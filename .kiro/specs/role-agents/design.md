# Design: role-agents

Requirements: #[[file:.kiro/specs/role-agents/requirements.md]]. Plan: PLAN.md sections 10 and 11. Server: #[[file:.kiro/specs/fagan-mcp/design.md]].

## Overview

This spec covers the Kiro side of Fagan's Ghost:

- Five custom agents in `.kiro/agents/<name>.json`, with prompts in `.kiro/agents/prompts/<name>.md`.
- Three hooks in `.kiro/hooks/`.
- The hook launcher `scripts/fagan-hook.mjs`.
- Tests that check this config against `fagan-mcp`: `packages/fagan-mcp/test/kiro-config.test.ts`, `hook-launcher.test.ts` and `hook-launcher.property.test.ts`.

The agents make no decisions the server cannot record. Every reading and defect goes through a `fagan` tool call that `fagan-mcp` checks and stores. The surface used to write and check these files is Kiro CLI V3 (`kiro-cli` 3.3.0) driven over ACP by T3 Code. The Kiro IDE is not installed here.

## Kiro docs used

Every format below was read on [kiro.dev/docs](https://kiro.dev/docs) on 2026-11-16, before the files were written. The sub-agents, steering, permissions, tools and configuration reference pages were read again while writing this design.

| Page | What it settled |
| --- | --- |
| [Custom agents](https://kiro.dev/docs/custom-agents/) | Workspace agents in `.kiro/agents/` load only if the workspace is trusted; CLI 2.x profiles that use `allowedTools` or `toolsSettings` without a `permissions` block must be converted before CLI V3 loads them |
| [Slash commands](https://kiro.dev/docs/reference/slash-commands.md) | `kiro-cli chat --agent <name>` and `/agent swap <name>` switch agents |
| [Configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/) | Agent fields (`name`, `description`, `prompt`, `tools`, `permissions`, `resources`, `includeMcpJson`, `welcomeMessage`, `model`); `prompt` as `file://./prompts/<name>.md`, relative to the agent file; tool selectors; rule fields `capability`, `match`, `effect`, `exclude`; resource limits (32 `file://` files, 100,000 characters in total, 50,000 per file, files over 1 MiB skipped); default-resource inheritance and the `chat.disableInheritingDefaultResources` setting; a sub-agent with its own `file://` resources loads those instead of the parent's; MCP server `timeout` (handshake, default 60000 ms) and `requestTimeout` (per call, default 120000 ms) |
| [Sub-agents](https://kiro.dev/docs/custom-agents/subagents.md) | `subagent/<name>` entries limit which agents can be started in CLI V3; never `@builtin` or `*`, which include `invoke_sub_agent`; a `subagent` allow rule only skips the start prompt; every sub-agent tool call is checked against the parent session policy and the sub-agent's own rules; allow rules for sub-agent calls go in the parent agent's `permissions.rules`; each delegated agent has its own context window; a headless run denies sub-agent prompts |
| [Permissions](https://kiro.dev/docs/permissions.md) | Capability and effect names; deny > ask > allow > evaluate in every scope; a rule without `match` (example `capability: fs_read`, `effect: allow`); MCP patterns are `server/tool` and support only `*`; workspace permissions are stored outside the repo ("A cloned repo cannot inject permission rules") |
| [Built-in tools](https://kiro.dev/docs/tools.md) | The `read` tag (read_file, list_directory, file_search, grep_search, code, introspect), `write`, `shell` (execute_bash or execute_pwsh), `web` and `subagent` tags; `invoke_sub_agent` has no tag |
| [Hooks](https://kiro.dev/docs/hooks/), [hook types](https://kiro.dev/docs/hooks/types/), [hook actions](https://kiro.dev/docs/hooks/actions/), [CLI V3 hooks migration](https://kiro.dev/docs/cli/v3/hooks-migration.md) | `{ "version": "v1", "hooks": [ ... ] }`; PascalCase triggers; matcher as a tool selector (`shell`, `@<server>/<tool>`) or a regex; command actions run in the project root with the session context JSON on stdin; exit 0 adds stdout to the agent's context; any other exit sends stderr to the agent and blocks a `PreToolUse` call; `timeout` in seconds, default 60, 0 disables; V3 payloads name MCP tools `mcp_<server>_<tool>` |
| [Steering](https://kiro.dev/docs/steering/) | "When using custom agents, steering files are not automatically included. You must explicitly add them to the agent's resources configuration" |
| [MCP configuration](https://kiro.dev/docs/mcp/configuration/) | `.kiro/settings/mcp.json` format (unchanged in this spec) |
| [Specs](https://kiro.dev/docs/specs/), [feature specs](https://kiro.dev/docs/specs/feature-specs/) | Spec layout and EARS form |

The steering page and the configuration reference disagree on whether custom agents inherit workspace steering. Every agent lists the steering it needs in `resources`, which works under both readings (`.kiro/steering/kiro-config.md`).

## Agents

The five agents share these choices:

- `name` is the file name and the role value the agent passes (RA-R1.2). There is no author agent: the Author is the human (RA-R1.1).
- `description` is one line that starts with `Fagan inspection` and names the role, so Kiro's automatic sub-agent selection can tell the roles apart (RA-R1.3).
- `includeMcpJson: true` gives the agent the workspace `fagan` server from `.kiro/settings/mcp.json`. The agents define no `mcpServers` of their own.
- No `model`: the agents use whatever model Kiro runs, and fagan-mcp makes no model calls.
- `tools` lists only `read`, `@fagan/<tool>` and `subagent/<name>` (RA-R2.5). The `fagan` tools in each list are the ones whose allowed roles in `packages/fagan-mcp/src/core/roles.ts` include the agent (RA-R2.7).
- Every agent has whole-capability deny rules for `fs_write`, `shell`, `web_fetch` and `web_search`, and an `mcp` deny rule for `fagan/record_rework` (RA-R3.1, RA-R3.2). A deny wins over any allow or approval in any scope (permissions page), so these hold even if a user later allows more in their own `permissions.yaml`.

The per-agent tool lists match PLAN.md section 10.

### moderator

```json
{
  "name": "moderator",
  "description": "Fagan inspection Moderator: opens an inspection with fagan-mcp, runs the phases in order, delegates to the reader, inspectors and scribe, and never logs defects or records rework.",
  "prompt": "file://./prompts/moderator.md",
  "includeMcpJson": true,
  "tools": [
    "read",
    "@fagan/open_inspection",
    "@fagan/get_packet",
    "@fagan/close_meeting",
    "@fagan/follow_up",
    "@fagan/metrics",
    "@fagan/export_report",
    "subagent/reader",
    "subagent/inspector-logic",
    "subagent/inspector-interfaces",
    "subagent/scribe"
  ],
  "permissions": {
    "rules": [
      { "capability": "fs_write", "effect": "deny" },
      { "capability": "shell", "effect": "deny" },
      { "capability": "web_fetch", "effect": "deny" },
      { "capability": "web_search", "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/record_rework"], "effect": "deny" },
      { "capability": "subagent", "match": ["reader", "inspector-logic", "inspector-interfaces", "scribe"], "effect": "allow" },
      { "capability": "mcp", "match": ["fagan/get_packet", "fagan/record_reading", "fagan/log_defect"], "effect": "allow" }
    ]
  },
  "resources": [
    "file://.kiro/steering/product.md",
    "file://.kiro/steering/tech.md",
    "file://.kiro/steering/inspection-ritual.md"
  ],
  "welcomeMessage": "Moderator here. Tell me what to inspect (default: the working tree against HEAD) and, if you like, an overview note. I will run the phases in order; you stay the Author."
}
```

- `tools`: the moderator's own `fagan` tools are the ones whose allowed roles include `moderator` (`open_inspection`, `get_packet`, `close_meeting`, `follow_up`, `metrics`, `export_report`). It gets the four sub-agents by name, never bare `subagent`, `@builtin` or `*`, so it cannot start any other agent (sub-agents page).
- `fs_write` deny: the moderator reads and delegates; changing files is the Author's rework.
- `shell` deny: `open_inspection` and `follow_up` run the build and tests inside the server, so the moderator never needs a shell, and it cannot run `git commit` itself.
- `web_fetch` and `web_search` deny: the inspection is about the packet and the workspace. As the parent, these denies also deny the same calls from every sub-agent ("A `deny` from either policy denies the call").
- `mcp` deny `fagan/record_rework`: rework is the Author's (RA-R8.1). As the parent policy it also denies the call for every sub-agent.
- `subagent` allow for the four roles: starts them without a prompt each time. It does not approve their tool calls (sub-agents page).
- `mcp` allow `fagan/get_packet`, `fagan/record_reading`, `fagan/log_defect`: these are the tools the sub-agents call. Kiro checks a sub-agent's call against the parent session policy and prompts when that policy has no rule, so without these rules every reading and every logged defect would stop for a prompt, and a headless run would deny them (RA-R3.5, E8 below). The moderator does not list `record_reading` or `log_defect` in `tools`, so the allow rules give it nothing to call itself; the sub-agents page says "The parent agent doesn't need the MCP server or tool itself".
- No rule for the moderator's own `open_inspection`, `close_meeting`, `follow_up`, `metrics` and `export_report`: Kiro asks before MCP calls by default (permissions page), so the Author approves each phase change in an interactive session. A headless run must pass `--trust-tools` for exactly these tools (FEAT-004).

### reader

```json
{
  "name": "reader",
  "description": "Fagan inspection Reader: paraphrases each packet unit in plain English and records it with record_reading; describes the code and never judges it.",
  "prompt": "file://./prompts/reader.md",
  "includeMcpJson": true,
  "tools": ["read", "@fagan/get_packet", "@fagan/record_reading"],
  "permissions": {
    "rules": [
      { "capability": "fs_write", "effect": "deny" },
      { "capability": "shell", "effect": "deny" },
      { "capability": "web_fetch", "effect": "deny" },
      { "capability": "web_search", "effect": "deny" },
      { "capability": "subagent", "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/record_rework"], "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/*"], "exclude": ["fagan/get_packet", "fagan/record_reading"], "effect": "deny" }
    ]
  },
  "resources": [
    "file://.kiro/steering/product.md",
    "file://.kiro/steering/inspection-ritual.md"
  ],
  "welcomeMessage": "Reader here. Give me an inspection ID and unit IDs and I will paraphrase each unit in plain English, without judging it."
}
```

- `tools`: `read` to open a whole file for context, `get_packet` for the units, `record_reading` for the paraphrase. Only the reader's role is allowed for `record_reading` (FM-R5.1).
- `fs_write`, `shell`, `web_fetch`, `web_search` deny: a paraphrase needs none of them.
- `subagent` deny: the reader never delegates, so it cannot start another role and borrow its tools.
- `mcp` deny `fagan/record_rework`: the Author rule, stated on its own so it does not depend on the exclude list below (RA-R8.1).
- `mcp` deny `fagan/*` except `get_packet` and `record_reading`: if a `fagan` tool were ever added to `tools` by mistake, this rule still denies it. A sub-agent's own deny applies whatever the parent allows (RA-R3.4).
- No allow rules: as a sub-agent, its two `fagan` calls are allowed by the moderator's rules. When the reader runs top-level, Kiro asks for them.

### inspector-logic and inspector-interfaces

```json
{
  "name": "inspector-logic",
  "description": "Fagan inspection logic Inspector: read-only; prepares with get_packet and raises logic and data defects as DEFECT lines in its reply for the scribe to log.",
  "prompt": "file://./prompts/inspector-logic.md",
  "includeMcpJson": true,
  "tools": ["read", "@fagan/get_packet"],
  "permissions": {
    "rules": [
      { "capability": "fs_write", "effect": "deny" },
      { "capability": "shell", "effect": "deny" },
      { "capability": "web_fetch", "effect": "deny" },
      { "capability": "web_search", "effect": "deny" },
      { "capability": "subagent", "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/record_rework"], "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/*"], "exclude": ["fagan/get_packet"], "effect": "deny" }
    ]
  },
  "resources": [
    "file://.kiro/steering/product.md",
    "file://.kiro/steering/tech.md",
    "file://.kiro/steering/inspection-ritual.md"
  ],
  "welcomeMessage": "Logic Inspector here. Give me an inspection ID; I read the packet against its checklists and raise logic and data defects as DEFECT lines. I cannot log them myself."
}
```

```json
{
  "name": "inspector-interfaces",
  "description": "Fagan inspection interfaces Inspector: read-only; prepares with get_packet and raises interface and documentation defects as DEFECT lines in its reply for the scribe to log.",
  "prompt": "file://./prompts/inspector-interfaces.md",
  "includeMcpJson": true,
  "tools": ["read", "@fagan/get_packet"],
  "permissions": {
    "rules": [
      { "capability": "fs_write", "effect": "deny" },
      { "capability": "shell", "effect": "deny" },
      { "capability": "web_fetch", "effect": "deny" },
      { "capability": "web_search", "effect": "deny" },
      { "capability": "subagent", "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/record_rework"], "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/*"], "exclude": ["fagan/get_packet"], "effect": "deny" }
    ]
  },
  "resources": [
    "file://.kiro/steering/product.md",
    "file://.kiro/steering/tech.md",
    "file://.kiro/steering/inspection-ritual.md"
  ],
  "welcomeMessage": "Interfaces Inspector here. Give me an inspection ID; I read the packet against its checklists and raise interface and documentation defects as DEFECT lines. I cannot log them myself."
}
```

- `tools`: `read` and `get_packet` only. Inspectors are read-only: they raise defects in their replies and cannot log them (RA-R2.3). Their first `get_packet` call with `phase: "preparation"` moves the inspection from Overview to Preparation (FM-R3.1) and records the role (FM-R3.2).
- `fs_write`, `shell`, `web_fetch`, `web_search` deny: an inspector reads; it does not run the code or look things up.
- `subagent` deny: an inspector cannot start the scribe and log a defect through it.
- `mcp` deny `fagan/record_rework`: the Author rule (RA-R8.1).
- `mcp` deny `fagan/*` except `get_packet`: no other `fagan` tool, in particular not `log_defect` or `record_reading`, even if the parent session allows them (RA-R3.4).
- `tech.md` is in `resources` so the inspectors know the project's TypeScript and determinism rules when they check code.

### scribe

```json
{
  "name": "scribe",
  "description": "Fagan inspection Scribe: the only role that calls log_defect; logs exactly the DEFECT lines the inspectors raised, with raised_by, and never adds its own.",
  "prompt": "file://./prompts/scribe.md",
  "includeMcpJson": true,
  "tools": ["@fagan/get_packet", "@fagan/log_defect"],
  "permissions": {
    "rules": [
      { "capability": "fs_write", "effect": "deny" },
      { "capability": "shell", "effect": "deny" },
      { "capability": "web_fetch", "effect": "deny" },
      { "capability": "web_search", "effect": "deny" },
      { "capability": "subagent", "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/record_rework"], "effect": "deny" },
      { "capability": "mcp", "match": ["fagan/*"], "exclude": ["fagan/get_packet", "fagan/log_defect"], "effect": "deny" }
    ]
  },
  "resources": [
    "file://.kiro/steering/product.md",
    "file://.kiro/steering/inspection-ritual.md"
  ],
  "welcomeMessage": "Scribe here. Send me DEFECT lines with the inspection ID and I will log each one exactly as raised, with who raised it."
}
```

- `tools`: `log_defect`, which only the scribe lists (RA-R2.6) and only the `scribe` role may call (FM-R6.1), and `get_packet` so it can look at a unit when it has to explain a `log_defect` error. No `read`: the scribe copies lines and has no reason to open source files and form its own view.
- `fs_write`, `shell`, `web_fetch`, `web_search` and `subagent` deny: as for the other roles.
- `mcp` deny `fagan/record_rework`: the Author rule (RA-R8.1).
- `mcp` deny `fagan/*` except `get_packet` and `log_defect` (RA-R3.4).

## Permission evaluation and E8

PLAN.md section 2.4 asked, as E8, whether the scribe keeps `log_defect` when it runs as a sub-agent of the moderator, whose `tools` do not include it. The sub-agents page answers it on paper for CLI V3 and the IDE:

1. A sub-agent's available tools come from its own `tools`. The scribe has `log_defect` whatever the moderator lists.
2. Each tool call is checked against the parent session policy and the sub-agent's own `permissions`, and the stricter result wins. A deny from either denies; an ask from either prompts; no rule in the parent policy prompts.
3. A sub-agent's own allow rules apply only when it runs top-level.
4. To let a sub-agent's calls run without prompts, put its allow rules in the parent agent's `permissions.rules`; the parent does not need the tool itself.

So the moderator carries `mcp` allow rules for exactly the `fagan` tools its sub-agents call, and nothing broader (RA-R3.5, RA-R3.6). For the scribe's `log_defect` call the result is: parent policy allow (moderator rule), scribe policy no rule (its `fagan/*` deny excludes `log_defect`), so the call runs. For an inspector's `log_defect` call, if one were possible, the result would be deny, because the inspector has no such tool and its own `fagan/*` deny covers it.

This is the fallback PLAN.md section 2.4 gave for E8 ("Moderator gets `log_defect` in `permissions` (allow) but not in `tools`"), adopted as the design because the docs describe it. FEAT-003 checks it live; if the scribe's call is still refused or prompts, the other fallback is for the Author's default agent to start the scribe directly.

## Resources and steering

Each agent lists its steering as separate `file://` entries instead of the `file://.kiro/steering/**/*.md` glob shown in PLAN.md section 10:

| Agent | `product.md` | `tech.md` | `inspection-ritual.md` |
| --- | --- | --- | --- |
| moderator | yes | yes | yes |
| reader | yes | no | yes |
| inspector-logic | yes | yes | yes |
| inspector-interfaces | yes | yes | yes |
| scribe | yes | no | yes |

- `product.md` carries the honesty rules (no fabricated data, no em dashes) every role needs.
- `inspection-ritual.md` is `inclusion: manual`, so it would not load on its own; the agents need it to know the phase order.
- `tech.md` helps the roles that judge code (the inspectors) and the one that opens inspections (the moderator). The reader and scribe do not judge code, so they do not get it.
- The other steering files (`kiro-config.md`, `fagan-mcp.md`, `inspection-room.md`, `fagan-history.md`) are for development work in this repo, so they would only add context the roles do not use.
- Each sub-agent declares its own `file://` resources, so it loads those and not the moderator's (configuration reference).

`kiro-config.test.ts` expands each entry from the workspace root and checks the limits from the configuration reference: at most 32 files, each at most 1 MiB and 50,000 characters, at most 100,000 characters in total (RA-R5.2).

## Prompts and the DEFECT line

Each prompt (`.kiro/agents/prompts/<name>.md`) states the role value as `"role": "<name>"` (RA-R4.5), the phase rules for that role, and the honesty rules: never invent defects, readings, metrics or results; on a tool error, report the code and message and stop (RA-R4.8). No prompt contains an em dash.

Inspectors raise defects as one line each. The moderator copies the lines to the scribe without changing them, and the scribe maps each field to one `log_defect` argument (RA-R4.7):

```text
DEFECT | by=inspector-logic | unit=U003 | file=src/core/gate.ts | side=new | lines=12-14 | type=logic | class=wrong | severity=major | checklist=typescript-03 | description=One or two sentences saying what is wrong and why.
NO DEFECTS | by=inspector-logic | unit=U004
```

| Field | `log_defect` argument | Values (from `packages/fagan-mcp/src/core/schema.ts`) |
| --- | --- | --- |
| `by` | `raised_by` | `inspector-logic`, `inspector-interfaces` |
| `unit` | `unit_id` | `U` and three or more digits |
| `file` | `file` | the unit's file, as `get_packet` returns it |
| `side` | `side` | `new`, `old` |
| `lines` | `line_start`, `line_end` | `first-last`, inside the unit on that side |
| `type` | `type` | `logic`, `interface`, `data`, `documentation`, `other` |
| `class` | `class` | `missing`, `wrong`, `extra`; `-` leaves it out |
| `severity` | `severity` | `major`, `minor` |
| `checklist` | `checklist_item_id` | an item of the unit's checklist; `-` leaves it out |
| `description` | `description` | the rest of the line, at most 2000 characters |

`description` is the last field, so a ` | ` inside it does not split it. The scribe replies `D004 <- <line>` for each logged line, or `ERROR <code>: <message> <- <line>`, or `ERROR MALFORMED: <what is missing>` when a field is missing or out of range (RA-R4.6). The server checks the location, checklist item and `raised_by` again (FM-R6.3 to FM-R6.6), so a wrong copy is refused, not stored.

## Meeting flow

PLAN.md section 10 steps 1 to 6, as the moderator prompt runs them:

1. The Author asks the moderator to inspect, for example after the Stop hook's suggestion. The Author switches with `kiro-cli chat --agent moderator` or `/agent swap moderator` ([slash commands](https://kiro.dev/docs/reference/slash-commands.md)), or with the IDE agent picker ([custom agents](https://kiro.dev/docs/custom-agents/)).
2. The moderator calls `open_inspection` with the Author's `base` and `head` (defaults `HEAD` and `WORKTREE`), and `author_overview` only when the Author wrote one. If the entry criteria fail, it reports the error code and details and stops. Nothing is stored (FM-R2.4 to FM-R2.8).
3. The moderator starts `inspector-logic`, then `inspector-interfaces`, asking each to prepare: `get_packet` with `phase: "preparation"`, paging until `next_cursor` is null, then reply with DEFECT or NO DEFECTS lines per unit. The moderator keeps both replies.
4. The moderator calls `get_packet` with `phase: "meeting"`, which moves the inspection to Meeting (FM-R3.4), and pages through every unit ID. A `WRONG_PHASE` here means preparation did not happen; it reports that and stops.
5. For each batch of at most five units, in packet order:
   1. The reader gets the inspection ID and unit IDs, records one reading per unit with `record_reading`, and replies with its paraphrases and any judgment flags.
   2. Each inspector gets the inspection ID, the unit IDs, the reader's paraphrases and its own prepared lines for those units, and replies with its final DEFECT or NO DEFECTS lines.
   3. The moderator sends every DEFECT line from both replies, unchanged, with the inspection ID, to the scribe. It skips the scribe when there are none.
   4. The scribe replies with one defect ID or one error per line. The moderator shows errors to the Author and does not correct lines itself.
6. When every unit has a reading, the moderator calls `close_meeting` (FM-R7.2 refuses it otherwise), then `metrics` and `export_report`, and gives the Author the defect list, totals, metrics (with any `null` values and reasons) and report paths.

How inspector findings reach the scribe: each delegated agent has its own context window (sub-agents page), so the design assumes a sub-agent knows only what the moderator puts in its request, and the moderator prompt tells it to send everything the sub-agent needs. FEAT-003 (E7) observes this live. The inspectors cannot call `log_defect` or start the scribe, so the only path from an inspector's finding to the defect log is its reply, copied by the moderator into the scribe's request. That is why the line format is fixed and why the moderator prompt forbids adding, dropping, merging, reordering or rewording lines. The defect's `raised_by` is the inspector named in the line, and the server stores `recordedBy: "scribe"` (FM-R6.7), so the record shows who raised and who logged each defect.

Rework and follow-up are not part of the meeting. The moderator tells the Author to record rework from the default agent and, when asked, calls `follow_up` and reports the result.

## The Author and record_rework

No role agent can call `record_rework` (RA-R8.1): no agent lists it, every agent denies `fagan/record_rework`, and `fagan-mcp` accepts only the `author` role for it (FM-R8.1), a role no agent has.

The Author calls `record_rework` from Kiro's default agent. PLAN.md section 10 first planned to give the default agent an `ask` rule for it. The repo cannot ship that: workspace permissions are stored per user at `~/.kiro/workspace-roots/<hash>/permissions.yaml`, outside the repo, and "A cloned repo cannot inject permission rules" ([permissions](https://kiro.dev/docs/permissions.md)). Kiro already asks before MCP tool calls by default, so the Author approves each call. The remaining risk is the Author choosing a persistent approval. `.kiro/steering/inspection-ritual.md` step 6 and the moderator prompt tell the Author not to choose "Always allow" for `record_rework`; the root README repeats it in step 7 (RA-R8.2).

The after-rework hook and `fagan follow-up` never record rework or waive anything. They only run follow-up, which checks the Author's records (fagan-mcp design.md "CLI").

## Hooks

All three hooks use the documented v1 file format with one hook per file, a command action and an explicit `timeout` in seconds (RA-R6.4). Command actions run in the project root and get the session context JSON on stdin. Exit 0 adds stdout to the agent's context. Any other exit code sends stderr to the agent and, for `PreToolUse`, blocks the tool call ([hook actions](https://kiro.dev/docs/hooks/actions/)). Hooks cannot call MCP tools, so each one runs the `fagan` CLI through the launcher. None has a `confirm` block yet; E5 decides whether the suggestion gets one.

### suggest-inspection

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Suggest a Fagan inspection",
      "description": "After each agent turn, suggest asking the moderator agent to open an inspection when the working tree has more than suggestThresholdLoc changed lines against HEAD (.fagan/config.json) that no open inspection covers. Prints nothing otherwise and always exits 0.",
      "trigger": "Stop",
      "action": { "type": "command", "command": "node scripts/fagan-hook.mjs hook suggest" },
      "timeout": 30,
      "enabled": true
    }
  ]
}
```

- `Stop` fires at the end of every agent turn on every surface; `PostTaskExec` fires only after spec tasks (PLAN.md section 11.1).
- `hook suggest` always exits 0 (FM-R15.3), so its one-line suggestion goes into the agent's context and never interrupts the session.
- `timeout` 30: the command runs `git diff` and reads the store, without the build or tests.

### commit-gate

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Fagan commit gate",
      "description": "Before a shell tool call, block any git commit (exit 2) while an inspection that is not Closed or Abandoned has an open major defect, one that is neither verified nor waived by the Author. Other commands pass with exit 0.",
      "trigger": "PreToolUse",
      "matcher": "shell",
      "action": { "type": "command", "command": "node scripts/fagan-hook.mjs hook gate" },
      "timeout": 30,
      "enabled": true
    }
  ]
}
```

- Matcher `shell` is the shell category tag (`execute_bash` or `execute_pwsh`, [built-in tools](https://kiro.dev/docs/tools.md)).
- `hook gate` exits 2 to block (FM-R16.3). The actions page says any non-zero exit blocks `PreToolUse`; the [IDE 1.0 hooks page](https://kiro.dev/docs/ide/whats-new-v1/hooks.md) says exit 2 blocks. Exit 2 blocks under both (E3).
- `timeout` 30: the gate runs before every shell call, so it must stay short. Only for a commit does it look up the repository with git and read the store; it never runs the build.
- Scope: the gate stops an agent's ordinary `git commit` through Kiro. The known gaps are in the fagan-mcp design.md "Commit gate scope". A commit the human types in a terminal is not gated.

### after-rework

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Fagan follow-up after rework",
      "description": "After the Author's record_rework call, re-run the configured build and tests and the follow-up exit rule for the latest inspection in Rework or FollowUp, and print which majors still block. The timeout covers two commands at commandTimeoutMs 600000 each, plus 60 s.",
      "trigger": "PostToolUse",
      "matcher": "@fagan/record_rework",
      "action": { "type": "command", "command": "node scripts/fagan-hook.mjs follow-up --latest" },
      "timeout": 1260,
      "enabled": true
    }
  ]
}
```

- Matcher `@fagan/record_rework` is the documented `@<server>/<tool>` selector. V3 payloads name the tool `mcp_fagan_record_rework`; whether the selector matches it is E4.
- `follow-up --latest` runs follow-up on the highest-numbered inspection in Rework or FollowUp, prints the result and exits 0 (FM-R15.4), so the agent sees which majors still block.
- `timeout` 1260 seconds (RA-R6.5). Follow-up runs the configured build and then the tests, each as its own command with `commandTimeoutMs` (600000 ms in `.fagan/config.json`, FM-R2.8). The worst case is 2 x 600 s = 1200 s, plus 60 s for Node start-up, git and store reads. With this timeout, fagan's own runner stops a slow build or test run first: follow-up then stores nothing (FM-R1.3) and the CLI prints `{ code: "COMMAND_TIMEOUT", message }` to stderr and exits 1 (FM-R15.7), which the hook actions page says reaches the agent. A shorter hook timeout could end the hook before that, and the agent would not learn why follow-up gave no result. Normal runs are far shorter: FEAT-001 measured build plus tests at about 33 to 36 s on this machine. The 60 s default would leave less than a 2x margin, and the test suite grows with each step.

## Hook launcher

`scripts/fagan-hook.mjs` is a Node ESM script with no dependencies. Every hook runs `node scripts/fagan-hook.mjs <args>` instead of `node packages/fagan-mcp/dist/cli.js <args>` (the command in PLAN.md section 11).

Why: `packages/fagan-mcp/dist/` is build output and is gitignored. In a fresh clone before `npm run build`, `node packages/fagan-mcp/dist/cli.js hook gate` exits non-zero because the file is missing. A `PreToolUse` hook whose command exits non-zero blocks the tool call (hook actions page), and the commit gate matches every shell call. So the agent could not run any shell command, including the `npm run build` that would fix it.

Behaviour (RA-R7):

- `CLI_PATH` is `../packages/fagan-mcp/dist/cli.js` resolved from `import.meta.url`, so it does not depend on the hook's working directory (RA-R7.1).
- When `CLI_PATH` exists: `spawnSync(process.execPath, [CLI_PATH, ...args], { stdio: "inherit" })`, with an argument array and no shell. The launcher exits with the child's status, or 1 if it has none or could not start (RA-R7.1).
- When it is missing:
  - `hook gate` reads the payload from stdin and takes the command as the CLI does (`COMMAND_FIELDS = ["command", "cmd"]`, string values only). A possible commit gets a message naming `npm run build` on stdout and stderr and exit 2 (`EXIT_BLOCK`, the same as the CLI). Any other command exits 0 silently. An empty or non-JSON payload, or one with no command string, exits 0 with a warning on stderr (RA-R7.2, RA-R7.3), the same fail-open rule as FM-R16.5.
  - `hook suggest` and `follow-up` print a message naming `npm run build` to stdout (exit 0 adds stdout to the agent's context) and stderr, and exit 0 (RA-R7.4).
  - Anything else prints the message to stderr and exits 1 (RA-R7.6).
- The module exports `CLI_PATH`, `EXIT_BLOCK`, `COMMAND_FIELDS`, `commandFromPayload`, `couldBeGitCommit` and `main`, and runs `main` only when it is the entry script, so tests can import it.

The fallback classifier `couldBeGitCommit` must not let through any commit the built gate would check (RA-R7.5). The built gate (`isGitCommitCommand` in `src/core/gate.ts`) needs a word that is exactly `commit` after quote removal. Without command substitution, the only characters the tokeniser drops from inside a word are quotes, backslashes and escaped newlines, so removing those from the command leaves `commit` as a substring. The built gate also leaves the output of `$(...)` and backticks out of a word, so when the command contains either, any `c`, `o`, `m`, `m`, `i`, `t` in that order counts. The classifier is deliberately coarse: before the first build it also blocks commands such as `echo commit`, with a message saying to run `npm run build`. That only lasts until the build, and the build command itself is never blocked.

## MCP request timeout

`open_inspection` and `follow_up` run the build and tests inside the `fagan` server. The configuration reference gives MCP servers a per-call `requestTimeout` with a default of 120000 ms, and `kiro-cli mcp status --name fagan` printed `Timeout : 120000 ms` in step 2 (docs/experiments.md). FEAT-001 measured build plus tests at about 33 to 36 s, about a 3.4x margin, so `.kiro/settings/mcp.json` is unchanged.

Risk: if the test suite grows past about 120 s, or a loaded machine doubles it, Kiro could time out an `open_inspection` or `follow_up` call while the server is still running the commands. Before adding `requestTimeout` to `.kiro/settings/mcp.json`, confirm on the [MCP configuration](https://kiro.dev/docs/mcp/configuration/) page that the workspace file accepts it (the configuration reference documents it for an agent's `mcpServers`), then check it with `kiro-cli mcp status --name fagan`.

## Validator findings (E11)

`kiro-cli agent validate --path` exited 0 with no output for all five agents, and `kiro-cli agent list` listed all five as `Workspace (v3 format)` (docs/experiments.md E11). Probes on throwaway copies in a temp folder showed what the validator checks: it rejected a `tools` value of the wrong JSON type and a `file://` prompt that does not exist, and it accepted an unknown top-level field, an unknown capability name, an unknown effect and the CLI 2.x field `allowedTools`. So `kiro-config.test.ts` parses every agent and hook file with strict zod schemas that list the documented fields, capabilities, effects and triggers (RA-R9.1), and checks scopes and rules itself.

## Experiments still to run (FEAT-003)

The docs answer some of these on paper. FEAT-003 runs each one live in a scratch repo under the system temp dir and records the result in `docs/experiments.md`. The fallbacks are from PLAN.md section 2.4.

| ID | Question | What the docs say | Fallback if it fails |
| --- | --- | --- | --- |
| E1 | Do workspace hooks fire in a V3 session driven over ACP? | V3 headless runs load workspace hooks; ACP behaviour and ACP workspace trust are not documented | Demo hooks in interactive `kiro-cli` or the IDE |
| E2 | Shell tool ID and the command field in `tool_input` | `execute_bash` (tools page); the headless page also names `run_command` | The gate reads `command`, then `cmd`; FEAT-003 adds the real field to `COMMAND_FIELDS` in `src/cli.ts` and the launcher if it differs (fagan-mcp task 16) |
| E3 | Does exit 2 block the shell call in CLI V3, and where does stderr show? | Any non-zero exit blocks `PreToolUse` and stderr goes to the agent (actions page); exit 2 (IDE 1.0 page) | Record the discrepancy |
| E4 | Does matcher `@fagan/record_rework` match `mcp_fagan_record_rework`? | Matchers are tool selectors; V3 payloads use `mcp_<server>_<tool>` | Matcher `mcp_fagan_record_rework`, then `@fagan` with a script-side filter |
| E5 | Does a `Stop` hook `confirm` block work over ACP? | `confirm` with `question`, `options` and `confirmCommand` is documented for `Stop` command hooks | Plain stdout suggestion (the current design) |
| E7 | Agent switching through ACP; project agents as sub-agents; nesting depth | Custom agents are ACP modes (`session/set_mode`) | `kiro-cli chat --agent moderator` in a terminal |
| E8 | Does the scribe keep `log_defect` as the moderator's sub-agent? | Yes, with the parent allow rules above | The Author's default agent starts the scribe directly |
| E12 | Units and default of the hook `timeout` field | Seconds, default 60, 0 disables | An explicit `timeout` on every hook (already done) |
| E16 | Is the `Stop` and `PostToolUse` payload the same shape as `PreToolUse`? | The documented example has `hook_event_name`, `cwd`, `session_id`, `tool_name`, `tool_input` | Scripts rely only on `cwd`, falling back to the process working directory (already the CLI's rule) |

Results from FEAT-003 pass A (2026-11-16, kiro-cli 3.3.0, `docs/experiments.md` has the commands and output):

- E1: workspace hooks fire over ACP only when the client's `initialize` sends `clientCapabilities._meta.kiro.hooks` `{ enabled: true, v2: true }`. kiro.dev does not document this; it was found in the installed agent server, and T3 Code's own Kiro sessions log the line it produces, so T3 Code turns hooks on. `scripts/acp-probe.mjs` sends it by default. Headless `kiro-cli chat --v3 --no-interactive` also runs the workspace hooks, with the local login and no API key. No fallback needed; the hook files are unchanged.
- E2: hook `tool_name` `execute_bash` (ACP tool call IDs start `run_command_`), command in `tool_input.command`, plus `tool_input.cwd` for the shell tool's working directory. `COMMAND_FIELDS` is unchanged in `src/cli.ts` and `scripts/fagan-hook.mjs`; the CLI gate now starts from `tool_input.cwd` (FM-R16.2). The launcher's fallback gate needs no directory: it blocks any possible commit.
- E3: exit 2 blocked a real `git commit --allow-empty` over ACP with an open major; the agent received the gate's message, while the ACP client got a `failed` `tool_call_update` with no content. No permission prompt appeared for the blocked commit.
- E16: `Stop` has only `session_id`, `hook_event_name`, `cwd`; `PostToolUse` is the `PreToolUse` payload plus `tool_response`. The scripts' `cwd`-only rule holds.
- Workspace trust over ACP: no trust prompt or trust request; the scratch repo's agents, MCP server and hooks loaded, and `~/.kiro/workspace-roots/` was not created.
- Every session sends one `_kiro/customAgent/config_error` per file in `.kiro/agents/prompts/` (`AgentFileFormatError: No front matter found`): Kiro also reads `.md` files under `.kiro/agents/` as agent files. The five JSON agents still load. Moving the prompts out of `.kiro/agents/` would silence it; not changed yet.

Known open risks for FEAT-003 and FEAT-004:

- Workspace trust: interactive CLI V3 asks to trust a workspace before loading its hooks, agents, MCP servers and steering (permissions page). Trust is the human's decision; no agent writes a trust record.
- The `read` tag includes `code`, which the tools page also lists under `write`. The `fs_write` deny rule applies to write tools; whether `code` ever writes through that check is not stated on the pages read.

## Deviations from PLAN.md

- Resources list specific steering files, not `file://.kiro/steering/**/*.md` (section "Resources and steering").
- Hooks run the launcher, not `node packages/fagan-mcp/dist/cli.js` (section "Hook launcher").
- The moderator has `mcp` allow rules for its sub-agents' tools (section "Permission evaluation and E8").
- The default agent gets no `ask` rule from the repo, because the repo cannot ship one (section "The Author and record_rework"). PLAN.md section 10 now says so.
- Whole-capability deny rules have no `match`, where PLAN.md section 10's illustration used `match: ["**"]` and `["*"]`. The permissions page shows a rule without `match` (`capability: fs_read`, `effect: allow`), and `**` is not supported in shell patterns.

## Testing strategy

- `packages/fagan-mcp/test/kiro-config.test.ts`: parses every agent and hook file with strict schemas, checks tool scopes against `ALLOWED_ROLES`, permission rules, prompt paths, resource limits and steering, hook triggers, matchers, commands and timeouts, and runs `kiro-cli agent validate` on every agent when `kiro-cli` is on PATH (skipped in CI, RA-R9.3).
- `packages/fagan-mcp/test/hook-launcher.test.ts`: fallback exit codes and messages on a copy of the launcher in a temp folder without `dist`, and forwarding of arguments, stdin and exit codes to the built CLI in a temp repo from `test/fixture.ts` (RA-R9.4). It never runs against this repo's `.fagan` store.
- `packages/fagan-mcp/test/hook-launcher.property.test.ts`: the fallback classifier property below. The generators are shared with the gate property P7 through `test/gate-arbitraries.ts`.
- `packages/fagan-mcp/test/acp-probe.test.ts`: the experiment client's launch arguments, transcript redaction and permission choices (RA-R10), using the request shapes from the [ACP migration guide](https://kiro.dev/docs/cli/v3/acp-migration.md).
- The launcher is loaded from TypeScript with a computed dynamic import and a typed interface (`test/launcher.ts`), so `tsc` strict passes without `allowJs`.

## Correctness properties

| # | Property | Test file | Test name | Requirements |
| --- | --- | --- | --- | --- |
| RA-P1 | For generated commands (commit segments, commit segments whose `git` and `commit` words are spelled with quotes, escapes, line continuations and substitutions, and safe segments, joined by separators), whenever `isGitCommitCommand` is true, `couldBeGitCommit` is true; at least 1000 of 3000 runs are commits | `hook-launcher.property.test.ts` | `RA-R7.5 the fallback blocks every command the built gate checks as a git commit` | RA-R7.5 |
| RA-P2 | The same implication for commit commands with up to six random fragments inserted (quotes, escapes, separators, `$(`, backticks, letters); at least 1000 of 5000 runs are still commits | `hook-launcher.property.test.ts` | `RA-R7.5 the fallback blocks every mutated command the built gate still checks as a git commit` | RA-R7.5 |
| RA-P3 | For any string of up to 40 characters without `c`, `o`, `m`, `m`, `i`, `t` in that order, `couldBeGitCommit` is false | `hook-launcher.property.test.ts` | `RA-R7.3 the fallback lets through commands with no c-o-m-m-i-t letters in order` | RA-R7.3 |
