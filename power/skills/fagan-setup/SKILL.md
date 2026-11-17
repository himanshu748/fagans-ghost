---
name: fagan-setup
description: Install Fagan's Ghost agents, steering, hooks and local deterministic MCP server into the current Git repository.
---

# Set up Fagan's Ghost

The human stays the Author. Use this skill when they ask to install the inspection
ritual in their repository. No model, network service, account or paid API is
required by the server. The setup writes only to the chosen repository.

1. Confirm the actual target Git root and read its instructions. Inspect its real
   build and test entry points. Get the Author's choices if they are ambiguous;
   never substitute an always-passing command. Node 22 or newer and Git are required.
2. Resolve this skill's `scripts/setup.mjs` from the skill location. Use its absolute
   path; do not assume the power is installed at a particular home-directory path.
3. Preview the install using argument arrays encoded as JSON, for example:
   `node /absolute/power/skills/fagan-setup/scripts/setup.mjs --target /absolute/repo --build '["npm","run","build"]' --test '["npm","test"]'`.
   Read the complete plan. A conflict aborts before writing. Never remove existing
   files or weaken permissions to force an install.
4. Apply the same command with `--apply` when installation is authorized. Existing
   files are never overwritten except `.kiro/settings/mcp.json`: its other fields
   and servers are preserved, the new `fagan` entry is merged, and the exact prior
   bytes are backed up to `.fagan/mcp.before-setup.json`. An existing `fagan` server,
   any conflicting template, or any symlink in a destination path is refused.
5. Reload the Kiro session so it sees the workspace MCP server named `fagan` and
   the five custom agents. List its nine tools and select the moderator to inspect
   a small real diff. Review the generated `.fagan/config.json` with the Author.
6. Keep `.kiro/` and the inspection records committed according to the repository's
   instructions. Do not add `.kiro/` to an ignore file. No publishing is part of setup.
   The exact MCP backup may contain existing credentials; review it before staging
   `.fagan/` files and keep secrets out of commits.

The power intentionally does not auto-start a namespaced MCP server: Agent Plugins
runs it from the plugin root, which is not the target repository. Setup registers
the server in the target workspace instead. This also keeps `@fagan/...` tool
names aligned with the supplied hooks and role permissions.

Use the `fagan-inspection` skill after installation. Agents cannot record rework
or waive majors; each of those is the human Author's decision.
