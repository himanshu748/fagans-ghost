# Local verification and remaining gates

Verified on 2026-11-17 in `/Users/himanshujha/code/fagans-ghost`, with Node
26.12.0, npm 11.20.0 and macOS. No remote is configured. This is local evidence,
not a hosted CI, deployment or contest submission result.

## Checks run

| Scope | Result and evidence |
| --- | --- |
| Strict TypeScript and complete test suite | PASS: `npm test`, 227 MCP tests across 23 files and 8 viewer tests; includes fast-check and a real stdio MCP contract |
| Production build | PASS: `npm run build`, both packages; viewer imports no server/storage/Git runtime and makes no model calls |
| Built viewer in Chromium | PASS: `npm run test:e2e`, 4 tests, desktop 1440×900 and mobile 390×844 with OS reduced motion |
| Browser journey | PASS: actual demo, event stepping/play/pause, unit selection and pinned D001, keyboard report toggle/arrows/dialog, manual motion reduction, plain report, print CSS and JSON download round-trip |
| Browser failures and trust boundary | PASS: invalid JSON, cross-origin URL rejection, controlled HTTP 404, and a test-only HTML string rendered as text; no uncaught page errors |
| Accessibility | PASS for tested states: axe found no violations on entry, room and report at both sizes; focusable code/listing scroll regions, names, headings and contrast. This is not a full WCAG conformance audit |
| Report boundary | PASS: schema/version/size, calendar timestamps, missing unit refs, duplicate units and sequence ordering; same-time events cannot reveal future readings; only recorded follow-up reveals verified status |
| Demo provenance | PASS: `npm run check:demo`, shipped JSON/text byte-match tracked actual `insp-0001` exports |
| Portable power | PASS: `npm run build:power` and `npm run test:power`; see [full evidence](power-verification.md), including real relocated stdio transactions and five Kiro agent validations |
| Root Kiro/license checks | PASS: `npm run check:repo`, 30 tracked nonignored `.kiro` files, all three specs, MIT root/package declarations |
| CI checker negative controls | PASS: disposable staged repo passes; ignoring already-tracked `.kiro`, removing required spec file or replacing MIT text each fails |
| Clean dependency install | PASS: fresh temporary snapshot of staged sources, no inherited `node_modules`/`dist`, `npm ci` installed 147 packages and `npm run build` passed; the temporary tree was removed |
| Diff review | PASS: source/docs/configuration and generated templates reviewed; `git diff --cached --check` passes. Captured raw patches preserve blank context markers with a targeted `.gitattributes` rule |
| Secrets | Known-pattern scanner found zero findings. Its initial full-file run omitted PNG binaries and was incomplete. A final text-only scan through a temporary index passed with zero findings and zero omissions; four original browser PNGs were separately visually reviewed. The real staging index was unchanged. No history or unknown-format credential audit is claimed |
| Real inspection | PASS: 501 changed lines, 40 Reader paraphrases; D001 disproved and explicitly waived by the human Author; actual build/test follow-up passed and the inspection is Closed |
| Kiro-native power import / Correctness | NOT TESTED: require Kiro IDE actions; direct installation and hand-written PBT are separate evidence |
| Current Kiro model execution | BLOCKED by observed quota error; the user explicitly selected Codex for continuation |
| Public CI / Pages / video / Devpost | NOT RUN: prepared workflow, commands, copy and shotlist only; public actions remain with the Author |
| Local commits for this continuation | PASS: `ad9dc06` preserves the real inspection/Author closure; `b765b79` adds the viewer and portable power; documentation and CI are finalized with this verification note. No push was performed |

The final suite includes the closed demo and a regression proving its real
waiver appears only at the recorded Author event, followed by the actual
passing follow-up. Desktop/mobile browser checks also assert the reason and
waived status, with no verified-fix styling. No separate Node 22 execution is
claimed; the minimum declared Node version is 22.12.

## Visual review

The direction is an archival reading room: Georgia narrative headings and
Reader text, system sans-serif controls, Menlo/monospace source and measures;
ink green, warm paper, restrained brass and ruled dividers. These system-font
choices rendered in the actual macOS browser screenshots. No external font,
stock-image or model requests are part of the viewer.

Two reference screens were inspected before implementation: Carbon's
[data-table guidelines](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines)
for title/metadata hierarchy, ruled separation and readable rows, and GitHub's
[VS Code source view](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/arrays.ts)
for line-number gutters and separation of source from context. These are
observed layout ideas, not measured style copies or copied assets. The table
and planchette shapes are original CSS. T3 preview snapshots twice failed with
“Preview automation snapshot timed out after 15000ms”; native Safari was used
for reference inspection and Playwright for the expressly requested smoke test.
Task-owned reference tabs were closed.

Inspected [entry](screenshots/landing-desktop.png), [desktop room](screenshots/room-desktop.png)
, [mobile room](screenshots/room-mobile.png) and [plain report](screenshots/report-desktop.png). The first mobile room screenshot
revealed a grid track growing to its code's intrinsic width. Changing it to
`minmax(0, 1fr)` fixed the overflow; the browser test now checks page width in
the room as well as report view. The final mobile screenshot is 390 pixels
wide. Code can scroll within its named focusable region. Earlier axe failures
also prompted fixes for file-picker landmarks, a listing's keyboard access and
heading order. The glyph reveal keeps one accessible full sentence and is
removed by either reduced-motion setting.

The screenshots now show the November 19 redesign. The entrance pairs the same
Georgia headings with a locally bundled WebP illustration. The reading desk
uses the earlier reference patterns of a clear title, compact metadata, ruled
sections and a separate code gutter. During visual review at 1440×900 and
390×844, phase shortcuts were moved into the playback area and made to wrap
on mobile so the active stop stayed visible. The built viewer's browser test
checks a keyboard phase jump, focus retention, and the appearance of follow-up
at event 58. It also checks contrast at the tested sizes with axe.

The room and report show D001’s original allegation and the Author’s waiver.
The JSON contains the actual decision and follow-up, and the plain listing
contains the full record. [False-positive investigation](inspections/insp-0001-D001-verification.md).

## Prepared CI and publication

`.github/workflows/ci.yml` runs repository checks, tests, build, demo hashes,
power verification and Chromium tests. `.github/workflows/pages.yml` only runs
on manual `workflow_dispatch`. Neither workflow has run on GitHub. The design
uses current official [Node Actions guidance](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs),
[Playwright CI guidance](https://playwright.dev/docs/ci-intro),
[Vite static-deployment guidance](https://vite.dev/guide/static-deploy.html) and
[Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

The [submission checklist](../SUBMISSION_CHECKLIST.md) contains the exact
Author-run repository creation, push and Pages commands. The user prohibited
those public actions here. The Author decision, follow-up, refreshed demo and screenshots are now recorded
for insp-0001. A new live Kiro recording must use its own real ceremony. Do not
imply a false-positive waiver is a verified code repair.
