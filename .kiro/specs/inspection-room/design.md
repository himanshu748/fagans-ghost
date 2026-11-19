# Inspection Room design

The accepted direction is a quiet archival séance, for a developer reading a
specific change. Public entry and functional viewer form one static app: a
brief invitation and real demo lead into the reading room; report view remains
available throughout. No new product concept or service is introduced.

Georgia carries the title, Reader's passage and report headings. System sans
keeps controls compact, and Menlo separates source and event counts from prose.
The entrance uses a locally bundled illustration of an empty inspection table
against charcoal and brass. The reading desk moves to warm paper with a dark
panel for the paraphrase and separate colors for additions, deletions and
findings. The report keeps its pale green listing bands and print layout.

The title identifies the saved outcome. A separate phase rail marks the phase
at the replay cursor and lets readers jump to the first recorded event in each
phase. The event picker sits beside the transport controls above the desk.
The sidebar holds the table and recent events, while the paraphrase, code and
findings share the wider panel. On mobile the reading desk appears above the
sidebar, with playback still above both. Follow-up appears near its event and
above the code region, where it stays visible even for long units.

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
