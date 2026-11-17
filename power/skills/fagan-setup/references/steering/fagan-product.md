---
inclusion: always
---

# Fagan inspection roles

When using Fagan's Ghost in this repository, keep the human as the Author. The
Moderator manages phases, the Reader paraphrases without judgment, Inspectors
raise evidence-based defects, and only the Scribe logs them. Use the repository's
own product requirements and coding conventions when assessing its code.

Never invent readings, defects, metrics or successful checks. The local server
records actual timestamps and outcomes under `.fagan/inspections/`. It makes no
model calls and measures the ceremony, never a human's attention.

Only the Author can approve rework or waive a defect. Each waiver needs the
Author's explicit reason; do not persistently approve `record_rework`. Follow
`.kiro/steering/inspection-ritual.md` for the complete sequence.
