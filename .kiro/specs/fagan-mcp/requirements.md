# Requirements: fagan-mcp

## Introduction

`fagan-mcp` is a deterministic local stdio MCP server, plus a `fagan` CLI for hooks, that keeps the record of a Fagan-style code inspection. It stores every inspection as plain files under `.fagan/inspections/<id>/`. It never calls a language model or any network API. The role agents (moderator, reader, inspectors, scribe) and the human Author drive it through nine tools: `open_inspection`, `get_packet`, `record_reading`, `log_defect`, `close_meeting`, `record_rework`, `follow_up`, `metrics` and `export_report`.

Source: PLAN.md sections 4 to 9 and 11. Acceptance criteria use EARS form ("WHEN [condition/event] THE SYSTEM SHALL [expected behavior]", per [Kiro feature specs](https://kiro.dev/docs/specs/feature-specs/)). Every criterion has an ID `FM-R<n>.<m>`; tests put that ID in their names.

Glossary:

- **Unit**: one reading unit of the packet, a hunk or part of a hunk, with ID `U001`, `U002`, and so on.
- **Changed line**: an added (`add`) or deleted (`del`) line of the diff. Context (`ctx`) lines are not changed lines.
- **Open major**: a major defect whose status is not `verified` and not `waived`.
- **Terminal phase**: `Closed` or `Abandoned`.
- **Valid waiver reason**: a reason whose trimmed length is at least `waiverMinChars` from config.

## Requirement 1: Inspection lifecycle state machine

**User story:** As the Author, I want the inspection to move through Fagan's phases in a fixed order, so that no step of the ritual can be skipped.

1. **FM-R1.1** WHEN an inspection is created THE SYSTEM SHALL record it in phase `Overview` after Planning passes, and SHALL only allow these transitions: Overview to Preparation, Preparation to Meeting, Meeting to Rework, Meeting to FollowUp, Rework to FollowUp (when `follow_up` is called), FollowUp to Closed (follow-up passes), FollowUp to Rework (follow-up fails), and any non-terminal phase to Abandoned. A single `follow_up` call makes the Rework to FollowUp step and its outcome together, so the stored phase after it is Closed or Rework.
2. **FM-R1.2** WHEN a tool is called in a phase where it is not allowed THE SYSTEM SHALL return error `WRONG_PHASE` with the current phase and the allowed phases in `details`.
3. **FM-R1.3** WHEN a tool call returns any error THE SYSTEM SHALL leave every file under `.fagan/inspections/<id>/` unchanged.
4. **FM-R1.4** WHEN the inspection is in a terminal phase THE SYSTEM SHALL accept only `get_packet` with `phase: "overview"`, `metrics` and `export_report`, and SHALL return `WRONG_PHASE` for every other tool.
5. **FM-R1.5** WHEN a timestamp's event first happens THE SYSTEM SHALL record the server clock time in `inspection.json` under `timestamps` and SHALL never overwrite a timestamp that is already set. The events are: `planningStart`, `planningEnd` and `overviewStart` at `open_inspection`, `preparationStart` and `meetingStart` at the first move into Preparation and Meeting, `meetingEnd` at `close_meeting`, `reworkStart` at the first `record_rework` (FM-R8.5), `followupStart` at the first entry into FollowUp (`close_meeting` with no defects, or the first `follow_up`), `closedAt` when follow-up passes and `abandonedAt` at abandon. `reworkStart` and `followupStart` are informational first-occurrence stamps; rework and follow-up durations do not use them and come from `meetingEnd` and the follow-up attempt times (FM-R10.1).

## Requirement 2: open_inspection

**User story:** As the Moderator, I want to open an inspection on a diff only when it builds, its tests pass and it is small enough, so that the team inspects work that is ready.

1. **FM-R2.1** WHEN `open_inspection` is called with role other than `moderator` THE SYSTEM SHALL return `ROLE_NOT_ALLOWED`.
2. **FM-R2.2** WHEN `base` or `head` (other than `WORKTREE`) starts with `-`, is empty, is longer than 200 characters, or fails `git rev-parse --verify` THE SYSTEM SHALL return `INVALID_RANGE`.
3. **FM-R2.3** WHEN `head` is `WORKTREE` THE SYSTEM SHALL diff the working tree, including staged changes, against `base`, and WHEN `include_untracked` is true THE SYSTEM SHALL also include untracked, non-ignored files as added files, without modifying the git index.
4. **FM-R2.4** WHEN the diff has no changed lines after exclusions THE SYSTEM SHALL return `EMPTY_DIFF` and store nothing.
5. **FM-R2.5** WHEN changed LOC exceeds `sizeLimitLoc` THE SYSTEM SHALL return `SIZE_LIMIT_EXCEEDED` with `changed_loc` and `limit` in `details`, without running the build or tests, and store nothing.
6. **FM-R2.6** WHEN the size check passes THE SYSTEM SHALL run the configured build command, then, only if the build exits 0, the configured test command, each as an argument array without a shell and with `commandTimeoutMs`.
7. **FM-R2.7** WHEN the build or the tests exit non-zero THE SYSTEM SHALL return `ENTRY_CRITERIA_FAILED` with the full `entry` object in `details`, and store nothing.
8. **FM-R2.8** WHEN a build or test command exceeds `commandTimeoutMs` THE SYSTEM SHALL stop it and return `COMMAND_TIMEOUT`, and store nothing.
9. **FM-R2.9** WHEN all entry criteria pass THE SYSTEM SHALL allocate the next sequential ID (`insp-0001`, `insp-0002`, ...), write `inspection.json`, `diff.patch`, `packet.json` and the first lines of `events.jsonl`, set `planningStart`, `planningEnd` and `overviewStart`, and return `inspection_id`, `phase: "Overview"`, `range`, `entry`, `files`, `units` and `checklists`.
10. **FM-R2.10** WHEN `title` is empty or longer than 200 characters, or `author_overview` is longer than 4000 characters, THE SYSTEM SHALL return a validation error and store nothing.

## Requirement 3: get_packet

**User story:** As an Inspector, I want the packet as small reading units with a checklist each, so that I can prepare unit by unit.

1. **FM-R3.1** WHEN `get_packet` is called with `phase: "preparation"` while the inspection is in Overview THE SYSTEM SHALL move it to Preparation and set `preparationStart`.
2. **FM-R3.2** WHEN `get_packet` is called with `phase: "preparation"` THE SYSTEM SHALL append an event recording the calling role, so per-role preparation requests are visible in `events.jsonl`.
3. **FM-R3.3** WHEN `get_packet` is called with `phase: "meeting"` by a role other than `moderator` THE SYSTEM SHALL return `ROLE_NOT_ALLOWED`.
4. **FM-R3.4** WHEN the moderator calls `get_packet` with `phase: "meeting"` while the inspection is in Preparation THE SYSTEM SHALL move it to Meeting and set `meetingStart`; WHEN the inspection is in Overview THE SYSTEM SHALL return `WRONG_PHASE`.
5. **FM-R3.5** WHEN `get_packet` is called for a phase earlier than the current one THE SYSTEM SHALL return the packet without changing the phase or any timestamp.
6. **FM-R3.6** WHEN `unit_ids` contains an ID not in the packet THE SYSTEM SHALL return `UNKNOWN_UNIT`.
7. **FM-R3.7** WHEN `limit` (1 to 50, default 20) is smaller than the number of selected units THE SYSTEM SHALL return at most `limit` units in packet order and a `next_cursor`; WHEN `cursor` is not a cursor this inspection issued THE SYSTEM SHALL return `INVALID_CURSOR`.
8. **FM-R3.8** WHEN units are returned THE SYSTEM SHALL include, for each checklist ID used by those units, the checklist title and items.

## Requirement 4: Packet splitting and checklist selection

**User story:** As the Moderator, I want every changed line in exactly one reading unit, so that nothing escapes the reading and nothing is read twice.

1. **FM-R4.1** WHEN a diff is split into units THE SYSTEM SHALL place every changed line of every non-excluded, non-binary file in exactly one unit, with no line duplicated or dropped.
2. **FM-R4.2** WHEN a hunk has more than `maxUnitLines` changed lines THE SYSTEM SHALL split it into consecutive units, each with at most `maxUnitLines` changed lines, keeping lines in diff order and keeping each context line in the unit where it falls.
3. **FM-R4.3** WHEN units are numbered THE SYSTEM SHALL order files by repo-relative path (byte order), then hunks in diff order, and number units `U001` upward without gaps.
4. **FM-R4.4** WHEN `changed_loc` is computed THE SYSTEM SHALL count added plus deleted lines over all units, excluding binary files and files matching `config.exclude`.
5. **FM-R4.5** WHEN a file is binary or matches `config.exclude` THE SYSTEM SHALL list it in `packet.json` `files` with `skipped` set to `"binary"` or `"excluded"` and create no units for it.
6. **FM-R4.6** WHEN a checklist is chosen for a file THE SYSTEM SHALL use the first entry in `config.checklists` whose glob matches the repo-relative path, otherwise `defaultChecklist`, and SHALL store that choice per file in `packet.json`.
7. **FM-R4.7** WHEN the diff contains added, deleted, renamed, or "no newline at end of file" cases THE SYSTEM SHALL parse them into the correct file status, line kinds and line numbers; each packet unit line SHALL carry `noNewlineAtEof` (true when git printed `\ No newline at end of file` after it) in `packet.json` and in `get_packet` results (as `no_newline_at_eof`), and `report.txt` SHALL print git's marker after such a line.
8. **FM-R4.8** WHEN `packet.json` is written THE SYSTEM SHALL store each file's blob hash before (`blobBefore`) and after (`blobAfter`) the change, or `null` where the file does not exist on that side.

## Requirement 5: record_reading

**User story:** As the Reader, I want my plain-English paraphrase of each unit stored, so that the meeting and the viewer show what was read.

1. **FM-R5.1** WHEN `record_reading` is called with a role other than `reader` THE SYSTEM SHALL return `ROLE_NOT_ALLOWED`.
2. **FM-R5.2** WHEN `record_reading` is called outside the Meeting phase THE SYSTEM SHALL return `WRONG_PHASE`.
3. **FM-R5.3** WHEN `record_reading` is called for a unit that already has a reading THE SYSTEM SHALL return `DUPLICATE_READING`; WHEN the unit is not in the packet THE SYSTEM SHALL return `UNKNOWN_UNIT`.
4. **FM-R5.4** WHEN a paraphrase (1 to 4000 characters) is stored THE SYSTEM SHALL assign the next reading ID (`R001` upward), record `recordedAt`, and return `judgment_flags` listing each configured judgment word found in the text as a whole word, case-insensitive, unique, in config order.
5. **FM-R5.5** WHEN a paraphrase contains judgment words THE SYSTEM SHALL still store it, with its flags, so a Reader that judges instead of paraphrasing is visible in the report.

## Requirement 6: log_defect

**User story:** As the Scribe, I want to log each defect the inspectors raise with its location, type, severity and who raised it, so that the defect log is complete and attributable.

1. **FM-R6.1** WHEN `log_defect` is called with a role other than `scribe` THE SYSTEM SHALL return `ROLE_NOT_ALLOWED`.
2. **FM-R6.2** WHEN `log_defect` is called outside the Meeting phase THE SYSTEM SHALL return `WRONG_PHASE`.
3. **FM-R6.3** WHEN `unit_id` is not in the packet THE SYSTEM SHALL return `UNKNOWN_UNIT`; WHEN `file` is not the unit's file, or the range `line_start..line_end` on `side` is not inside the unit's line numbers on that side, THE SYSTEM SHALL return `LOCATION_OUTSIDE_PACKET`.
4. **FM-R6.4** WHEN `line_end` is less than `line_start`, or either is below 1, THE SYSTEM SHALL return a validation error.
5. **FM-R6.5** WHEN `checklist_item_id` is given and is not an item of the unit's checklist THE SYSTEM SHALL return `UNKNOWN_CHECKLIST_ITEM`.
6. **FM-R6.6** WHEN `raised_by` is not one of `moderator`, `reader`, `inspector-logic`, `inspector-interfaces`, `author` THE SYSTEM SHALL return a validation error.
7. **FM-R6.7** WHEN a defect is valid THE SYSTEM SHALL assign the next defect ID (`D001` upward), store `recordedBy: "scribe"` and `loggedAt`, and return `defect_id` and the current `counts` of majors and minors.

## Requirement 7: close_meeting

**User story:** As the Moderator, I want to close the meeting only when every unit has been read, so that the reading is complete.

1. **FM-R7.1** WHEN `close_meeting` is called with a role other than `moderator` THE SYSTEM SHALL return `ROLE_NOT_ALLOWED`; WHEN it is called outside Meeting THE SYSTEM SHALL return `WRONG_PHASE`.
2. **FM-R7.2** WHEN any unit has no reading THE SYSTEM SHALL return `UNREAD_UNITS` with the missing unit IDs in `details`.
3. **FM-R7.3** WHEN every unit has a reading and at least one defect is logged THE SYSTEM SHALL set `meetingEnd` and move to Rework; WHEN no defect is logged THE SYSTEM SHALL set `meetingEnd` and move to FollowUp.
4. **FM-R7.4** WHEN the meeting closes THE SYSTEM SHALL return defect totals by severity and type, `units_read`, `units_total` and `meeting_ms`.

## Requirement 8: record_rework

**User story:** As the Author, I want to record each defect as fixed or waived with my reason, so that I keep the final word on every major.

1. **FM-R8.1** WHEN `record_rework` is called with a role other than `author` THE SYSTEM SHALL return `ROLE_NOT_ALLOWED`.
2. **FM-R8.2** WHEN `record_rework` is called while the inspection is Closed THE SYSTEM SHALL return `ALREADY_CLOSED`; WHEN it is called in any phase other than Rework THE SYSTEM SHALL return `WRONG_PHASE`.
3. **FM-R8.3** WHEN an item names a defect ID that does not exist THE SYSTEM SHALL return `UNKNOWN_DEFECT`; WHEN one batch names the same defect twice THE SYSTEM SHALL return `DUPLICATE_DEFECT_IN_BATCH`.
4. **FM-R8.4** WHEN an item has resolution `waived` and its reason is not a valid waiver reason THE SYSTEM SHALL return `WAIVER_REASON_REQUIRED` and store none of the batch.
5. **FM-R8.5** WHEN a batch is valid THE SYSTEM SHALL store each item with `recordedAt`, replacing any earlier item for the same defect in `rework.json` while keeping every item in `events.jsonl`, set `reworkStart` on the first call only (an informational stamp, FM-R1.5), and return the items and the number of open majors.

## Requirement 9: follow_up and exit criteria

**User story:** As the Author, I want follow-up to pass only when every major is fixed and verified or waived by me with a reason, so that the inspection cannot close on unresolved majors.

1. **FM-R9.1** WHEN `follow_up` is called with a role other than `moderator` or `author` THE SYSTEM SHALL return `ROLE_NOT_ALLOWED`; WHEN it is called outside Rework or FollowUp THE SYSTEM SHALL return `WRONG_PHASE`.
2. **FM-R9.2** WHEN `run_checks` is true (default) THE SYSTEM SHALL run the build and test commands again; WHEN `run_checks` is false THE SYSTEM SHALL record the checks as not run.
3. **FM-R9.3** WHEN a defect's latest rework item is `fixed` THE SYSTEM SHALL mark it `verified` in this attempt only if the build and tests both passed in this attempt and, when `requireLocationChange` is true, the file's current blob hash differs from its `blobAfter` in the packet; otherwise it SHALL mark it `fixed_unverified`.
4. **FM-R9.4** WHEN follow-up evaluates the exit rule THE SYSTEM SHALL pass if and only if every major defect is `verified` or `waived` with a valid waiver reason. Minor defects SHALL never block the exit.
5. **FM-R9.5** WHEN follow-up passes THE SYSTEM SHALL set `closedAt` and move to Closed; WHEN it fails THE SYSTEM SHALL move to Rework and return the blocking defect IDs.
6. **FM-R9.6** WHEN follow-up runs THE SYSTEM SHALL append one attempt with its time, checks, per-defect statuses, result and the working-tree blob hash of each packet file at that time (`null` for a file that is gone) to `followup.json`.

## Requirement 10: metrics

**User story:** As the Author, I want preparation rate, inspection rate and defect density computed from real timestamps, so that I can see whether the agents actually took the reading seriously.

1. **FM-R10.1** WHEN `metrics` is called THE SYSTEM SHALL compute durations from `inspection.json` timestamps: planning, overview, preparation (`meetingStart - preparationStart`), meeting (`meetingEnd - meetingStart`), rework and follow-up, and write `metrics.json`. Rework is the total time spent in Rework across all visits and follow-up is the total time spent in FollowUp across all visits. The phase after the meeting starts at `meetingEnd`; each follow-up attempt ends the current visit at its time, a failed attempt starts a new Rework visit, and a `follow_up` call made from Rework adds a zero-length FollowUp visit. Abandoning ends the open visit at `abandonedAt`. WHEN a phase was never entered, or the inspection is still in it, THE SYSTEM SHALL return `null` for its duration with null reason `phase_not_reached`.
2. **FM-R10.2** WHEN metrics are computed THE SYSTEM SHALL compute `preparation_rate_loc_per_hour = changed_loc / (preparation_ms / 3600000)`, `inspection_rate_loc_per_hour = changed_loc / (meeting_ms / 3600000)`, `defects_per_kloc = defects / (changed_loc / 1000)` and `majors_per_kloc` the same with majors.
3. **FM-R10.3** WHEN a timestamp needed for a value is missing THE SYSTEM SHALL return `null` for that value with null reason `phase_not_reached`.
4. **FM-R10.4** WHEN a needed duration is zero or negative THE SYSTEM SHALL return `null` with null reason `non_positive_duration`.
5. **FM-R10.5** WHEN `changed_loc` is zero THE SYSTEM SHALL return `null` per-KLOC values with null reason `zero_loc`, and SHALL never return `Infinity` or `NaN` for any input.
6. **FM-R10.6** WHEN the duration grows and `changed_loc` stays the same THE SYSTEM SHALL return a rate that does not increase.
7. **FM-R10.7** WHEN a `rateWarnings` limit is set and a rate exceeds it THE SYSTEM SHALL add a warning to `warnings`; WHEN the limit is `null` THE SYSTEM SHALL add no warning for it.
8. **FM-R10.8** WHEN metrics are stored THE SYSTEM SHALL store unrounded values; rounding happens only when rendering.

## Requirement 11: export_report and import

**User story:** As the Author, I want a self-contained report in JSON and as a printable listing, so that the Inspection Room and people can read the inspection later.

1. **FM-R11.1** WHEN `export_report` is called by a role other than `moderator` or `author` THE SYSTEM SHALL return `ROLE_NOT_ALLOWED`.
2. **FM-R11.2** WHEN `export_report` is called in any phase THE SYSTEM SHALL write the requested formats (`json`, `txt`, default both) as `report.json` and `report.txt`, and return each file's path, `sha256` and byte size, `schema_version: "fagan-report/1"` and the phase.
3. **FM-R11.3** WHEN a report is exported and then parsed with the report parser THE SYSTEM SHALL produce a model deep-equal to the exported one.
4. **FM-R11.4** WHEN the same stored inspection is exported twice with the same clock reading THE SYSTEM SHALL produce byte-identical `report.json` and `report.txt`.
5. **FM-R11.5** WHEN `report.txt` is rendered THE SYSTEM SHALL keep every line at or under 132 characters and include the header block, each unit with line numbers and its paraphrase, defect markers, the defect log, rework, follow-up and metrics.
6. **FM-R11.6** WHEN any stored file fails schema validation during export THE SYSTEM SHALL return `STORE_CORRUPT` naming the file.
7. **FM-R11.7** WHEN the report parser reads JSON whose `schemaVersion` is not `fagan-report/1` THE SYSTEM SHALL reject it with an error naming the version found.

## Requirement 12: File formats and determinism

**User story:** As a developer, I want the store to be plain, stable files, so that inspections diff well in git.

1. **FM-R12.1** WHEN any JSON file is written THE SYSTEM SHALL use 2-space indentation, a fixed key order per schema, arrays sorted by ID, and a trailing newline.
2. **FM-R12.2** WHEN any JSON file is written THE SYSTEM SHALL include its `schemaVersion` (`fagan-inspection/1`, `fagan-packet/1`, `fagan-readings/1`, `fagan-defects/1`, `fagan-rework/1`, `fagan-followup/1`, `fagan-metrics/1`, `fagan-report/1`).
3. **FM-R12.3** WHEN the same repo state, config, clock readings and inputs are given THE SYSTEM SHALL write byte-identical files.
4. **FM-R12.4** WHEN a successful tool call or CLI command changes or reads an inspection THE SYSTEM SHALL append exactly one line to `events.jsonl` with `seq`, `at`, `tool`, `role`, `phase` and `data`; `seq` starts at 1 and increases by 1.
5. **FM-R12.5** WHEN `fagan-mcp` or the `fagan` CLI runs THE SYSTEM SHALL make no language-model call and no network request.
6. **FM-R12.6** WHEN timestamps are written THE SYSTEM SHALL use the injected clock and ISO 8601 UTC format with milliseconds.

## Requirement 13: Store writes and locking

**User story:** As the Author, I want the store to survive crashes and concurrent calls, so that the defect log is never half-written.

1. **FM-R13.1** WHEN a file is written THE SYSTEM SHALL write it to a temporary file in the same folder and then rename it over the target.
2. **FM-R13.2** WHEN a write starts THE SYSTEM SHALL create `.fagan/.lock` exclusively. WHEN another call in the same process holds the lock THE SYSTEM SHALL queue the write until that call finishes. WHEN another process holds a lock that is not stale THE SYSTEM SHALL retry for up to 2 seconds and then return `LOCKED` and write nothing.
3. **FM-R13.3** WHEN a write finishes or fails THE SYSTEM SHALL remove the lock it created.
4. **FM-R13.4** WHEN a stored file is missing or fails schema validation on read THE SYSTEM SHALL return `STORE_CORRUPT` naming the file; WHEN the inspection folder does not exist THE SYSTEM SHALL return `INSPECTION_NOT_FOUND`.
5. **FM-R13.5** WHEN `.fagan/config.json` is missing or fails validation THE SYSTEM SHALL return `CONFIG_INVALID` with the failing paths.

## Requirement 14: Input validation, roles and errors

**User story:** As a maintainer, I want every input checked at the boundary, so that agents cannot escape the store or inject options into git.

1. **FM-R14.1** WHEN `inspection_id` does not match `^insp-[0-9]{4}$` THE SYSTEM SHALL reject it before any path is built, so values such as `../x` never reach the file system.
2. **FM-R14.2** WHEN a unit ID does not match `^U[0-9]{3,}$` or a defect ID does not match `^D[0-9]{3,}$` THE SYSTEM SHALL return a validation error.
3. **FM-R14.3** WHEN any git revision argument starts with `-` THE SYSTEM SHALL reject it before running git.
4. **FM-R14.4** WHEN `role` is not one of `moderator`, `reader`, `inspector-logic`, `inspector-interfaces`, `scribe`, `author`, or is not allowed for the tool, THE SYSTEM SHALL return `ROLE_NOT_ALLOWED` and record the attempt nowhere.
5. **FM-R14.5** WHEN a tool fails THE SYSTEM SHALL return a result with `isError: true` whose text is the JSON `{ "code", "message", "details" }`; WHEN the arguments do not match the tool's advertised input schema, the MCP SDK rejects them before fagan-mcp runs, and the result is `isError: true` with the SDK's `Input validation error` text (see design.md "MCP server").
6. **FM-R14.6** WHEN a tool succeeds THE SYSTEM SHALL return `structuredContent` and the same object as a JSON text block.
7. **FM-R14.7** WHEN the server starts outside a git repository, or a tool runs where `git rev-parse --show-toplevel` fails, THE SYSTEM SHALL return `NOT_A_GIT_REPO`.
8. **FM-R14.8** WHEN the server lists its tools THE SYSTEM SHALL list exactly the nine tools, each with a non-empty description and an input schema.

## Requirement 15: fagan CLI

**User story:** As a hook author, I want a CLI over the same core and store, so that hooks (which cannot call MCP tools) can run the ritual's checks.

1. **FM-R15.1** WHEN `fagan serve` runs THE SYSTEM SHALL start the MCP server on stdio and write logs only to stderr.
2. **FM-R15.2** WHEN `fagan hook suggest` runs THE SYSTEM SHALL read the hook payload from STDIN, use its `cwd` (or the process working directory), count changed LOC of the working tree against `HEAD` including untracked files with the same rules as FM-R4.4, and print one short suggestion to run the moderator only if the count exceeds `suggestThresholdLoc`, no inspection is in a non-terminal phase, and no Closed inspection's `diff.patch` equals the current diff. A changed file whose current blob hash equals its blob hash in a Closed inspection's passing follow-up attempt is covered and SHALL not be counted. WHEN the uncovered count also exceeds `sizeLimitLoc` THE SYSTEM SHALL say in the suggestion that `open_inspection` would refuse it with `SIZE_LIMIT_EXCEEDED` and that the change should be split.
3. **FM-R15.3** WHEN `fagan hook suggest` finishes, for any input or error THE SYSTEM SHALL exit 0.
4. **FM-R15.4** WHEN `fagan follow-up --latest` runs THE SYSTEM SHALL run follow-up (as FM-R9) on the highest-numbered inspection in Rework or FollowUp, print the result, and exit 0; WHEN no such inspection exists THE SYSTEM SHALL print that and exit 0. `fagan follow-up <id>` does the same for one inspection.
5. **FM-R15.5** WHEN `fagan abandon <id> --reason <text>` runs on a non-terminal inspection with a valid waiver reason THE SYSTEM SHALL move it to Abandoned, set `abandonedAt` and `abandonReason`, and append an event; otherwise it SHALL print the error and exit 1.
6. **FM-R15.6** WHEN `fagan export <id>` runs THE SYSTEM SHALL write the report files as `export_report` does and print their paths and hashes.
7. **FM-R15.7** WHEN any CLI command other than `hook suggest` and `hook gate` fails THE SYSTEM SHALL print `{ code, message }` to stderr and exit 1.

## Requirement 16: Commit gate

**User story:** As the Author, I want agents blocked from committing while an inspection has open majors, so that unresolved majors cannot slip into history.

1. **FM-R16.1** WHEN `fagan hook gate` reads a shell command that is not a git commit THE SYSTEM SHALL exit 0, whatever the store holds.
2. **FM-R16.2** WHEN the command contains a segment (split on `&&`, `||`, `;`, `|`, `&`, parentheses and newlines, plus the bodies of `$(...)` and backticks) whose program is `git` and whose subcommand, after skipping leading environment assignments, the wrappers `command`, `exec`, `time`, `nohup`, `env`, `nice`, `timeout`, `stdbuf`, `xargs`, `sudo` and `doas` with their options, and git global options such as `-c key=value`, `-C <path>` and `--no-pager`, is `commit` THE SYSTEM SHALL treat it as a git commit, and SHALL check the repository it runs in: the payload `cwd` moved, in order, by `env -C`/`--chdir`, `sudo -D`/`--chdir` and each `git -C <path>` (relative paths resolve against the previous directory). Known gaps are listed in design.md "Commit gate scope".
3. **FM-R16.3** WHEN a git commit is attempted and any inspection in a non-terminal phase has an open major THE SYSTEM SHALL write the inspection IDs and blocking defect IDs to stderr and stdout and exit 2.
4. **FM-R16.4** WHEN a git commit is attempted and no inspection has an open major, or `.fagan/inspections/` does not exist, THE SYSTEM SHALL exit 0.
5. **FM-R16.5** WHEN the STDIN payload is not JSON or has no command string in `tool_input` (checked fields: `command`, `cmd`) THE SYSTEM SHALL write a warning to stderr and exit 0.
6. **FM-R16.6** WHEN a git commit is attempted and the store exists but cannot be read or validated THE SYSTEM SHALL exit 2 with the reason.
