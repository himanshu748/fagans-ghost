# Experiments

Results of the experiments listed in PLAN.md section 2.4. Each row records what was actually tried and seen, including failures. "Not run yet" means nobody has tried it.

| ID | Question (short) | Step | Status | Result |
| --- | --- | --- | --- | --- |
| E1 | Do workspace hooks fire in a V3 session driven by T3 Code over ACP? | 3 | Not run yet | |
| E2 | Shell tool ID and command field in `tool_input` | 3 | Not run yet | |
| E3 | Does exit code 2 block the shell call in CLI V3? Where does stderr show? | 3 | Not run yet | |
| E4 | Does matcher `@fagan/record_rework` match `mcp_fagan_record_rework`? | 3 | Not run yet | |
| E5 | Does a `Stop` hook `confirm` block work over ACP? | 3 | Not run yet | |
| E6 | Does the T3 Code client expose `/spec`, `/agent`, `/hooks` and manual steering slash commands? | 2 | Partly run | See below |
| E7 | Agent switching through ACP; project agents as sub-agents; nesting depth | 3 | Not run yet | |
| E8 | Does the scribe keep `log_defect` as a sub-agent of the moderator? | 3 | Not run yet | |
| E9 | Command path resolution and server namespacing for a power's `mcp.json` | 5 | Not run yet | |
| E10 | Can a power ship steering files or hooks? | 5 | Not run yet | |
| E11 | Do all agent files pass `kiro-cli agent validate`? | 3 | Not run yet | |
| E12 | Units and default of the hook `timeout` field | 3 | Not run yet | |
| E13 | Does `auto` steering inclusion trigger in CLI V3 for our description? | 2 | Not observed | See below |
| E14 | Do `skill://` resources in agent files load power skills? | 5 | Not run yet | |
| E15 | How do Kiro Correctness properties relate to our fast-check tests? | after 2, in IDE | Not run yet | Needs the Kiro IDE (you) |
| E16 | Is the `Stop` / `PostToolUse` payload the same shape as `PreToolUse`? | 3 | Not run yet | |

## E6: slash commands in the T3 Code client (step 2)

- The spec work in step 2 was done by a Kiro CLI V3 agent session that T3 Code drives over ACP. That session had no `/spec` command or spec tool it could call, so `/spec new fagan-mcp` was not used.
- The three spec files in `.kiro/specs/fagan-mcp/` (`requirements.md`, `design.md`, `tasks.md`) were written by hand, following the layout and EARS format on [kiro.dev/docs/specs](https://kiro.dev/docs/specs/) and [feature specs](https://kiro.dev/docs/specs/feature-specs/).
- Not yet tested: whether the T3 Code chat box passes `/spec`, `/agent`, `/hooks` or `/inspection-ritual` through to Kiro when a human types them. That needs a human in the T3 Code UI or an interactive `kiro-cli chat` session.

## E13: auto steering inclusion (step 2)

- `.kiro/steering/fagan-history.md` uses `inclusion: auto` with `name: fagan-history` and a `description` about history, citations and docs, per [kiro.dev/docs/steering](https://kiro.dev/docs/steering/).
- Whether Kiro actually pulled it in could not be observed from inside this harness: the agent session does not show which steering files were loaded, and no history or docs writing happened in step 2. Not observed, so no result is claimed.
- To check later (step 7, when the README history section is written): ask in an interactive session for the Fagan citation and see whether the answer uses the verified list, or check Kiro's context view in the IDE. If it does not trigger, switch the file to `manual` as planned.

## PBT findings

None so far. Property tests are written in FEAT-002 of step 2; only real failures found by fast-check will be recorded here, with the counterexample and the fix.
