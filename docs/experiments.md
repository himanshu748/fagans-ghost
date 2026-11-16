# Experiments

Results of the experiments listed in PLAN.md section 2.4. Each row records what was actually tried and seen, including failures. "Not run yet" means nobody has tried it.

| ID | Question (short) | Step | Status | Result |
| --- | --- | --- | --- | --- |
| E1 | Do workspace hooks fire in a V3 session driven by T3 Code over ACP? | 3 | Not run yet | |
| E2 | Shell tool ID and command field in `tool_input` | 3 | Not run yet | See "Review v1 follow-ups" below |
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

- E2 and the commit gate (review v1 issue 4): `fagan hook gate` reads `tool_input.command`, then `tool_input.cmd`, and allows the call with a stderr warning when neither is a string (FM-R16.5). If Kiro uses another field, every commit passes. Step 3 acceptance for the gate is "the gate blocked a real `git commit` in a live Kiro session", not only "payload field recorded". Tracked as task 16 in `.kiro/specs/fagan-mcp/tasks.md`.

## Review v2 fixes (step 2)

A second review on 2026-11-16, of the v1 fix pass (commit 647a96b), returned NEEDS_CHANGES with 4 issues. What changed for each, and the tests that cover it (all in `packages/fagan-mcp/test/`):

1. The v1 issue 6 fix opened the gate for `-C` words the shell expands (blocking regression). `git -C "$PWD" commit`, `git -C ~/<repo> commit`, `git -C "$(git rev-parse --show-toplevel)/src" commit` and `env -C $PWD git commit` resolved to folders that do not exist, found no repo and exited 0 while a major was open. The tokeniser in `src/core/gate.ts` now flags each word: `~` and `~/` (unquoted, no quoted character before the first `/`) become the home directory, and a word with `$`, a backtick, another tilde form or an unquoted `*`, `?`, `[` or `{` is reported as unknown. `commitRoot` in `src/cli.ts` checks the payload `cwd` repo when a directory is unknown or is not inside a git repo; an absolute `-C` after an unknown word is known again (FM-R16.2, design.md "Commit gate scope" lists the remaining gap). After the fix, a throwaway script drove a temp repo to Rework with one open major and piped each command into the built `fagan hook gate`: `git commit -m x` and all four commands above exited 2, as did `git -C does-not-exist commit -m x`; `git status` exited 0. Tests: `cli.test.ts` (`FM-R16.2 FM-R16.3 falls back to the payload cwd for -C words the shell would expand or that are not a repo (review v2 issue 1)`, nine commands plus the clean-repo and absolute-path cases) and `gate.test.ts` (`FM-R16.2 reports null for directory words the shell would expand`, `FM-R16.2 resolves quoted, escaped and tilde directory words as the shell would`).
2. `hook suggest` treated any amount of code added to an inspected file during Rework as covered. A covered file now adds its rework drift to the count: the added and deleted lines that differ between its diff in `diff.patch` and its current diff (`reworkDriftLoc` in `src/core/packet.ts`, FM-R15.2, design.md "CLI"). Tests: `packet.test.ts` (`FM-R15.2 rework drift counts the changed lines that differ between two diffs of a file`) and `cli.test.ts` (`FM-R15.2 counts code added during rework against the threshold (review v2 issue 2)`: a one-line fix plus 20 new lines gives 22 changed lines against a threshold of 10, and 20 lines added while a no-defect inspection waits in FollowUp give 20). The v1 issue 5 test now uses threshold 2, because its one-line fix is 2 lines of drift.
3. design.md "Commit gate scope" pointed at `tasks.md` task 15 for the step 3 live-block check. It now points at task 16. No code change.
4. No property checked the rework and follow-up totals. New property P8 in `metrics.property.test.ts` (`FM-R10.1 FM-R10.3 rework plus follow-up equals the time from meetingEnd to closedAt or abandonedAt`) generates time-ordered attempts, with and without defects, and checks the sum, non-negative values and which phase is `null`. Changing `at - since` to `at - start` in `reworkAndFollowupMs`, or dropping `entered.FollowUp = true`, makes it fail (counterexamples `[false,0,[1],"closed",0]` and `[true,0,[],"closed",0]`); both edits were reverted.

The review also listed `no_newline_at_eof` in a `get_packet` result over stdio as untested. The full-lifecycle test in `contract.test.ts` now checks that every unit line returned in Preparation carries the field. All values are `false` there, because every fixture file ends in a newline; the `true` case is covered in-process by `packet.test.ts` (`FM-R4.7 keeps the no-newline-at-end-of-file marker in packet units and report.txt`).
