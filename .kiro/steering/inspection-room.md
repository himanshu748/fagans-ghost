---
inclusion: fileMatch
fileMatchPattern: "packages/inspection-room/**"
---

# Inspection Room rules

The Inspection Room is a static Vite plus TypeScript viewer that plays back an exported `report.json` as a séance. There is no backend and no network call except fetching the report file itself.

## Data

- Load real exported reports only (`schemaVersion: "fagan-report/1"`). Validate before rendering and show a clear error state on failure.
- The bundled demo is a copy of a real report under `.fagan/inspections/`, made by `scripts/copy-demo.mjs`. Never edit it by hand and never invent data for it.
- Render all report text with `textContent`, never `innerHTML`, so a crafted report cannot inject script.

## Accessibility

- `prefers-reduced-motion: reduce` and a visible "Reduce motion" toggle turn off the planchette animation, fades and glows. Text appears at once.
- Full keyboard use: Tab order follows visual order; Space play or pause; Left and Right step events; Up and Down move between defects; R toggles report view; ? shows shortcuts; Escape closes dialogs.
- Every control is a real button or link with a visible focus ring.
- Contrast meets WCAG 2.2 AA: 4.5:1 for text, 3:1 for UI parts and focus rings.
- Majors and minors differ in shape and text, not only colour. Ghost markers have text labels. Playback state is announced in a polite live region.
- A plain "report view" toggle is available from every screen and prints cleanly.

## Theme

- Gentle séance: a round table, a planchette, ghosts pinned to lines, exorcism on follow-up.
- No jump scares, no blood, no audio, no copyrighted horror assets. Use system fonts and our own SVG.
