# Resume the first real inspection

Step 2 is complete. Step 3's agents, hooks and initial experiments exist;
the first inspection of this repo is blocked on Kiro's monthly usage limit,
confirmed on 2026-11-17. The suggestion's new acknowledgment variant has local
regression coverage but has not run live. No inspection exists yet.

Use this repository, not the shared T3 workspace:

```sh
cd /Users/himanshujha/code/fagans-ghost
npm test
npm run build
git status --short
```

Resume only when the existing free Kiro allowance is available. Do not enable
overages or buy credits. First check `.fagan/inspections/`: if a previous attempt
has created an inspection, resume its stored phase instead of opening another.
Build plus tests must fit within the current Kiro MCP per-call timeout (the
previously documented default is 120 seconds); retime under current load. If
they exceed it, verify a supported timeout configuration before running.

For the first run, from a clean tree with no inspection, use the existing ACP
probe. This invokes the actual Kiro moderator and its role agents. It permits
only the listed tool requests, never `record_rework`, shell or file writes.
The moderator's existing Kiro permissions also apply.

```sh
evidence_dir=$(mktemp -d -t fagan-inspection)
node scripts/acp-probe.mjs \
  --cwd "$PWD" --transcript "$evidence_dir/inspection.jsonl" \
  --mode moderator --timeout 5400 --linger 5 \
  --allow hook-confirm \
  --allow @fagan/open_inspection --allow @fagan/get_packet \
  --allow @fagan/record_reading --allow @fagan/log_defect \
  --allow @fagan/close_meeting --allow @fagan/metrics \
  --allow @fagan/export_report --allow @fagan/follow_up \
  --allow subagent:reader --allow subagent:inspector-logic \
  --allow subagent:inspector-interfaces --allow subagent:scribe \
  'Run the inspection ritual on base 647a96b and head 4b4c692, title "fagan-mcp review v2 fixes". Omit author_overview. Use both inspectors for preparation with get_packet; then open the meeting as moderator. For every unit have the Reader record a factual paraphrase without judging. Have both inspectors review it and pass their exact DEFECT lines to the Scribe for logging; do not invent, rewrite, merge or omit findings. Close the meeting, call metrics and export_report for JSON and text, and list the results for the Author. Never call record_rework or waive a defect. If there are no defects, follow_up may close the inspection. Stop and report any failure; do not repeatedly open inspections or retry a quota error.'
```

Afterward, inspect the stored packet, readings, defect log, phase and exported
report; compare them with the actual role calls in the transcript. Do not use
an agent's final answer alone as evidence. Add committed-report parse coverage
once the first report exists. When majors exist, test the Kiro commit gate with
`git commit --dry-run -m "fagan gate check"`; verify no commit was created.
Rework and waivers require the human Author's decision. Export again after
follow-up, then commit the genuine inspection record locally.

The original hard rule leaves these steps for the human in the Kiro IDE:

- Open `.kiro/specs/fagan-mcp/` and `.kiro/specs/role-agents/` and run the
  Correctness workflow. Record actual generated properties and failures;
  hand-written fast-check tests are separate evidence.
- Verify the Stop suggestion and commit/after-rework hooks in the IDE. A
  CLI/ACP experiment does not establish IDE behavior. `Got it` acknowledges
  the suggestion; it does not open a meeting or approve rework.
- Once step 5 produces the power, test its folder import in the IDE.

Then continue the agreed sequence: real report → Inspection Room → power
installation in a scratch repo → accessibility and CI → final documentation.
All GitHub publication, Pages, video upload and Devpost actions remain manual.
