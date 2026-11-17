import "./style.css";
import {
  atEvent,
  reworkAt,
  defectStatus,
  eventName,
  fetchReport,
  fmt,
  loadReport,
  MAX_BYTES,
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
const footer = el(
  "footer",
  "A method revived. A record kept. The Author has the final word.",
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
let report: Report | null = null;
let cursor = 0;
let plain = false;
let playing = false;
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let controller: AbortController | undefined;
let selectedUnit: string | null = null;
let sourceName = "";
let loading = false;
let error = "";
function pause() {
  playing = false;
  if (timer) clearInterval(timer);
  timer = undefined;
}
function reset() {
  pause();
  generation++;
  controller?.abort();
  report = null;
  cursor = 0;
  selectedUnit = null;
  error = "";
  loading = false;
  render();
}
function step(delta: number) {
  if (!report) return;
  selectedUnit = null;
  cursor = Math.max(0, Math.min(report.events.length - 1, cursor + delta));
  if (cursor === report.events.length - 1) pause();
  render();
}
function play() {
  if (!report || !report.events.length) return;
  if (playing) pause();
  else {
    if (cursor === report.events.length - 1) cursor = 0;
    playing = true;
    timer = setInterval(() => step(1), 2200);
  }
  render();
}
async function load(
  read: (signal: AbortSignal) => Promise<string>,
  name: string,
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
  render();
  try {
    const next = loadReport(await read(signal));
    if (current !== generation) return;
    report = next;
    cursor = 0;
    selectedUnit = null;
    sourceName = name;
    live.textContent = `Loaded ${next.inspection.title}. ${next.packet.units.length} reading units.`;
  } catch (e) {
    if (current !== generation) return;
    error = signal.aborted
      ? "Loading stopped or timed out. Retry or open a local report."
      : e instanceof Error
        ? e.message
        : String(e);
  } finally {
    clearTimeout(timeout);
    if (current === generation) {
      loading = false;
      render();
    }
  }
}
function openFile(file: File) {
  void load(async () => {
    if (file.size > MAX_BYTES)
      throw new Error("Report exceeds the 10 MiB limit.");
    return file.text();
  }, file.name);
}
const fileInput = el("input");
fileInput.type = "file";
fileInput.accept = ".json,application/json";
fileInput.setAttribute("aria-label", "Choose inspection report");
fileInput.className = "sr-only";
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) openFile(f);
  fileInput.value = "";
});
topActions.append(fileInput);
const demo = () =>
  void load(
    (s) =>
      fetchReport(
        new URL("demo/report.json", document.baseURI).href,
        location.href,
        s,
      ),
    "Bundled demo · Codex role agents",
  );
function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function roleTable(active: string | null = null) {
  const board = el("div", "", "ritual-board");
  board.setAttribute("aria-label", "Inspection roles");
  const ring = el("div", "", "table-ring");
  ring.append(
    el("span", "FG", "monogram"),
    el("span", "READ · QUESTION · RECORD", "table-motto"),
  );
  const planchette = el("span", "◦", "planchette");
  planchette.setAttribute("aria-hidden", "true");
  ring.append(planchette);
  board.append(ring);
  const roles = [
    ["moderator", "Moderator"],
    ["reader", "Reader"],
    ["inspector-logic", "Logic inspector"],
    ["inspector-interfaces", "Interface inspector"],
    ["scribe", "Scribe"],
    ["author", "Author · human"],
  ];
  roles.forEach(([id, label], i) => {
    const seat = el(
      "div",
      "",
      `seat seat-${i}${id === active ? " active" : ""}`,
    );
    seat.append(
      el("span", String(i + 1).padStart(2, "0"), "seat-number"),
      el("span", label),
    );
    if (id === active) seat.append(el("span", "Speaking", "sr-only"));
    board.append(seat);
  });
  return board;
}
function render() {
  const focused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset["focus"]
      : undefined;
  main.replaceChildren();
  viewButton.textContent = plain ? "Room view" : "Report view";
  viewButton.setAttribute("aria-pressed", String(plain));
  if (loading) {
    const s = el("section", "", "notice");
    s.append(
      el("h1", "Opening the record…"),
      el("p", "Reading and validating the inspection."),
      button("Cancel loading", reset),
    );
    main.append(s);
    return;
  }
  if (error) {
    const s = el("section", "", "notice error");
    s.setAttribute("role", "alert");
    s.append(
      el("h1", "The record could not be opened"),
      el("p", error),
      button("Back to load screen", reset),
    );
    main.append(s);
    return;
  }
  if (!report) {
    landing();
    return;
  }
  const r = report;
  const title = el("section", "", "inspection-heading");
  title.append(
    el("p", `${r.inspection.id.toUpperCase()} / ${sourceName}`, "eyebrow"),
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
      ? "Inspection closed. See the recorded follow-up for verification and waivers."
      : `Inspection still in ${r.inspection.phase}. Unreached phases are not completed.`,
    "phase-banner",
  );
  title.append(status);
  const actions = el("div", "", "actions");
  actions.append(
    button("Open another report", () => fileInput.click()),
    button("Download JSON", () =>
      download(
        `${r.inspection.id}.json`,
        JSON.stringify(r, null, 2),
        "application/json",
      ),
    ),
  );
  title.append(actions);
  main.append(title);
  if (plain) plainReport(r);
  else room(r);
  if (focused)
    main
      .querySelector<HTMLElement>(`[data-focus="${focused}"]`)
      ?.focus({ preventScroll: true });
}
function landing() {
  const hero = el("section", "", "hero");
  const copy = el("div", "", "hero-copy");
  copy.append(
    el("p", "A CODE INSPECTION, BROUGHT BACK TO LIFE", "eyebrow"),
    el("h1", "Someone has to\nread the code."),
    el(
      "p",
      "Gather the roles. Read the change aloud. Leave an honest record.",
      "lede",
    ),
    el(
      "p",
      "Fagan's Ghost revives formal code inspection for an age of AI-written code. Enter the room to replay a real inspection, one reading and one finding at a time.",
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
  hero.append(copy, roleTable());
  main.append(hero);
  const strip = el("section", "", "story-strip");
  for (const [n, title, body] of [
    [
      "01",
      "Read, before judging",
      "The Reader describes the change. Two inspectors question its logic and interfaces.",
    ],
    [
      "02",
      "Keep the record honest",
      "The Scribe logs findings. A deterministic server enforces phases and measures elapsed time.",
    ],
    [
      "03",
      "Let the Author decide",
      "Only the human Author records rework or waivers. Follow-up checks the result.",
    ],
  ]) {
    const part = el("article");
    part.append(el("span", n, "eyebrow"), el("h2", title), el("p", body));
    strip.append(part);
  }
  main.append(strip);
  main.append(
    el(
      "p",
      "The bundled inspection uses Codex role agents after Kiro reached its usage limit. Kiro configuration and earlier hook experiments remain part of the project. This viewer makes no model calls.",
      "provenance",
    ),
  );
  if (plain)
    main.append(el("p", "Open an inspection to read its plain report."));
}
function room(r: Report) {
  const state = atEvent(r, cursor);
  const unit = r.packet.units.find((u) => u.id === selectedUnit) ?? state.unit;
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
  const toggle = button(playing ? "Pause" : "Play ceremony", play, "primary");
  toggle.dataset["focus"] = "play";
  controls.append(
    back,
    toggle,
    next,
    el(
      "span",
      `${cursor + 1} / ${r.events.length} · ${eventName(state.event?.tool ?? "")}`,
      "event-count",
    ),
  );
  main.append(controls);
  const layout = el("div", "", "room-grid");
  const aside = el("aside", "", "room-aside");
  aside.append(roleTable(state.event?.role));
  const eventLabel = el("label", "Jump to a recorded event", "field-label");
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
  select.addEventListener("change", () => {
    pause();
    cursor = Number(select.value);
    selectedUnit = null;
    render();
  });
  aside.append(eventLabel);
  aside.append(
    el(
      "p",
      state.event
        ? `${new Date(state.event.at).toISOString()} · ${state.event.phase}`
        : "No events recorded.",
      "fineprint",
    ),
  );
  const eventLog = el("ol", "", "event-log");
  r.events.slice(Math.max(0, cursor - 3), cursor + 1).forEach((e) => {
    const item = el("li");
    item.append(
      el("span", String(e.seq).padStart(2, "0"), "event-index"),
      el("span", eventName(e.tool)),
      el("small", e.role ?? "server"),
    );
    eventLog.append(item);
  });
  aside.append(eventLog);
  const work = el("section", "", "reading-desk");
  work.append(el("h2", "Reading and defects", "sr-only"));
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
    render();
  });
  unitLabel.append(units);
  work.append(unitLabel);
  const reading = state.readings.find((x) => x.unitId === unit?.id);
  const passage = el("div", "", "reader-passage");
  passage.append(el("p", "THE READER", "eyebrow"));
  const para = el("p", "", "paraphrase");
  const words =
    reading?.paraphrase ??
    "The Reader has not spoken about this unit at this point in the ceremony.";
  if (reading && state.event?.tool === "record_reading" && !reduced()) {
    // One accessible sentence; the visual glyphs spell it out without live-region chatter.
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
    passage.append(
      el("p", `Language flags: ${reading.judgmentFlags.join(", ")}`, "flag"),
    );
  work.append(passage);
  if (unit) {
    const code = el("div", "", "code-block");
    code.tabIndex = 0;
    code.setAttribute("role", "region");
    code.setAttribute("aria-label", `Code for ${unit.id}`);
    code.append(el("div", unit.file, "code-file"));
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
      for (const d of pinned) code.append(defectCard(r, d, cursor));
    }
    work.append(code);
    if (!state.defects.some((d) => d.unitId === unit.id))
      work.append(
        el("p", "No defects logged for this unit at this point.", "fineprint"),
      );
  }
  if (state.attempt)
    work.append(
      el(
        "p",
        state.attempt.passed
          ? "Follow-up passed. See each defect for verified or waived status."
          : `Follow-up failed. Blocking majors: ${state.attempt.blocking.join(", ")}.`,
        "phase-banner",
      ),
    );
  layout.append(aside, work);
  main.append(layout);
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
  for (const d of r.defects.defects) section.append(defectCard(r, d));
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
  if (!report) return;
  if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    pause();
    plain = !plain;
    render();
  }
  if (
    e.key === " " &&
    !(e.target instanceof HTMLButtonElement) &&
    !(e.target instanceof HTMLAnchorElement)
  ) {
    e.preventDefault();
    play();
  }
  if (
    e.target instanceof HTMLElement &&
    e.target.closest(".code-block, .greenbar")
  )
    return;
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    pause();
    step(e.key === "ArrowRight" ? 1 : -1);
  }
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    const cards = [...main.querySelectorAll<HTMLElement>(".ghost")];
    if (cards.length) {
      e.preventDefault();
      const i = cards.indexOf(document.activeElement as HTMLElement);
      cards[
        (i + (e.key === "ArrowDown" ? 1 : -1) + cards.length) % cards.length
      ]?.focus();
    }
  }
});
render();
const query = new URL(location.href).searchParams.get("report");
if (query) void load((s) => fetchReport(query, location.href, s), query);
