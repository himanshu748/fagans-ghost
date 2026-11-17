---
inclusion: fileMatch
fileMatchPattern: ".fagan/**"
---

# Fagan local files and checks

Node 22 or newer and Git run the installed `.fagan/bin/fagan.mjs` bundle. Its
checklists and license notices live beside it. The workspace MCP server is named
`fagan`, and the hook launcher is `scripts/fagan-hook.mjs`.

`.fagan/config.json` defines the target repository's real build and test commands
as argument arrays. Run them in this repository; never replace them with
always-passing commands. Only execute configured commands from a trusted
repository. Use its existing tools and language conventions for rework.

The server owns `.fagan/inspections/` records. Read them for evidence and change
them through its tools; hand-edited metrics or defect outcomes are not evidence.
Keep `.kiro/` committed and visible. No network service or paid model API is
required by the server.
