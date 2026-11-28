import "./style.css";
import "./room.css";
import {
  atEvent,
  reworkAt,
  defectStatus,
  eventName,
  fetchReport,
  findingTrail,
  fmt,
  loadReport,
  MAX_BYTES,
  ReportRequestError,
  replayHighlights,
  renderReportTxt,
  type Report,
  type Defect,
} from "./model.js";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function button(text: string, action: () => void, cls = ""): HTMLButtonElement {
  const b = el("button", text, cls);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
const root = document.querySelector<HTMLDivElement>("#app")!;
const live = el("div", "", "sr-only");
live.setAttribute("role", "status");
live.setAttribute("aria-live", "polite");
const header = el("header", "", "masthead");
const brand = button("Fagan's Ghost", () => reset(), "brand");
const brandSeal = el("span", "", "brand-seal");
brandSeal.append(el("span", "FG", "brand-seal-text"));
brandSeal.setAttribute("aria-hidden", "true");
brand.prepend(brandSeal);
const topActions = el("nav", "", "top-actions");
topActions.setAttribute("aria-label", "View controls");
const viewButton = button("Report view", () => {
  pause();
  plain = !plain;
  render();
});
const helpButton = button("Shortcuts ?", () => help.showModal());
const motionLabel = el("label", "", "motion-label");
const motion = el("input");
motion.type = "checkbox";
motion.addEventListener("change", () => {
  applyMotion();
  render();
});
motionLabel.append(motion, " Reduce motion");
topActions.append(motionLabel, helpButton, viewButton);
header.append(brand, el("span", "THE INSPECTION ROOM", "edition"), topActions);
const main = el("main");
main.id = "main";
main.tabIndex = -1;
const skip = el("a", "Skip to inspection", "skip");
skip.href = "#main";
const help = el("dialog");
help.setAttribute("aria-labelledby", "help-title");
const ht = el("h2", "A few quiet shortcuts");
ht.id = "help-title";
help.append(
  ht,
  el(
    "p",
    "Space: play or pause · ← →: step events · ↑ ↓: move between defects · R: report view · ?: this guide · Escape: close",
  ),
  button("Close shortcuts", () => help.close()),
);
const footer = el("footer");
footer.append(
  el("span", "Fagan's Ghost", "footer-brand"),
  el("span", "The Inspection Room"),
);
root.append(skip, header, live, main, footer, help);
const osMotion = matchMedia("(prefers-reduced-motion: reduce)");
function applyMotion() {
  root.classList.toggle("reduced", reduced());
}
function reduced() {
  return osMotion.matches || motion.checked;
}
osMotion.addEventListener("change", () => {
  applyMotion();
  render();
});
applyMotion();
let opened: { report: Report; bytes: ArrayBuffer; name: string } | null = null;
let cursor = 0;
let plain = false;
let playing = false;
let eventsOpen = false;
let evidenceOpen = false;
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let controller: AbortController | undefined;
let selectedUnit: string | null = null;
let selectedFinding: string | null = null;
let loading = false;
let error = "";
let retryLoad: (() => void) | null = null;
type DemoHighlight = "reading" | "finding" | "decision";
function pause() {
  playing = false;
  if (timer) clearInterval(timer);
  timer = undefined;
}
function abortLoading() {
  generation++;
  controller?.abort();
  controller = undefined;
  loading = false;
}
function reset() {
  pause();
  abortLoading();
  opened = null;
  cursor = 0;
  plain = false;
  selectedUnit = null;
  selectedFinding = null;
  eventsOpen = false;
  evidenceOpen = false;
  error = "";
  retryLoad = null;
  planchetteAt = CENTER;
  render();
}
function step(delta: number) {
  const report = opened?.report;
  if (!report) return;
  selectedUnit = null;
  selectedFinding = null;
  cursor = Math.max(0, Math.min(report.events.length - 1, cursor + delta));
  if (cursor === report.events.length - 1) pause();
  render();
}
function play() {
  const report = opened?.report;
  if (!report || plain || report.events.length < 2) return;
  if (playing) pause();
  else {
    if (cursor === report.events.length - 1) cursor = 0;
    playing = true;
    timer = setInterval(() => step(1), 2200);
  }
  render();
}
async function load(
  read: (signal: AbortSignal) => Promise<ArrayBuffer>,
  name: string,
  highlight?: DemoHighlight,
) {
  pause();
  controller?.abort();
  controller = new AbortController();
  const current = ++generation;
  const signal = controller.signal;
  const timeout = setTimeout(
    () => controller?.signal === signal && controller.abort(),
    20_000,
  );
  loading = true;
  error = "";
  retryLoad = null;
  render(true);
  let onAbort: (() => void) | undefined;
  try {
    // A local File.arrayBuffer() read does not observe the signal.
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const bytes = await Promise.race([read(signal), aborted]);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Report is not valid UTF-8. Export a fresh JSON report.");
    }
    const next = loadReport(text);
    if (current !== generation) return;
    opened = { report: next, bytes, name };
    cursor = highlight ? Math.max(0, replayHighlights(next)[highlight]) : 0;
    selectedUnit = null;
    selectedFinding = null;
    eventsOpen = false;
    evidenceOpen = false;
    live.textContent = `Loaded ${next.inspection.title}. ${next.packet.units.length} reading units.`;
  } catch (e) {
    if (current !== generation) return;
    if (signal.aborted || e instanceof ReportRequestError)
      retryLoad = () => void load(read, name, highlight);
    error = signal.aborted
      ? "Loading stopped or timed out."
      : e instanceof Error
        ? e.message
        : String(e);
  } finally {
    clearTimeout(timeout);
    if (onAbort) signal.removeEventListener("abort", onAbort);
    if (current === generation) {
      loading = false;
      render();
      main.focus();
    }
  }
}
function openFile(file: File) {
  void load(async () => {
    if (file.size > MAX_BYTES)
      throw new Error("Report exceeds the 10 MiB limit.");
    return file.arrayBuffer();
  }, file.name);
}
const fileInput = el("input");
fileInput.type = "file";
fileInput.accept = ".json,application/json";
fileInput.setAttribute("aria-label", "Choose inspection report");
fileInput.hidden = true;
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) openFile(f);
  fileInput.value = "";
});
topActions.append(fileInput);
const openDemo = (highlight?: DemoHighlight) =>
  void load(
    (s) =>
      fetchReport(
        new URL("demo/report.json", document.baseURI).href,
        location.href,
        s,
      ),
    "Bundled demo · Codex role agents",
    highlight,
  );
const demo = () => openDemo();
function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const seats = [
  ["moderator", "Moderator"],
  ["reader", "Reader"],
  ["inspector-logic", "Logic inspector"],
  ["inspector-interfaces", "Interface inspector"],
  ["scribe", "Scribe"],
  ["author", "Author"],
] as const;

type Pt = { x: number; y: number };
const CENTER: Pt = { x: 50, y: 55 };
const YES: Pt = { x: 18, y: 13 };
const NO: Pt = { x: 82, y: 13 };
const GOODBYE: Pt = { x: 50, y: 88 };
function arc(chars: string, baseY: number, lift: number, x0: number, x1: number) {
  const map = new Map<string, Pt>();
  [...chars].forEach((ch, i, arr) => {
    const t = arr.length === 1 ? 0.5 : i / (arr.length - 1);
    map.set(ch, {
      x: x0 + (x1 - x0) * t,
      y: baseY - lift * Math.sin(Math.PI * t),
    });
  });
  return map;
}
const LETTERS = new Map([
  ...arc("ABCDEFGHIJKLM", 38, 16, 9, 91),
  ...arc("NOPQRSTUVWXYZ", 60, 10, 14, 86),
]);
const DIGITS = new Map(
  [..."1234567890"].map((ch, i): [string, Pt] => [ch, { x: 17 + i * 7.4, y: 73 }]),
);
const SEAT_POS: Pt[] = [
  { x: 50, y: 1 },
  { x: 88, y: 21 },
  { x: 90, y: 73 },
  { x: 50, y: 99 },
  { x: 10, y: 73 },
  { x: 12, y: 21 },
];
let planchetteAt: Pt = CENTER;

function planchetteTarget(
  state: ReturnType<typeof atEvent>,
  reading: ReplayReading | undefined,
): Pt {
  const e = state.event;
  if (!e) return CENTER;
  const firstLetter = (text: string) =>
    LETTERS.get(text.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase());
  switch (e.tool) {
    case "open_inspection":
      return YES;
    case "close_meeting":
    case "export_report":
      return GOODBYE;
    case "follow_up":
    case "cli:follow-up":
      return state.attempt && state.attempt.passed === false ? NO : YES;
    case "log_defect":
      return firstLetter(String(e.data["defect_id"] ?? "")) ?? CENTER;
    case "record_reading":
      return firstLetter(reading?.paraphrase ?? "") ?? CENTER;
    case "record_rework":
      return LETTERS.get("A") ?? CENTER;
    case "metrics":
      return DIGITS.get("5") ?? CENTER;
    default:
      return CENTER;
  }
}

function boardMark(text: string, p: Pt, cls: string) {
  const mark = el("span", text, `board-letter ${cls}`);
  mark.style.left = `${p.x}%`;
  mark.style.top = `${p.y}%`;
  return mark;
}

function planchette(target: Pt) {
  const pl = el("div", "", "planchette");
  pl.setAttribute("aria-hidden", "true");
  pl.innerHTML =
    '<svg viewBox="0 0 100 108">' +
    '<defs><linearGradient id="planchette-wood" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#7d5427"/><stop offset=".55" stop-color="#553517"/>' +
    '<stop offset="1" stop-color="#2e1a0a"/></linearGradient></defs>' +
    '<path class="planchette-shell" fill="url(#planchette-wood)" fill-rule="evenodd" ' +
    'd="M50 104C31 86 5 66 5 41 5 17 26 3 50 3 74 3 95 17 95 41 95 66 69 86 50 104Z' +
    'M50 59a19 19 0 1 0 0-38 19 19 0 0 0 0 38Z"/>' +
    '<circle class="planchette-ring" cx="50" cy="40" r="19"/>' +
    '<g class="planchette-feet"><circle cx="50" cy="89" r="2.6"/>' +
    '<circle cx="25" cy="56" r="2.6"/><circle cx="75" cy="56" r="2.6"/></g>' +
    '</svg>';
  pl.style.left = `${target.x}%`;
  pl.style.top = `${target.y}%`;
  return pl;
}

function ouijaBoard(active: string | null, target: Pt, ambient = false) {
  const board = el("div", "", "ouija");
  if (ambient) board.classList.add("ambient");
  const face = el("div", "", "board-face");
  const letters = el("div", "", "board-letters");
  letters.setAttribute("aria-hidden", "true");
  letters.append(
    boardMark("YES", YES, "board-word"),
    boardMark("NO", NO, "board-word"),
    boardMark("GOOD BYE", GOODBYE, "board-word goodbye"),
  );
  for (const [ch, p] of LETTERS) letters.append(boardMark(ch, p, ""));
  for (const [ch, p] of DIGITS) letters.append(boardMark(ch, p, "digit"));
  face.append(letters, planchette(target));
  board.append(face);
  const ring = el("div", "", "seats");
  ring.setAttribute("role", "group");
  ring.setAttribute("aria-label", "Inspection roles");
  seats.forEach(([id, label], i) => {
    const p = SEAT_POS[i]!;
    const seat = el(
      "div",
      "",
      `seat seat-${i}${id === active ? " active" : ""}`,
    );
    seat.style.left = `${p.x}%`;
    seat.style.top = `${p.y}%`;
    const marker = el("span", "", "seat-lamp");
    marker.setAttribute("aria-hidden", "true");
    seat.append(marker, el("span", label));
    if (id === active) seat.append(el("span", "Current role", "sr-only"));
    ring.append(seat);
  });
  board.append(ring);
  return board;
}

function glidePlanchette(next: Pt) {
  const prev = planchetteAt;
  planchetteAt = next;
  const face = main.querySelector<HTMLElement>(".replay-scene .board-face");
  const pl = face?.querySelector<HTMLElement>(".planchette");
  if (
    !pl ||
    !face ||
    reduced() ||
    (prev.x === next.x && prev.y === next.y)
  )
    return;
  const rect = face.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dx = ((prev.x - next.x) / 100) * rect.width;
  const dy = ((prev.y - next.y) / 100) * rect.height;
  pl.animate(
    [
      { translate: `${dx}px ${dy}px` },
      { translate: "0px 0px" },
    ],
    { duration: 1000, easing: "cubic-bezier(.16,.7,.24,1)" },
  );
}
function render(focusLoading = false) {
  const focused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset["focus"]
      : undefined;
  main.replaceChildren();
  root.classList.toggle("room-view", !!opened && !loading && !error && !plain);
  viewButton.textContent = plain ? "Room view" : "Report view";
  viewButton.setAttribute("aria-pressed", String(plain));
  viewButton.disabled = !opened || loading || !!error;
  if (loading) {
    const s = el("section", "", "notice");
    const cancel = button("Cancel loading", () => {
      if (opened) {
        abortLoading();
        render();
      } else reset();
      main.focus();
    });
    cancel.dataset["focus"] = "cancel-loading";
    s.append(
      el("h1", "Opening the record…"),
      el("p", "Reading and validating the inspection."),
      cancel,
    );
    main.append(s);
    if (focusLoading || focused === "cancel-loading") cancel.focus({ preventScroll: true });
    return;
  }
  if (error) {
    const s = el("section", "", "notice error");
    s.setAttribute("role", "alert");
    s.append(el("h1", "The record could not be opened"), el("p", error));
    if (retryLoad) s.append(button("Retry report", retryLoad));
    s.append(
      opened
        ? button("Return to current report", () => {
            error = "";
            retryLoad = null;
            render();
            main.focus();
          })
        : button("Back to load screen", reset),
    );
    main.append(s);
    return;
  }
  if (!opened) {
    landing();
    return;
  }
  const { report: r, bytes, name } = opened;
  const title = el("section", "", "inspection-heading");
  const caseDetails = el("div", "", "case-details");
  const caseTag = el("div", "", "case-tag");
  caseTag.append(
    el("span", r.inspection.id.toUpperCase(), "case-number"),
    el("span", name, "case-source"),
  );
  caseDetails.append(
    caseTag,
    el("h1", r.inspection.title),
    el(
      "p",
      `${r.inspection.range.base} → ${r.inspection.range.head} · ${r.packet.units.length} reading units · ${fmt(r.packet.changedLoc)} changed lines`,
      "meta",
    ),
  );
  const status = el(
    "p",
    r.inspection.phase === "Closed"
      ? "Inspection closed."
      : `Inspection still in ${r.inspection.phase}. Unreached phases are not completed.`,
    "phase-banner",
  );
  caseDetails.append(status);
  const actions = el("div", "", "actions");
  actions.append(
    button("Open another report", () => fileInput.click()),
    button("Download JSON", () =>
      download(
        `${r.inspection.id}.json`,
        bytes,
        "application/json",
      ),
    ),
  );
  title.append(caseDetails);
  if (plain) title.append(actions);
  main.append(title);
  if (plain) plainReport(r);
  else room(r, actions);
  if (focused) {
    let target = main.querySelector<HTMLElement>(`[data-focus="${focused}"]`);
    if (target?.matches(":disabled")) {
      if (focused === "previous") target = main.querySelector('[data-focus="next"]');
      if (focused === "next") target = main.querySelector('[data-focus="previous"]');
    }
    target?.focus({ preventScroll: true });
  }
}
function landing() {
  const hero = el("section", "", "hero");
  const copy = el("div", "", "hero-copy");
  const headline = el("h1");
  headline.append("Someone has to ", el("em", "read the code."));
  copy.append(
    el("p", "Agents write the code now. Fagan's Ghost reads it.", "eyebrow"),
    headline,
    el(
      "p",
      "AI agents ship diffs faster than any team can review them. This revives the 1976 inspection ritual: fixed roles read every changed line, a deterministic log keeps the findings honest, and the human Author keeps the final word.",
      "intro",
    ),
  );
  const actions = el("div", "", "actions");
  actions.append(
    button("Enter the demo inspection →", demo, "primary"),
    button("Open a report", () => fileInput.click()),
  );
  copy.append(
    actions,
    el(
      "p",
      "Or drop an exported report.json here. Files stay in your browser.",
      "fineprint",
    ),
  );
  const artwork = el("div", "", "hero-board");
  artwork.setAttribute("aria-hidden", "true");
  artwork.append(ouijaBoard(null, CENTER, true));
  hero.append(copy, artwork);
  main.append(hero);

  const problem = el("section", "", "pitch problem");
  const problemTitle = el("h2");
  problemTitle.append(
    el("span", "Code is being written. "),
    el("em", "Nobody is reading it."),
  );
  problem.append(el("p", "The problem", "pitch-kicker"), problemTitle);
  const problemGrid = el("div", "", "pitch-grid");
  for (const [title, body] of [
    [
      "Diffs outpace review",
      "Agents produce hundreds of changed lines per task. A skimmed diff and a rubber-stamp approval are not a review.",
    ],
    [
      "Findings evaporate",
      "A comment in a chat or a half-remembered concern leaves no record. Nothing proves the defect was ever addressed.",
    ],
    [
      "Fixes go unverified",
      "Rework lands and the thread moves on. Without exit criteria, \"looks fine\" is the only gate a change has to pass.",
    ],
  ]) {
    const part = el("article");
    part.append(el("h3", title), el("p", body));
    problemGrid.append(part);
  }
  problem.append(problemGrid);
  main.append(problem);

  const ritual = el("section", "", "pitch ritual");
  const ritualTitle = el("h2");
  ritualTitle.append(
    el("span", "Fagan's Ghost brings formal code inspection "),
    el("em", "back from the dead."),
  );
  ritual.append(el("p", "The answer, circa 1976", "pitch-kicker"), ritualTitle);
  const ritualGrid = el("div", "", "pitch-grid");
  for (const [title, body] of [
    [
      "Six seats at the board",
      "A Moderator, a Reader, two inspectors, a Scribe and the Author each hold a fixed role, played by Kiro agents and the human.",
    ],
    [
      "Every line is read aloud",
      "The diff is split into reading units and the Reader paraphrases each in plain language before anyone judges it.",
    ],
    [
      "The log is honest",
      "A deterministic MCP server records each defect with its type, severity and the line that raised it. No memory, no vibes.",
    ],
    [
      "Nothing closes on trust",
      "Rework is recorded, the tests rerun, and follow-up fails while any major finding stays open without an Author waiver.",
    ],
  ]) {
    const part = el("article");
    part.append(el("h3", title), el("p", body));
    ritualGrid.append(part);
  }
  ritual.append(ritualGrid);
  const ritualCta = el("div", "", "actions");
  ritualCta.append(button("Watch a real inspection replay →", demo, "primary"));
  ritual.append(ritualCta);
  main.append(ritual);

  const strip = el("section", "", "story-strip");
  for (const [title, body] of [
    [
      "The Moderator",
      "Opens the ceremony, checks entry criteria and keeps the phases in order.",
    ],
    [
      "The Reader",
      "Explains each change in plain language before the inspectors weigh in.",
    ],
    [
      "The Inspectors",
      "Hunt logic and interface defects against a checklist chosen by file type.",
    ],
    [
      "The Scribe",
      "Records each finding beside the line of code that raised it.",
    ],
    [
      "The Author",
      "Reviews the evidence, decides what to fix or waive, and records why.",
    ],
    [
      "The Follow-up",
      "Verifies the rework and blocks closure while open majors remain.",
    ],
  ]) {
    const part = el("article");
    part.append(el("h2", title), el("p", body));
    strip.append(part);
  }
  main.append(strip);
  const demoNote = el("section", "", "demo-note");
  demoNote.append(
    el("h2", "About the bundled inspection"),
    el(
      "p",
      "The demo replays a real inspection of Fagan's Ghost, recorded by Codex role agents after Kiro reached its usage limit.",
    ),
  );
  main.append(demoNote);
}
function jumpToEvent(index: number) {
  pause();
  cursor = index;
  selectedUnit = null;
  selectedFinding = null;
  render();
}

function revealFinding(defect: Defect) {
  pause();
  evidenceOpen = true;
  selectedUnit = defect.unitId;
  selectedFinding = defect.id;
  render();
  if (!focusFinding(defect.id))
    main.querySelector<HTMLElement>('[data-focus="units"]')?.focus();
}

function focusFinding(id: string): boolean {
  const card = main.querySelector<HTMLElement>(`[data-finding="${CSS.escape(id)}"]`);
  if (card) {
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  return Boolean(card);
}

type ReplayFrame = ReturnType<typeof atEvent>;
type ReplayReading = ReplayFrame["readings"][number];

function detailsPanel(label: string, open: boolean, remember: (value: boolean) => void, cls: string) {
  const pane = el("details", "", cls);
  pane.open = open;
  const summary = el("summary", label);
  summary.dataset["focus"] = cls;
  pane.append(summary);
  pane.addEventListener("toggle", () => {
    if (pane.isConnected) remember(pane.open);
  });
  return pane;
}

function showEvidence(unitId: string | undefined) {
  pause();
  evidenceOpen = true;
  if (unitId) selectedUnit = unitId;
  render();
  const pane = main.querySelector<HTMLDetailsElement>(".evidence-panel");
  if (!pane) return;
  const summary = pane.querySelector("summary");
  summary?.focus({ preventScroll: true });
  summary?.scrollIntoView({ block: "start" });
}

function readingPassage(reading: ReplayReading | undefined, excerpt = false) {
  const passage = el("div", "", "reader-passage");
  const full = reading?.paraphrase ?? "The Reader has not spoken about this unit at this point in the ceremony.";
  const abbreviate = excerpt && full.length > 186;
  const words = abbreviate ? `${full.slice(0, 186).replace(/\s+\S*$/, "")}…` : full;
  const label = el("p", abbreviate ? "From the Reader’s paraphrase" : "Reader’s paraphrase", "reader-label");
  if (reading) label.append(el("span", reading.id, "reading-id"));
  passage.append(label);

  const para = el("p", "", "paraphrase");
  if (reading && excerpt && !reduced()) {
    // One accessible sentence even while the visual glyphs reveal it.
    para.append(el("span", words, "sr-only"));
    const visual = el("span", "", "spelled-reading");
    visual.setAttribute("aria-hidden", "true");
    [...words].forEach((letter, index) => {
      const glyph = el("span", letter, "glyph");
      glyph.style.animationDelay = `${index * Math.min(12, 1000 / words.length)}ms`;
      visual.append(glyph);
    });
    para.append(visual);
  } else para.textContent = words;
  passage.append(para);
  if (reading?.judgmentFlags.length)
    passage.append(el("p", `Language flags: ${reading.judgmentFlags.join(", ")}`, "flag"));
  if (abbreviate) passage.append(button("Read the full paraphrase ↓", () => showEvidence(reading?.unitId), "scene-action"));
  return passage;
}

function sceneNote(r: Report, state: ReplayFrame): string {
  const event = state.event;
  if (!event) return "This report has no recorded events to replay.";
  switch (event.tool) {
    case "open_inspection":
      return `The Moderator opened a review of ${fmt(r.packet.changedLoc)} changed lines. Follow how the team read the change and what the Author did with the findings.`;
    case "get_packet":
      return "The participant consulted the inspection packet.";
    case "log_defect": {
      const finding = state.defects.find((d) => d.id === event.data["defect_id"]);
      return finding
        ? `An inspector flagged a possible problem. The Scribe logged it as ${finding.id} at line ${finding.location.lineStart} for the Author to check.`
        : "The Scribe logged a finding.";
    }
    case "record_rework":
      return "The Author’s recorded disposition is attached to the finding in the evidence below.";
    case "follow_up":
    case "cli:follow-up":
      if (!state.attempt) return "This event has no recorded check result.";
      return state.attempt.passed
        ? "The recorded follow-up passed. The evidence shows which findings were waived or verified."
        : "The recorded follow-up did not pass. The evidence shows which major findings remain open.";
    default:
      return "";
  }
}

function replayScene(
  r: Report,
  state: ReplayFrame,
  reading: ReplayReading | undefined,
  controls: HTMLElement,
  focusDefect: Defect | undefined,
) {
  const scene = el("section", "", "replay-scene");
  scene.setAttribute("aria-label", "Inspection stage");
  const current = state.event;
  const copy = el("div", "", "scene-copy");
  const who = seats.find(([id]) => id === current?.role)?.[1] ?? current?.role ?? "Server";
  const active = el("p", "", "scene-role");
  const light = el("span", "", "scene-lamp");
  light.setAttribute("aria-hidden", "true");
  active.append(light, el("strong", current ? who : "Replay"));
  if (current) active.append(el("span", current.phase, "scene-phase"));
  const headings: Record<string, string> = {
    open_inspection: "A code change under review",
    record_reading: "Read the change",
    log_defect: "A possible problem",
    record_rework: "The Author responds",
  };
  const result = current?.tool === "follow_up" || current?.tool === "cli:follow-up";
  const heading = result && state.attempt
    ? state.attempt.passed ? "Follow-up passed" : "Follow-up needs work"
    : current ? headings[current.tool] ?? eventName(current.tool) : "No recorded events";
  copy.append(active, el("h2", heading));
  const caption = el("div", "", "scene-caption");
  if (reading) caption.append(readingPassage(reading, true));
  else {
    const note = sceneNote(r, state);
    const decision = focusDefect && (result || current?.tool === "record_rework")
      ? reworkAt(r, cursor).find((item) => item.defectId === focusDefect.id) : undefined;
    if (decision?.resolution === "waived" && decision.reason) {
      caption.append(
        el("p", `The Author waived ${decision.defectId}.`, "scene-note decision-lead"),
        el("p", decision.reason, "scene-note"),
      );
    } else if (note) caption.append(el("p", note, "scene-note"));
    if (focusDefect && (current?.tool === "log_defect" || decision)) {
      caption.append(button("See the finding in the code ↓", () => revealFinding(focusDefect), "scene-action"));
    }
  }
  if (r.events.length > 1) {
    const ledger = el("ol", "", "scene-ledger");
    for (const i of [cursor - 1, cursor, cursor + 1]) {
      const e = r.events[i];
      if (!e) continue;
      const item = el("li", "", i === cursor ? "current" : "");
      const jump = button(`${i + 1}. ${eventName(e.tool)}`, () => jumpToEvent(i));
      jump.dataset["focus"] = `ledger-event-${i}`;
      if (i === cursor) jump.setAttribute("aria-current", "step");
      const who = seats.find(([id]) => id === e.role)?.[1] ?? e.role ?? "Server";
      item.append(jump, el("span", who, "ledger-who"));
      ledger.append(item);
    }
    caption.append(ledger);
  }
  const visual = el("div", "", "scene-visual");
  visual.append(
    ouijaBoard(current?.role ?? null, planchetteTarget(state, reading)),
  );
  scene.append(copy, visual, controls, caption);
  return scene;
}

function room(r: Report, actions: HTMLDivElement) {
  const state = atEvent(r, cursor);
  const highlights = replayHighlights(r);
  const unit = r.packet.units.find((u) => u.id === selectedUnit) ?? state.unit;
  const sceneReading = state.event?.tool === "record_reading"
    ? state.readings.find((reading) => reading.id === state.event?.data["reading_id"])
    : undefined;
  const player = el("div", "", "replay-player");
  const guide = el("nav", "", "story-guide");
  if (cursor === 0) guide.classList.add("starting");
  guide.setAttribute("aria-label", "Inspection highlights");
  for (const [index, label] of [
    [highlights.reading, "Read the change"],
    [highlights.finding, "Review the finding"],
    [highlights.decision, "See the decision"],
  ] as const) {
    if (index < 0) continue;
    const link = button(label, () => jumpToEvent(index));
    link.dataset["focus"] = `highlight-${index}`;
    if (cursor === index) link.setAttribute("aria-current", "step");
    guide.append(link);
  }
  if (guide.childElementCount) player.append(guide);
  const controls = el("section", "", "playback");
  controls.setAttribute("aria-label", "Playback controls");
  const back = button("← Previous", () => {
    pause();
    step(-1);
  });
  back.dataset["focus"] = "previous";
  back.disabled = cursor === 0;
  const next = button("Next →", () => {
    pause();
    step(1);
  });
  next.dataset["focus"] = "next";
  next.disabled = cursor >= r.events.length - 1;
  const toggle = button(playing ? "Pause" : "Play replay", play, "primary");
  toggle.dataset["focus"] = "play";
  toggle.disabled = r.events.length < 2;
  const eventCount = state.event
    ? `${cursor + 1} / ${r.events.length} · ${eventName(state.event.tool)}`
    : "No recorded events";
  const progress = el("input", "", "replay-progress");
  progress.type = "range";
  progress.min = "0";
  progress.max = String(Math.max(0, r.events.length - 1));
  progress.value = String(cursor);
  progress.disabled = r.events.length < 2;
  progress.dataset["focus"] = "replay-position";
  progress.setAttribute("aria-label", "Replay position");
  const updateProgress = () => {
    const index = progress.valueAsNumber;
    const event = r.events[index];
    progress.style.setProperty("--played", `${(index / Math.max(1, r.events.length - 1)) * 100}%`);
    if (event) progress.setAttribute("aria-valuetext", `Event ${index + 1} of ${r.events.length}, ${eventName(event.tool)}`);
  };
  updateProgress();
  progress.addEventListener("input", () => {
    pause();
    updateProgress();
  });
  progress.addEventListener("change", () => jumpToEvent(progress.valueAsNumber));
  controls.append(progress);
  const allEvents = detailsPanel("Browse all events", eventsOpen, (open) => { eventsOpen = open; }, "all-events");
  const phases = new Map<string, number>();
  r.events.forEach((event, index) => {
    if (!phases.has(event.phase)) phases.set(event.phase, index);
  });
  if (phases.size) {
    const rail = el("nav", "", "phase-rail");
    rail.setAttribute("aria-label", "Recorded phases");
    for (const [phase, index] of phases) {
      const stop = button(phase, () => jumpToEvent(index));
      stop.dataset["focus"] = `phase-${index}`;
      stop.setAttribute("aria-label", `Jump to ${phase}`);
      if (phase === state.event?.phase) stop.setAttribute("aria-current", "step");
      rail.append(stop);
    }
    allEvents.append(rail);
  }
  const transport = el("div", "", "transport");
  const buttons = el("div", "", "transport-buttons");
  buttons.append(back, toggle, next);
  const eventLabel = el("label", "Jump to event", "field-label");
  const select = el("select");
  select.dataset["focus"] = "events";
  eventLabel.append(select);
  r.events.forEach((e, i) => {
    const opt = el(
      "option",
      `${i + 1}. ${eventName(e.tool)} · ${e.role ?? "server"}`,
    );
    opt.value = String(i);
    select.append(opt);
  });
  select.value = String(cursor);
  select.disabled = !r.events.length;
  select.addEventListener("change", () => jumpToEvent(Number(select.value)));
  const position = el("span", eventCount, "event-count");
  transport.append(buttons, position, allEvents);
  allEvents.append(eventLabel);
  controls.append(transport);
  const focusId = state.event?.tool === "log_defect"
    ? state.event.data["defect_id"]
    : selectedFinding ?? highlights.defect?.id;
  const focusDefect = state.defects.find((defect) => defect.id === focusId);
  player.append(replayScene(r, state, sceneReading, controls, focusDefect));
  main.append(player);

  const layout = el("div", "", "room-grid");
  const evidence = detailsPanel("Source code and evidence", evidenceOpen, (open) => { evidenceOpen = open; }, "evidence-panel");
  const evidenceHeader = el("div", "", "evidence-heading");
  evidenceHeader.append(actions);
  const history = el("aside", "", "room-history");
  history.setAttribute("aria-label", "Event timeline");
  history.append(el("h2", "Event timeline"));
  const eventLog = el("ol", "", "event-log");
  const historyStart = Math.max(0, cursor - 6);
  r.events.slice(historyStart, cursor + 1).forEach((e, offset) => {
    const index = historyStart + offset;
    const item = el("li");
    const eventButton = button("", () => jumpToEvent(index), "event-row");
    eventButton.dataset["focus"] = `history-${index}`;
    if (index === cursor) eventButton.setAttribute("aria-current", "step");
    eventButton.append(
      el("span", String(e.seq).padStart(2, "0"), "event-index"),
      el("span", eventName(e.tool)),
      el("small", e.role ?? "server"),
    );
    item.append(eventButton);
    eventLog.append(item);
  });
  if (state.event) {
    history.append(eventLog);
    const fullTime = new Date(state.event.at).toISOString();
    const time = el("time", `${fullTime.slice(11, 19)} UTC`, "fineprint event-time");
    time.dateTime = state.event.at;
    time.title = fullTime;
    history.append(time);
  } else history.append(el("p", "No events recorded.", "fineprint"));

  const findings = el("aside", "", "finding-index");
  findings.setAttribute("aria-label", "Findings at this point");
  findings.append(el("h2", "Findings at this point"));
  if (!state.defects.length) {
    findings.classList.add("empty");
    findings.append(el("p", "No findings recorded yet.", "fineprint"));
  } else {
    const list = el("ul");
    for (const defect of state.defects) {
      const item = el("li");
      const link = button("", () => revealFinding(defect), "finding-link");
      link.append(
        el("span", `${defect.id} · ${defect.severity}`, "finding-label"),
        el("span", `Line ${defect.location.lineStart} ↗`, "finding-location"),
      );
      item.append(link);
      list.append(item);
    }
    findings.append(list);
  }
  const work = el("section", "", "reading-desk");
  const deskHeader = el("div", "", "desk-header");
  deskHeader.append(el("h2", "Reading desk"));
  const unitLabel = el("label", "Reading unit", "field-label");
  const units = el("select");
  units.setAttribute("aria-label", "Reading unit");
  units.dataset["focus"] = "units";
  r.packet.units.forEach((u) => {
    const opt = el("option", `${u.id} · ${u.file}`);
    opt.value = u.id;
    units.append(opt);
  });
  units.value = unit?.id ?? "";
  units.addEventListener("change", () => {
    pause();
    selectedUnit = units.value;
    selectedFinding = null;
    render();
  });
  unitLabel.append(units);
  deskHeader.append(unitLabel);
  work.append(deskHeader);
  if (state.attempt)
    work.append(
      el(
        "p",
        state.attempt.passed
          ? "Follow-up passed. See each defect for verified or waived status."
          : `Follow-up failed. Blocking majors: ${state.attempt.blocking.join(", ")}.`,
        `phase-banner ${state.attempt.passed ? "followup-passed" : "followup-failed"}`,
      ),
    );
  const reading = state.readings.find((x) => x.unitId === unit?.id);
  work.append(readingPassage(reading));
  if (unit) {
    const code = el("div", "", "code-block");
    code.tabIndex = 0;
    code.setAttribute("role", "region");
    code.setAttribute("aria-label", `Code for ${unit.id}`);
    const fileHeader = el("div", "", "code-file");
    const file = el("span", unit.file, "file-path");
    file.title = unit.file;
    const additions = unit.lines.filter((line) => line.kind === "add").length;
    const deletions = unit.lines.filter((line) => line.kind === "del").length;
    const diffStats = el("span", "", "diff-stats");
    diffStats.setAttribute("aria-label", `${additions} additions, ${deletions} deletions`);
    diffStats.append(
      el("span", `+${additions}`, "added-count"),
      el("span", `−${deletions}`, "deleted-count"),
    );
    fileHeader.append(file, diffStats);
    code.append(fileHeader);
    for (const line of unit.lines) {
      const row = el("div", "", `code-line ${line.kind}`);
      row.append(
        el("span", `${line.oldNo ?? ""}`, "line-number"),
        el("span", `${line.newNo ?? ""}`, "line-number"),
        el(
          "span",
          line.kind === "add" ? "+" : line.kind === "del" ? "−" : " ",
          "diff-sign",
        ),
        el("code", line.text),
      );
      code.append(row);
      const pinned = state.defects.filter(
        (d) =>
          d.unitId === unit.id &&
          d.location.lineStart ===
            (d.location.side === "new" ? line.newNo : line.oldNo),
      );
      if (pinned.length) row.classList.add("has-finding");
      for (const d of pinned) code.append(defectCard(r, d, cursor));
    }
    work.append(code);
    if (!state.defects.some((d) => d.unitId === unit.id))
      work.append(
        el("p", "No defects logged for this unit at this point.", "fineprint"),
      );
  }
  layout.append(findings, work, history);
  evidence.append(evidenceHeader, layout);
  main.append(evidence);
  glidePlanchette(planchetteTarget(state, sceneReading));
  live.textContent = `Event ${cursor + 1}: ${eventName(state.event?.tool ?? "")}. ${state.event?.role ?? "server"}.`;
}
function defectCard(r: Report, d: Defect, index = r.events.length - 1) {
  const status = defectStatus(r, d, index);
  const card = el(
    "article",
    "",
    `ghost ${d.severity}${status.startsWith("Exorcised") ? " verified" : ""}`,
  );
  card.tabIndex = 0;
  card.dataset["finding"] = d.id;
  card.setAttribute("aria-label", `${d.id}, ${d.severity} defect`);
  card.append(
    el(
      "h3",
      `${d.severity === "major" ? "◇" : "○"} ${d.id} · ${d.severity} · ${d.type}`,
    ),
    el("p", d.description),
    el(
      "p",
      `${d.location.file}:${d.location.lineStart}–${d.location.lineEnd} (${d.location.side}) · ${d.raisedBy}`,
      "fineprint",
    ),
    el("strong", status),
  );
  const waiver = reworkAt(r, index).find((x) => x.defectId === d.id);
  if (waiver?.reason) card.append(el("p", `Author's waiver: ${waiver.reason}`));
  return card;
}
function metricLabel(field: string): string {
  const names: Record<string, string> = {
    'durationsMs.planning': 'Planning duration', 'durationsMs.overview': 'Overview duration',
    'durationsMs.preparation': 'Preparation duration', 'durationsMs.meeting': 'Meeting duration',
    'durationsMs.rework': 'Rework duration', 'durationsMs.followup': 'Follow-up duration',
    preparationRateLocPerHour: 'Preparation rate', inspectionRateLocPerHour: 'Inspection rate',
    defectsPerKloc: 'Defects per KLOC', majorsPerKloc: 'Majors per KLOC',
  };
  return names[field] ?? field;
}
function plainReport(r: Report) {
  const section = el("section", "", "plain-report");
  section.append(el("h2", "The inspection record"));
  const metrics = el("dl", "", "metrics");
  for (const [label, val] of [
    ["Changed LOC", r.metrics.changedLoc],
    ["Defects", r.metrics.defects.total],
    ["Majors", r.metrics.defects.major],
    ["Preparation LOC/hour", r.metrics.preparationRateLocPerHour],
    ["Inspection LOC/hour", r.metrics.inspectionRateLocPerHour],
    ["Defects/KLOC", r.metrics.defectsPerKloc],
  ] as const) {
    const pair = el("div");
    pair.append(el("dt", label), el("dd", fmt(val)));
    metrics.append(pair);
  }
  section.append(
    metrics,
    el(
      "p",
      "Rates measure elapsed agent ceremony time, including orchestration waits. They do not measure human reading or attention.",
      "fineprint",
    ),
  );
  for (const n of r.metrics.nullReasons)
    section.append(
      el("p", `${metricLabel(n.field)}: ${n.reason.replaceAll("_", " ")}`, "fineprint"),
    );
  for (const w of r.metrics.warnings)
    section.append(el("p", w.message, "flag"));
  section.append(el("h2", "Defect log"));
  if (!r.defects.defects.length)
    section.append(el("p", "No ghosts. This inspection logged no defects."));
  for (const defect of r.defects.defects) {
    const card = defectCard(r, defect);
    const trail = findingTrail(r, defect);
    if (trail.length) {
      const steps = el("nav", "", "finding-trail");
      steps.setAttribute("aria-label", `${defect.id} replay evidence`);
      for (const { index, label } of trail) {
        steps.append(button(label, () => {
          pause();
          plain = false;
          cursor = index;
          selectedUnit = defect.unitId;
          selectedFinding = defect.id;
          evidenceOpen = true;
          render();
          const heading = main.querySelector<HTMLElement>(".replay-scene h2");
          if (heading) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
            heading.scrollIntoView({ block: "nearest" });
          }
        }));
      }
      card.append(steps);
    }
    section.append(card);
  }
  section.append(el("h2", "Rework and follow-up"));
  if (!r.rework.items.length)
    section.append(el("p", "No Author rework has been recorded."));
  for (const rework of r.rework.items)
    section.append(
      el(
        "p",
        `${rework.defectId} · ${rework.resolution} · ${rework.note ?? rework.reason ?? ""}`,
      ),
    );
  if (!r.followup.attempts.length)
    section.append(el("p", "Follow-up has not been reached."));
  for (const a of r.followup.attempts)
    section.append(
      el(
        "p",
        `Attempt ${a.n}: ${a.passed ? "passed" : "failed"} at ${a.at}. Build: ${a.checks.build.passed}; tests: ${a.checks.tests.passed}. Blocking: ${a.blocking.join(", ") || "none"}.`,
      ),
    );
  const actions = el("div", "", "actions");
  actions.append(
    button("Print report", () => window.print()),
    button("Download text", () =>
      download(`${r.inspection.id}.txt`, renderReportTxt(r), "text/plain"),
    ),
  );
  const listing = el("pre", renderReportTxt(r), "greenbar");
  listing.tabIndex = 0;
  listing.setAttribute("role", "region");
  listing.setAttribute("aria-label", "Green-bar listing");
  section.append(actions, el("h2", "Green-bar listing"), listing);
  main.append(section);
}
root.addEventListener("dragover", (e) => {
  e.preventDefault();
});
root.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) openFile(file);
});
document.addEventListener("keydown", (e) => {
  if (
    help.open ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement ||
    (e.target instanceof HTMLElement && e.target.isContentEditable)
  )
    return;
  if (e.key === "?") {
    e.preventDefault();
    help.showModal();
  }
  if (!opened || loading || error) return;
  if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    pause();
    plain = !plain;
    render();
  }
  const target = e.target instanceof HTMLElement ? e.target : null;
  const inSource = target?.closest(".code-block, .greenbar");
  if (!plain && e.key === " " && !inSource && !target?.closest("button, a, summary")) {
    e.preventDefault();
    play();
  }
  const findingId = target?.closest<HTMLElement>("[data-finding]")?.dataset["finding"];
  if ((e.key === "ArrowUp" || e.key === "ArrowDown") && (!inSource || findingId)) {
    const report = opened.report;
    const defects = plain ? report.defects.defects : atEvent(report, cursor).defects;
    if (!defects.length) return;
    const current = defects.findIndex((defect) => defect.id === findingId);
    const direction = e.key === "ArrowDown" ? 1 : -1;
    const next = current < 0
      ? (direction === 1 ? 0 : defects.length - 1)
      : (current + direction + defects.length) % defects.length;
    e.preventDefault();
    if (plain) focusFinding(defects[next]!.id);
    else revealFinding(defects[next]!);
    return;
  }
  if (inSource) return;
  if (!plain && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    e.preventDefault();
    pause();
    step(e.key === "ArrowRight" ? 1 : -1);
  }
});
render();
const params = new URL(location.href).searchParams;
const reportUrl = params.get("report");
const highlight = params.get("demo");
if (reportUrl) void load((s) => fetchReport(reportUrl, location.href, s), reportUrl);
else if (highlight === "reading" || highlight === "finding" || highlight === "decision") openDemo(highlight);
