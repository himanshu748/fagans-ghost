---
inclusion: manual
---

# Running an inspection

Use this as `#inspection-ritual` or `/inspection-ritual` in chat. It is the step-by-step script for one Fagan-style inspection of the current working tree. The human is the Author throughout.

1. **Planning.** Switch to the `moderator` agent. The moderator calls `open_inspection` with a title, `base` (default `HEAD`) and `head` (default `WORKTREE`). If the build, the tests or the size limit fail, the moderator reports the entry result and stops. Nothing is stored for a failed entry.
2. **Overview.** The Author may add an overview note (`author_overview`) explaining what changed and why.
3. **Preparation.** The moderator asks `inspector-logic` and `inspector-interfaces` to call `get_packet` with `phase: "preparation"` and study each unit against its checklist.
4. **Inspection meeting.** The moderator calls `get_packet` with `phase: "meeting"`. For each unit in order:
   - The `reader` paraphrases the unit in plain English and calls `record_reading`. The Reader describes, it does not judge.
   - Inspectors raise defects in their replies, with location, type and severity.
   - The `scribe` logs each raised defect with `log_defect`, recording who raised it. Only the scribe logs defects.
5. **Close.** When every unit has a reading, the moderator calls `close_meeting`, then `metrics` and `export_report`, and hands the defect list to the Author.
6. **Rework.** The Author fixes defects, then records each one with `record_rework` (`fixed` with a note, or `waived` with a reason). Kiro asks the Author to approve every `record_rework` call.
7. **Follow-up.** The after-rework hook re-runs the build and tests and runs follow-up. Follow-up passes only when every major is fixed and verified, or waived by the Author with a reason. Until then the commit gate blocks `git commit` from agents.
8. **Report.** Export again and open `report.json` in the Inspection Room.

Never invent defects or readings to fill a step. If an agent cannot do a step, say so and stop.
