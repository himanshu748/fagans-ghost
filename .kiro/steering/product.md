---
inclusion: always
---

# Product: Fagan's Ghost

Fagan's Ghost brings back Michael Fagan's 1976 formal code inspection as a ritual run inside Kiro. The ritual is the point: fixed roles, fixed phases, entry and exit criteria, and a defect log with measured rates. Do not describe or build it as a generic "AI code reviewer".

## Roles and phases

- Roles: Moderator, Reader, Inspectors (logic, interfaces), Scribe, and the Author.
- The Author is always the human. There is no Author agent. Only the Author can waive a major defect, and only with a written reason.
- Phases: Planning, Overview, Preparation, Inspection meeting, Rework, Follow-up. A tool called in the wrong phase is refused.
- Role agents live in `.kiro/agents/`. Hooks in `.kiro/hooks/` start and enforce the ceremony. The deterministic MCP server `fagan-mcp` keeps the record under `.fagan/inspections/<id>/`.

## Honesty rules

- Never fabricate inspections, defects, metrics, users, quotes or test results. Every inspection, defect and metric shown anywhere must come from actually running the tool.
- Demo data for the Inspection Room is a real exported report from a real run on this repo, copied, never hand-written.
- Fagan's historical claims appear in docs only with a citation. Anything not verified is marked "needs citation". See `fagan-history.md` for the verified list.
- Metrics measure the agent ceremony from server timestamps. Nothing watches a human or measures eyes-on time.
- If an experiment or a Kiro feature did not work, record that plainly in `docs/experiments.md`.

## Writing rules

- Plain, direct English. No em dashes (U+2014) in any written content; use commas, periods or parentheses.
- No jump scares, blood or copyrighted horror assets. The séance theme stays gentle.
- Free tiers only. No paid APIs.
- Never push, create the GitHub repo, enable Pages, deploy, upload video or submit on Devpost. Those are the human's actions.

The approved plan is #[[file:PLAN.md]].
