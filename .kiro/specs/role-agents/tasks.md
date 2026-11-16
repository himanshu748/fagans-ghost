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
  - [x] 4.1 `.kiro/agents/prompts/<name>.md` for the five roles, each stating its role value, phase rules and honesty rules
  - [x] 4.2 The DEFECT line format in both inspector prompts and the scribe prompt, with fagan-mcp's types, classes and severities
  - _Requirements: RA-R4.1 to RA-R4.8, RA-R5.1_

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

- [ ] 9. E1 and E16: hooks over ACP and payload shapes (FEAT-003)
  - [ ] 9.1 In a scratch repo, record whether `Stop`, `PreToolUse` and `PostToolUse` hooks fire in an ACP V3 session, and the payload keys and `tool_name` values for each
  - _Requirements: RA-R6.1, RA-R6.2, RA-R6.3_

- [ ] 10. E2 and E3: the commit gate live (FEAT-003, fagan-mcp task 16)
  - [ ] 10.1 Record the shell tool ID and command field; update `COMMAND_FIELDS` in `src/cli.ts` and the launcher if the field differs
  - [ ] 10.2 With an open major, the gate blocks a real `git commit` attempted by the agent; record where stderr shows
  - _Requirements: RA-R6.2, RA-R7.2_

- [ ] 11. E4: after-rework matcher (FEAT-003)
  - [ ] 11.1 Record whether matcher `@fagan/record_rework` fires for the V3 tool ID `mcp_fagan_record_rework`; apply the PLAN.md fallback if not
  - _Requirements: RA-R6.3, RA-R6.5_

- [ ] 12. E5: `confirm` block on the Stop hook over ACP (FEAT-003)
  - [ ] 12.1 Try it on a scratch copy of `suggest-inspection.json`; keep the plain suggestion if it does not work
  - _Requirements: RA-R6.1, RA-R6.4_

- [ ] 13. E7 and E8: agent switching and the scribe as a sub-agent (FEAT-003)
  - [ ] 13.1 Record how the moderator is selected over ACP and whether it can start the four role agents
  - [ ] 13.2 Record whether the scribe's `log_defect` call runs without a prompt under the moderator's allow rules
  - _Requirements: RA-R2.8, RA-R3.5, RA-R4.2_

- [ ] 14. E12: hook timeout units (FEAT-003)
  - [ ] 14.1 A probe hook that sleeps longer than its timeout shows the unit live
  - _Requirements: RA-R6.4, RA-R6.5_

- [ ] 15. First real inspection of this repo (FEAT-004)
  - [ ] 15.1 Record the real `SIZE_LIMIT_EXCEEDED` result for the whole repo
  - [ ] 15.2 Run insp-0001 on `647a96b..4b4c692` with the moderator and its four sub-agents, stopping at the Author's part (no agent records rework or waives)
  - [ ] 15.3 Commit the real `.fagan/inspections/insp-0001/` record and a test that parses every committed `report.json`
  - _Requirements: RA-R4.1 to RA-R4.8, RA-R8.1_

- [ ] 16. Step 7: the root README tells the Author not to choose "Always allow" for `record_rework`
  - _Requirements: RA-R8.2_
