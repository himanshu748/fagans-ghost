# Requirements: role-agents

## Introduction

The role agents, hooks and hook launcher run the Fagan ritual inside Kiro. Five Kiro custom agents in `.kiro/agents/` play the Moderator, the Reader, two Inspectors and the Scribe. Each one can reach only the `fagan` MCP tools its role needs. Three Kiro hooks in `.kiro/hooks/` suggest an inspection, block `git commit` while majors are open, and run follow-up after rework. The hooks start the `fagan` CLI through a small launcher, `scripts/fagan-hook.mjs`. The human is the Author. No agent plays the Author, and no agent can record rework or waive a defect.

Source: PLAN.md sections 10 and 11, and the Kiro pages listed in design.md "Kiro docs used". Acceptance criteria use EARS form ("WHEN [condition/event] THE SYSTEM SHALL [expected behavior]", per [Kiro feature specs](https://kiro.dev/docs/specs/feature-specs/)). Every criterion has an ID `RA-R<n>.<m>`; tests put that ID in their names. The tool names and role values come from `fagan-mcp` (`.kiro/specs/fagan-mcp/requirements.md`).

Glossary:

- **Role agent**: one of the five custom agents `moderator`, `reader`, `inspector-logic`, `inspector-interfaces` and `scribe`.
- **Role value**: the `role` argument of a `fagan` tool call. For a role agent it is the agent's name (`ROLES` in `packages/fagan-mcp/src/core/schema.ts`).
- **Allowed roles**: the roles `fagan-mcp` accepts for a tool (`ALLOWED_ROLES` in `packages/fagan-mcp/src/core/roles.ts`). The server's role check is advisory; Kiro's `tools` and `permissions` are the enforcement (PLAN.md section 6.1).
- **Registered tool**: one of the nine tools the `fagan` server registers (`TOOL_NAMES` in `packages/fagan-mcp/src/server/server.ts`).
- **Sub-agent**: a role agent the moderator starts through a `subagent/<name>` tool. Each delegated agent has its own context window ([sub-agents](https://kiro.dev/docs/custom-agents/subagents.md)), so it sees only what the moderator sends it.
- **Parent session policy**: the permission rules Kiro checks a sub-agent's tool calls against, in addition to the sub-agent's own rules: user and workspace `permissions.yaml`, the parent agent's `permissions`, and approvals given earlier in the session ([sub-agents](https://kiro.dev/docs/custom-agents/subagents.md)).
- **Whole-capability deny rule**: a permission rule with a `capability`, `effect: "deny"`, and no `match` or `exclude`.
- **DEFECT line**: one line of an inspector's reply that raises one defect, in the format of RA-R4.7.
- **Built CLI**: `packages/fagan-mcp/dist/cli.js`, produced by `npm run build`.
- **Launcher**: `scripts/fagan-hook.mjs`, the command every hook runs.
- **Possible commit**: a shell command the launcher's fallback classifier (`couldBeGitCommit`) says could be a git commit.
- **Author**: the human. The Author works with Kiro's default agent, not with a role agent.

## Requirement 1: The five role agents

**User story:** As the Author, I want one Kiro custom agent per Fagan role, so that each role is played by an agent that can only do that role's part.

1. **RA-R1.1** WHEN Kiro loads custom agents from `.kiro/agents/` THE SYSTEM SHALL provide exactly five agent files, `moderator.json`, `reader.json`, `inspector-logic.json`, `inspector-interfaces.json` and `scribe.json`, and no agent for the Author.
2. **RA-R1.2** WHEN an agent file is read THE SYSTEM SHALL have its `name` equal to the file name without `.json`, and that name SHALL be a role value `fagan-mcp` accepts.
3. **RA-R1.3** WHEN an agent file is read THE SYSTEM SHALL have exactly the fields `name`, `description`, `prompt`, `includeMcpJson`, `tools`, `permissions`, `resources` and `welcomeMessage`, where `description` is one line that starts with `Fagan inspection ` and names the role (so automatic sub-agent selection can pick it), `prompt` is `file://./prompts/<name>.md` and `includeMcpJson` is `true`. No agent SHALL set `model`, so every agent uses the model Kiro runs.
4. **RA-R1.4** WHEN `kiro-cli agent validate --path .kiro/agents/<name>.json` runs from the repo root THE SYSTEM SHALL exit 0 for every agent file.

## Requirement 2: Tool scopes

**User story:** As the Author, I want each role agent to see only the tools of its role, so that inspectors stay read-only and only the scribe can log defects.

1. **RA-R2.1** WHEN the moderator's `tools` are read THE SYSTEM SHALL list exactly, in this order, `read`, `@fagan/open_inspection`, `@fagan/get_packet`, `@fagan/close_meeting`, `@fagan/follow_up`, `@fagan/metrics`, `@fagan/export_report`, `subagent/reader`, `subagent/inspector-logic`, `subagent/inspector-interfaces` and `subagent/scribe`.
2. **RA-R2.2** WHEN the reader's `tools` are read THE SYSTEM SHALL list exactly `read`, `@fagan/get_packet` and `@fagan/record_reading`.
3. **RA-R2.3** WHEN the `tools` of `inspector-logic` or `inspector-interfaces` are read THE SYSTEM SHALL list exactly `read` and `@fagan/get_packet`.
4. **RA-R2.4** WHEN the scribe's `tools` are read THE SYSTEM SHALL list exactly `@fagan/get_packet` and `@fagan/log_defect`.
5. **RA-R2.5** WHEN any agent's `tools` are read THE SYSTEM SHALL contain only `read`, `@fagan/<tool>` and `subagent/<name>` entries, with no `*` or `?` in any entry, and SHALL NOT contain `write`, `shell`, `web`, `@builtin`, `*`, `@mcp`, `@fagan`, `subagent`, `invoke_sub_agent` or `@fagan/record_rework`.
6. **RA-R2.6** WHEN the tools of all agents are compared THE SYSTEM SHALL have only the scribe list `@fagan/log_defect`, only the reader list `@fagan/record_reading`, and no agent list `@fagan/record_rework`.
7. **RA-R2.7** WHEN an agent lists `@fagan/<tool>` THE SYSTEM SHALL have `<tool>` be a registered tool whose allowed roles include that agent's role value.
8. **RA-R2.8** WHEN the moderator's `subagent/<name>` entries are read THE SYSTEM SHALL name exactly the four other role agents, and no other agent SHALL list any `subagent/<name>` entry.

## Requirement 3: Permission rules

**User story:** As the Author, I want each agent's permission rules to deny everything outside its role, so that a role agent cannot write, run commands, browse or reach the Author's tools even if its tool list were wrong.

1. **RA-R3.1** WHEN any role agent's `permissions.rules` are read THE SYSTEM SHALL contain a whole-capability deny rule for each of `fs_write`, `shell`, `web_fetch` and `web_search`.
2. **RA-R3.2** WHEN any role agent's `permissions.rules` are read THE SYSTEM SHALL contain an `mcp` deny rule whose `match` includes `fagan/record_rework` and that has no `exclude`.
3. **RA-R3.3** WHEN the `permissions.rules` of the reader, an inspector or the scribe are read THE SYSTEM SHALL contain a whole-capability deny rule for `subagent`; the moderator SHALL have no `subagent` deny rule.
4. **RA-R3.4** WHEN the `permissions.rules` of the reader, an inspector or the scribe are read THE SYSTEM SHALL contain exactly one `mcp` deny rule matching `fagan/*`, and its `exclude` SHALL list exactly the `fagan` tools that agent lists in `tools`, as `fagan/<tool>`.
5. **RA-R3.5** WHEN the moderator's `permissions.rules` are read THE SYSTEM SHALL contain one `subagent` allow rule matching exactly the four other role agents, `mcp` allow rules matching exactly the `fagan` tools its sub-agents list (`fagan/get_packet`, `fagan/record_reading` and `fagan/log_defect`), and no other allow rule, because Kiro checks every sub-agent tool call against the parent session policy and prompts when that policy has no rule for the call (design.md "Permission evaluation and E8").
6. **RA-R3.6** WHEN any rule has effect `allow` or `ask` THE SYSTEM SHALL have its capability be `mcp` or `subagent`, SHALL give it a `match` list with no `*` or `?` in any pattern, and SHALL NOT match `fagan/record_rework`.
7. **RA-R3.7** WHEN any `mcp` rule names a tool in `match` or `exclude` THE SYSTEM SHALL use the documented `fagan/<tool>` form with a registered tool name, or `fagan/*`.

## Requirement 4: Prompts

**User story:** As the Author, I want each agent's prompt to state its part of the ritual and its honesty rules, so that the meeting record contains only what the roles actually did.

1. **RA-R4.1** WHEN the moderator runs an inspection THE SYSTEM SHALL have its prompt tell it to run the phases in the order of `.kiro/steering/inspection-ritual.md` (Planning, Overview, Preparation, Meeting, Close, then hand Rework to the Author, then Follow-up), and to report the error code and stop WHEN `open_inspection` fails, WHEN any tool returns `WRONG_PHASE`, or WHEN a sub-agent cannot do its part.
2. **RA-R4.2** WHEN the moderator delegates THE SYSTEM SHALL have its prompt tell it to give every sub-agent the inspection ID, the unit IDs and all text it needs, because each sub-agent has its own context window; to forward every DEFECT line from the inspectors to the scribe unchanged; and never to log defects, record readings, record rework or write the Author's overview note.
3. **RA-R4.3** WHEN the reader is given units THE SYSTEM SHALL have its prompt tell it to paraphrase each unit in plain English, record one reading per unit with `record_reading`, describe what the lines do without judging them or suggesting changes, and report any judgment words the server flags.
4. **RA-R4.4** WHEN an inspector prepares or attends the meeting THE SYSTEM SHALL have its prompt tell it to call `get_packet` with `phase: "preparation"` and page with `next_cursor` until it is null, read each unit against its checklist, and raise defects only as DEFECT lines in its reply, or one `NO DEFECTS` line for a unit with none. `inspector-logic` SHALL focus on `logic` and `data` defects and `inspector-interfaces` on `interface` and `documentation` defects.
5. **RA-R4.5** WHEN any prompt is read THE SYSTEM SHALL state the role value the agent passes on every `fagan` tool call, written as `"role": "<name>"`, and SHALL contain no U+2014 em dash.
6. **RA-R4.6** WHEN the scribe receives DEFECT lines THE SYSTEM SHALL have its prompt tell it to call `log_defect` once per line with `raised_by` set to the line's `by` value and every other field copied exactly, never to add a defect of its own, not to log a line with a missing or out-of-range field (reply `ERROR MALFORMED` for it instead), and to report a `log_defect` error without retrying with changed values.
7. **RA-R4.7** WHEN the inspector and scribe prompts describe a defect THE SYSTEM SHALL use the fixed line format `DEFECT | by=<role> | unit=<unit> | file=<file> | side=<new|old> | lines=<first>-<last> | type=<type> | class=<class or -> | severity=<severity> | checklist=<item or -> | description=<text>`, with the types `logic`, `interface`, `data`, `documentation` and `other`, the classes `missing`, `wrong` and `extra`, and the severities `major` and `minor` from `packages/fagan-mcp/src/core/schema.ts`.
8. **RA-R4.8** WHEN any role agent cannot do a step THE SYSTEM SHALL have its prompt tell it never to invent defects, readings, metrics or results, and to report the error code and message and stop.

## Requirement 5: Resources and steering

**User story:** As a developer, I want each agent to load its prompt and the steering it needs within Kiro's limits, so that the agents know the ritual and the project rules.

1. **RA-R5.1** WHEN an agent's `prompt` is resolved relative to the agent file's folder THE SYSTEM SHALL find an existing file in `.kiro/agents/prompts/`.
2. **RA-R5.2** WHEN an agent's `file://` resources are expanded from the workspace root THE SYSTEM SHALL name at least one and at most 32 existing files, each at most 1 MiB and 50,000 characters, with at most 100,000 characters in total (the limits on the [configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/)).
3. **RA-R5.3** WHEN an agent's `resources` are read THE SYSTEM SHALL list `file://.kiro/steering/product.md` and `file://.kiro/steering/inspection-ritual.md` for every agent, and also `file://.kiro/steering/tech.md` for the moderator and both inspectors, because the [steering page](https://kiro.dev/docs/steering/) says custom agents do not include steering automatically and a sub-agent that declares its own `file://` resources loads those instead of the parent's.

## Requirement 6: Hooks

**User story:** As the Author, I want hooks to start and guard the ritual automatically, so that inspections are suggested, open majors block commits, and follow-up runs after each rework record.

1. **RA-R6.1** WHEN an agent turn ends THE SYSTEM SHALL run `node scripts/fagan-hook.mjs hook suggest` from `.kiro/hooks/suggest-inspection.json`, with trigger `Stop`, no `matcher` and `timeout` 30.
2. **RA-R6.2** WHEN an agent is about to call a shell tool THE SYSTEM SHALL run `node scripts/fagan-hook.mjs hook gate` from `.kiro/hooks/commit-gate.json`, with trigger `PreToolUse`, matcher `shell` and `timeout` 30, so a git commit is blocked with exit 2 while an inspection has an open major (FM-R16.3).
3. **RA-R6.3** WHEN a `fagan` `record_rework` call completes THE SYSTEM SHALL run `node scripts/fagan-hook.mjs follow-up --latest` from `.kiro/hooks/after-rework.json`, with trigger `PostToolUse` and matcher `@fagan/record_rework`.
4. **RA-R6.4** WHEN `.kiro/hooks/` is read THE SYSTEM SHALL contain exactly `suggest-inspection.json`, `commit-gate.json` and `after-rework.json`, each `{ "version": "v1", "hooks": [ ... ] }` with one hook that has `name`, `description`, a trigger from the documented PascalCase list, an optional `matcher`, a `command` action of the form `node scripts/fagan-hook.mjs <hook suggest | hook gate | follow-up --latest>`, an explicit whole-number `timeout` in seconds, `enabled: true`, and no other field (no `confirm` block until experiment E5 is run).
5. **RA-R6.5** WHEN the after-rework hook's `timeout` is set THE SYSTEM SHALL make it at least `2 * commandTimeoutMs / 1000 + 60` seconds (1260 for `commandTimeoutMs` 600000 in `.fagan/config.json`), because follow-up runs the build and then the tests, each with up to `commandTimeoutMs`.

## Requirement 7: Hook launcher

**User story:** As someone who has just cloned the repo, I want the hooks to keep working before the first build, so that the commit gate cannot lock the agent out of the shell it needs to run `npm run build`.

1. **RA-R7.1** WHEN the built CLI exists THE SYSTEM SHALL resolve it from the launcher's own folder (`../packages/fagan-mcp/dist/cli.js` from `import.meta.url`), not from the working directory, run it with `process.execPath` and an argument array, without a shell and with the launcher's stdin, stdout and stderr, and exit with the CLI's exit status, or 1 if it has none.
2. **RA-R7.2** WHEN the built CLI is missing and `hook gate` reads a payload whose command, taken as the CLI takes it (`tool_input.command`, then `tool_input.cmd`, string values only), is a possible commit THE SYSTEM SHALL write a message naming `npm run build` to stdout and stderr and exit 2, the same code as the CLI's `EXIT_BLOCK`.
3. **RA-R7.3** WHEN the built CLI is missing and `hook gate` reads a command that is not a possible commit THE SYSTEM SHALL exit 0 with no output; WHEN the payload is empty, is not JSON, or has no command string THE SYSTEM SHALL write a warning naming `npm run build` to stderr and exit 0. A command without the letters `c`, `o`, `m`, `m`, `i`, `t` in that order SHALL never be a possible commit.
4. **RA-R7.4** WHEN the built CLI is missing and the launcher runs `hook suggest` or `follow-up` THE SYSTEM SHALL write a message naming `npm run build` to stdout and stderr and exit 0.
5. **RA-R7.5** WHEN `isGitCommitCommand` in `packages/fagan-mcp/src/core/gate.ts` returns true for a command THE SYSTEM SHALL have the fallback classifier also return true for it, so the fallback never lets through a commit the built gate would check.
6. **RA-R7.6** WHEN the built CLI is missing and the launcher runs any other command THE SYSTEM SHALL write a message naming `npm run build` to stderr and exit 1.

## Requirement 8: The Author's final word

**User story:** As the Author, I want rework and waivers to be mine alone, so that no agent can close an inspection by declaring its own defects fixed or waived.

1. **RA-R8.1** WHEN any role agent runs THE SYSTEM SHALL give it no way to call `record_rework`: no agent lists `@fagan/record_rework` in `tools`, and every agent has an `mcp` deny rule for `fagan/record_rework`.
2. **RA-R8.2** WHEN the Author records rework THE SYSTEM SHALL have the Author call `record_rework` from Kiro's default agent, where Kiro asks before each MCP tool call by default ([permissions](https://kiro.dev/docs/permissions.md)). The repo SHALL ship no permission rule for the default agent, because workspace permissions live outside the repo, and `.kiro/steering/inspection-ritual.md`, the moderator prompt and the root README (step 7) SHALL tell the Author not to choose "Always allow" for `record_rework`.

## Requirement 9: Config tests

**User story:** As a maintainer, I want tests that check the Kiro config against `fagan-mcp`, so that a typo in an agent or hook file cannot silently widen a role.

1. **RA-R9.1** WHEN `packages/fagan-mcp/test/kiro-config.test.ts` runs THE SYSTEM SHALL parse every `.kiro/agents/*.json` and `.kiro/hooks/*.json` with strict schemas, so an unknown field, capability, effect or trigger fails the test, because `kiro-cli agent validate` accepted an unknown field, capability and effect (docs/experiments.md E11).
2. **RA-R9.2** WHEN the config test checks tool names THE SYSTEM SHALL compare every `fagan` tool named in agent tools, permission rules and hook matchers with the registered tools, SHALL check that the registered tools equal the keys of `ALLOWED_ROLES` without `get_packet:meeting`, and SHALL check that `.kiro/settings/mcp.json` registers server `fagan`.
3. **RA-R9.3** WHEN `kiro-cli` is not on PATH (as in CI) THE SYSTEM SHALL skip the `kiro-cli agent validate` test instead of failing it.
4. **RA-R9.4** WHEN the launcher tests run THE SYSTEM SHALL run the fallback cases on a copy of the launcher in a temp folder with no built CLI, and the forwarding cases with the working directory set to a temp git repo, never against this repo's own `.fagan` store.
