# Inspection Room requirements

Audience: developers, students and reviewers inspecting a real agent ceremony.
Outcome: load a report, follow its roles and readings, inspect defects and actual
follow-up status, and print a plain report without running a backend or model.

- **IR-R1** WHEN a demo, file upload, drop or same-origin `?report=` URL is selected THE SYSTEM SHALL validate `fagan-report/1` before showing it, reject files above 10 MiB, show loading and actionable error states, and allow returning to the load screen. External URLs and redirects SHALL be refused. A newer load SHALL supersede an older one.
- **IR-R2** WHEN no report is loaded THE SYSTEM SHALL explain the ritual, the human Author's authority, local-only processing and the actual demo provider, with an obvious demo and file action.
- **IR-R3** WHEN a report loads THE SYSTEM SHALL show its title, range, phase, changed lines, measured metrics and null reasons. A partial report SHALL name the phase reached and SHALL NOT imply follow-up succeeded.
- **IR-R4** WHEN replay advances THE SYSTEM SHALL follow recorded event sequence, highlight the declared role at the table, show the current reading unit and the actual Reader paraphrase, and expose play/pause, previous/next and event selection. Playback SHALL start paused.
- **IR-R5** WHEN a defect appears THE SYSTEM SHALL pin its ID, type, severity and raising role to the recorded code location. Verified defects SHALL be labelled fixed and verified; waived defects SHALL retain the Author's reason. Unreached follow-up SHALL remain unreached. No outcome SHALL be inferred from an agent claim.
- **IR-R6** WHEN report view is selected THE SYSTEM SHALL show summary, metrics with null reasons, every defect, rework and follow-up, and the deterministic green-bar text generated from the same JSON. Print CSS SHALL preserve the whole listing.
- **IR-R7** WHEN reduced motion is requested by the OS or visible toggle THE SYSTEM SHALL show full paraphrases immediately and remove spatial/continuous animation. Keyboard controls SHALL work without hijacking inputs or native button activation. Space toggles play, arrows step, up/down move defect focus, R toggles report, ? opens help, Escape dismisses it. Controls SHALL have visible focus and names.
- **IR-R8** WHEN viewed on a narrow screen THE SYSTEM SHALL keep all tasks usable without page-level horizontal overflow; code MAY scroll within its labelled region. Text and controls SHALL meet WCAG AA contrast. Status changes SHALL be announced without reading every animated character.
- **IR-R9** WHEN any report text is rendered THE SYSTEM SHALL use text nodes, not HTML interpolation. The viewer SHALL make no model calls, persist no uploaded report, and never fetch cross-origin report content.
- **IR-R10** WHEN demo files are copied or checked THE SYSTEM SHALL require an actual export under `.fagan/inspections/`, verify its schema, copy its bytes unchanged, and check matching hashes. Synthetic test fixtures SHALL never become the shipped demo.
- **IR-R11** WHEN a replay contains recorded phases THE SYSTEM SHALL show a keyboard-accessible jump to the first event of each phase and mark the phase at the current event. Jumping SHALL pause playback and render the selected point without revealing later findings or follow-up outcomes.
- **IR-R12** WHEN a reader selects an available finding shortcut THE SYSTEM SHALL pause playback, keep the event cursor, and focus the inline finding in its recorded reading unit. The shortcut list SHALL show only findings recorded through the current event.
