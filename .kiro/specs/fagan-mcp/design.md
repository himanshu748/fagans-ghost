# Design: fagan-mcp

Requirements: #[[file:.kiro/specs/fagan-mcp/requirements.md]]. Plan: PLAN.md sections 4 to 9 and 11.

## Overview

`fagan-mcp` is one npm workspace package, `packages/fagan-mcp`, with two entry points over the same code:

- `fagan serve`: a stdio MCP server registered in Kiro as server `fagan`.
- `fagan <subcommand>`: a CLI that hooks run, because hooks cannot call MCP tools.

The package has no LLM and makes no network calls (FM-R12.5). The only non-deterministic inputs are clock readings and the outcome of the configured build and test commands. Both are injected so tests can fix them.

## Toolchain decisions

Versions installed on 2026-11-15 and the docs checked before choosing them:

| Tool | Version | Why | Docs checked |
| --- | --- | --- | --- |
| Node | 22.14.0 (engines `>=22`) | Installed locally; Vitest 5.1.0 needs `^22.12.0` or newer | [Node 22 docs](https://nodejs.org/docs/latest-v22.x/api/) |
| TypeScript | 7.0.2 | PLAN.md Q8 default: try 7 first. It worked: `tsc -p` builds and type-checks the scaffold with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, including a probe that called `McpServer.registerTool` with zod 4 schemas. TypeScript 7 ships no programmatic API; nothing in this repo needs one (Vitest transpiles TypeScript itself). TypeScript 7 changed defaults (`types` now defaults to `[]`, `rootDir` to `./`), so `tsconfig.base.json` sets `types: ["node"]` and each package sets `rootDir` | [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [tsconfig reference](https://www.typescriptlang.org/tsconfig/) |
| Vitest | 5.1.0 | Unit, property and contract tests. Run per package (`vitest run` in each workspace through `npm test --workspaces`), so no root `projects` config is needed yet | [Vitest guide](https://vitest.dev/guide/), [Test projects](https://vitest.dev/guide/projects) |
| fast-check | 4.10.2 | Property tests with `fc.assert`, `fc.property`, `fc.asyncProperty` and `fc.commands` | [fast-check getting started](https://fast-check.dev/docs/introduction/getting-started/), [model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/) |
| @modelcontextprotocol/sdk | 1.32.2 | The v1.x line. Its README says v1.x is now the maintenance line implementing the MCP spec up to 2025-11-25, and v2 ships as separate packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`). We stay on v1.32.2 as planned, because it is the version PLAN.md was reviewed against and Kiro's MCP client support for the 2026-07-28 spec is not documented on the pages read. Moving to v2 is a later, separate decision | [SDK v1.x README](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/README.md), [v1.x server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md), [v1 docs site](https://ts.sdk.modelcontextprotocol.io/) |
| zod | 4.6.7 | Peer of the SDK (`^3.25 \|\| ^4.0`). The SDK README says it imports `zod/v4` internally; we import `{ z } from "zod"`, which is the v4 API in zod 4.x. The probe compiled | [SDK v1.x README](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/README.md), [zod docs](https://zod.dev/) |
| @types/node | 22.20.5 | Matches the Node 22 line; Vitest peer range is `^22.0.0 \|\| >=24.0.0` | npm registry |

Glob matching for checklist selection (FM-R4.6) and `exclude`: Node's `path.matchesGlob` was added in v22.5.0 and marked stable only in v22.20.0 ([path docs](https://nodejs.org/docs/latest-v22.x/api/path.html)). The local Node is 22.14.0, where it is still experimental. FEAT-002 picks either `path.posix.matchesGlob` (if it runs without an experimental warning on 22.14.0) or a small documented glob library such as picomatch after reading its docs, and records the choice here.

## Module layout

```text
packages/fagan-mcp/
├── package.json            # bin: { "fagan": "dist/cli.js" }
├── tsconfig.json           # type-check src + test (noEmit)
├── tsconfig.build.json     # emit src -> dist
├── vitest.config.ts
├── checklists/             # general.json, typescript.json, json-config.json, docs.json, tests.json
├── src/
│   ├── core/               # pure: no fs, no child_process, no clock reads
│   │   ├── schema.ts       # zod schemas + inferred types for every file format
│   │   ├── json.ts         # deterministic serializer
│   │   ├── diff.ts         # unified diff parser
│   │   ├── packet.ts       # unit splitter, changed_loc, checklist selection
│   │   ├── phase.ts        # state machine, allowed tools per phase
│   │   ├── roles.ts        # allowed roles per tool
│   │   ├── readings.ts     # judgment-word flags
│   │   ├── defects.ts      # location checks, ID allocation
│   │   ├── rework.ts       # rework batch rules
│   │   ├── followup.ts     # verification + exit rule
│   │   ├── metrics.ts      # durations, rates, null reasons, warnings
│   │   ├── report.ts       # build/parse report.json, render report.txt
│   │   ├── gate.ts         # git commit command matcher
│   │   └── errors.ts       # FaganError { code, message, details }
│   ├── store/              # .fagan/ reads and writes, atomic write, lock, events
│   ├── git/                # execFile("git", argv) wrappers
│   ├── runner/             # execFile(argv[0], argv.slice(1)) with timeout
│   ├── service/            # one function per tool: validate, load, core, store
│   ├── server/             # McpServer + StdioServerTransport, registers the nine tools
│   ├── cli.ts              # `fagan` entry: serve | hook suggest | hook gate | follow-up | abandon | export
│   └── index.ts            # exports for tests and the power bundle
└── test/                   # *.test.ts, *.property.test.ts, contract.test.ts, cli.test.ts
```

`src/service` holds the tool logic once, so the MCP server and the CLI (`follow-up`, `export`, `abandon`) cannot drift apart.

## Clock

```ts
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };
```

Services take a `Clock`. Tests use a fake clock that returns scripted times. Core functions take timestamps as arguments and never read a clock (FM-R12.6). Stored times use `date.toISOString()`.

## Repo root and config

- The repo root is `git rev-parse --show-toplevel` run in the process working directory. Kiro starts workspace MCP servers in the project, and hooks run in the project root ([hooks docs](https://kiro.dev/docs/hooks/)). For tests only, the environment variable `FAGAN_REPO_ROOT` overrides the starting directory (still resolved through `git rev-parse --show-toplevel`). No other override exists.
- The store root is `<repo>/.fagan/`. Config is `<repo>/.fagan/config.json`, validated with the `fagan-config/1` schema (FM-R13.5).

### Project defaults for this repo

These values are chosen for this project. They are not Fagan's figures; Fagan's recommended rates and sizes need citation (PLAN.md section 21).

| Key | Value | Reason |
| --- | --- | --- |
| `sizeLimitLoc` | 1500 | Lets step 3 inspect one feature's diff in this repo; larger diffs should be split into several inspections |
| `suggestThresholdLoc` | 200 | Small edits should not trigger the suggestion after every agent turn |
| `maxUnitLines` | 80 | A unit fits on one screen for the Reader |
| `commandTimeoutMs` | 600000 | Ten minutes covers `npm run build` plus `npm test` here |
| `waiverMinChars` | 20 | Forces a real sentence, not "ok" |
| `requireLocationChange` | true | A "fixed" defect must change its file |
| `judgmentWords` | `bug`, `buggy`, `wrong`, `incorrect`, `broken`, `should`, `shouldn't`, `mistake`, `bad`, `fix` | Words that signal judging rather than paraphrasing |
| `rateWarnings` | both `null` | No cited rate exists yet |

## Schemas and file formats

Every stored file has a zod schema in `src/core/schema.ts`, exactly as PLAN.md section 7 shows, plus these additions decided here:

- `inspection.json` `timestamps` also has `abandonedAt` (`string | null`), and the top level has `abandonReason` (`string | null`), for `fagan abandon` (FM-R15.5).
- `packet.json` `files[]` also has `skipped`: `null | "binary" | "excluded"` (FM-R4.5).
- `readings.json`: `{ schemaVersion: "fagan-readings/1", readings: [ { id, unitId, paraphrase, judgmentFlags, recordedAt } ] }`.
- `rework.json`: `{ schemaVersion: "fagan-rework/1", items: [ { defectId, resolution, note | null, reason | null, recordedAt } ] }`, one item per defect (the latest).
- `followup.json`: `{ schemaVersion: "fagan-followup/1", attempts: [ { n, at, checks: { build, tests }, defects: [ { defectId, severity, status } ], blocking, passed } ] }`. A check that did not run is `{ ran: false, passed: false, exitCode: null, durationMs: null }`.
- `metrics.json`: `{ schemaVersion: "fagan-metrics/1", computedAt, ...section 9 fields }`.

Key order on write is the order of keys in the zod schema object, so the schema is the single source of order. The serializer (`core/json.ts`) re-emits objects in schema order, sorts arrays of records by their `id` (or `defectId`, `n`, `seq`) field, uses 2-space indent and ends with `\n` (FM-R12.1).

## Diff and packet

- Diff command for `head: "WORKTREE"`: `git -c core.quotepath=off diff --no-color --no-ext-diff --find-renames --unified=3 <base_sha> --`. For a revision head: the same with `<base_sha> <head_sha>`. Without `--cached`, `git diff <commit>` compares the working tree (which includes staged content) with the commit ([git-diff docs](https://git-scm.com/docs/git-diff)).
- Untracked files: `git ls-files --others --exclude-standard -z`, then for each file `git diff --no-index --no-color -- /dev/null <path>`. `--no-index` exits 1 when files differ, so exit code 1 is success there. This never touches the index (FM-R2.3).
- Blob hashes: `git rev-parse <rev>:<path>` for committed sides, `git hash-object -- <path>` for the working tree.
- Parser (`core/diff.ts`) handles `diff --git`, `new file mode`, `deleted file mode`, `rename from/to`, `Binary files ... differ`, `@@ -a,b +c,d @@` and `\ No newline at end of file` (FM-R4.7).
- Splitter (`core/packet.ts`) walks each hunk's lines in order and starts a new unit when the current unit already holds `maxUnitLines` changed lines and the next line is a changed line. Context lines stay in the unit they fall in (FM-R4.2). Files sort by path in byte order before numbering (FM-R4.3).

## Phase rules

| Tool | Roles | Allowed phases | Transition |
| --- | --- | --- | --- |
| `open_inspection` | moderator | (none: creates) | to Overview |
| `get_packet` overview | all | any | none |
| `get_packet` preparation | all | Overview to FollowUp | Overview to Preparation |
| `get_packet` meeting | moderator | Preparation to FollowUp | Preparation to Meeting |
| `record_reading` | reader | Meeting | none |
| `log_defect` | scribe | Meeting | none |
| `close_meeting` | moderator | Meeting | to Rework or FollowUp |
| `record_rework` | author | Rework | none |
| `follow_up` | moderator, author | Rework, FollowUp | to Closed or Rework |
| `metrics` | all | any | none |
| `export_report` | moderator, author | any | none |
| CLI `abandon` | human | any non-terminal | to Abandoned |

## Error codes

| Code | When |
| --- | --- |
| `VALIDATION_ERROR` | Input fails its zod schema (lengths, patterns, enums); `details.issues` lists paths |
| `NOT_A_GIT_REPO` | `git rev-parse --show-toplevel` fails |
| `CONFIG_INVALID` | `.fagan/config.json` missing or invalid |
| `INSPECTION_NOT_FOUND` | No folder for a valid ID |
| `WRONG_PHASE` | Tool not allowed in current phase |
| `ROLE_NOT_ALLOWED` | Role not allowed for the tool |
| `STORE_CORRUPT` | Stored file missing or fails its schema |
| `LOCKED` | `.fagan/.lock` held |
| `INVALID_RANGE`, `EMPTY_DIFF`, `SIZE_LIMIT_EXCEEDED`, `ENTRY_CRITERIA_FAILED`, `COMMAND_TIMEOUT` | `open_inspection`, `follow_up` |
| `UNKNOWN_UNIT`, `INVALID_CURSOR` | `get_packet`, `record_reading`, `log_defect` |
| `DUPLICATE_READING` | `record_reading` |
| `LOCATION_OUTSIDE_PACKET`, `UNKNOWN_CHECKLIST_ITEM` | `log_defect` |
| `UNREAD_UNITS` | `close_meeting` |
| `UNKNOWN_DEFECT`, `WAIVER_REASON_REQUIRED`, `DUPLICATE_DEFECT_IN_BATCH`, `ALREADY_CLOSED` | `record_rework` |

Errors are thrown inside services as `FaganError` and turned into tool results `{ isError: true, content: [{ type: "text", text: JSON.stringify({ code, message, details }) }] }` at the server edge (FM-R14.5). Invalid input caught by the SDK's own schema check also comes back as an `isError` result; the contract test records which form it takes.

## Store

- Atomic write: `writeFile(<target>.<pid>.<n>.tmp)`, then `rename` onto the target in the same folder (FM-R13.1).
- Lock: `open(".fagan/.lock", "wx")` writing `{ pid, at }`. A lock whose mtime is older than 60 seconds is stale and is removed once before retrying; otherwise `LOCKED` (FM-R13.2). The lock is removed in a `finally` block (FM-R13.3).
- A tool call validates everything in memory first and writes only after all checks pass, so errors leave the store unchanged (FM-R1.3).
- Inspection IDs: scan `.fagan/inspections/` for `insp-NNNN` folders, take the highest plus one.

## MCP server

APIs used, as shown in the SDK v1.x docs ([server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md)) and confirmed in the installed type declarations (`dist/esm/server/mcp.d.ts`, `dist/esm/server/stdio.d.ts`, `dist/esm/client/index.d.ts`, `dist/esm/client/stdio.d.ts`):

- `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"`; `new McpServer({ name: "fagan-mcp", version })`.
- `server.registerTool(name, { title, description, inputSchema, outputSchema? }, handler)`, where `inputSchema` is a zod raw shape. The older `server.tool(...)` overloads are marked deprecated in 1.32.2.
- Handler returns `{ content: [{ type: "text", text }], structuredContent }`, or `{ content, isError: true }`.
- `import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"`; `await server.connect(new StdioServerTransport())`.
- Contract test: `Client` from `@modelcontextprotocol/sdk/client/index.js` and `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js` (parameters `command`, `args`, `cwd`, `env`, `stderr`).
- Logs go to stderr only; stdout carries the protocol (FM-R15.1).

Kiro registration (FEAT-003), per [MCP configuration](https://kiro.dev/docs/mcp/configuration/): `.kiro/settings/mcp.json` with `{ "mcpServers": { "fagan": { "command": "node", "args": ["packages/fagan-mcp/dist/cli.js", "serve"], "env": {}, "disabled": false } } }`. No `autoApprove`.

## CLI

`dist/cli.js` with a `#!/usr/bin/env node` shebang, arguments parsed with `node:util` `parseArgs`.

| Command | Exit codes |
| --- | --- |
| `fagan serve` | runs until stdin closes |
| `fagan hook suggest` | always 0 (FM-R15.3) |
| `fagan hook gate` | 0 allow, 2 block (FM-R16) |
| `fagan follow-up --latest` / `fagan follow-up <id>` | 0 (prints result, FM-R15.4) |
| `fagan abandon <id> --reason <text>` | 0 or 1 |
| `fagan export <id> [--format json] [--format txt]` | 0 or 1 |

Commit gate matcher (`core/gate.ts`): split the command on `&&`, `||`, `;`, `|` and newlines; in each segment drop leading `NAME=value` words; if the program is `git` (or ends in `/git`), skip global options (`-c <k=v>`, `-C <path>`, `--git-dir=<p>`, `--work-tree=<p>`, `--no-pager`, `-p`, `--paginate`, and other words starting with `-`, taking one argument for `-c` and `-C`); the next word is the subcommand. It is a commit if that word is `commit`. Quoted strings are tokenised so `git log --grep "commit"` and `echo "git commit"` are not commits. Known gap: commands hidden inside `sh -c '...'` or aliases are not detected; documented in README.

## Testing strategy

- Unit tests (`test/*.test.ts`): diff parser cases, splitter, checklist selection, state machine, store atomic write and lock, git adapter against a temp repo under `os.tmpdir()` (removed after), runner timeout, report.txt width.
- Contract test (`test/contract.test.ts`): spawns the built `dist/cli.js serve` over stdio in a temp git repo, so `npm run build` must run before `npm test` (root `npm test` is run after `npm run build` in CI and locally; the test fails with a clear message if `dist/cli.js` is missing).
- CLI tests (`test/cli.test.ts`): STDIN payloads into `hook gate` and `hook suggest`.

## Correctness properties

Each property is a fast-check test in `packages/fagan-mcp/test/*.property.test.ts`. The test name starts with the requirement IDs it checks. These are hand-written; Kiro's own spec Correctness workflow is IDE only ([Correctness docs](https://kiro.dev/docs/specs/correctness/)) and is run by the human later (PLAN.md section 2.3, experiment E15).

| # | Property | Test file | Test name | Requirements |
| --- | --- | --- | --- | --- |
| P1 | For any timestamps (missing, equal, reversed, far apart) and any `changed_loc` (including 0), every metric is a finite number or `null`, and every `null` has a reason | `metrics.property.test.ts` | `FM-R10.3 FM-R10.4 FM-R10.5 metrics are finite or null with a reason` | FM-R10.3, FM-R10.4, FM-R10.5 |
| P2 | With `changed_loc` fixed, for positive durations d1 <= d2, rate(d1) >= rate(d2) | `metrics.property.test.ts` | `FM-R10.6 rates never increase as duration grows` | FM-R10.2, FM-R10.6 |
| P3 | For any defect log, rework set and check outcome, follow-up passes if and only if no major is `open`, `fixed_unverified`, or waived with an invalid reason | `followup.property.test.ts` | `FM-R9.3 FM-R9.4 follow-up passes iff every major is verified or validly waived` | FM-R9.3, FM-R9.4 |
| P4 | For any valid report model, `parseReport(serializeReport(m))` deep-equals `m`, and serializing twice gives identical bytes | `report.property.test.ts` | `FM-R11.3 FM-R11.4 report round-trips and is byte-stable` | FM-R11.3, FM-R11.4, FM-R12.1 |
| P5 | For any generated diff and any `maxUnitLines` from 1 to 200, the multiset of changed lines across units equals the diff's changed lines, no unit exceeds the cap, and unit IDs are gapless | `packet.property.test.ts` | `FM-R4.1 FM-R4.2 every changed line is in exactly one unit` | FM-R4.1, FM-R4.2, FM-R4.3, FM-R4.4 |
| P6 | For any random sequence of tool operations (`fc.commands`) against a model, an operation not allowed in the current phase returns `WRONG_PHASE` and leaves the stored state unchanged | `phase.property.test.ts` | `FM-R1.2 FM-R1.3 wrong-phase calls never change the store` | FM-R1.1, FM-R1.2, FM-R1.3 |
| P7 | For generated shell commands, the gate matcher returns true only for commands with a `git ... commit` segment; any command built without such a segment returns false | `gate.property.test.ts` | `FM-R16.1 FM-R16.2 the gate matches only git commit commands` | FM-R16.1, FM-R16.2 |
