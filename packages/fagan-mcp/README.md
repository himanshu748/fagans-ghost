# fagan-mcp

The local stdio MCP server and `fagan` CLI for [Fagan's Ghost](https://github.com/himanshu748/fagans-ghost). The CLI reads the inspection store belonging to the Git checkout where it is started.

## Build an installable archive

From the source repository with Node 22.12 or newer:

```sh
npm ci
npm run build --workspace fagan-mcp
node scripts/test-package.mjs
npm pack --workspace fagan-mcp
```

From a target checkout, run the archive using its absolute path. npm installs package dependencies as needed.

```sh
npm exec --package=/absolute/path/fagan-mcp-0.1.0.tgz -- fagan --help
npm exec --package=/absolute/path/fagan-mcp-0.1.0.tgz -- fagan serve
```

`serve` starts MCP on stdio. Use the [Kiro setup guide](https://github.com/himanshu748/fagans-ghost#bring-the-ritual-to-another-repository) to register the server and install the agents, hooks and checklists in the target.

## Export a shareable report

After recording an inspection, run the export command from the inspected Git checkout. Use its actual inspection ID.

```sh
npm exec --package=/absolute/path/fagan-mcp-0.1.0.tgz -- fagan export insp-0001 --format html
```

The command prints the HTML file path, SHA-256 and size. The report embeds source excerpts and findings. Review its contents before sharing it.
