# Tasks: fagan-mcp

Requirements: #[[file:.kiro/specs/fagan-mcp/requirements.md]]. Design: #[[file:.kiro/specs/fagan-mcp/design.md]].

Tasks 1 to 9 are the core, store, git and runner work (FEAT-002). Tasks 10 to 14 are the server, CLI, contract test and Kiro registration (FEAT-003). Task 15 is the review v1 fix pass. Task 16 is carried into step 3. Tick each box when its tests pass.

- [x] 1. Core schemas and deterministic JSON
  - [x] 1.1 zod schemas and types for config, inspection, packet, readings, defects, rework, followup, metrics, events and report in `src/core/schema.ts`
  - [x] 1.2 Deterministic serializer in `src/core/json.ts` (schema key order, arrays sorted by ID, 2-space indent, trailing newline)
  - [x] 1.3 `FaganError` and error codes in `src/core/errors.ts`
  - _Requirements: FM-R12.1, FM-R12.2, FM-R12.3, FM-R13.4, FM-R13.5, FM-R14.5_

- [x] 2. Diff parser and packet splitter
  - [x] 2.1 Unified diff parser for added, deleted, modified, renamed, binary and no-newline-at-EOF cases
  - [x] 2.2 Unit splitter capped by `maxUnitLines`, unit numbering, `changed_loc`, skipped files
  - [x] 2.3 Checklist selection by first matching glob, else `defaultChecklist` (record the glob matcher choice in design.md)
  - [x] 2.4 Unit tests for parser and splitter cases
  - [x] 2.5 Property P5: every changed line is in exactly one unit
  - _Requirements: FM-R4.1, FM-R4.2, FM-R4.3, FM-R4.4, FM-R4.5, FM-R4.6, FM-R4.7_

- [x] 3. Checklists
  - [x] 3.1 `checklists/general.json`, `typescript.json`, `json-config.json`, `docs.json`, `tests.json` in `fagan-checklist/1` format, written for this project
  - _Requirements: FM-R3.8, FM-R4.6, FM-R6.5_

- [x] 4. Phase state machine and roles
  - [x] 4.1 Allowed phases and transitions per tool in `src/core/phase.ts`; allowed roles in `src/core/roles.ts`
  - [x] 4.2 Unit tests for every transition and every `WRONG_PHASE` and `ROLE_NOT_ALLOWED` case
  - [x] 4.3 Property P6: wrong-phase calls never change the store (`fc.commands`, fake clock)
  - _Requirements: FM-R1.1, FM-R1.2, FM-R1.3, FM-R1.4, FM-R1.5, FM-R14.4_

- [x] 5. Readings, defects and rework rules
  - [x] 5.1 Judgment-word flagging (whole word, case-insensitive, config order)
  - [x] 5.2 Defect location checks and ID allocation
  - [x] 5.3 Rework batch validation (waiver reason length, duplicates, unknown defects, latest item wins)
  - _Requirements: FM-R5.3, FM-R5.4, FM-R5.5, FM-R6.3, FM-R6.4, FM-R6.5, FM-R6.7, FM-R8.3, FM-R8.4, FM-R8.5_

- [x] 6. Follow-up exit rule
  - [x] 6.1 Per-defect status (`verified`, `fixed_unverified`, `waived`, `open`) from rework, checks and blob hashes
  - [x] 6.2 Exit rule: pass iff every major is verified or validly waived
  - [x] 6.3 Property P3: follow-up passes iff no major is open, unverified or invalidly waived
  - _Requirements: FM-R9.3, FM-R9.4, FM-R9.5, FM-R9.6_

- [x] 7. Metrics
  - [x] 7.1 Durations, rates, per-KLOC values, null reasons and rate warnings
  - [x] 7.2 Property P1: metrics are finite or null with a reason
  - [x] 7.3 Property P2: rates never increase as duration grows
  - _Requirements: FM-R10.1, FM-R10.2, FM-R10.3, FM-R10.4, FM-R10.5, FM-R10.6, FM-R10.7, FM-R10.8_

- [x] 8. Report
  - [x] 8.1 Build and parse `report.json` (rejects other schema versions)
  - [x] 8.2 Render 132-column `report.txt` green-bar listing
  - [x] 8.3 Property P4: report round-trips and is byte-stable
  - _Requirements: FM-R11.3, FM-R11.4, FM-R11.5, FM-R11.7_

- [x] 9. Store, git adapter and runner
  - [x] 9.1 Store: atomic writes, `.fagan/.lock`, sequential IDs, `events.jsonl` append, `STORE_CORRUPT`, ID validation before path joins
  - [x] 9.2 Git adapter with `execFile` argv only: verify revisions, worktree and revision diffs, untracked files via `--no-index`, blob hashes, `NOT_A_GIT_REPO`
  - [x] 9.3 Runner for build and test argv with timeout and `COMMAND_TIMEOUT`
  - [x] 9.4 Unit tests against temp repos under `os.tmpdir()`
  - [x] 9.5 Commit-gate matcher in `src/core/gate.ts` and property P7
  - _Requirements: FM-R2.2, FM-R2.3, FM-R2.6, FM-R2.8, FM-R4.8, FM-R12.4, FM-R13.1, FM-R13.2, FM-R13.3, FM-R13.4, FM-R14.1, FM-R14.3, FM-R14.7, FM-R16.1, FM-R16.2_

- [x] 10. Tool services
  - [x] 10.1 One service function per tool in `src/service`, shared by server and CLI, validating fully before writing
  - _Requirements: FM-R2.1 to FM-R2.10, FM-R3.1 to FM-R3.8, FM-R5.1, FM-R5.2, FM-R6.1, FM-R6.2, FM-R6.6, FM-R7.1 to FM-R7.4, FM-R8.1, FM-R8.2, FM-R9.1, FM-R9.2, FM-R10.1, FM-R11.1, FM-R11.2, FM-R11.6_

- [x] 11. MCP server
  - [x] 11.1 Register the nine tools with `McpServer.registerTool`, zod input schemas, descriptions; `StdioServerTransport`; logs on stderr only
  - [x] 11.2 Success results with `structuredContent` plus JSON text; errors as `isError: true` with `{ code, message, details }`
  - _Requirements: FM-R14.5, FM-R14.6, FM-R14.8, FM-R15.1_

- [x] 12. fagan CLI
  - [x] 12.1 `serve`, `hook suggest`, `hook gate`, `follow-up --latest` and `follow-up <id>`, `abandon`, `export` with `node:util` `parseArgs`; `bin` entry with shebang
  - [x] 12.2 CLI tests feeding STDIN payloads to `hook gate` and `hook suggest`
  - _Requirements: FM-R15.1 to FM-R15.7, FM-R16.3 to FM-R16.6_

- [x] 13. MCP contract test
  - [x] 13.1 Spawn the built server over stdio in a temp repo; list tools; drive a full lifecycle; check files on disk and error results
  - _Requirements: FM-R1.2, FM-R7.2, FM-R9.4, FM-R14.1, FM-R14.4, FM-R14.5, FM-R14.8_

- [x] 14. Kiro registration and use
  - [x] 14.1 `.kiro/settings/mcp.json` registering server `fagan`
  - [x] 14.2 Run `kiro-cli mcp list` and record the real output in `docs/experiments.md`
  - [x] 14.3 Dry-run `fagan hook suggest` and `fagan hook gate` on this repo and record what ran
  - _Requirements: FM-R14.8, FM-R15.2, FM-R16.1_

- [x] 15. Review v1 fixes (semantic review of 2026-11-16, 7 issues)
  - [x] 15.1 Rework and follow-up durations from `meetingEnd` and follow-up attempts; metrics tests for the fail-then-pass loop, no-defect, open and abandoned cases
  - [x] 15.2 In-process lock queue plus a 2 s bounded retry for another process's lock
  - [x] 15.3 Property tying `openMajorIds` to each attempt's `blocking`; CLI gate test for a fixed but unverified major
  - [x] 15.4 Attempts store working-tree blob hashes; `hook suggest` skips files a Closed inspection accepted and mentions `sizeLimitLoc`
  - [x] 15.5 Gate wrappers (`nice`, `timeout`, `stdbuf`, `xargs`, `sudo`, `doas`, `env -C`) and `-C`/`--chdir` target repos; "Commit gate scope" list in design.md
  - [x] 15.6 `noNewlineAtEof` carried into `packet.json`, `get_packet` and `report.txt`
  - _Requirements: FM-R1.5, FM-R4.7, FM-R8.5, FM-R9.6, FM-R10.1, FM-R13.2, FM-R15.2, FM-R16.2_

- [ ] 16. Step 3: prove the commit gate in a live Kiro session (review v1 issue 4)
  - [ ] 16.1 Run experiment E2 and record the real `PreToolUse` shell tool ID and command field in `docs/experiments.md`; change `COMMAND_FIELDS` in `src/cli.ts` if the field differs
  - [ ] 16.2 Acceptance: with `.kiro/hooks/commit-gate.json` wired and an inspection holding an open major, the gate blocked a real `git commit` attempted by the agent in a live Kiro session. Recording the payload field alone does not complete this task
  - _Requirements: FM-R16.3, FM-R16.5_

- [x] 17. Review v2 fixes (review of the v1 fix pass, 4 issues)
  - [x] 17.1 Gate: `-C`/`--chdir` words the shell would expand, and directories outside a git repo, fall back to the payload `cwd` repo; `~` and `~/` expand to the home directory
  - [x] 17.2 `hook suggest`: covered files add their rework drift (`reworkDriftLoc`) to the count
  - [x] 17.3 design.md "Commit gate scope" points at task 16
  - [x] 17.4 Property P8: rework plus follow-up equals the time from `meetingEnd` to `closedAt` or `abandonedAt`
  - _Requirements: FM-R10.1, FM-R10.3, FM-R15.2, FM-R16.2_
