# fagan-mcp

Deterministic local stdio MCP server and `fagan` CLI that keep the record for a
Fagan-style formal code inspection (Fagan, 1976), driven from Kiro's agents and
hooks. Part of the [fagans-ghost](https://github.com/himanshu748/fagans-ghost)
repository.

## Use

Register it as an MCP server, or run the CLI directly:

```sh
npx fagan-mcp@latest          # starts the stdio MCP server
fagan serve                   # same, once installed
fagan record <tool_input>     # records an inspection event (used by hooks)
fagan commit-gate <payload>   # PreToolUse shell-commit gate
```

See the repository README for the full workflow: the `fagan-setup` power installs
the agents, hooks and steering files into `.kiro/` and registers this server as a
workspace MCP server.
