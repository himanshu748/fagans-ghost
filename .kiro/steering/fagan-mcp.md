---
inclusion: fileMatch
fileMatchPattern: ["packages/fagan-mcp/**", ".fagan/**"]
---

# fagan-mcp rules

Spec: #[[file:.kiro/specs/fagan-mcp/requirements.md]] and #[[file:.kiro/specs/fagan-mcp/design.md]].

## Structure

- `src/core` is pure: no file system, no process, no clock reads. Property tests target it.
- `src/store` owns `.fagan/inspections/<id>/`. `src/git` and `src/runner` own child processes. `src/server` and `src/cli` are thin adapters over core and store.

## Files and formats

- One folder per inspection: `inspection.json`, `diff.patch`, `packet.json`, `readings.json`, `defects.json`, `rework.json`, `followup.json`, `metrics.json`, `events.jsonl`, `report.json`, `report.txt`.
- Every JSON file has a `schemaVersion` such as `fagan-inspection/1`. Validate with zod on read; a file that fails validation is `STORE_CORRUPT`.
- Write JSON with 2-space indent, fixed key order, arrays sorted by ID, and a trailing newline, so files diff well.
- Atomic writes: write to a temp file in the same folder, then rename. Hold `.fagan/.lock` while writing; if it is held, return `LOCKED`.
- `events.jsonl` is append-only. Every successful tool call or CLI command appends one line.

## Inputs and errors

- `inspection_id` must match `^insp-[0-9]{4}$`, unit IDs `^U[0-9]{3,}$`, defect IDs `^D[0-9]{3,}$`. This also blocks path traversal.
- Git revisions must not start with `-` and must pass `git rev-parse --verify`.
- Errors are tool results with `isError: true` and a body `{ "code", "message", "details" }`. Use the codes from the design, such as `WRONG_PHASE`, `ROLE_NOT_ALLOWED`, `INSPECTION_NOT_FOUND`, `STORE_CORRUPT`, `LOCKED`.
- A call in the wrong phase returns `WRONG_PHASE` and changes nothing on disk.

## Processes

- Run `git` and the configured build and test commands with argument arrays and a timeout. Capture exit code and duration. Never use `shell: true`.
- Build and test commands come from `.fagan/config.json` of the repo being inspected.

## Metrics

- Rates are finite numbers or `null` with a reason (`phase_not_reached`, `non_positive_duration`, `zero_loc`). Never `Infinity` or `NaN`.
- Config defaults in `.fagan/config.json` are project defaults, not Fagan's figures.
