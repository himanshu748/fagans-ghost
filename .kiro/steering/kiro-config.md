---
inclusion: fileMatch
fileMatchPattern: [".kiro/**", "power/**"]
---

# Kiro configuration rules

- Never guess a Kiro config format. Before writing or changing a file under `.kiro/` or `power/`, read the matching page on [kiro.dev/docs](https://kiro.dev/docs) and link it in the commit message or the spec design.
  - Steering: [kiro.dev/docs/steering](https://kiro.dev/docs/steering/)
  - Specs: [kiro.dev/docs/specs](https://kiro.dev/docs/specs/)
  - Custom agents: [configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/), [sub-agents](https://kiro.dev/docs/custom-agents/subagents.md), [permissions](https://kiro.dev/docs/permissions.md) and [built-in tools](https://kiro.dev/docs/tools.md)
  - Hooks: [kiro.dev/docs/hooks](https://kiro.dev/docs/hooks/) and [CLI V3 hooks migration](https://kiro.dev/docs/cli/v3/hooks-migration.md)
  - MCP: [configuration](https://kiro.dev/docs/mcp/configuration/)
  - Powers: [create powers](https://kiro.dev/docs/powers/create/)
- Run `kiro-cli agent validate --path <file>` on every agent file after editing it. It checks JSON types and that a `file://` prompt exists, but on 2026-11-16 (kiro-cli 3.3.0) it accepted an unknown field, an unknown capability name and an unknown effect (`docs/experiments.md` E11), so `packages/fagan-mcp/test/kiro-config.test.ts` checks tool scopes, permission rules, resources and hooks as well.
- `.kiro/` and every folder under it are committed. Never add `.kiro` or any of its subfolders to a `.gitignore`.
- Steering front matter uses `inclusion: always`, `fileMatch` (with `fileMatchPattern`), `manual`, or `auto` (with `name` and `description`).
- Every custom agent lists the steering files it needs in `resources` as `file://` entries. The docs disagree on whether this is required: the [steering page](https://kiro.dev/docs/steering/) says custom agents do not include steering automatically, while the [configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/) says custom agents inherit default resources (steering, skills, AGENTS.md) unless the setting `chat.disableInheritingDefaultResources` is true. Listing the files works under both readings. A sub-agent that declares its own `file://` resources loads those in place of the parent's (configuration reference).
- If a feature is IDE only (for example spec Correctness), say so and ask the human to run it in the Kiro IDE. Do not fake its output.
- Record what did and did not work in `docs/experiments.md`.
