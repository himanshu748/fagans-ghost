# Fagan's Ghost power

Bring the inspection ritual into another Git repository: five scoped role
agents, hooks, steering, checklists, and a local deterministic MCP server. The
human remains the Author. Node 22 or newer and Git are required; the server
needs no account, model service or network connection.

## Build and import locally

From the Fagan's Ghost source repository, with dependencies installed:

```sh
npm run build
node scripts/build-power.mjs
node scripts/test-power.mjs
```

The build creates `dist/fagan.mjs`, relocatable checklist assets, installation
templates and third-party license notices. The generated `dist/` directory is
not committed, so build before importing this folder. Direct import of an
unbuilt GitHub checkout is not a supported installation path.

In Kiro IDE, open **Powers → Add Custom Power → Import power from a folder** and
select this `power/` directory. Ask to set up Fagan's Ghost in the target repo.
This is the documented native import path; native import and automatic skill
activation have not been verified in this project. See
[verification](../docs/power-verification.md) for the tested boundary.

## Preview and install into a repository

The setup skill invokes the same deterministic installer you can run directly.
Provide the target repository's real build and test argument arrays:

```sh
node /absolute/fagans-ghost/power/skills/fagan-setup/scripts/setup.mjs \
  --target /absolute/target-repo \
  --build '["npm","run","build"]' \
  --test '["npm","test"]'
```

Review the printed file list. Re-run with `--apply` to install. These example
commands suit a repository with those npm scripts; use its actual commands.
Setup records the commands without executing them. Inspections execute them in
the target repository, so inspect their contents before trusting a repository.

The installer preserves existing files. It refuses conflicts and symlinks in
destination paths before writing. An existing `.kiro/settings/mcp.json` is the
one merge target: other servers and fields survive, and its exact original bytes
are saved as `.fagan/mcp.before-setup.json`. An existing server named `fagan` is
a conflict. Existing `product.md` and `tech.md` steering remain untouched; this
power uses `fagan-product.md` and `fagan-tech.md` instead. Run setup while no
other process is editing the target's Kiro configuration. This is a first-install
tool; it does not silently upgrade an existing installation.

After setup, open the target Git root in Kiro and reload the session. Use the
workspace server `fagan` and select `moderator`. Follow the `fagan-inspection`
skill or `.kiro/steering/inspection-ritual.md`. The installed bundle is independent
of this source checkout. Keep `.kiro/` visible and committed. Review inspection
records before committing them according to your repository's policies.
The MCP backup is created with owner-only permissions and excluded by a target-local `.fagan/.gitignore`. It may contain credentials from the original configuration; review
it before staging `.fagan/` files.

## Why setup registers a workspace server

This is a skills-only Agent Plugins power: there is no power-level `mcp.json`.
The current format starts plugin MCP processes in the plugin root and offers
only plugin-root and plugin-data working directories. That would inspect the
power package rather than the user's repository. Setup instead registers
`.fagan/bin/fagan.mjs` in the target's `.kiro/settings/mcp.json`; stable `@fagan/`
tool names also match the supplied permissions and hooks. This design follows
the [Agent Plugins specification](https://agent-plugins.org/specification) and
[Kiro's workspace MCP configuration](https://kiro.dev/docs/mcp/configuration/).

The [Kiro power documentation](https://kiro.dev/docs/powers/create/) supports
skills-only packages. This repository's scratch test proves file installation
and the installed server's stdio workflow. It does not prove Kiro-native power
activation or agent execution.

The bundle carries the project's [MIT license](LICENSE) and
[third-party license notices](THIRD_PARTY_NOTICES.txt).
