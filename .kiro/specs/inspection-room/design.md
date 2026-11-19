# Inspection Room design

The accepted direction is a quiet archival séance, for a developer reading a
specific change. Public entry and functional viewer form one static app: a
brief invitation and real demo lead into the reading room; report view remains
available throughout. No new product concept or service is introduced.

Georgia carries the entrance, scene title, Reader's paraphrase and report
headings. System sans handles controls, while Menlo separates source and event
counts from prose. The replay pairs a charcoal and brass palette with an overhead
illustration of the table. Each event highlights its recorded role, and the
Reader's actual passage appears when that reading plays. The report uses warm
paper and keeps its pale green listing bands and print layout.

The stage and its transport form one player. A slider seeks by event sequence,
and the phase rail jumps to the first event of a phase. On mobile, the
transport sits directly below the table and above long captions. The evidence
stays below the player, with a timeline that can replay prior events and
finding shortcuts that focus the inline finding without changing the event.
The diff uses muted red and green bands and marks the finding's exact line.
Follow-up appears above the code region, where it stays visible for long units.

The Vite/TypeScript app imports the existing browser-safe report schema/parser
and green-bar formatter from fagan-mcp. It does not import the service, store,
Git or Node runner. A small pure model maps the event cursor to the unit,
readings, defects and follow-up state visible at that recorded time. DOM
rendering uses textContent. File reads are bounded; fetch uses same-origin
checks, redirect refusal and an AbortController with a finite timeout. Load
sequence numbers prevent stale async results replacing newer reports.

Motion follows the local motion-design skill and its context-adaptation guide:
short, user-initiated planchette/readout transitions, subtle active-role feedback,
no perpetual animation. OS reduction wins over the manual toggle. The full
paraphrase remains accessible while the visual reveal plays. No motion implies
an inspection outcome absent from the report.

Primary sources checked 2026-11-17: https://vite.dev/guide/,
https://vite.dev/guide/static-deploy.html,
https://playwright.dev/docs/test-webserver,
https://playwright.dev/docs/accessibility-testing,
https://kiro.dev/docs/specs/feature-specs/.

Validation: Vitest covers load validation, event projection and boundary cases;
Playwright loads the built genuine demo, exercises replay, report, upload and
failure paths at desktop/mobile, checks reduced motion/keyboard and runs axe.
Tests with malicious synthetic strings remain tests only. No backend, database,
authentication or telemetry is in scope.
