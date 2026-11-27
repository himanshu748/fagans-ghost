# Submission checklist

Entered in **Kiroween 2026, Resurrection**. Devpost recorded the [submission](https://devpost.com/software/fagan-s-ghost) on November 25, 2026. The [repository](https://github.com/himanshu748/fagans-ghost), [Inspection Room](https://himanshu748.github.io/fagans-ghost/), and [YouTube demo](https://www.youtube.com/watch?v=01w_wCccRWY) are public.

The [official rules](https://kiroween.devpost.com/rules), checked November 25, 2026, give a submission deadline of **December 4, 2026 at 2:00 PM PST**: December 4 at 22:00 UTC, or **December 5 at 03:30 IST**. The rules were updated November 16. The older `kiro.devpost.com` address describes a different 2025 event; use `kiroween.devpost.com` for this entry.

## Ready-to-submit record

| Item | Current state / Author action |
| --- | --- |
| Public GitHub repository | https://github.com/himanshu748/fagans-ghost |
| License | Root [LICENSE](LICENSE) is MIT. Verify that GitHub displays MIT in About |
| Root `.kiro/` | Specs, hooks, steering, agents and MCP settings exist. Run `npm run check:repo`, confirm they are committed and inspect them on GitHub |
| Functional app | https://himanshu748.github.io/fagans-ghost/ |
| Description | [DEVPOST_STORY.md](DEVPOST_STORY.md); update remaining-state paragraph after final verification |
| YouTube video | [1:43 captioned demo](https://www.youtube.com/watch?v=01w_wCccRWY) is attached to the Devpost entry. It shows the saved Codex inspection and the separate Kiro CLI gate experiment. [Archived video](docs/kiroween-demo.mp4) |
| Kiro write-up | [KIRO_USAGE.md](KIRO_USAGE.md); includes actual Kiro experiments, Codex provenance and missing IDE checks |
| Category | Resurrection |
| Student bonus | Candidate only; eligibility and personal fields below remain unconfirmed |
| Blog / Social Blitz | Optional, Author-written and Author-published; URLs pending if pursued |
| Final Devpost submission | [Submitted and verified on Devpost](https://devpost.com/software/fagan-s-ghost) |

## Product and evidence gates

- [x] Human Author explicitly waived D001 as a false positive; the exact approved reason is recorded. It is not labeled a verified repair.
- [x] Actual follow-up passed build/tests and closed insp-0001; JSON/text were exported. If the full video uses another real inspection, retain its provenance too.
- [ ] Run Kiro IDE Correctness on all three specs. Record its actual output separately from fast-check test results.
- [ ] Import the power through the IDE into a scratch repository and verify activation and hooks. Record native activation separately from the scripted install test.
- [ ] Verify the final Stop suggestion and full role ceremony with Kiro when access is available. Keep Codex footage labeled if used.
- [x] Check the final closed export in desktop/mobile layouts, keyboard mode, reduced motion and Report view, including its actual waiver and follow-up.
- [x] Confirm local checks and a clean staged-source snapshot: fresh `npm ci` and production build pass. See `docs/verification.md`.
- [ ] Inspect tracked files and exports for secrets or private source before publishing.
- [ ] Complete the hosted Inspection Room walkthrough and confirm the public video plays while signed out.
- [ ] Reconcile story, README, video and Devpost form against the final behavior. Keep the pre-existing-resource and AI-assistance disclosures.

## Judging path

| Criterion | Evidence to show |
| --- | --- |
| Theme and required Kiro use | Resurrection story plus real CLI/ACP experiments, `.kiro` artifacts and honest runtime labels |
| Potential impact | One developer's journey from a bounded AI change to an inspectable decision; no invented users or time savings |
| Technological implementation | Scoped agents, observed hook behavior, deterministic MCP state, requirements-linked properties and portable setup |
| Design | Complete record navigation, code-pinned findings, clear pending states, keyboard/reduced motion and plain report |
| Innovation / idea | Formal inspection adapted into distinct agent roles with a human Author and measured record |
| Presentation | Real end-to-end footage under three minutes, with actual outcome and clear unresolved limitations |

## Student and optional bonus fields

For each participating student, fill these in privately in the submission form. Do not guess eligibility or commit student email addresses:

| Field | Value to supply |
| --- | --- |
| LinkedIn profile | `YOUR_LINKEDIN_URL` |
| Student email | `YOUR_STUDENT_EMAIL` |
| Year of study | `YOUR_YEAR` |
| Degree | `YOUR_DEGREE` |
| Recognised academic institution | `YOUR_SCHOOL` |
| Current attendance confirmation | Author to confirm |

Optional blog URL: `YOUR_BLOG_URL`. Publish during the submission period and identify the post as part of Kiroween 2026. Optional social URL: `YOUR_SOCIAL_POST_URL`. Its first text must be `#KiroweenHackathon26`; describe an actual Kiro experience in the Author's own words. Do not claim a startup, previous Kiroween participation or a Crew app without supporting facts.

## Verify the published build

Run the local checks from a fresh clone of the public repository:

~~~sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run build:power
npm run test:power
npm run check:repo
npm run check:demo
~~~

Open the [public viewer](https://himanshu748.github.io/fagans-ghost/) in a signed-out
browser, load the demo, and follow the inspection through its recorded waiver.
Use the reviewed GitHub Pages workflow if the hosted viewer needs refreshing
after an app change. Once Pages reports success, run `npm run check:hosted` from
the same built checkout. It compares the public page, bundles and inspection
exports with the local production files and reports any mismatches. Keep the
demo and repository available through judging.

On November 27, 2026, the public viewer loaded without authentication. The
walkthrough reached R023, D001, the Author's waiver, the passing follow-up and
the Green-bar listing in Report view. The hosted JSON and text matched the
tracked inspection exports. That build did not yet have the per-finding replay
trail from [PR #18](https://github.com/himanshu748/fagans-ghost/pull/18).

The recorded inspection used Codex role agents. The [Kiro usage record](KIRO_USAGE.md)
documents the separate Kiro implementation, delegation and hook experiments.
Label the runtime in any footage you submit.
