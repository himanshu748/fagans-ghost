# Experiments

Results of the experiments listed in PLAN.md section 2.4. Each row records what was actually tried and seen, including failures. "Not run yet" means nobody has tried it.

| ID | Question (short) | Step | Status | Result |
| --- | --- | --- | --- | --- |
| E1 | Do workspace hooks fire in a V3 session driven by T3 Code over ACP? | 3 | Done | Yes, once `initialize` sends `clientCapabilities._meta.kiro.hooks` `{ enabled: true, v2: true }`, which T3 Code sends. Without it no hook runs. See below |
| E2 | Shell tool ID and command field in `tool_input` | 3 | Done | Hook `tool_name` `execute_bash` (ACP tool call IDs start `run_command_`); command in `tool_input.command`; `tool_input.cwd` is the shell tool's working directory, `null` unless the agent sets it. See below |
| E3 | Does exit code 2 block the shell call in CLI V3? Where does stderr show? | 3 | Done | Yes: a live `git commit --allow-empty` was blocked over ACP with one open major, commit count stayed 1. The agent got the gate's message; the ACP client got only a `failed` tool update. See below |
| E4 | Does matcher `@fagan/record_rework` match `mcp_fagan_record_rework`? | 3 | Not run yet | |
| E5 | Does a `Stop` hook `confirm` block work over ACP? | 3 | Not run yet | |
| E6 | Does the T3 Code client expose `/spec`, `/agent`, `/hooks` and manual steering slash commands? | 2 | Partly run | See below |
| E7 | Agent switching through ACP; project agents as sub-agents; nesting depth | 3 | Not run yet | |
| E8 | Does the scribe keep `log_defect` as a sub-agent of the moderator? | 3 | Not run yet | |
| E9 | Command path resolution and server namespacing for a power's `mcp.json` | 5 | Not run yet | |
| E10 | Can a power ship steering files or hooks? | 5 | Not run yet | |
| E11 | Do all agent files pass `kiro-cli agent validate`? | 3 | Done | All five exit 0. The validator also accepted an unknown field, capability and effect. Follow-up: prompts moved to `.kiro/agent-prompts/` after Kiro read them as agent files; all five still exit 0 and the `config_error` notifications stopped. See below |
| E12 | Units and default of the hook `timeout` field | 3 | Not run yet | |
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
