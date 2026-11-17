# Experiments

Results of the experiments listed in PLAN.md section 2.4. Each row records what was actually tried and seen, including failures. "Not run yet" means nobody has tried it.

| ID | Question (short) | Step | Status | Result |
| --- | --- | --- | --- | --- |
| E1 | Do workspace hooks fire in a V3 session driven by T3 Code over ACP? | 3 | Done | Yes, once `initialize` sends `clientCapabilities._meta.kiro.hooks` `{ enabled: true, v2: true }`, which T3 Code sends. Without it no hook runs. See below |
| E2 | Shell tool ID and command field in `tool_input` | 3 | Done | Hook `tool_name` `execute_bash` (ACP tool call IDs start `run_command_`); command in `tool_input.command`; `tool_input.cwd` is the shell tool's working directory, `null` unless the agent sets it. See below |
| E3 | Does exit code 2 block the shell call in CLI V3? Where does stderr show? | 3 | Done | Yes: a live `git commit --allow-empty` was blocked over ACP with one open major, commit count stayed 1. The agent got the gate's message; the ACP client got only a `failed` tool update. See below |
| E4 | Does matcher `@fagan/record_rework` match `mcp_fagan_record_rework`? | 3 | Done | Yes: after a live `record_rework` call over ACP (hook `tool_name` `mcp_fagan_record_rework`), `.kiro/hooks/after-rework.json` ran `follow-up --latest`, which verified the fixed major and closed the scratch inspection. The matcher is unchanged. See below |
| E5 | Does a `Stop` hook `confirm` block work over ACP? | 3 | Done | Yes: it reaches the ACP client as a `session/request_permission` with the hook's options as `allow_once` and `reject_once`, and `{"skip":true}` from `confirmCommand` suppresses it. Choosing the `run: false` option started an extra agent turn with no task (2 of 2 runs), and `Stop` stdout is not given to the agent. The original hook stayed plain; the 2026-11-17 continuation adds a dynamic question with one acknowledgment option. That exact variant is locally tested; live retest is blocked by quota. See below |
| E6 | Does the T3 Code client expose `/spec`, `/agent`, `/hooks` and manual steering slash commands? | 2 | Partly run | See below |
| E7 | Agent switching through ACP; project agents as sub-agents; nesting depth | 3 | Done | `_meta.kiro.modeId: "moderator"` on `session/new` started the session in the moderator mode; the moderator started the `scribe` as a sub-agent (hook `tool_name` `subagent_scribe`) without a prompt. Depth tested: 1 (moderator to scribe). See below |
| E8 | Does the scribe keep `log_defect` as a sub-agent of the moderator? | 3 | Done | Yes: the scribe's `log_defect` ran with no permission request and stored D001 with `raisedBy` `inspector-logic` and `recordedBy` `scribe`. Control: with `fagan/log_defect` removed from the moderator's `mcp` allow rule (scratch copy), the same call asked the client first. See E7 |
| E9 | Command path resolution and server namespacing for a power's `mcp.json` | 5 | Not run yet | |
| E10 | Can a power ship steering files or hooks? | 5 | Not run yet | |
| E11 | Do all agent files pass `kiro-cli agent validate`? | 3 | Done | All five exit 0. The validator also accepted an unknown field, capability and effect. Follow-up: prompts moved to `.kiro/agent-prompts/` after Kiro read them as agent files; all five still exit 0 and the `config_error` notifications stopped. See below |
| E12 | Units and default of the hook `timeout` field | 3 | Done | Seconds: a `PostToolUse` hook that sleeps 5 s with `timeout` 2 got SIGTERM about 2 s after the tool finished, and a control with `timeout` 2 that sleeps 0.3 s ran to the end. Kiro reported both as `completed` and told neither the client nor the agent about the timeout. See below |
| E13 | Does `auto` steering inclusion trigger in CLI V3 for our description? | 2 | Not observed | See below |
| E14 | Do `skill://` resources in agent files load power skills? | 5 | Not run yet | |
| E15 | How do Kiro Correctness properties relate to our fast-check tests? | after 2, in IDE | Not run yet | Needs the Kiro IDE (you) |
| E16 | Is the `Stop` / `PostToolUse` payload the same shape as `PreToolUse`? | 3 | Done | No. `Stop` has only `session_id`, `hook_event_name`, `cwd`; `PostToolUse` is the `PreToolUse` payload plus `tool_response`. See E1 |

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

## Review v1 fixes (step 2)

A semantic review of the step 2 code (FEAT-001 to FEAT-003) on 2026-11-16 returned NEEDS_CHANGES with 7 issues. What changed for each, and the tests that cover it (all in `packages/fagan-mcp/test/`):

1. Rework and follow-up durations were mismeasured: rework was `followupStart - reworkStart`, so a `follow_up` before the first `record_rework` gave `null (non_positive_duration)` and later rework rounds counted as follow-up time. `src/core/metrics.ts` now sums time spent in each phase from `meetingEnd` and the follow-up attempt times (FM-R10.1, design.md "Metrics durations"); FM-R1.5 and FM-R8.5 now call `reworkStart` and `followupStart` informational stamps. Tests: `metrics.test.ts` (`FM-R10.1 rework sums every Rework visit in a fail-then-pass loop`, `FM-R10.1 FM-R10.3 follow-up time without defects, open and abandoned Rework`) and a rework duration assertion in `contract.test.ts`, whose flow runs a failing `follow_up` before any rework.
2. Concurrent tool calls in one server got `LOCKED`. `withLock` in `src/store/fs.ts` now queues same-process callers per lock path and retries another process's fresh lock every 25 ms for up to 2 s (FM-R13.2). Tests: `store.test.ts` (`queues concurrent calls from one process instead of returning LOCKED (review v1 issue 2)`, `parallel transacts on one inspection all succeed with one event each`, `waits for a lock that another process releases within the retry window`, `returns LOCKED while another process holds a fresh lock, and removes only its own lock`).
3. The gate's copy of the exit rule (`openMajorIds`) had no property test. Tests: `followup.property.test.ts` (`FM-R9.4 FM-R16.3 open majors right after an attempt equal its blocking IDs, and a later fix reopens a major`) and `cli.test.ts` (`FM-R9.3 FM-R16.3 a fixed major blocks until follow-up verifies it (review v1 issue 3)`).
4. The gate fails open until E2 confirms the payload field. Deliberate (FM-R16.5); carried into step 3, see "Review v1 follow-ups" below. No code change.
5. `hook suggest` fired again after every inspection with rework, and suggested diffs above `sizeLimitLoc`. Follow-up attempts now store working-tree blob hashes of the packet files (`AttemptSchema.blobs`, FM-R9.6), files whose content a Closed inspection's passing attempt accepted are not counted, and the message names `sizeLimitLoc` and `SIZE_LIMIT_EXCEEDED` (FM-R15.2). Tests: `cli.test.ts` (`FM-R15.2 stays quiet after a Closed inspection whose rework changed the diff (review v1 issue 5)`, `FM-R15.2 says when the diff is above sizeLimitLoc (review v1 issue 5)`). The report arbitrary in `report.property.test.ts` now generates `blobs` too.
6. `sudo`, `nice`, `timeout` and `xargs` let a commit through, and `git -C <other> commit` was checked against the payload `cwd`. `src/core/gate.ts` now knows `nice`, `timeout`, `stdbuf`, `xargs`, `sudo` and `doas` with their options, and `gitCommitTargets` returns the `-C`/`--chdir` directories that the CLI resolves in order (FM-R16.2). The remaining gaps are listed in design.md "Commit gate scope". Tests: `gate.test.ts` (wrapped and non-commit wrapper cases, `reports the directories a commit runs in, in order`), wrappers added to the generators in `gate.property.test.ts`, and `cli.test.ts` (`FM-R16.2 FM-R16.3 checks the repo named by git -C, not only the payload cwd (review v1 issue 6)`).
7. The no-newline marker was dropped from packets. `noNewlineAtEof` is now stored on unit lines in `packet.json`, returned by `get_packet` and printed as git's marker in `report.txt` (FM-R4.7). Test: `packet.test.ts` (`FM-R4.7 keeps the no-newline-at-end-of-file marker in packet units and report.txt`).

## Review v1 follow-ups (for step 3)

- E2 and the commit gate (review v1 issue 4): `fagan hook gate` reads `tool_input.command`, then `tool_input.cmd`, and allows the call with a stderr warning when neither is a string (FM-R16.5). If Kiro uses another field, every commit passes. Step 3 acceptance for the gate is "the gate blocked a real `git commit` in a live Kiro session", not only "payload field recorded". Tracked as task 16 in `.kiro/specs/fagan-mcp/tasks.md`. Done in step 3: see "E2 and E3" below.

## Review v2 fixes (step 2)

A second review on 2026-11-16, of the v1 fix pass (commit 647a96b), returned NEEDS_CHANGES with 4 issues. What changed for each, and the tests that cover it (all in `packages/fagan-mcp/test/`):

1. The v1 issue 6 fix opened the gate for `-C` words the shell expands (blocking regression). `git -C "$PWD" commit`, `git -C ~/<repo> commit`, `git -C "$(git rev-parse --show-toplevel)/src" commit` and `env -C $PWD git commit` resolved to folders that do not exist, found no repo and exited 0 while a major was open. The tokeniser in `src/core/gate.ts` now flags each word: `~` and `~/` (unquoted, no quoted character before the first `/`) become the home directory, and a word with `$`, a backtick, another tilde form or an unquoted `*`, `?`, `[` or `{` is reported as unknown. `commitRoot` in `src/cli.ts` checks the payload `cwd` repo when a directory is unknown or is not inside a git repo; an absolute `-C` after an unknown word is known again (FM-R16.2, design.md "Commit gate scope" lists the remaining gap). After the fix, a throwaway script drove a temp repo to Rework with one open major and piped each command into the built `fagan hook gate`: `git commit -m x` and all four commands above exited 2, as did `git -C does-not-exist commit -m x`; `git status` exited 0. Tests: `cli.test.ts` (`FM-R16.2 FM-R16.3 falls back to the payload cwd for -C words the shell would expand or that are not a repo (review v2 issue 1)`, nine commands plus the clean-repo and absolute-path cases) and `gate.test.ts` (`FM-R16.2 reports null for directory words the shell would expand`, `FM-R16.2 resolves quoted, escaped and tilde directory words as the shell would`).
2. `hook suggest` treated any amount of code added to an inspected file during Rework as covered. A covered file now adds its rework drift to the count: the added and deleted lines that differ between its diff in `diff.patch` and its current diff (`reworkDriftLoc` in `src/core/packet.ts`, FM-R15.2, design.md "CLI"). Tests: `packet.test.ts` (`FM-R15.2 rework drift counts the changed lines that differ between two diffs of a file`) and `cli.test.ts` (`FM-R15.2 counts code added during rework against the threshold (review v2 issue 2)`: a one-line fix plus 20 new lines gives 22 changed lines against a threshold of 10, and 20 lines added while a no-defect inspection waits in FollowUp give 20). The v1 issue 5 test now uses threshold 2, because its one-line fix is 2 lines of drift.
3. design.md "Commit gate scope" pointed at `tasks.md` task 15 for the step 3 live-block check. It now points at task 16. No code change.
4. No property checked the rework and follow-up totals. New property P8 in `metrics.property.test.ts` (`FM-R10.1 FM-R10.3 rework plus follow-up equals the time from meetingEnd to closedAt or abandonedAt`) generates time-ordered attempts, with and without defects, and checks the sum, non-negative values and which phase is `null`. Changing `at - since` to `at - start` in `reworkAndFollowupMs`, or dropping `entered.FollowUp = true`, makes it fail (counterexamples `[false,0,[1],"closed",0]` and `[true,0,[],"closed",0]`); both edits were reverted.

The review also listed `no_newline_at_eof` in a `get_packet` result over stdio as untested. The full-lifecycle test in `contract.test.ts` now checks that every unit line returned in Preparation carries the field. All values are `false` there, because every fixture file ends in a newline; the `true` case is covered in-process by `packet.test.ts` (`FM-R4.7 keeps the no-newline-at-end-of-file marker in packet units and report.txt`).

## E11: kiro-cli agent validate (step 3)

Run on 2026-11-16 with `kiro-cli 3.3.0`, from the repo root, on the five agent files in `.kiro/agents/` ([configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/)). `kiro-cli agent validate --help` lists only `--path` and `--verbose`.

```text
$ kiro-cli agent validate --path .kiro/agents/moderator.json
exit 0
$ kiro-cli agent validate --path .kiro/agents/reader.json
exit 0
$ kiro-cli agent validate --path .kiro/agents/inspector-logic.json
exit 0
$ kiro-cli agent validate --path .kiro/agents/inspector-interfaces.json
exit 0
$ kiro-cli agent validate --path .kiro/agents/scribe.json
exit 0
```

Each run printed nothing and exited 0, so there was nothing to fix. `kiro-cli agent list` from the repo root (colour codes removed):

```text
$ kiro-cli agent list
Workspace: ~/code/fagans-ghost/.kiro/agents
Global:    ~/.kiro/agents

* kiro_default            (Built-in)    Default agent
  inspector-interfaces    Workspace     (v3 format) Fagan inspection interfaces Inspector: read-only; prepares with
                                         get_packet and raises interface and documentation defects as DEFECT lines in
                                         its reply for the scribe to log.
  inspector-logic         Workspace     (v3 format) Fagan inspection logic Inspector: read-only; prepares with
                                         get_packet and raises logic and data defects as DEFECT lines in its reply for
                                         the scribe to log.
  kiro_help               (Built-in)    Help agent that answers questions about Kiro CLI features using documentation
  kiro_planner            (Built-in)    Specialized planning agent that helps break down ideas into implementation plans
  moderator               Workspace     (v3 format) Fagan inspection Moderator: opens an inspection with fagan-mcp, runs
                                         the phases in order, delegates to the reader, inspectors and scribe, and never
                                         logs defects or records rework.
  reader                  Workspace     (v3 format) Fagan inspection Reader: paraphrases each packet unit in plain
                                         English and records it with record_reading; describes the code and never judges
                                         it.
  scribe                  Workspace     (v3 format) Fagan inspection Scribe: the only role that calls log_defect; logs
                                         exactly the DEFECT lines the inspectors raised, with raised_by, and never adds
                                         its own.
exit 0
```

All five role agents are found as workspace agents. Kiro labels them `(v3 format)`. `kiro-cli agent upgrade --help` describes a "universal format both engines load" and says it leaves "V3-only" agents untouched. Whether the label means the V2 engine would skip these files was not tested: T3 Code runs Kiro with `--agent-engine=v3`, and `agent upgrade` rewrites files in place, so it was not run on the repo.

What the validator checks: a probe copied `scribe.json` and its prompt into a fresh folder from `mktemp -d` (outside the repo) and wrote six variants with a one-off `node -e` script. Each variant changes one thing in the copy:

| File | Change |
| --- | --- |
| `control.json` | none |
| `unknown-field.json` | adds `"notAField": true` |
| `unknown-capability.json` | first rule's `capability` is `"not_a_capability"` |
| `unknown-effect.json` | first rule's `effect` is `"maybe"` |
| `tools-not-array.json` | `tools` is the string `"@fagan/log_defect"` |
| `missing-prompt.json` | `prompt` is `file://./prompts/does-not-exist.md` |
| `allowed-tools-v2.json` | adds the CLI 2.x field `"allowedTools": ["@fagan/log_defect"]` |

Run from inside the temp folder:

```text
$ kiro-cli agent validate --path control.json
exit 0
$ kiro-cli agent validate --path unknown-field.json
exit 0
$ kiro-cli agent validate --path unknown-capability.json
exit 0
$ kiro-cli agent validate --path unknown-effect.json
exit 0
$ kiro-cli agent validate --path tools-not-array.json
Error: Json supplied at tools-not-array.json is invalid: invalid type: string "@fagan/log_defect", expected a sequence at line 6 column 30
exit 1
$ kiro-cli agent validate --path missing-prompt.json
Error: File URI not found: file://./prompts/does-not-exist.md (resolved to prompts/does-not-exist.md)
exit 1
$ kiro-cli agent validate --path allowed-tools-v2.json
exit 0
```

The temp folder was deleted afterwards. Conclusion: the validator checks JSON types and that a `file://` prompt exists, and it accepts unknown fields, unknown capability names and unknown effects. A typo such as `"capability": "fs_wirte"` or `"effect": "dney"` would pass it, and whether Kiro then ignores that rule was not tested. So `packages/fagan-mcp/test/kiro-config.test.ts` parses the agent and hook files with strict schemas that list the documented fields, capabilities, effects and triggers (RA-R9.1), and checks the tool scopes and rules itself. The same test runs `kiro-cli agent validate` on every agent when `kiro-cli` is on PATH (RA-R1.4) and skips it otherwise, as in CI.

### Follow-up: prompts moved out of .kiro/agents/ (2026-11-16, FEAT-005)

The problem, from FEAT-003 pass A: every ACP session in the scratch repos (transcripts `t0`, `e1`, `e1b`, `e2`, `e2c`) received five `_kiro/customAgent/config_error` notifications, one per file in `.kiro/agents/prompts/`. One of them, with the scratch folder shortened to `<scratch>`:

```json
{"jsonrpc":"2.0","method":"_kiro/customAgent/config_error","params":{"sessionId":"sess_61be341f-fc6a-478b-958b-c30648e671f3","path":"<scratch>/repo/.kiro/agents/prompts/inspector-interfaces.md","reasonCode":"invalid_config","error":"AgentFileFormatError: No front matter found"}}
```

The [custom agents](https://kiro.dev/docs/custom-agents/) page says agent files are `.kiro/agents/[name].json` or `.kiro/agents/[name].md` and that nested folders are read too, and the [configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/) says a Markdown agent file keeps its config in YAML front matter. The prompts have no front matter, so Kiro reported each one. The fix moved them with `git mv` to `.kiro/agent-prompts/<name>.md` and set each agent's `prompt` to `file://../agent-prompts/<name>.md`. The configuration reference resolves relative `file://` prompts "relative to the agent configuration file's directory" and gives `"file://../shared/prompt.md"` as "prompt.md in a parent directory". `.kiro/prompts/` was not used, because the [manage prompts](https://kiro.dev/docs/cli/chat/manage-prompts/) page makes it the folder for saved slash-command prompts. No other agent field changed. Reasons in `.kiro/specs/role-agents/design.md`, "Prompt folder".

The validator after the move, from the repo root:

```text
$ kiro-cli agent validate --path .kiro/agents/moderator.json
exit 0
$ kiro-cli agent validate --path .kiro/agents/reader.json
exit 0
$ kiro-cli agent validate --path .kiro/agents/inspector-logic.json
exit 0
$ kiro-cli agent validate --path .kiro/agents/inspector-interfaces.json
exit 0
$ kiro-cli agent validate --path .kiro/agents/scribe.json
exit 0
```

Each run printed nothing. To check that the validator really resolves `../` from the agent file's folder, a probe in a fresh `mktemp -d` folder held `.kiro/agents/scribe.json` and `.kiro/agent-prompts/scribe.md` (copies) plus `.kiro/agents/missing.json`, a copy of `scribe.json` whose `prompt` is `file://../agent-prompts/does-not-exist.md`:

```text
$ kiro-cli agent validate --path .kiro/agents/scribe.json          (cwd: the temp folder)
exit 0
$ kiro-cli agent validate --path .kiro/agents/missing.json         (cwd: the temp folder)
Error: File URI not found: file://../agent-prompts/does-not-exist.md (resolved to .kiro/agent-prompts/does-not-exist.md)
exit 1
$ kiro-cli agent validate --path <temp>/.kiro/agents/scribe.json   (cwd: /)
exit 0
```

So the validator resolves the prompt from the agent file's folder, not from the working directory, and fails when the file is missing. The temp folder was deleted afterwards. `kiro-cli agent list` from the repo root printed exactly the listing above (compared with `diff`, colour codes removed) and exited 0.

Live check over ACP, in the FEAT-003 scratch repos. Both got the new `.kiro/agents/` and `.kiro/agent-prompts/` in place of their old `.kiro/agents/` copy (`diff -r` against this repo: no differences), committed inside each scratch repo only (`<scratch>/clean` at `1a84b92`; `<scratch>/repo` at `634cea8` on top of `c082d44`, with `src/calc.ts` still modified and `insp-0001` untouched). The scratch-only probe hooks were kept. A short session in `<scratch>/clean`:

```text
$ node scripts/acp-probe.mjs --cwd <scratch>/clean --transcript <scratch>/logs/f5-default.jsonl \
    --timeout 200 --linger 8 'Reply with the single word READY. Do not call any tools.'
[probe] session/new: sessionId=sess_f52e6518-fe08-4794-b1f4-d5d6306517a7
[probe] modes: current=vibe available=["vibe","spec","quick-spec","bug-fix","plan","autonomous","semantic_reviewer","inspector-interfaces","inspector-logic","moderator","reader","scribe"]
[probe] prompt 1/1: Reply with the single word READY. Do not call any tools.
[probe] prompt 1 stopReason=end_turn
[probe] agent said: READY
[probe] kiro-cli pid 70504 exited (code 143, signal null)
[probe] done, exit 0
```

`config_error` notifications per transcript (`grep -c 'customAgent/config_error'`): 5 in each pass A transcript, 0 in `f5-default.jsonl`. The Kiro session log (`~/.kiro/logs/20261116T171132501-70506/kiro.log`) has no line mentioning `customAgent`, `AgentFileFormatError` or `File URI`. The five role agents are still modes.

A second session started in moderator mode, to show that the moved prompt file loads:

```text
$ node scripts/acp-probe.mjs --cwd <scratch>/clean --transcript <scratch>/logs/f5-moderator.jsonl \
    --mode moderator --mode-via auto --timeout 240 --linger 8 \
    'Do not call any tools. From your own agent instructions (the prompt in your agent configuration, not steering files), quote word for word the first Markdown heading line, then quote word for word the sentence that says which role value you pass on fagan tool calls. Reply with just those two quoted lines.'
[probe] session/new: sessionId=sess_b4402f17-1198-47b9-8296-5504cdaa723f
[probe] modes: current=moderator available=["vibe","spec","quick-spec","bug-fix","plan","autonomous","semantic_reviewer","inspector-interfaces","inspector-logic","moderator","reader","scribe"]
[probe] mode moderator via _meta.kiro.modeId: current=moderator
[probe] prompt 1 stopReason=end_turn
[probe] agent said: "# Moderator"

"Pass `"role": "moderator"` on every fagan tool call that takes a `role`."
[probe] kiro-cli pid 77678 exited (code 143, signal null)
[probe] done, exit 0
```

Both quoted lines match lines 1 and 7 of `.kiro/agent-prompts/moderator.md`. In the scratch repo that sentence appears only in `.kiro/agent-prompts/moderator.md` (the scratch repo has no `.kiro/steering/`, `~/.kiro/steering` does not exist, and no file in `~/.kiro/agents` contains it), so the answer came from the prompt file at its new path. The transcript has 0 `config_error` notifications, no tool call and no permission request. For E7 this shows one thing only: `_meta.kiro.modeId` on `session/new` selects a custom agent (Kiro reported `moderator` as the current mode, so the probe sent no `session/set_mode`). Starting sub-agents and nesting are still open for E7.

## Step 3 live experiments: setup

Run on 2026-11-16 with `kiro-cli 3.3.0` on macOS. Pages read first: [Migrate an ACP client to CLI V3](https://kiro.dev/docs/cli/v3/acp-migration.md), [ACP](https://kiro.dev/docs/cli/acp.md), [Agent Client Protocol (Kiro)](https://kiro.dev/docs/acp.md), and the ACP spec pages [initialization](https://agentclientprotocol.com/protocol/initialization), [session setup](https://agentclientprotocol.com/protocol/session-setup), [prompt turn](https://agentclientprotocol.com/protocol/prompt-turn), [tool calls](https://agentclientprotocol.com/protocol/tool-calls) and [session modes](https://agentclientprotocol.com/protocol/session-modes).

- Client: `scripts/acp-probe.mjs` (Node built-ins only). It starts `kiro-cli acp --agent-engine=v3 --auth-method=cli` with the scratch repo as cwd, the same argv T3 Code uses (seen with `ps`), sends `initialize`, `session/new` and one `session/prompt` per prompt, and logs every message to a JSONL transcript. It answers `session/request_permission` with the `allow_once` option for requests whose key matches an `--allow` pattern and `reject_once` otherwise, and never picks a persistent option. Usage is in the comment at the top of the file.
- Scratch repo: a folder from `mktemp -d -t fagan-acp` (here `<scratch>`, under `$TMPDIR`), never inside this repo. `<scratch>/repo` is a `git init` repo with one commit holding `README.md`, `src/calc.ts`, `.fagan/config.json` (copied from this repo with `build` and `test` set to `["node","-e","0"]` and `suggestThresholdLoc` 5), `.kiro/agents/` (copied), `.kiro/settings/mcp.json` (server `fagan` with the absolute path of this repo's `packages/fagan-mcp/dist/cli.js`) and `.kiro/hooks/` (copied, with `node scripts/fagan-hook.mjs` rewritten to the absolute path of this repo's launcher). One extra scratch-only hook file, `.kiro/hooks/zz-probe.json`, has `Stop`, `PreToolUse` (matcher `*`) and `PostToolUse` (matcher `*`) hooks that run `node <scratch>/probe-hook.mjs <trigger>`, which saves STDIN and its own cwd to a numbered file in `<scratch>/probe-log/` and exits 0. Probe logs live outside the repo so they do not change its diff.
- Workspace trust: no run in this step was asked to trust the folder. Over ACP, `session/new` loaded the five workspace agents (they are listed as modes), started the workspace MCP server `fagan` (`_kiro/mcp/status` shows `"origin":"workspace"`, `"standing":{"kind":"active"}`, then `"status":"connected"` with the nine tools), and, once hooks were enabled (E1), loaded the workspace hooks. `git status` ran without a permission request, which matches the documented default allow list for read-only git commands ([permissions](https://kiro.dev/docs/permissions.md#default-behavior)); the permissions page says an untrusted workspace asks before every shell command, so the folder was not treated as untrusted. No trust record was written: `~/.kiro/workspace-roots/` still does not exist.
- Modes advertised by `session/new` in the scratch repo: `vibe` (current), `spec`, `quick-spec`, `bug-fix`, `plan`, `autonomous`, `semantic_reviewer`, `inspector-interfaces`, `inspector-logic`, `moderator`, `reader`, `scribe`. The same list is the `mode` config option. Other config options: `memoryReflection` (off), `autopilot` (on), `contentCollection` (enabled). `agentCapabilities._meta.kiro.extensionMethods` has 44 methods and no `_kiro/hooks/list`; the hook list arrives as a `_kiro/hooks/didChange` notification instead.
- Also seen in every pass A session: Kiro reads `.kiro/agents/prompts/*.md` as agent files and sends one `_kiro/customAgent/config_error` notification per prompt file (`"reasonCode":"invalid_config","error":"AgentFileFormatError: No front matter found"`). The five JSON agents still load. Fixed after pass A (FEAT-005): the prompts moved to `.kiro/agent-prompts/`, and a session after the move got no `config_error` (E11, "Follow-up: prompts moved out of .kiro/agents/").
- Pass B (E4, E5, E7, E8, E12), later on 2026-11-16: the same scratch folder, plus `<scratch>/meet`, a `git clone` of `<scratch>/repo` with no inspections, for E5, E7 and E8. Every session was started in the background with its output and transcript in files. None of the eight pass B sessions got a trust prompt or a `config_error`, and none was offered a persistent choice that the probe took: every `session/request_permission` was answered with a one-time option. Afterwards `~/.kiro/workspace-roots/` still did not exist and `~/.kiro/settings/` had no `permissions.yaml`. The machine was heavily loaded during pass B (load averages between 50 and 190 from other processes), so the session times below are long.

## E1: workspace hooks over ACP (step 3)

First run, without any hook metadata in `initialize`:

```text
$ node scripts/acp-probe.mjs --cwd <scratch>/repo --transcript <scratch>/logs/e1.jsonl \
    --allow 'shell:git status' --timeout 200 --linger 8 \
    'Run exactly `git status` with your shell tool, then reply with the single word DONE.'
[probe] tool_call run_command_toolu_bdrk_013F... kind=execute status=pending title=Show git working tree status rawInput={"command":"git status","description":"Show git working tree status","run_in_background":false}
[probe] tool_call_update run_command_toolu_bdrk_013F... status=completed content=Output:
On branch main
nothing to commit, working tree clean
[probe] prompt 1 stopReason=end_turn
[probe] agent said: DONE
```

The shell call ran, but `<scratch>/probe-log/` stayed empty: no `PreToolUse`, `PostToolUse` or `Stop` hook ran, and Kiro's session log (`~/.kiro/logs/<launch>/kiro.log`) had no hook lines at all. The log of one of T3 Code's own Kiro sessions on this machine has `[KiroAgent] v2 hooks cache initialized (hooks load at session start)` right after `initialize`, and the probe session did not. Both logs show the same resolved client capabilities (all false) and both clients are "inferred" as `kiro-ide` (`reportedClientName` `t3-code` and `fagan-acp-probe`). Reading the installed agent server (`~/Library/Application Support/kiro-cli/kas/3.3.0-.../node_modules/@kiro/agent/dist/server/acp-server.js`) showed why: `initialize` builds the hook cache for standalone `.kiro/hooks/*.json` files only when `clientCapabilities._meta.kiro.hooks.enabled` is true and `.v2` is `true`, and with `enabled` but no `v2` it wires client-side "v1 ACP hook providers" instead. No kiro.dev page documents this field; [kiro.dev/docs/acp](https://kiro.dev/docs/acp.md) only says the harness applies Hooks "when available for a session".

Second run, the same command after the probe started sending `clientCapabilities._meta.kiro.hooks` `{ "enabled": true, "v2": true }` (now its default; `--hooks-meta off` gives the first behaviour). Kiro sent a `_kiro/hooks/didChange` notification listing all six hooks with `"source":"standalone-file"` and `"standing":{"kind":"active"}`, and then:

```text
[probe] session_info_update kind=turn_start
[probe] session_info_update kind=hook_update        (Fagan commit gate, status completed)
[probe] session_info_update kind=hook_update        (probe PreToolUse, status completed)
[probe] tool_call run_command_toolu_bdrk_01Qc... kind=execute status=pending title=Show git working tree status rawInput={"command":"git status","description":"Show git working tree status","run_in_background":false}
[probe] tool_call_update run_command_toolu_bdrk_01Qc... status=completed content=Output:
On branch main
nothing to commit, working tree clean
[probe] session_info_update kind=hook_update        (probe PostToolUse, status completed)
[probe] session_info_update kind=hook_update        (Suggest a Fagan inspection, status completed)
[probe] session_info_update kind=hook_update        (probe Stop, status completed)
[probe] prompt 1 stopReason=end_turn
[probe] agent said: DONE
```

Each `hook_update` carries `_meta.kiro.hook` `{ hookId, operationId, name, status, actionType: "runCommand" }`. Three probe files appeared, one per trigger. Their STDIN, with the scratch path shortened:

```json
{"session_id":"sess_7449f3ae-...","hook_event_name":"PreToolUse","cwd":"<scratch>/repo","tool_name":"execute_bash","tool_input":{"command":"git status","description":"Show git working tree status","cwd":null,"run_in_background":false,"timeout":null}}
{"session_id":"sess_7449f3ae-...","hook_event_name":"PostToolUse","cwd":"<scratch>/repo","tool_name":"execute_bash","tool_input":{"command":"git status","description":"Show git working tree status","cwd":null,"run_in_background":false,"timeout":null},"tool_response":"Output:\nOn branch main\nnothing to commit, working tree clean\n\n\nExit Code: 0"}
{"session_id":"sess_7449f3ae-...","hook_event_name":"Stop","cwd":"<scratch>/repo"}
```

Conclusions:

- Workspace hooks fire over ACP in CLI V3 when the client opts in with `clientCapabilities._meta.kiro.hooks` `{ enabled: true, v2: true }`. T3 Code's sessions log the line that this opt-in produces, so hooks are expected to run under T3 Code; a third-party ACP client that does not send it gets no hooks and no warning.
- The hook `tool_name` for the V3 shell tool is `execute_bash`, while the ACP `toolCallId` starts with `run_command_` and Kiro's own log calls the action type `run_command`. The `shell` matcher in `.kiro/hooks/commit-gate.json` matched it (the gate ran and exited 0 for `git status`).
- The command is in `tool_input.command`. `tool_input` also has `cwd` (here `null`), `description`, `run_in_background` and `timeout`. The ACP `rawInput` omits the null `cwd` and `timeout` keys.
- The hook process runs in the project root: the probe hook's `process.cwd()` was `/private/var/folders/.../repo`, the resolved form of the payload `cwd` (`/var` is a symlink to `/private/var` on macOS).
- The `Stop` hook runs after the tool hooks and before the `session/prompt` response.

Headless repeat, in `<scratch>/repo`, with the local `kiro-cli` login (no `KIRO_API_KEY` set or created):

```text
$ gtimeout 180 kiro-cli chat --v3 --no-interactive --output-format stream-json \
    'Run exactly `git status` with your shell tool, then reply with the single word DONE.'
{"type":"runStarted","data":{"payloadSchema":"acp","acpProtocolVersion":1,"engine":"v3"}}
...  session_info_update hook_update "Fagan commit gate" completed, "probe PreToolUse" completed
...  tool_call run_command_toolu_bdrk_01DN... rawInput {"command":"git status",...}
...  session_info_update hook_update "probe PostToolUse" completed
...  agent_message_chunk "DONE"
...  session_info_update hook_update "Suggest a Fagan inspection" completed, "probe Stop" completed
{"type":"runFinished","data":{"sessionId":"sess_f25e6068-...","status":"success","stopReason":"end_turn","finalText":"DONE","finalTextTruncated":false}}
```

It ran with the local login, so the [headless page](https://kiro.dev/docs/cli/headless.md)'s `KIRO_API_KEY` is not needed on a signed-in machine. stderr had one throttling line (`HTTP 429 ... USER_REQUEST_RATE_EXCEEDED`) and the run still finished. The headless stream uses the same ACP `session/update` shapes. The three probe payloads had the same keys and values as over ACP, except that `cwd` was the resolved `/private/var/.../repo`: headless takes the process cwd, while over ACP it is the `cwd` the client sent in `session/new`.

## E16: payload shapes per trigger (step 3)

From the E1 second run above: `PreToolUse` has `session_id`, `hook_event_name`, `cwd`, `tool_name`, `tool_input`. `PostToolUse` has the same keys plus `tool_response` (a string with the tool output and exit code). `Stop` has only `session_id`, `hook_event_name` and `cwd`, with no tool fields and no transcript. `fagan hook suggest` reads only `cwd`, so it works with the real `Stop` payload; `fagan hook gate` reads `tool_input.command` and `cwd`, which the real `PreToolUse` payload has.

## E2 and E3: the commit gate in a live session (step 3)

Setup: `src/calc.ts` in `<scratch>/repo` was changed to add `sub` with `return a - b + 1;`, and a short scratch script (`<scratch>/to-rework.mjs`, the SDK `Client` and `StdioClientTransport` pattern of `packages/fagan-mcp/test/contract.test.ts`) drove the scratch repo's own `fagan serve`: `open_inspection`, `get_packet` for preparation and the meeting, `record_reading` for the one unit, `log_defect` with one major, `close_meeting`. Output: `close_meeting: {"phase":"Rework","defects":{"total":1,"major":1,"minor":0,...},"units_read":1,"units_total":1,...}`. This inspection is scratch fixture data and is not in this repo. `git -C <scratch>/repo rev-list --count HEAD` printed `1`.

One ACP session in `<scratch>/repo`, three prompts in order:

```text
$ node scripts/acp-probe.mjs --cwd <scratch>/repo --transcript <scratch>/logs/e2.jsonl \
    --allow 'shell:git commit --allow-empty -m "gate probe"' --allow 'shell:git status' \
    --timeout 360 --linger 8 \
    'Run exactly this command with your shell tool, once, and do not run any other command first or after: git commit --allow-empty -m "gate probe". Then reply with one sentence saying what happened, quoting any message you were shown.' \
    'Now run exactly `git status` with your shell tool and reply with the single word DONE.' \
    "Now run exactly \`git status\` with your shell tool, and set the shell tool's cwd parameter to the absolute path <scratch>/repo/src (do not put cd in the command). Reply with the single word DONE."
[probe] prompt 1/3: Run exactly this command with your shell tool, once, ...
[probe] session_info_update kind=hook_update        (Fagan commit gate, status completed)
[probe] session_info_update kind=hook_update        (probe PreToolUse, status completed)
[probe] tool_call_update toolu_bdrk_015EyzE9GVjRn3Jg69g8jK2A status=failed
[probe] prompt 1 stopReason=end_turn
[probe] agent said: The commit didn't run. A pre-tool hook blocked it with this message: "fagan commit gate: blocked. Open major defects: insp-0001: D001. Fix them and run follow_up, or have the Author waive them with a reason, before committing."
[probe] prompt 2/3: Now run exactly `git status` with your shell tool and reply with the single word DONE.
[probe] tool_call run_command_toolu_bdrk_01Ue... kind=execute status=pending title=Run Command rawInput={"command":"git status","run_in_background":false}
[probe] tool_call_update run_command_toolu_bdrk_01Ue... status=completed content=Output:
On branch main
Changes not staged for commit:
	modified:   src/calc.ts
Untracked files:
	.fagan/inspections/
[probe] agent said: DONE
[probe] prompt 3/3: Now run exactly `git status` with your shell tool, and set the shell tool's cwd parameter to ...
[probe] tool_call run_command_toolu_bdrk_01SZ... kind=execute status=pending title=Run Command rawInput={"command":"git status","cwd":"<scratch>/repo/src","run_in_background":false}
[probe] tool_call_update run_command_toolu_bdrk_01SZ... status=completed content=Output:
On branch main
Changes not staged for commit:
	modified:   calc.ts
Untracked files:
	../.fagan/inspections/
[probe] agent said: DONE
```

(The `git status` hint lines are cut here.) Afterwards `git -C <scratch>/repo rev-list --count HEAD` printed `1` and `git log --oneline` showed only `c082d44 scratch base`: the commit did not happen. The three `PreToolUse` payloads the probe hook saved (the gate got the same STDIN, since both hooks match the same call):

```json
{"session_id":"sess_bddc36cd-...","hook_event_name":"PreToolUse","cwd":"<scratch>/repo","tool_name":"execute_bash","tool_input":{"command":"git commit --allow-empty -m \"gate probe\"","description":null,"cwd":null,"run_in_background":false,"timeout":null}}
{"session_id":"sess_bddc36cd-...","hook_event_name":"PreToolUse","cwd":"<scratch>/repo","tool_name":"execute_bash","tool_input":{"command":"git status","description":null,"cwd":null,"run_in_background":false,"timeout":null}}
{"session_id":"sess_bddc36cd-...","hook_event_name":"PreToolUse","cwd":"<scratch>/repo","tool_name":"execute_bash","tool_input":{"command":"git status","description":null,"cwd":"<scratch>/repo/src","run_in_background":false,"timeout":null}}
```

Kiro's ACP updates and session log do not include a hook's exit code (the `hook_update` status is `completed` for the blocking gate too), so the first payload was piped back into the launcher in the same repo state:

```text
$ <payload 1> | node scripts/fagan-hook.mjs hook gate     (cwd <scratch>/repo)
fagan commit gate: blocked. Open major defects: insp-0001: D001. Fix them and run follow_up, or have the Author waive them with a reason, before committing.   (stdout)
fagan commit gate: blocked. Open major defects: insp-0001: D001. Fix them and run follow_up, or have the Author waive them with a reason, before committing.   (stderr)
exit 2
```

Conclusions:

- E2: the hook `tool_name` is `execute_bash` and the command is `tool_input.command`, which the gate already reads first (`COMMAND_FIELDS`), so the field list needed no change. `tool_input` always has the keys `command`, `description`, `cwd`, `run_in_background` and `timeout`, with `null` for unset ones. `tool_input.cwd` is the shell tool's working directory: when the agent set it, the command ran there (`git status` printed `calc.ts` relative to `src/`), while the payload's top-level `cwd` stayed the session cwd. The gate used only the top-level `cwd`, so a commit whose `tool_input.cwd` named another repo was checked against the wrong repo. The fix is below.
- E3: exit 2 from a `PreToolUse` command hook blocks the shell call in CLI V3 over ACP. The agent received the gate's message (it quoted it word for word). The ACP client received no `tool_call` for the blocked call, only a `tool_call_update` with `status` `failed`, no `content` and no `_meta.kiro.failureReason`, and its `toolCallId` lacks the `run_command_` prefix that allowed calls have. A client such as T3 Code can therefore show a failed tool card while the reason only appears in the agent's reply. No `session/request_permission` reached the client for the commit, although `git commit` is not on the default allow list: the gate ran before Kiro would have asked. The `git status` control in the same session still ran.
- fagan-mcp task 16.1: done, the gate blocked a real `git commit --allow-empty` from the agent in a live Kiro session while an open major existed, and the commit count stayed 1.

The `tool_input.cwd` fix: `fagan hook gate` now starts from `tool_input.cwd` when it is a non-empty string (resolved against the payload `cwd`), moves it by any `-C`/`--chdir` words, and falls back first to the shell tool's directory repo and then to the payload `cwd` repo (FM-R16.2). With only the `src/cli.ts` change stashed and the CLI rebuilt, the new test `FM-R16.2 FM-R16.3 checks the repo in tool_input.cwd before the payload cwd (E2)` in `packages/fagan-mcp/test/cli.test.ts` failed at its first case (`expected +0 to be 2`: a commit with the session in a clean repo and `tool_input.cwd` in the repo with the open major was allowed); with the change it passes. Live check after the rebuild: a second scratch repo, `<scratch>/clean`, with the same `.kiro/` and `.fagan/config.json`, one commit and no inspections, and one ACP session there:

```text
$ node scripts/acp-probe.mjs --cwd <scratch>/clean --transcript <scratch>/logs/e2c.jsonl \
    --allow 'shell:git commit --allow-empty -m "cwd probe"' --timeout 240 --linger 8 \
    "Run exactly this command with your shell tool, once: git commit --allow-empty -m \"cwd probe\" . Set the shell tool's cwd parameter to the absolute path <scratch>/repo and do not put cd or -C in the command. Do not run any other command. Then reply with one sentence saying what happened, quoting any message you were shown."
[probe] tool_call_update toolu_bdrk_01Y9... status=failed
[probe] prompt 1 stopReason=end_turn
[probe] agent said: The commit didn't run. A pre-tool-use hook (the fagan commit gate) blocked it with this message: "fagan commit gate: blocked. Open major defects: insp-0001: D001. Fix them and run follow_up, or have the Author waive them with a reason, before committing."
```

The saved payload: `{"session_id":"sess_ab83beb7-...","hook_event_name":"PreToolUse","cwd":"<scratch>/clean","tool_name":"execute_bash","tool_input":{"command":"git commit --allow-empty -m \"cwd probe\" .","description":"Run requested git commit probe","cwd":"<scratch>/repo","run_in_background":false,"timeout":null}}`. The agent copied the trailing ` .` of the prompt's sentence into the command; it is still a `git commit`. Piped back into the launcher from `<scratch>/clean` it exits 2. Both scratch repos still have one commit each (`c082d44 scratch base`, `cd74748 clean base`).

The recorded payloads, with the scratch repo path replaced by `@REPO@`, are test fixtures in `packages/fagan-mcp/test/fixtures/kiro-payloads/` (`pre-tool-use-commit.json`, `pre-tool-use-git-status.json`, `pre-tool-use-git-status-tool-cwd.json`, `post-tool-use-git-status.json`, `stop.json`), used by `cli.test.ts`.

## E4: the after-rework matcher (step 3)

Run on 2026-11-16 (FEAT-003 pass B) in `<scratch>/repo`, which was still in Rework from E2 (insp-0001, one open major D001 on `src/calc.ts` line 6). Before the session, the experimenter, as the Author in this scratch repo, changed line 6 back to `return a - b;`. The probe approved exactly one MCP call, `record_rework`, with `allow_once`:

```text
$ node scripts/acp-probe.mjs --cwd <scratch>/repo --transcript <scratch>/logs/e4.jsonl \
    --allow @fagan/record_rework --timeout 300 --linger 10 \
    'Call the fagan MCP tool record_rework exactly once with these arguments and no others: {"inspection_id":"insp-0001","role":"author","items":[{"defect_id":"D001","resolution":"fixed","note":"sub now returns a - b; the extra + 1 was removed from src/calc.ts line 6."}]}. Do not call any other tool before or after it. Then reply with one sentence that quotes the tool result and any hook output you were shown.'
[probe] session_info_update kind=hook_update        (probe PreToolUse, completed)
[probe] tool_call_update toolu_bdrk_01VC... status=completed content={ "loaded": [ { "tool_id": "fagan::record_rework", "description": "Rework: the Author marks defects fixed ...
[probe] session_info_update kind=hook_update        (probe PostToolUse, completed)
[probe] session_info_update kind=hook_update        (probe PreToolUse, completed)
[probe] tool_call toolu_bdrk_0154... kind=other status=pending title=@fagan/record_rework rawInput={"inspection_id":"insp-0001","role":"author","items":[{"defect_id":"D001","resolution":"fixed","note":"sub now returns a - b; the extra + 1 was removed from src/calc.ts line 6."}]}
[probe] permission toolu_bdrk_0154... title=@fagan/record_rework keys=["@fagan/record_rework","mcp:fagan/record_rework"] options=["allow_once","allow_always","reject_once","reject_always"] -> allow_once
[probe] tool_call_update toolu_bdrk_0154... status=in_progress
[probe] tool_call_update toolu_bdrk_0154... status=completed content={"items":[{"defect_id":"D001","resolution":"fixed","recorded_at":"2026-11-16T17:25:05.261Z"}],"open_majors":1}
[probe] session_info_update kind=hook_update        (Fagan follow-up after rework, completed)
[probe] session_info_update kind=hook_update        (probe PostToolUse, completed)
[probe] session_info_update kind=hook_update        (Suggest a Fagan inspection, completed)
[probe] session_info_update kind=hook_update        (probe Stop, completed)
[probe] prompt 1 stopReason=end_turn
[probe] agent said: The tool returned `{"items":[{"defect_id":"D001","resolution":"fixed","recorded_at":"2026-11-16T17:25:05.261Z"}],"open_majors":1}`, and I was shown no hook output.
```

(Hook names are added from each `hook_update`'s `_meta.kiro.hook.name`.) The session took 43 s from launch to the probe's exit, including the 10 s linger; stderr had two `HTTP 429 ... USER_REQUEST_RATE_EXCEEDED` lines and the turn still finished.

The raw permission request (scratch path shortened):

```json
{"jsonrpc":"2.0","id":1,"method":"session/request_permission","params":{"sessionId":"sess_3ae60fc2-...","toolCall":{"toolCallId":"toolu_bdrk_0154...","status":"pending","title":"@fagan/record_rework"},"options":[{"optionId":"accept","name":"Allow","kind":"allow_once"},{"optionId":"always-accept","name":"Always allow","kind":"allow_always"},{"optionId":"reject","name":"Deny","kind":"reject_once"},{"optionId":"always-reject","name":"Always deny","kind":"reject_always"}],"_meta":{"kiro":{"toolId":"mcp_fagan_record_rework","agentManagesTrust":true,"consent":{"capability":"mcp","resource":"fagan/record_rework","askType":"implicit","workspaceRoot":"<scratch>/repo"},"consentRound":1,"mcpTool":{"version":1,"identity":{"serverName":"fagan","toolName":"record_rework"}}}}}}
```

Two of the five hook payloads, the `PreToolUse` of the first call and the `PostToolUse` of the MCP call, from `<scratch>/probe-log/`:

```json
{"session_id":"sess_3ae60fc2-...","hook_event_name":"PreToolUse","cwd":"<scratch>/repo","tool_name":"tool_load","tool_input":{"tool_ids":["fagan::record_rework"]}}
{"session_id":"sess_3ae60fc2-...","hook_event_name":"PostToolUse","cwd":"<scratch>/repo","tool_name":"mcp_fagan_record_rework","tool_input":{"inspection_id":"insp-0001","role":"author","items":[{"defect_id":"D001","resolution":"fixed","note":"sub now returns a - b; the extra + 1 was removed from src/calc.ts line 6."}]},"tool_response":"{\"items\":[{\"defect_id\":\"D001\",\"resolution\":\"fixed\",\"recorded_at\":\"2026-11-16T17:25:05.261Z\"}],\"open_majors\":1}"}
```

The scratch store after the session, written by the scratch repo's own `fagan` server and the hook (nothing edited by hand):

```text
rework.json    items: [{ defectId D001, resolution fixed, note "sub now returns a - b; ...", recordedAt 2026-11-16T17:25:05.261Z }]
events.jsonl   {"seq":7,"at":"2026-11-16T17:25:05.262Z","tool":"record_rework","role":"author","phase":"Rework",...}
               {"seq":8,"at":"2026-11-16T17:25:05.676Z","tool":"cli:follow-up","role":"human","phase":"Closed","data":{"attempt":1,"passed":true,"blocking":[]}}
followup.json  attempt 1 at 2026-11-16T17:25:05.674Z: build and tests passed, D001 major "verified", blocking [], passed true
inspection.json  "phase": "Closed"
```

Conclusions:

- E4: the matcher `@fagan/record_rework` matches the V3 tool ID `mcp_fagan_record_rework`. `.kiro/hooks/after-rework.json` fired once, after the call (its `hook_update` at 17:25:05.735Z, the CLI's `cli:follow-up` event at 05.676Z, 414 ms after `record_rework` was stored), ran the follow-up checks and closed the inspection. No fallback matcher was needed, so the hook file and the RA-R6.3 test are unchanged.
- The MCP server Kiro started wrote to the scratch repo's store, so it ran with the workspace root as its cwd (Kiro's logs do not show the cwd; the store write does).
- The default agent reached the MCP tool through Kiro's tool search: it first called a built-in `tool_load` tool (`tool_ids: ["fagan::record_rework"]`, no permission request, no `tool_call` notification, only a `completed` update), then the MCP tool itself. The hooks saw both calls as separate tools; the MCP call carried its own `mcp_fagan_record_rework` name, so no generic wrapper hides it from a matcher.
- The permission request has the shape the probe expected: `_meta.kiro.mcpTool.identity` gives the key `@fagan/record_rework` and `_meta.kiro.consent` gives `mcp:fagan/record_rework`. It also carries `toolId`, `agentManagesTrust`, `consent.askType` `implicit`, `consent.workspaceRoot` and `consentRound`. All four option kinds were offered; the probe chose `allow_once` (`optionId` `accept`). No persistent choice was made. The request reached the client after the `PreToolUse` hooks and before the tool ran, so the default agent's MCP calls do ask the human by default, as the [permissions page](https://kiro.dev/docs/permissions.md) says.
- The agent said it was shown no hook output, although the hook exited 0 and `follow-up --latest` prints the follow-up result JSON. E12 below also saw no `PostToolUse` hook output reach the agent, which matches the actions page's CLI text.

## E5: a `confirm` block on the Stop hook over ACP (step 3)

Docs re-read on 2026-11-16 before the run: [hooks](https://kiro.dev/docs/hooks/) ("Confirmation prompts": a `Stop` command hook may carry `confirm` `{ question, options: [{ id, label, run }], confirmCommand }`; `confirmCommand` stdout `{ "skip": true }` suppresses the prompt and skips the hook for this turn, `{ "question": ..., "options": [...] }` replaces the static ones, and a non-zero exit, a timeout or invalid JSON falls back to the static ones), [hook types](https://kiro.dev/docs/hooks/types/) ("Agent Stop": exit 0 without a continue decision leaves the response finished; exit 1 or a `decision: "block"` JSON on stdout starts another agent turn) and [hook actions](https://kiro.dev/docs/hooks/actions/) (its general text says exit 0 adds stdout to the agent's context; its CLI list says "Exit code 0: Hook succeeded. STDOUT is added to context (SessionStart, UserPromptSubmit) or ignored (others)"). role-agents design.md had quoted only the general text ("exit 0 adds stdout to the agent's context" for every trigger).

Setup, scratch only: `<scratch>/meet` is a fresh `git clone` of `<scratch>/repo` (so no inspections), with one scratch commit that adds this `confirm` block to its copy of `.kiro/hooks/suggest-inspection.json` (the action is unchanged):

```json
"confirm": {
  "question": "E5 static question: run the Fagan suggestion hook?",
  "confirmCommand": "node <scratch>/confirm-suggest.mjs",
  "options": [
    { "id": "run", "label": "Yes, run it", "run": true },
    { "id": "skip", "label": "Not this time", "run": false }
  ]
}
```

`<scratch>/confirm-suggest.mjs` runs `node scripts/fagan-hook.mjs hook suggest` with an empty stdin, prints `{"skip":true}` when the suggestion is empty and otherwise `{"question":"E5 dynamic question: <suggestion>","options":[{"id":"open","label":"Show the suggestion","run":true},{"id":"dismiss","label":"Not now","run":false}]}`, and logs each run to `<scratch>/probe-log/`. The working tree of `<scratch>/meet` had 10 added lines in `src/calc.ts` (threshold 5). The same hook copy was committed in `<scratch>/clean`, whose tree was clean. Each session sent one prompt, `Reply with the single word READY. Do not call any tool.`, with `--timeout 240 --linger 15`. For the run where the probe approved the prompt, the probe got a new key, `hook-confirm`, for requests whose `toolCall.toolCallId` starts with `hook-confirm-` (`scripts/acp-probe.mjs`, test in `acp-probe.test.ts`).

| Run | Repo | Probe choice | What reached the client | Hook | Agent reply | Model requests in the turn |
| --- | --- | --- | --- | --- | --- | --- |
| e5 | meet (10 lines) | `reject_once` (`dismiss`) | `tool_call` `hook-confirm-<uuid>` with the dynamic question as title, then `session/request_permission` | `failed` tool update, then `hook_update` completed | `READY`, then a second reply: "The hook asked me to keep working but gave no task. ..." | 2 |
| e5b | meet (10 lines) | `allow_once` (`open`) | the same | `completed` tool update, then `hook_update` completed | `READY` | 1 |
| e5c | clean (0 lines) | none needed | nothing: `confirmCommand` printed `{"skip":true}` | no `hook_update` for the suggest hook | `READY` | 1 |
| e5d | meet (10 lines) | `reject_once` (`skip`) | the same request, but with the static question: `confirmCommand` wrote no log, so it did not finish (load average was above 50) | `failed`, then `hook_update` completed | `READY`, then "I have no outstanding work. ... the hook gave no further task. ..." | 2 |

The raw request from run e5:

```json
{"jsonrpc":"2.0","id":1,"method":"session/request_permission","params":{"sessionId":"sess_5a249b67-...","toolCall":{"toolCallId":"hook-confirm-fceced92-...","status":"pending","title":"E5 dynamic question: fagan: 10 changed lines against HEAD (threshold 5) and no inspection covers them. Consider asking the moderator agent to open an inspection with open_inspection."},"options":[{"optionId":"open","name":"Show the suggestion","kind":"allow_once"},{"optionId":"dismiss","name":"Not now","kind":"reject_once"}]}}
```

The `tool_call` before it carried `_meta.kiro.hookConfirm` `{ "kind": "stop", "hookName": "Suggest a Fagan inspection", "question": ... }`, and the closing `tool_call_update` added `"decision": "dismiss"`. The request has no `_meta.kiro.consent`; the hook's option IDs and labels are passed through, with `run: true` sent as `allow_once` and `run: false` as `reject_once`, and no persistent option is offered. Session times from launch to probe exit: e5 61 s, e5b 40 s, e5c 42 s, e5d 162 s (the machine was heavily loaded).

Conclusions:

- E5: a `confirm` block works over ACP. Kiro asks the client with an ordinary `session/request_permission`, so an ACP client such as T3 Code can show the question (static or from `confirmCommand`) and the hook's own labels, and `{"skip":true}` keeps the prompt away when there is nothing to ask.
- Choosing the `run: false` option made Kiro start another agent turn in both runs that tried it, and the agent answered a task nobody gave. That costs a model request on every dismissal. Approving it, or skipping it with `{"skip":true}`, did not.
- Under heavy load `confirmCommand` did not finish once and Kiro fell back to the static question, as the hooks page says. Its time limit is not documented.
- In E5b the suggest action ran with a suggestion due and the agent's only reply was `READY`. The actions page says a CLI V3 `Stop` hook's stdout is ignored, and a `Stop` hook that exits 0 without a continue decision leaves the response finished, so even a hook that printed something would get no reply. So the current plain suggestion (RA-R6.1) runs but, as far as these runs and the docs show, reaches neither the agent nor the human in CLI V3 over ACP. The open choices are listed in role-agents design.md "Hooks"; this repo's hook file is unchanged.

## E12: hook timeout units (step 3)

The [hooks](https://kiro.dev/docs/hooks/) page says `hooks[].timeout` is "Timeout in seconds for command actions (default: 60). `0` disables the timeout." The CLI section of the [hook actions](https://kiro.dev/docs/hooks/actions/) page, re-read on 2026-11-16, also says "Default timeout is 30 seconds (30,000ms). Configure with the `timeout_ms` field in the hook configuration", which looks like the CLI 2.x agent-embedded hook form. This run checks the unit for a standalone `.kiro/hooks/*.json` file in CLI V3.

Setup, scratch only: `<scratch>/repo/.kiro/hooks/zz-e12.json` (deleted after the run) with two `PostToolUse` hooks, matcher `shell`, `timeout` 2, in this order: "e12 slow" runs `node <scratch>/e12-hook.mjs slow 5` and "e12 quick" runs `node <scratch>/e12-hook.mjs quick 0.3`. The script writes a `<name>-start` file, a `<name>-sigterm` file if it gets SIGTERM, and a `<name>-end` file after its sleep, then prints `E12-<NAME>-STDOUT` on stdout and `E12-<NAME>-STDERR` on stderr and exits 0. If the unit were milliseconds both hooks would be stopped; if it were minutes both would finish.

```text
$ node scripts/acp-probe.mjs --cwd <scratch>/repo --transcript <scratch>/logs/e12.jsonl \
    --allow 'shell:git status --short' --timeout 300 --linger 15 \
    'Run exactly `git status --short` with your shell tool, once. Then reply with the single word DONE and, on the next line, quote verbatim any hook output or hook message you were shown after the tool result, or write NONE.'
[probe] session_info_update kind=hook_update        (Fagan commit gate, completed)
[probe] session_info_update kind=hook_update        (probe PreToolUse, completed)
[probe] tool_call run_command_toolu_bdrk_01Ja... kind=execute status=pending title=Show short git status rawInput={"command":"git status --short","description":"Show short git status","run_in_background":false}
[probe] tool_call_update run_command_toolu_bdrk_01Ja... status=completed content=Output:   (17:52:43.543Z)
[probe] session_info_update kind=hook_update        (e12 slow, completed)          17:52:46.712Z
[probe] session_info_update kind=hook_update        (e12 quick, completed)         17:52:46.757Z
[probe] session_info_update kind=hook_update        (probe PostToolUse, completed) 17:52:46.843Z
[probe] session_info_update kind=hook_update        (Suggest a Fagan inspection, completed)
[probe] session_info_update kind=hook_update        (probe Stop, completed)
[probe] prompt 1 stopReason=end_turn
[probe] agent said: DONE
NONE
```

The files the hook script wrote (times in UTC):

```text
slow-start    17:52:44.457Z  (pid 2941, sleep 5 s)
slow-sigterm  17:52:45.553Z  (1096 ms after its own start, 2010 ms after the shell tool completed)
quick-start   17:52:45.976Z  (pid 2958, sleep 0.3 s)
quick-end     17:52:46.289Z  (313 ms after its own start)
```

No `slow-end` file was written. The machine was heavily loaded (load average above 100), so Node took about 0.9 s to start the slow hook; the SIGTERM came about 2 s after Kiro could have spawned it. The session took 77 s from launch to probe exit.

Conclusions:

- E12: `timeout` in a standalone hook file is in seconds in CLI V3. A hook still running when it runs out gets SIGTERM; a hook that finishes inside it is not touched. This matches the hooks page; the `timeout_ms` field the actions page mentions was not tried.
- Kiro gave no sign of the timeout: the `hook_update` for "e12 slow" says `completed`, like every other, and Kiro's session log has no timeout line. The agent answered `NONE`, so neither hook's stdout or stderr reached it, which matches the actions page (`PostToolUse` stdout is ignored, and other exit codes show a warning to the user, which this ACP client never received).
- The `PostToolUse` hooks ran one after another in file and array order (slow, then quick, then the probe hook), and all three `hook_update` notifications arrived together after the last one finished. A slow `PostToolUse` hook therefore delays the hooks after it and the rest of the turn. The after-rework hook's `timeout` of 1260 s (RA-R6.5) is a real limit in seconds; FEAT-001 measured this repo's build plus tests at about 35 s.
- Default 60 s and `0` disables: not tested live (every hook in this repo sets `timeout`).

## E7 and E8: the moderator mode and the scribe as its sub-agent (step 3)

Docs re-read on 2026-11-16: [sub-agents](https://kiro.dev/docs/custom-agents/subagents.md) (CLI V3 checks every sub-agent tool call against the parent session's policy and the sub-agent's own `permissions`, the stricter wins, a call the parent policy has no rule for prompts, and the parent agent's `permissions.rules` can carry the sub-agent's allow rules; it gives no nesting limit and says custom agents inside a workflow "can still invoke sub-agents when their tool configuration permits it").

Setup, scratch only: in `<scratch>/meet` (the E5 clone, with the `confirm` commit reverted so its suggest hook is the plain scratch copy again, and 10 added lines in `src/calc.ts` including `clamp`, whose line 10 is `if (x < lo) return hi;`), `<scratch>/to-meeting.mjs` (the SDK `Client` pattern of `contract.test.ts`) called `open_inspection`, `get_packet` for preparation as `inspector-logic` and `get_packet` for the meeting as `moderator`. Result: insp-0001 in Meeting with one unit, U001 (`src/calc.ts`, new lines 4 to 13), and `defects.json` holding no defects. The DEFECT line in the prompt was written by the experimenter for this test and attributed to `inspector-logic`; no inspector agent ran.

```text
$ node scripts/acp-probe.mjs --cwd <scratch>/meet --transcript <scratch>/logs/e7.jsonl \
    --mode moderator --mode-via auto \
    --allow @fagan/log_defect --allow @fagan/get_packet --allow subagent:scribe \
    --timeout 600 --linger 15 \
    "This is a delegation test in a scratch repo. Inspection insp-0001 is already in the Meeting phase; the experimenter set it up. Do only meeting step 4.3 for unit U001: inspector-logic raised exactly the DEFECT line below. Start the scribe sub-agent and send it the inspection ID insp-0001 and this line, copied exactly. Do not start any other sub-agent, do not call close_meeting, metrics or export_report, and do not call any other fagan tool. Then reply with the scribe's reply, quoted exactly.

DEFECT | by=inspector-logic | unit=U001 | file=src/calc.ts | side=new | lines=10-10 | type=logic | class=wrong | severity=major | checklist=- | description=clamp returns hi when x is below lo; for x < lo the result is hi instead of lo."
[probe] modes: current=moderator available=["vibe","spec","quick-spec","bug-fix","plan","autonomous","semantic_reviewer","inspector-interfaces","inspector-logic","moderator","reader","scribe"]
[probe] mode moderator via _meta.kiro.modeId: current=moderator
[probe] session_info_update kind=hook_update        (probe PreToolUse)
[probe] tool_call invoke_subagent_toolu_bdrk_01Sr... kind=other status=pending title=Sub-agent: scribe rawInput={"name":"scribe","prompt":"Inspection ID: insp-0001. Log exactly the following DEFECT line, copied exactly, and reply with the defect ID or the error for it:\n\nDEFECT | by=inspector-logic | unit=U001 | ... | description=clamp returns hi when x is below lo; for x < lo the result is hi instead of lo.", ...}
[probe] tool_call_update invoke_subagent_toolu_bdrk_01Sr... status=in_progress
[probe] tool_call_update toolu_bdrk_01Fs... status=completed content={ "loaded": [ { "tool_id": "fagan::log_defect", ...      (the scribe's tool_load)
[probe] tool_call toolu_bdrk_01Gy... kind=other status=pending title=@fagan/log_defect rawInput={"inspection_id":"insp-0001","role":"scribe","raised_by":"inspector-logic","unit_id":"U001","file":"src/calc.ts","side":"new","line_start":10,"line_end":10,"type":"logic","class":"wrong","severity":"major","description":"clamp returns hi when x is below lo; for x < lo the result is hi instead of lo."}
[probe] tool_call_update toolu_bdrk_01Gy... status=completed content={"defect_id":"D001","counts":{"major":1,"minor":0}}
[probe] tool_call_update invoke_subagent_toolu_bdrk_01Sr... status=completed
[probe] prompt 1 stopReason=end_turn
[probe] agent said: D001 <- DEFECT | by=inspector-logic | unit=U001 | ... | description=clamp returns hi when x is below lo; for x < lo the result is hi instead of lo.The scribe replied:

D001 <- DEFECT | by=inspector-logic | unit=U001 | file=src/calc.ts | side=new | lines=10-10 | type=logic | class=wrong | severity=major | checklist=- | description=clamp returns hi when x is below lo; for x < lo the result is hi instead of lo.
```

The transcript has no `session/request_permission` and no other agent-to-client request. `defects.json` afterwards, written by the scratch repo's `fagan` server:

```json
{"id":"D001","unitId":"U001","location":{"file":"src/calc.ts","side":"new","lineStart":10,"lineEnd":10},"type":"logic","class":"wrong","severity":"major","raisedBy":"inspector-logic","recordedBy":"scribe","description":"clamp returns hi when x is below lo; for x < lo the result is hi instead of lo.","checklistItemId":null,"loggedAt":"2026-11-16T17:57:53.671Z"}
```

The hook payloads for the run, in order (`tool_input` shortened): `PreToolUse` `subagent_scribe` `{ prompt, explanation }`, `PreToolUse` and `PostToolUse` `tool_load` `{ tool_ids: ["fagan::log_defect"] }`, `PreToolUse` and `PostToolUse` `mcp_fagan_log_defect` (the full `log_defect` arguments above), `PostToolUse` `subagent_scribe` (with the scribe's reply as `tool_response`), then `Stop`. Every payload carried the parent session's `session_id`. The turn took 75 s and five model requests; the session took 111 s from launch to probe exit, and `kiro-cli` exited with code 0.

Control for E8 (scratch copy only): `<scratch>/meet/.kiro/agents/moderator.json` with `fagan/log_defect` removed from its `mcp` allow rule, and the same prompt with another line (`lines=9-13 | type=logic | class=missing | severity=minor | ... | description=clamp does not handle lo greater than hi; with lo > hi it returns hi for every x.`):

```text
[probe] tool_call invoke_subagent_toolu_bdrk_01T5... kind=other status=pending title=Sub-agent: scribe ...
[probe] tool_call toolu_bdrk_011e... kind=other status=pending title=@fagan/log_defect rawInput={"inspection_id":"insp-0001","role":"scribe",...,"severity":"minor","raised_by":"inspector-logic",...}
[probe] permission toolu_bdrk_011e... title=@fagan/log_defect keys=["@fagan/log_defect","mcp:fagan/log_defect"] options=["allow_once","allow_always","reject_once","reject_always"] -> allow_once
[probe] agent said: D002 <- DEFECT | by=inspector-logic | unit=U001 | ... The scribe's reply, quoted exactly: ...
```

The request had the same shape as E4's (`_meta.kiro.toolId` `mcp_fagan_log_defect`, `consent` `mcp` `fagan/log_defect`, `mcpTool.identity`) and nothing marking it as a sub-agent's call; only the `tool_call` notification before it carried `_meta.kiro.agentSubtaskId`. The probe approved it once and D002 was stored (`raisedBy` `inspector-logic`, `recordedBy` `scribe`). The scratch moderator file was restored afterwards. This session took 144 s.

Conclusions:

- E7, switching: the role agents are ACP modes, and `_meta.kiro.modeId` on `session/new` starts the session in one (`current=moderator`, so the probe sent no `session/set_mode`). `session/set_mode` was not needed and not tried.
- E7, sub-agents: the moderator started the project agent `scribe` with Kiro's sub-agent tool. Over ACP it is a `tool_call` with `toolCallId` prefix `invoke_subagent_`, title `Sub-agent: scribe`, `rawInput.name` `scribe` and `_meta.kiro` `{ kind: "agent-subtask", agentSubtaskId }`; in hook payloads it is `tool_name` `subagent_scribe`. The scribe's own tool calls stream into the parent session with the same `agentSubtaskId`, its reply text streams in as agent message chunks, and the workspace hooks run for its calls with the parent's `session_id`. So the commit gate also sees any sub-agent shell call (none of the role agents has `shell`). The delegation ran in the foreground (`runningWorkflows` 0) and the parent turn waited for it.
- E7, nesting: depth 1 was tested (moderator to scribe). The sub-agents page states no depth limit. In this repo deeper nesting cannot happen by configuration: only the moderator lists `subagent/<name>` tools, and the four other agents deny the `subagent` capability.
- E8: the scribe keeps `log_defect` as the moderator's sub-agent, and the moderator's `mcp` allow rule is what lets the call run without a prompt: with the rule the client was never asked, without it the client was asked. The start of the scribe needed no approval in either run (the moderator's `subagent` allow rule). The design in role-agents design.md "Permission evaluation and E8" holds live.
- The `code` tool: no agent called it in these runs (the moderator only called the sub-agent tool, the scribe only `tool_load` and `log_defect`).

## 2026-11-17 continuation: suggestion fix and provider blocker

Implementation surface for this continuation: Codex through T3 Code. Earlier
Kiro experiment results above were recovered from the previous run's local
changes; they were not repeated here. No Codex-generated reading or finding is
being presented as a Kiro inspection.

The invisible Stop suggestion now uses the documented `confirm.confirmCommand`
protocol in [Kiro hooks](https://kiro.dev/docs/hooks/) (rechecked 2026-11-17).
`scripts/fagan-hook.mjs hook suggest-confirm` puts the CLI's actual suggestion
in the confirmation question, or emits `{ "skip": true }`. The one `Got it`
option uses `run: true`: it acknowledges the suggestion without opening an
inspection. This selects E5's previously working approve path. There is no
`run: false` button; dismissing the host UI could still cause Kiro's extra turn.
The child process is bounded to 20 seconds and makes no model calls. Tests cover
a due suggestion, below-threshold and already-covered diffs, an unbuilt CLI and
a failed diff check. Live verification of this exact variant is **blocked**.

A single availability probe used the repo's moderator mode, a 120-second
limit, and only `hook-confirm` in the probe's allow list. The prompt was:
`Reply with the single word READY. Do not call any tools or start sub-agents.
This checks Kiro availability and the suggestion hook only.` Kiro selected
`moderator` and connected the `fagan` MCP server, but rejected `session/prompt`
with `UsageLimitReachedError` at `2026-11-17T04:49:30.660Z`. The probe exited 1.
No meeting, reading, defect, rework or waiver was created. The raw error alone
is retained in [the quota receipt](experiments/2026-11-17-kiro-usage-limit.json);
unrelated session metadata is excluded. No overages, upgrade, alternative
provider, or repeated retries were used.

The whole-repository size preflight did run through the real built MCP server
over stdio using the Node SDK client, without a Kiro agent. At HEAD
`c6d3e7514858ba7f2f2a8afc6823b3087688a043`, `001cf80..HEAD` returned
`SIZE_LIMIT_EXCEEDED`: 12,483 changed lines against the configured limit of
1,500. The inspection-directory list was empty before and after. See the
[request and result](experiments/2026-11-17-size-preflight.json). The first
attempt to save this receipt failed because its output directory was absent;
after creating the directory the read-only preflight was repeated and saved.
This establishes the real entry-criterion failure, not a completed inspection.

The first real inspection (`647a96b..4b4c692`, 13 files, 501 changed lines) is
still pending, as are the Inspection Room, power installation, final CI and
submission deliverables. The exact continuation and IDE steps are in
[STEP3_RESUME.md](STEP3_RESUME.md). Do not create viewer demo data until the
Kiro roles have produced an actual exported inspection.

Validation on this continuation: `npm test` passed strict typechecking and all
225 tests in 22 files, including the real stdio MCP contract test (fixture
repo), property-based tests and hook/agent configuration checks. Vitest reported
49.06 seconds for the final suite. `npm run build` and `git diff --check` passed.
The initial unchanged baseline had 221 passing tests. The fixture contract
run does not replace the blocked Kiro role-agent inspection.

## Codex continuation: real meeting, viewer and portable power

The later user-authorized Codex run did produce the real inspection that the
quota-blocked Kiro run could not. See [insp-0001 provenance](inspections/insp-0001.md).
D001 was logged as an actual inspector finding, then disproved by actual Git
behavior. Its false-positive investigation is retained and no automatic waiver
is inferred. At that point the inspection remained in Rework pending its human Author;
the later approval and follow-up are recorded below.

The Inspection Room now loads that actual export. Browser validation found and
fixed a file input outside landmarks, an unfocusable listing scroll region,
a heading-level jump and a mobile grid overflowing its viewport. A same-time
event test also exposed the risk of revealing future readings when projection
used timestamps alone; it now follows sequence IDs. See [verification](verification.md).
The [power scratch test](power-verification.md) exposed and fixed relocated
checklist and package-manifest paths. It establishes installed stdio behavior,
not native Kiro power activation.

An actual, deliberately small [conversational-code comparison](experiments/vibe-comparison/README.md)
retains a one-pass sketch and observed results against the specified gate. It
is not an independent benchmark or a Kiro-native Vibe-mode run.

## Author-approved closure of insp-0001

On 2026-11-17 the human Author selected “Waive D001 with that reason and run
follow-up.” Codex relayed the exact approved false-positive reason through
`record_rework`. Actual `follow_up` ran the configured build and tests, both
passed, and returned Closed with D001 waived and no blocking IDs. Metrics and
JSON/text exports were refreshed through MCP. The final demo is a byte copy
of that closed export; it does not relabel the false positive as a repair.
See [provenance](inspections/insp-0001.md) and its decision receipt. This was
an explicit Codex-driven follow-up, not a new live Kiro after-rework hook run.
