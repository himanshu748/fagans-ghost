# How Kiro was used

Fagan's Ghost uses Kiro to stage an inspection rather than ask one agent for a review verdict. The project combines scoped custom agents, workspace hooks, steering, EARS specs and a deterministic MCP server. The evidence below distinguishes installed configuration, locally tested behavior and actual Kiro execution.

## Surfaces and provenance

Initial implementation and experiments used **Kiro CLI V3 through T3 Code over ACP** on macOS. The plan recorded CLI 3.2.1; the live hook and agent experiments on November 16, 2026 used 3.3.0. ACP exposed tool calls, session modes and permission requests, allowing the hook payloads and blocked calls to be examined directly.

On November 17 a bounded availability probe selected the Moderator and connected `fagan`, but Kiro rejected its prompt with `UsageLimitReachedError`. No inspection was created by that probe. The user authorized continuing with **Codex through T3 Code**. The real repository inspection in `.fagan/inspections/insp-0001/` therefore used Codex role agents and the actual stdio MCP server. Its 40 readings and D001 finding are real, but they are not evidence that Kiro ran all five roles in that meeting.

| Surface | What actually happened | Remaining boundary |
| --- | --- | --- |
| Kiro CLI / ACP | Implementation, MCP connection, custom-agent validation, Moderator-to-Scribe delegation, hook experiments | Current one-option suggestion and full real role ceremony need another live run when Kiro is available |
| Kiro IDE | Configuration prepared for it | Correctness workflow, power import and hook cross-check not run |
| Kiro Web | Not used | No GitHub-connected published repository was created; publication is reserved for the Author |
| Kiro Crew | Not used | Local custom agents already model the inspection roles; no separate Crew app was built or claimed |
| Codex / T3 Code | Authorized continuation, real role inspection, viewer, power packaging and local verification | Does not establish Kiro runtime execution |

The [experiment log](docs/experiments.md) retains actual payloads and outcomes. Its November 17 quota entry describes the state at that time; the later Codex inspection is evidenced by the saved inspection record. [Kiro's availability tables](https://kiro.dev/docs/) and the [PLAN feature matrix](PLAN.md#2-kiro-surface-and-feature-support-matrix) explain the intended surface coverage.

## Custom agents and their impact

Five project-scoped configurations live in [.kiro/agents](.kiro/agents/), with prompts in [.kiro/agent-prompts](.kiro/agent-prompts/). There is no Author agent.

| Agent | Responsibility | Permission boundary |
| --- | --- | --- |
| Moderator | Opens the packet, coordinates preparation and meeting, closes and exports | Delegates roles; cannot record Author rework |
| Reader | Explains each unit in plain English without judging | Records readings; cannot log defects |
| Logic inspector | Checks logic, state transitions and invariants | Read-only findings; cannot mutate the defect log |
| Interface inspector | Checks contracts, inputs, outputs and boundaries | Read-only findings; cannot mutate the defect log |
| Scribe | Records confirmed findings with locations and attribution | Only supplied role allowed to call `log_defect` |

All five configurations passed `kiro-cli agent validate`. That command also accepted deliberately invalid probe configurations, so it was insufficient as a strict checker; repository tests validate the documented format and permission scope as well. Markdown prompts originally placed below `.kiro/agents/` were interpreted as agents, so they were moved to `.kiro/agent-prompts/`.

A real Kiro scratch experiment switched to Moderator mode and delegated a tool call to the Scribe. It also revealed that child permissions intersect with the parent's rules: the Moderator needs to allow the delegated Scribe's `fagan/log_defect` capability, while its prompt keeps the actual recording with the Scribe. That is a workflow constraint, not independent authentication.

The Codex meeting demonstrated the role separation on actual project code. The Reader covered all 40 units; the inspectors revisited the packet; the Scribe recorded the Logic inspector's allegation that `git -C/path commit` could check the wrong repository. The [subsequent reproduction](docs/inspections/insp-0001-D001-verification.md) found that Git rejects this syntax before a commit, making D001 a false positive. The human Author explicitly approved the waiver, which Codex relayed through `record_rework`; actual follow-up passed the configured build and tests and closed the inspection with D001 still marked waived. The interface inspector reported no additional defects. No finding was invented to populate the viewer.

Official references: [custom agents](https://kiro.dev/docs/custom-agents/), [configuration](https://kiro.dev/docs/custom-agents/configuration-reference/).

## Hooks and the workflows they automate

| File | Workflow | Evidence and limitation |
| --- | --- | --- |
| [.kiro/hooks/suggest-inspection.json](.kiro/hooks/suggest-inspection.json) | On Stop, checks changed-line threshold and presents an inspection suggestion | Plain stdout was invisible over ACP. A confirmation interaction worked; the final single `Got it` variant has local tests but still needs live Kiro verification |
| [.kiro/hooks/commit-gate.json](.kiro/hooks/commit-gate.json) | Before a shell call, blocks a supported Git commit while an inspection has unresolved majors | Live Kiro scratch commit was blocked and commit count stayed unchanged; the real inspection later raised an attached `-C` concern, since reproduced as a false positive |
| [.kiro/hooks/after-rework.json](.kiro/hooks/after-rework.json) | After `@fagan/record_rework`, reruns checks and follow-up | Live scratch record-rework matched Kiro's internal MCP tool name and triggered follow-up |

ACP hooks required the client to advertise Kiro's hook extension. Payload inspection established `execute_bash`, `tool_input.command` and the tool's working-directory behavior. The gate therefore uses observed fields rather than guessed ones. Exit code 2 prevented the shell action; stderr reached the agent, while the client saw a failed tool update.

The suggestion experiment also found that dismissing a `run: false` choice produced an extra model turn. The current acknowledgment uses `run: true` without opening a meeting. Hook timeout tests established seconds as the unit, but a killed hook could still be reported completed by Kiro. These observations changed the implementation and are recorded in experiments E1–E5, E12 and E16.

Official references: [hooks](https://kiro.dev/docs/hooks/), [types](https://kiro.dev/docs/hooks/types/), [actions](https://kiro.dev/docs/hooks/actions/).

## Specs, implementation and the vibe-coding comparison

Each major component has `requirements.md`, `design.md` and `tasks.md`:

- [.kiro/specs/fagan-mcp](.kiro/specs/fagan-mcp/): phases, roles, persistence, packet splitting, metrics and exit criteria.
- [.kiro/specs/role-agents](.kiro/specs/role-agents/): scoped responsibilities and hook behavior.
- [.kiro/specs/inspection-room](.kiro/specs/inspection-room/): real exports, playback, safe rendering, keyboard access and reduced motion.

The requirements use EARS form; stable IDs connect invariants to tests. For example, follow-up cannot succeed while an unwaived major remains open, and a report must survive export/import without data loss. Writing those contracts before the implementation made it possible to challenge a passing example with generated cases.

T3 Code did not expose the native `/spec` slash workflow in the observed session. The spec files were written and implemented directly. This is use of Kiro with spec artifacts, not evidence of a completed native Spec or Analyze Requirements workflow. The IDE-only Correctness integration remains a manual handoff.

A small [conversational-code comparison](docs/experiments/vibe-comparison/README.md) was actually run during the Codex continuation. A one-pass regex sketch handled ordinary commits and flags but missed quoted/escaped command letters and misclassified echoed words; the specified gate classified those seven hand-selected examples as expected. The source, command and raw results are retained. This was written after the production implementation, with prior knowledge of it, so it is an illustration rather than an independent benchmark. No speed advantage or general quality claim is supported, and it was not a run of Kiro’s native Vibe mode.

Official references: [specs](https://kiro.dev/docs/specs/), [feature specs](https://kiro.dev/docs/specs/feature-specs/), [Correctness](https://kiro.dev/docs/specs/correctness/).

## Steering that mattered

[product.md](.kiro/steering/product.md) and [tech.md](.kiro/steering/tech.md) are always included. They keep the human as Author, prohibit fabricated evidence and require deterministic runtime behavior. File-match steering scopes server, viewer and Kiro configuration guidance. [inspection-ritual.md](.kiro/steering/inspection-ritual.md) is manual; [fagan-history.md](.kiro/steering/fagan-history.md) uses auto inclusion for citations, though that auto-inclusion behavior was not observed in the session.

The most consequential strategy was preserving the distinction between **what an agent says** and **what the server records**. A Reader's statement cannot become a verified repair; a source change cannot become an Author waiver. The same rule now keeps the Codex meeting and the earlier Kiro experiments clearly labeled.

Foundation steering generation was unnecessary because the project-specific guidance was authored directly. Session, compaction and file-event hooks were not added because they would not serve another required transition. Manual steering supplies the user-invoked ritual instead of an obsolete manual-hook path. Reference: [steering](https://kiro.dev/docs/steering/).

## What MCP enabled

The custom server owns the state machine and plain-file history. It checks actual commands before entry, partitions the real diff, validates defect locations, refuses wrong roles or phases, timestamps transitions and exports the resulting evidence. The roles can reason in Kiro while the rules remain deterministic and testable.

The same stdio interface supports the live Kiro experiments, the Codex continuation and the contract test. That portability made the runtime switch possible without making a fake inspection. The full-repository preflight rejected 12,483 changed lines against the 1,500-line limit and left no inspection behind; the real meeting used the smaller `647a96b..4b4c692` range. See the [size-preflight receipt](docs/experiments/2026-11-17-size-preflight.json). Reference: [MCP](https://kiro.dev/docs/mcp/).

## What property-based testing caught

The [experiment log](docs/experiments.md#pbt-findings) records three actual fast-check failures in report round-tripping:

- An event's own `__proto__` key disappeared during record parsing. Validation now rejects that shape instead of silently losing it.
- A metric containing negative zero returned as positive zero after JSON serialization. The metric schema rejects negative zero and metric computation avoids it.
- Negative zero nested inside event data suffered the same loss. The event schema rejects it recursively.

Other properties cover changed-line coverage, finite/defined rates, time monotonicity, open-major exit rules and repeated rework/follow-up accounting. The repeated-cycle duration defect came from review; it was not discovered by the original passing suite. A later property now fails when either recorded accounting mutation is reintroduced. These distinctions matter: testing the eventual repair is not the same as discovering the original bug.

These are fast-check tests under Vitest. **Kiro IDE Correctness has not run**, so automatic EARS-to-property extraction is not claimed.

## Powers built and used

The [Fagan's Ghost power](power/) packages `fagan-setup` and `fagan-inspection` skills, the bundled deterministic server, checklists and installation templates. No third-party Kiro power was used to implement the product.

The setup skill installs into a chosen Git repository and registers a workspace server named `fagan`. This deliberate adaptation avoids starting the server in the power's installation directory and keeps hook tool names consistent. Template copying is performed by the setup script, not by undocumented fields in a power manifest.

[Power verification](docs/power-verification.md) records a passing isolated installation test with Node 26.12.0 and Kiro CLI 3.4.0. It exercised a relocated bundle through a real stdio fixture inspection, verified preserved target configuration and rejected conflicts and symlinks. The fixture used scripted readings, no inspectors and no seeded defects; it is not demo data or evidence of agent review quality. Native Kiro IDE import/activation and CLI power installation are not claimed. The CLI's install command has no workspace scope in its observed help; the local test does not alter the user's global power configuration.

Official references: [powers](https://kiro.dev/docs/powers/), [create](https://kiro.dev/docs/powers/create/), [installation](https://kiro.dev/docs/powers/installation/).

## Before presenting a complete Kiro ceremony

Run the three specs through **Correctness in the Kiro IDE**, import the built power into an isolated repository through the IDE, and cross-check its hooks. When Kiro model access is available, record a full real ceremony and the final suggestion interaction. D001’s human-approved waiver and passing follow-up are now recorded in the closed Codex inspection. A fresh Kiro ceremony must retain its own genuine decisions and results. None of these missing actions should be replaced by edited JSON or a staged success screen.
