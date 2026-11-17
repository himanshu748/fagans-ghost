---
name: fagan-inspection
description: Run a Fagan-style inspection with Moderator, Reader, Inspectors and Scribe, keeping the human as Author and using the deterministic fagan MCP record.
---

# Conduct an inspection

First use `fagan-setup` if the workspace has no `fagan` MCP server. The runtime
must expose nine tools: open_inspection, get_packet, record_reading, log_defect,
close_meeting, record_rework, follow_up, metrics, export_report.

Read the installed `.kiro/steering/inspection-ritual.md` and each role's prompt.
Select the `moderator` custom agent. It opens a small actual diff, allows the two
Inspectors to prepare, opens the meeting, and asks the Reader to paraphrase each
unit without judgment. Inspectors return their own findings. Only the Scribe
logs those exact findings. Then the Moderator closes and exports the meeting.
The scope of each agent is encoded in `.kiro/agents/`.

If the entry criteria fail, report the error; never weaken the checks or invent
an inspection. If a run is interrupted, inspect the stored phase and resume the
same inspection. Do not open duplicates. Every demo reading, defect and metric
must come from real tool calls; scratch test fixtures are not product evidence.

Present defects to the Author. Do not auto-fix, mark fixed or waive them as part
of the ceremony. The Author may request changes and explicitly authorize a rework
record; every waiver needs their reason. Avoid persistent approval for
`record_rework`. The after-rework hook runs tests and follow-up. Export again to
capture its actual result. A green build alone does not close an open major.

The commit gate covers Kiro shell calls, not commands a human types in a terminal.
Role labels in the MCP protocol are declared caller roles, not authentication;
Kiro's tool scopes supply the intended role separation. The local server executes
the configured build/test commands with the current user's permissions. Inspect
those commands before trusting a repository. No model calls occur in the server.
