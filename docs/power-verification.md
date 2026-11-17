# Local power verification

Verified on 2026-11-17 with Node **26.12.0**, Git, and **kiro-cli 3.4.0** on macOS.
The generated bundle targets Node 22, but this run did not independently execute
on Node 22. No Kiro model call, account change, global power installation,
publication or deployment was performed.

## What ran

After the repository server build:

```sh
node scripts/build-power.mjs
node scripts/test-power.mjs
```

The final build and test both exited **0**. The scratch integration test creates
its own temporary Git repositories, installs the power's local files, drives the
installed bundle over stdio using the MCP SDK, and removes only those temporary
repositories in `finally`. It never writes fixtures into the repository's real
inspection store or the viewer's demo directory.

Observed final test output:

```json
{
  "status": "passed",
  "scope": "Disposable deterministic packaging fixture; no Kiro runtime activation or model calls",
  "observations": [
    "Preview wrote nothing; apply installed; existing MCP server and unknown top-level field preserved; exact original backed up; repeat install refused.",
    "All installed agent steering resources exist; target product/tech steering preserved; 5 role files validated by kiro-cli.",
    "Relocated bundle listed 9 tools and completed an actual stdio fixture inspection: 2 units, 4 changed lines, 2 recorded fixture paraphrases, 0 defects, Closed, JSON/text export parsed.",
    "Fresh install works; conflicts in templates, reserved paths and existing fagan server, invalid command arrays, and symlinked .kiro/.fagan/bin rejected before writes; original files and external directory preserved."
  ]
}
```

The fixture starts with an identity function, then adds a correct doubling
function and its assertion. Its title explicitly labels it as a scratch
packaging fixture. The test records known fixture descriptions, not claimed
agent reasoning. No inspectors ran and no defects were seeded. The observed
zero-defect result verifies packaging and the phase loop, not review quality.
The build command checks JavaScript syntax, and the test command executes real
assertions with Node's test runner; neither is an always-success placeholder.

Additional checks passed:

- `node --check` for the build, setup and integration-test scripts.
- The five installed custom-agent files passed `kiro-cli agent validate --path`.
- All installed role-agent steering resources resolved to real files in the
  target; existing target `product.md` and `tech.md` stayed unchanged.
- `power/plugin.json` passed the canonical
  [Agent Plugins 1.0.0 JSON Schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json),
  fetched from its official URL and compiled with installed Ajv's draft-2020-12
  validator. This was a one-off schema check, not a network requirement of build
  or setup. Ajv's [schema-version documentation](https://ajv.js.org/json-schema.html#draft-2020-12)
  describes that validator.

## Format and installation boundary

The [Kiro creation documentation](https://kiro.dev/docs/powers/create/) supports
`plugin.json` with optional skills and MCP configuration, including a skills-only
power. The [Agent Plugins specification](https://agent-plugins.org/specification)
sets a plugin's default subprocess directory to the plugin root and restricts
the supported working-directory placeholders to plugin-root and plugin-data
locations. There is no standard workspace placeholder in that version.

Accordingly, this power bundles the server as an asset and uses its setup skill
to install `.fagan/bin/fagan.mjs`, its checklists, and licenses in the chosen
repository. It registers a stable workspace server named `fagan` in
`.kiro/settings/mcp.json`, using Kiro's documented
[workspace MCP format](https://kiro.dev/docs/mcp/configuration/). There is no
power-level `mcp.json` that could start against the wrong repository or namespace
the server differently from the role permissions.

`kiro-cli powers install --help` was inspected; the installed CLI exposes a
name-or-path operand and verbosity/help flags, with no workspace-scoped install
option. We did not alter global power state. The documented
[local-folder import](https://kiro.dev/docs/powers/installation/) remains a Kiro
IDE step: build the source package, then **Powers → Add Custom Power → Import
power from a folder**, selecting `power/`. Native import, keyword activation,
skill execution, role execution and hook activation in that second repository
remain **unverified**. The completed test boundary is direct local installation,
native agent-file validation, and a real MCP stdio transaction sequence.

## Failures found and fixed

The first scratch attempts exposed two portability assumptions in the source
server: the checklist directory and package version loader used paths relative
to unbundled module files. A bundle changes those paths. The build now relocates
checklists beside the bundle and embeds the server package manifest at build
time. The test repository deliberately has no `package.json`, proving that the
installed server does not read a target repository manifest for its own version.

Setup also now uses Fagan-specific steering filenames to preserve a target's
existing product and technology guidance. Conflict checks cover every copied
file, the MCP backup, the installation lock and the temporary MCP filename
before creating any directories. Existing paths are checked for symlinks, and
file creation is exclusive. Configuration merges preserve other MCP servers and
unknown top-level fields. Setup is intended for a trusted local checkout with
no concurrent configuration editor; it is not a filesystem sandbox and does
not claim to defeat hostile concurrent path replacement. On an unexpected
write failure, it removes files created by that attempt; empty directories may
remain.

The installer is a first-install operation, not an automatic updater. It
refuses existing Fagan files rather than guessing how to migrate local changes.
The exact original MCP backup is created with owner-only permissions and excluded by a target-local `.fagan/.gitignore`. It may contain credentials and must be reviewed
before staging `.fagan/` files.

The bundler uses the official [esbuild API](https://esbuild.github.io/api/) and
Node's documented [filesystem operations](https://nodejs.org/api/fs.html).
`power/THIRD_PARTY_NOTICES.txt` is generated from the license files of included
npm packages. Generated `power/dist/` artifacts are ignored, so importing an
unbuilt checkout directly from GitHub is not a supported install path.
