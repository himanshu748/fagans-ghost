---
inclusion: manual
---

# Running an inspection

Use this as `#inspection-ritual` or `/inspection-ritual` in chat. It is the step-by-step script for one Fagan-style inspection of the current working tree. The human is the Author throughout. The role agents are specified in `.kiro/specs/role-agents/`.

0. **Before the first inspection.** Run `npm run build` so `packages/fagan-mcp/dist/cli.js` exists; the `fagan` MCP server and the hooks run from it. Kiro loads this repo's custom agents, steering and MCP server only after you trust the workspace ([permissions](https://kiro.dev/docs/permissions.md)), so answer Kiro's trust question yourself. `kiro-cli chat --trust-workspace` trusts it for one launch only.
1. **Planning.** Switch to the `moderator` agent: start `kiro-cli chat --agent moderator`, run `/agent swap moderator` in an interactive `kiro-cli chat` session ([slash commands](https://kiro.dev/docs/reference/slash-commands.md)), or pick the agent in the IDE chat ([custom agents](https://kiro.dev/docs/custom-agents/)). The moderator calls `open_inspection` with a title, `base` (default `HEAD`) and `head` (default `WORKTREE`). If the build, the tests or the size limit fail, the moderator reports the entry result and stops. Nothing is stored for a failed entry.
2. **Overview.** The Author may add an overview note (`author_overview`) explaining what changed and why. Give it to the moderator in your own words; the moderator never writes it for you.
3. **Preparation.** The moderator asks `inspector-logic` and `inspector-interfaces` to call `get_packet` with `phase: "preparation"` and study each unit against its checklist.
4. **Inspection meeting.** The moderator calls `get_packet` with `phase: "meeting"`. For each batch of units in order:
   - The `reader` paraphrases each unit in plain English and calls `record_reading`. The Reader describes, it does not judge.
   - Inspectors raise defects in their replies as `DEFECT | by=... | unit=... | ...` lines, with location, type and severity. They are read-only and cannot log anything.
   - The moderator forwards every DEFECT line, unchanged, to the `scribe`, because each sub-agent starts with an empty conversation.
   - The `scribe` logs each raised defect with `log_defect`, recording who raised it. Only the scribe logs defects.
5. **Close.** When every unit has a reading, the moderator calls `close_meeting`, then `metrics` and `export_report`, and hands the defect list to the Author.
6. **Rework.** The Author fixes defects, then records each one with `record_rework` from Kiro's default agent (`fixed` with a note, or `waived` with a reason). No role agent can call `record_rework`. Kiro asks before every MCP tool call by default, so you approve each `record_rework` yourself. **Do not choose "Always allow" (or any persistent approval) for `record_rework`**: each rework record and each waiver must stay your own decision. This repo cannot ship workspace permission rules for the default agent, because Kiro keeps them outside the repo.
7. **Follow-up.** The after-rework hook re-runs the build and tests and runs follow-up after each `record_rework`. Follow-up passes only when every major is fixed and verified, or waived by the Author with a reason. Until then the commit gate blocks `git commit` from agents.
8. **Report.** Export again and open `report.json` in the Inspection Room.

Never invent defects or readings to fill a step. If an agent cannot do a step, say so and stop.

## Inspection suggestion

The Stop hook shows a suggestion in a confirmation question when an uncovered diff exceeds the configured threshold. `Got it` acknowledges the notice; it does not open an inspection or approve rework. Ask the moderator to begin the ritual when ready. If the prompt is unavailable, run `node scripts/fagan-hook.mjs hook suggest` after building.
