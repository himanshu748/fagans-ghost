# Experiments

Results of the experiments listed in PLAN.md section 2.4. Each row records what was actually tried and seen, including failures. "Not run yet" means nobody has tried it.

| ID | Question (short) | Step | Status | Result |
| --- | --- | --- | --- | --- |
| E1 | Do workspace hooks fire in a V3 session driven by T3 Code over ACP? | 3 | Not run yet | |
| E2 | Shell tool ID and command field in `tool_input` | 3 | Not run yet | |
| E3 | Does exit code 2 block the shell call in CLI V3? Where does stderr show? | 3 | Not run yet | |
| E4 | Does matcher `@fagan/record_rework` match `mcp_fagan_record_rework`? | 3 | Not run yet | |
| E5 | Does a `Stop` hook `confirm` block work over ACP? | 3 | Not run yet | |
| E6 | Does the T3 Code client expose `/spec`, `/agent`, `/hooks` and manual steering slash commands? | 2 | Partly run | See below |
| E7 | Agent switching through ACP; project agents as sub-agents; nesting depth | 3 | Not run yet | |
| E8 | Does the scribe keep `log_defect` as a sub-agent of the moderator? | 3 | Not run yet | |
| E9 | Command path resolution and server namespacing for a power's `mcp.json` | 5 | Not run yet | |
| E10 | Can a power ship steering files or hooks? | 5 | Not run yet | |
| E11 | Do all agent files pass `kiro-cli agent validate`? | 3 | Not run yet | |
| E12 | Units and default of the hook `timeout` field | 3 | Not run yet | |
| E13 | Does `auto` steering inclusion trigger in CLI V3 for our description? | 2 | Not observed | See below |
| E14 | Do `skill://` resources in agent files load power skills? | 5 | Not run yet | |
| E15 | How do Kiro Correctness properties relate to our fast-check tests? | after 2, in IDE | Not run yet | Needs the Kiro IDE (you) |
| E16 | Is the `Stop` / `PostToolUse` payload the same shape as `PreToolUse`? | 3 | Not run yet | |

## E6: slash commands in the T3 Code client (step 2)

- The spec work in step 2 was done by a Kiro CLI V3 agent session that T3 Code drives over ACP. That session had no `/spec` command or spec tool it could call, so `/spec new fagan-mcp` was not used.
- The three spec files in `.kiro/specs/fagan-mcp/` (`requirements.md`, `design.md`, `tasks.md`) were written by hand, following the layout and EARS format on [kiro.dev/docs/specs](https://kiro.dev/docs/specs/) and [feature specs](https://kiro.dev/docs/specs/feature-specs/).
- Not yet tested: whether the T3 Code chat box passes `/spec`, `/agent`, `/hooks` or `/inspection-ritual` through to Kiro when a human types them. That needs a human in the T3 Code UI or an interactive `kiro-cli chat` session.

## E13: auto steering inclusion (step 2)

- `.kiro/steering/fagan-history.md` uses `inclusion: auto` with `name: fagan-history` and a `description` about history, citations and docs, per [kiro.dev/docs/steering](https://kiro.dev/docs/steering/).
- Whether Kiro actually pulled it in could not be observed from inside this harness: the agent session does not show which steering files were loaded, and no history or docs writing happened in step 2. Not observed, so no result is claimed.
- To check later (step 7, when the README history section is written): ask in an interactive session for the Fagan citation and see whether the answer uses the verified list, or check Kiro's context view in the IDE. If it does not trigger, switch the file to `manual` as planned.

## MCP registration and CLI dry run (step 2)

`.kiro/settings/mcp.json` registers server `fagan` as `node packages/fagan-mcp/dist/cli.js serve`, in the format on [kiro.dev/docs/mcp/configuration](https://kiro.dev/docs/mcp/configuration/), without `autoApprove`. These commands ran on 2026-11-15 after `npm run build`. `kiro-cli --version` printed `kiro-cli 3.3.0` (the task notes said 3.2.1; the installed binary had been updated). `kiro-cli mcp --help` lists `add`, `remove`, `list`, `import` and `status`, so both `list` and `status` were run.

From the repo root:

```text
$ kiro-cli mcp list

🤖 default:

  kiro_default
    • fagan        node

📄 workspace:

  kiro_help
    (empty)
  kiro_planner
    (empty)

$ kiro-cli mcp status --name fagan

─────────────
Scope   : 🤖 default
Agent   : kiro_default
Command : node
Timeout : 120000 ms
Disabled: false
Env Vars:
```

Both exited 0. As a control, `kiro-cli mcp list` run in `/tmp` showed `kiro_default` with `(empty)`, so the `fagan` entry above comes from this repo's `.kiro/settings/mcp.json`. Kiro lists it under the default agent `kiro_default`; the `workspace` heading lists the agents `kiro_help` and `kiro_planner`, which have no servers. These commands only read the config. They do not start the server or call a tool. Whether a Kiro chat session starts `fagan` and calls its tools is checked in step 3, when the role agents use it.

The server itself was driven over stdio by `packages/fagan-mcp/test/contract.test.ts` (SDK `Client` and `StdioClientTransport`) in a temp repo, not in this repo.

Dry run of the CLI in this repo. None of these commands writes anything; `.fagan/` still holds only `config.json` afterwards, and no inspection data was created:

```text
$ echo '{"hook_event_name":"Stop","cwd":"<repo root>"}' | node packages/fagan-mcp/dist/cli.js hook suggest
fagan: 1739 changed lines against HEAD (threshold 200) and no inspection covers them. Consider asking the moderator agent to open an inspection with open_inspection.
exit 0
$ echo '{"tool_input":{"command":"git status"}}' | node packages/fagan-mcp/dist/cli.js hook gate
exit 0
$ echo '{"tool_input":{"command":"git commit -m test"}}' | node packages/fagan-mcp/dist/cli.js hook gate
exit 0
$ node packages/fagan-mcp/dist/cli.js follow-up --latest
fagan follow-up: no inspection is in Rework or FollowUp; nothing to do.
exit 0
```

The 1739 lines are this step's uncommitted work at the time. The commit check exits 0 because `.fagan/inspections/` does not exist yet (FM-R16.4). The payload field names here are guesses until E2 records a real `PreToolUse` payload in step 3.

## PBT findings

Only real failures found by fast-check are recorded here, with the counterexample and the fix. The three below were found by property P4 (`FM-R11.3 FM-R11.4 report round-trips and is byte-stable`, `packages/fagan-mcp/test/report.property.test.ts`) during FEAT-002. P4-1 and P4-2 were reproduced again before the commit by removing their fix and running the property; P4-3 showed up in a normal test run during that check.

### P4-1: event data with a `__proto__` key was silently dropped

- Counterexample (shrunk; `seed: -608977263`): one event whose `data` is `{ ["__proto__"]: [] }`, an own key named `__proto__`, which `JSON.parse` produces from `{"__proto__":[]}`.
- Failure: `parseReport(exportReport(model))` returned `data: {}`. zod's `z.record` parsing drops `__proto__` keys, so data was lost on import.
- Fix: `EventDataSchema` in `src/core/schema.ts` rejects any own `__proto__` key at any depth (`hasProtoKey`) before record parsing, so the export fails with a validation error instead of losing data. The serializer in `src/core/json.ts` copies keys with `Object.defineProperty` so the key is not swallowed on the write side either. Regression test: `FM-R11.3 event data with a __proto__ key is rejected instead of silently dropped`.

### P4-2: a metric of negative zero came back as 0

- Counterexample (`seed: 2054659411`, failed after 23 runs): `metrics.durationsMs.preparation` is `-0`.
- Failure: JSON has no negative zero, so `JSON.stringify(-0)` writes `0` and the parsed report has `preparation: 0`, which does not deep-equal `-0`.
- Fix: the metric number schema in `src/core/schema.ts` rejects `-0`, and `computeMetrics` never produces it. Regression test: `FM-R11.3 a metric of negative zero is rejected instead of coming back as 0`.

### P4-3: negative zero inside event data came back as 0

- Counterexample (`seed: 161279075`, intermittent, about one full-suite run in five): an event whose free-form `data` from `fc.jsonValue()` holds `{ "constructor": -0 }`.
- Failure: the same JSON limitation as P4-2, in event data instead of metrics. The parsed report had `"constructor": 0`. The P4-2 fix only covered metric fields.
- Fix: `EventDataSchema` in `src/core/schema.ts` also rejects `-0` at any depth (`hasNegativeZero`). The ops only put IDs, strings and non-negative counts into event data, so no real call is affected. Regression test: `FM-R11.3 event data containing negative zero is rejected instead of coming back as 0`.
