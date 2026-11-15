---
inclusion: fileMatch
fileMatchPattern: [".kiro/**", "power/**"]
---

# Kiro configuration rules

- Never guess a Kiro config format. Before writing or changing a file under `.kiro/` or `power/`, read the matching page on [kiro.dev/docs](https://kiro.dev/docs) and link it in the commit message or the spec design.
  - Steering: [kiro.dev/docs/steering](https://kiro.dev/docs/steering/)
  - Specs: [kiro.dev/docs/specs](https://kiro.dev/docs/specs/)
  - Custom agents: [configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/)
  - Hooks: [kiro.dev/docs/hooks](https://kiro.dev/docs/hooks/) and [CLI V3 hooks migration](https://kiro.dev/docs/cli/v3/hooks-migration.md)
  - MCP: [configuration](https://kiro.dev/docs/mcp/configuration/)
  - Powers: [create powers](https://kiro.dev/docs/powers/create/)
- Run `kiro-cli agent validate` on every agent file after editing it.
- `.kiro/` and every folder under it are committed. Never add `.kiro` or any of its subfolders to a `.gitignore`.
- Steering front matter uses `inclusion: always`, `fileMatch` (with `fileMatchPattern`), `manual`, or `auto` (with `name` and `description`).
- Custom agents do not load workspace steering on their own; list it in `resources` explicitly.
- If a feature is IDE only (for example spec Correctness), say so and ask the human to run it in the Kiro IDE. Do not fake its output.
- Record what did and did not work in `docs/experiments.md`.
