# Tasks: role-agents

Requirements: #[[file:.kiro/specs/role-agents/requirements.md]]. Design: #[[file:.kiro/specs/role-agents/design.md]].

Tasks 1 to 8 are the spec, agents, hooks, launcher and config tests (step 3, FEAT-002). Tasks 9 to 14 are the live Kiro experiments (FEAT-003). Task 15 is the first real inspection of this repo (FEAT-004). Task 16 is carried into step 7. Tick each box when its tests pass or its result is recorded in `docs/experiments.md`.

- [x] 1. Docs and steering
  - [x] 1.1 Read the configuration reference, sub-agents, permissions, built-in tools, hooks (overview, types, actions, CLI V3 migration), steering and MCP configuration pages, and list them in design.md "Kiro docs used"
  - [x] 1.2 `.kiro/steering/kiro-config.md` says one consistent thing about steering for custom agents (both doc pages cited; every agent lists its steering) and what `kiro-cli agent validate` checks
  - [x] 1.3 PLAN.md section 10 no longer says the repo gives the default agent an `ask` rule for `record_rework`
  - _Requirements: RA-R5.3, RA-R8.2_

- [x] 2. Spec
  - [x] 2.1 `requirements.md` with EARS criteria and `RA-R<n>.<m>` IDs
  - [x] 2.2 `design.md` with each agent's JSON and the reason for each rule, the meeting flow, hooks, launcher, E8, the request-timeout risk and the experiments still to run
  - [x] 2.3 `tasks.md`
  - _Requirements: RA-R1.1 to RA-R9.4_

- [x] 3. Role agents
  - [x] 3.1 `.kiro/agents/moderator.json`, `reader.json`, `inspector-logic.json`, `inspector-interfaces.json` and `scribe.json` with the tool scopes of PLAN.md section 10
  - [x] 3.2 Permission rules: whole-capability denies, `fagan/record_rework` deny, `fagan/*` deny with `exclude`, and the moderator's `subagent` and `mcp` allow rules for its sub-agents' tools (E8 on paper)
  - [x] 3.3 Resources: `product.md` and `inspection-ritual.md` for every agent, `tech.md` for the moderator and inspectors
  - _Requirements: RA-R1.1, RA-R1.2, RA-R1.3, RA-R2.1 to RA-R2.8, RA-R3.1 to RA-R3.7, RA-R5.2, RA-R5.3, RA-R8.1_

- [x] 4. Prompts
  - [x] 4.1 `.kiro/agent-prompts/<name>.md` for the five roles, each stating its role value, phase rules and honesty rules
  - [x] 4.2 The DEFECT line format in both inspector prompts and the scribe prompt, with fagan-mcp's types, classes and severities
  - [x] 4.3 Move the prompts from `.kiro/agents/prompts/` to `.kiro/agent-prompts/` with `prompt` set to `file://../agent-prompts/<name>.md`, because Kiro read the old prompt files as agent files and sent a `config_error` for each (FEAT-005, design.md "Prompt folder"); `kiro-config.test.ts` checks that `.kiro/agents/` has no `.md` file at any depth
  - _Requirements: RA-R4.1 to RA-R4.8, RA-R5.1, RA-R5.4_

- [x] 5. Hooks
  - [x] 5.1 `.kiro/hooks/suggest-inspection.json` (`Stop`, timeout 30)
  - [x] 5.2 `.kiro/hooks/commit-gate.json` (`PreToolUse`, matcher `shell`, timeout 30)
  - [x] 5.3 `.kiro/hooks/after-rework.json` (`PostToolUse`, matcher `@fagan/record_rework`, timeout 1260)
  - _Requirements: RA-R6.1 to RA-R6.5_

- [x] 6. Hook launcher
  - [x] 6.1 `scripts/fagan-hook.mjs`: forwards to the built CLI, and falls back when `dist/cli.js` is missing (gate blocks possible commits with exit 2, other hooks warn and exit 0)
  - [x] 6.2 `.kiro/steering/inspection-ritual.md`: build first, workspace trust, how to switch to the moderator, the DEFECT line hand-off, and the "Always allow" warning for `record_rework`
  - _Requirements: RA-R7.1 to RA-R7.6, RA-R8.2_

- [x] 7. Config and launcher tests
  - [x] 7.1 `packages/fagan-mcp/test/kiro-config.test.ts`: strict schemas, scopes against `ALLOWED_ROLES`, rules, registered tool names, prompts, resources, hooks, and `kiro-cli agent validate` when `kiro-cli` is on PATH
  - [x] 7.2 `packages/fagan-mcp/test/hook-launcher.test.ts`: fallback in a temp copy without `dist`, forwarding to the built CLI in a temp repo
  - [x] 7.3 `packages/fagan-mcp/test/hook-launcher.property.test.ts`: properties RA-P1 to RA-P3, with generators shared through `test/gate-arbitraries.ts`
  - _Requirements: RA-R1.4, RA-R7.1 to RA-R7.6, RA-R9.1 to RA-R9.4_

- [x] 8. Validator run (E11)
  - [x] 8.1 `kiro-cli agent validate --path` on all five agents and `kiro-cli agent list` from the repo root, recorded in `docs/experiments.md` E11
  - [x] 8.2 Probe on throwaway copies in a temp folder: what the validator accepts and rejects, recorded in E11
  - _Requirements: RA-R1.4, RA-R9.1_

- [x] 9. E1 and E16: hooks over ACP and payload shapes (FEAT-003)
  - [x] 9.1 In a scratch repo, record whether `Stop`, `PreToolUse` and `PostToolUse` hooks fire in an ACP V3 session, and the payload keys and `tool_name` values for each. All three fire once the client's `initialize` sends `clientCapabilities._meta.kiro.hooks` `{ enabled: true, v2: true }` (T3 Code does) and in headless `kiro-cli chat --v3 --no-interactive`; shell `tool_name` is `execute_bash`; `Stop` carries only `session_id`, `hook_event_name`, `cwd`; `PostToolUse` adds `tool_response`
  - [x] 9.2 `scripts/acp-probe.mjs`, the ACP client for these experiments, and `packages/fagan-mcp/test/acp-probe.test.ts` for its launch arguments, redaction and one-time permission choices
  - _Requirements: RA-R6.1, RA-R6.2, RA-R6.3, RA-R10.1, RA-R10.2_

- [x] 10. E2 and E3: the commit gate live (FEAT-003, fagan-mcp task 16)
  - [x] 10.1 Record the shell tool ID and command field; update `COMMAND_FIELDS` in `src/cli.ts` and the launcher if the field differs. `execute_bash` with `tool_input.command`: no change. The gate now also starts from `tool_input.cwd` (fagan-mcp task 16.3)
  - [x] 10.2 With an open major, the gate blocks a real `git commit` attempted by the agent; record where stderr shows. Blocked over ACP, commit count unchanged; the agent received the message, the ACP client only a `failed` tool update
  - _Requirements: RA-R6.2, RA-R7.2_

- [x] 11. E4: after-rework matcher (FEAT-003)
  - [x] 11.1 Record whether matcher `@fagan/record_rework` fires for the V3 tool ID `mcp_fagan_record_rework`; apply the PLAN.md fallback if not. It fires: a live `record_rework` call over ACP ran `follow-up --latest`, which closed the scratch inspection; no fallback, the hook file is unchanged. `cli.test.ts` pipes the recorded `PostToolUse` payload into `follow-up --latest`, and `acp-probe.test.ts` checks the recorded permission request
  - _Requirements: RA-R6.3, RA-R6.5_

- [x] 12. E5: `confirm` block on the Stop hook over ACP (FEAT-003)
  - [x] 12.1 Try it on a scratch copy of `suggest-inspection.json`; keep the plain suggestion if it does not work. It reaches the ACP client as a `session/request_permission` (`{"skip":true}` suppresses it), but choosing `run: false` started an extra agent turn with no task, so the original plain hook was kept. CLI V3 ignores its stdout. On 2026-11-17 the hook gained a dynamic confirmation question with one acknowledgment option; local regression tests cover due, below-threshold, covered, unbuilt and failed checks. Live verification of this exact variant remains separate (docs/experiments.md)
  - _Requirements: RA-R6.1, RA-R6.4_

- [x] 13. E7 and E8: agent switching and the scribe as a sub-agent (FEAT-003)
  - [x] 13.1 Record how the moderator is selected over ACP and whether it can start the four role agents. `_meta.kiro.modeId: "moderator"` on `session/new` selects it; it started the `scribe` (hook `tool_name` `subagent_scribe`) without a prompt. Only the scribe was started live; the reader and inspectors are first started in FEAT-004. Depth tested: 1
  - [x] 13.2 Record whether the scribe's `log_defect` call runs without a prompt under the moderator's allow rules. Yes, and a scratch control without the moderator's `fagan/log_defect` allow rule got a permission request for the same call
  - _Requirements: RA-R2.8, RA-R3.5, RA-R4.2_

- [x] 14. E12: hook timeout units (FEAT-003)
  - [x] 14.1 A probe hook that sleeps longer than its timeout shows the unit live. Seconds: with `timeout` 2, a 5 s hook got SIGTERM about 2 s after the tool finished and a 0.3 s control finished; Kiro reported both as `completed`
  - _Requirements: RA-R6.4, RA-R6.5_

- [x] 15. First real inspection of this repo (FEAT-004)
  - [x] 15.1 Record the real `SIZE_LIMIT_EXCEEDED` result for the whole repo (2026-11-17, Node SDK over real stdio MCP: 12,483 > 1,500; no inspection stored; receipt in docs/experiments/)
  - [x] 15.2 After Kiro `UsageLimitReachedError`, the user authorized Codex. A real insp-0001 was produced with Codex roles; this does not satisfy a full Kiro role-run claim (docs/inspections/insp-0001.md). Original Kiro task: Run insp-0001 on `647a96b..4b4c692` with the moderator and its four sub-agents, stopping at the Author's part (no agent records rework or waives)
  - [x] 15.3 Commit the real `.fagan/inspections/insp-0001/` record and a test that parses every committed `report.json`
  - _Requirements: RA-R4.1 to RA-R4.8, RA-R8.1_

- [x] 16. Step 7: the root README tells the Author not to choose "Always allow" for `record_rework`
  - _Requirements: RA-R8.2_
