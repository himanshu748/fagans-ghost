# Fagan's Ghost

**Category:** Resurrection

**Tagline:** A code inspection, brought back to life.

This is prepared submission copy. The project has not been submitted. Public links and the demonstration video remain to be supplied in [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md).

## Inspiration

An AI assistant can produce a change faster than a developer can comfortably explain it. For a student working alone or a small team without a second reviewer, a green test run can become the last meaningful checkpoint before a commit.

Fagan's Ghost starts with an older idea: give reading its own ceremony. Michael Fagan's 1976 paper, *Design and code inspections to reduce errors in program development*, is the historical starting point ([IBM Systems Journal, DOI](https://doi.org/10.1147/sj.153.0182)). We adapt formal inspection into a room of distinct roles. The Reader must explain the code before the inspectors judge it. The Scribe records the finding. The human Author keeps the final decision.

The Resurrection is this deliberate practice returning with new participants and a new interface. We do not claim that formal inspection disappeared everywhere or promise its historical effectiveness for AI agents.

## What it does

Fagan's Ghost lives in the repository. Kiro custom agents play Moderator, Reader, two Inspectors and Scribe. Hooks suggest an inspection after a substantial change, block supported Kiro commit commands while major findings remain unresolved, and trigger follow-up after the Author records rework.

A deterministic MCP server holds the rules. It checks the real build and tests, splits the actual diff into reading units, selects checklists and validates defect locations. It stores plain files that can be reviewed in Git. It measures the elapsed ceremony from actual timestamps rather than inventing productivity scores.

The Inspection Room replays an exported record as a quiet séance. A Reader's paraphrase unfolds beside the code; findings appear at their lines; recorded follow-up determines whether they remain open, are verified or are waived. Keyboard navigation, reduced motion and a plain report view keep the metaphor from becoming a barrier. Files load locally in the browser, without a backend or model call.

## How it was built

The project uses strict TypeScript, the MCP TypeScript SDK, Vite, Vitest, fast-check and Playwright. EARS requirements, designs and tasks live under `.kiro/specs/`. Always-on, file-match and manual steering preserve the roles and the evidence rules. The power packages the server, checklists and setup skills for another repository.

Kiro CLI through T3 Code was used for the initial implementation and live hook and delegation experiments. Later, Kiro reached its usage limit. With the Author's approval, Codex continued the build and ran the actual repository inspection through the same local MCP server. [KIRO_USAGE.md](KIRO_USAGE.md) names the exact boundaries; the Codex meeting is not presented as Kiro execution.

## The difficult part

The most interesting problems were at the boundary between a documented feature and observed behavior. A Stop hook could run without displaying its stdout. A dismissed confirmation could cause another model turn. A custom-agent validator accepted malformed probes. These were tested, recorded and addressed rather than hidden behind a configuration file.

Property-based tests found that report round-tripping could lose `__proto__` keys and negative zero. Review also caught repeated-cycle duration accounting that the original passing tests had missed. The resulting properties now test that accounting explicitly.

The real inspection supplied another lesson: a recorded finding is not automatically true. The Logic inspector raised D001 about Git's attached `-C/path` syntax. The [subsequent reproduction](docs/inspections/insp-0001-D001-verification.md) found that Git rejects that syntax before a commit can run. The human Author approved a false-positive waiver. The finding and that decision remain in the record, and follow-up passed the real build and tests. Keeping that correction visible is part of the product's purpose.

## What is working, and what remains

There is a real inspection of 501 changed lines with 40 Reader paraphrases, one logged major and an exported report. Its current phase is Closed after the human Author’s false-positive waiver and a passing follow-up. The viewer presents that state honestly. No user research, adoption, time savings or defect-detection accuracy has been measured.

The local implementation and verification are documented in the repository. A complete live Kiro ceremony after the quota limit, IDE Correctness, native power activation, public hosting and the final recorded video remain separate steps. These should be completed or explicitly reflected in the final submission copy before publication.

## What is next

The next useful step is Kiro IDE verification of the portable setup and a fresh complete Kiro ceremony when access is available. Beyond this entry, the goal is to help teams review a bounded change without confusing fluent reasoning with a verified result.

## Submission choices

Target **Kiroween 2026 / Resurrection**. Consider **Best Student Project: Resurrection** only after the entrant provides the required student details and confirms eligibility. Bonus Blog and Social Blitz remain optional Author-written, Author-published work; no post or eligibility is claimed. No startup, prior-year or Crew eligibility is assumed. The official [Kiroween rules](https://kiroween.devpost.com/rules) were checked on November 17, 2026.
