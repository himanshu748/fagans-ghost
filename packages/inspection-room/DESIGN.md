# Design system: the Ouija board

The Inspection Room's visual identity is a single object: the Ouija board
the inspection was held on. The page is the board, not a dashboard about a
seance. A visitor lands mid-session, watches the planchette move as the
record replays and drops to the evidence below or switches to the printed
report.

## World

Deep mahogany room, letterpress ivory board, ink-black marks, brass
accents and a single walnut planchette. Display type is IM Fell English
SC (self-hosted in `src/assets/`), prose is IM Fell English, and
monospace appears only for real data: IDs, timestamps, paths and metrics.

## Tokens

- `--night #160d09` room background, `--night-text #f0e4c8` body text
- `--brass #c99a45`, `--brass-bright #e8c37a` accents and active states
- `--display`, `--board-display` (SC), `--board-prose`
- Board face: ivory parchment surface with printed marks
- Evidence zone below the stage: parchment dossier on dark wood

## Composition

Slim masthead, one case line, then the board dominates the first
viewport. Six role seats ring the board (Moderator, Reader, Logic
inspector, Interface inspector, Scribe, Author); the active seat glows
brass. On small screens the seat ring collapses to a labeled row under
the board.

## The board

DOM-generated marks, no image assets:

- `YES` and `NO` top corners
- Two letter arcs: `ABCDEFGHIJKLM` and `NOPQRSTUVWXYZ`
- Digit row `1234567890`
- `GOOD BYE` at the foot
- SVG planchette with a central window that frames the target mark

## Planchette semantics

The planchette answers the record; it is the replay position made
physical:

- `open_inspection` and passed `follow_up`: YES
- failed `follow_up`: NO
- readings and defects: first relevant letter
- `metrics`: a digit
- `close_meeting` and `export_report`: GOOD BYE
- anything else: board center

Movement is a WAAPI translate glide (`glidePlanchette`), skipped under
`prefers-reduced-motion` or the Reduce motion control. The planchette is
sized (13.5% of board width) and offset (translate -50%, -38%) so its
window sits on the target letter instead of covering its neighbors.

## Two modes of light

The seance stage is dark; the evidence below (reading desk, diff,
defect slips, event timeline) is a parchment dossier, ink on paper.
The report view is the daylight printed record. Contrast is held on
both surfaces; muted tones inside the dossier are darkened to stay axe
clean.

## Accessibility

Board marks and the planchette are decorative; state lives in real text
(`.event-count`, phase rail, paraphrase, defect slips). Focus rings,
keyboard replay and reduced motion are unchanged from the previous
build and covered by the Playwright suite.

## Responsive

Container queries size board marks; under 670px the masthead, heading,
board ratio, phase rail and transport compress so the Play replay
control stays in the first viewport at 390x844.
