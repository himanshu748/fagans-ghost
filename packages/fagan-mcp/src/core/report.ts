// report.json build/parse and the 132-column report.txt listing (FM-R11.3 to FM-R11.7).
import { FaganError, issuesToDetails } from "./errors.js";
import { toDeterministicJson } from "./json.js";
import { ReportSchema, type Checklist, type FaganEvent, type Metrics, type Report } from "./schema.js";
import type { InspectionState } from "./state.js";

export const REPORT_WIDTH = 132;
export const REPORT_SCHEMA_VERSION = "fagan-report/1";

export interface BuildReportArgs {
  state: InspectionState;
  metrics: Metrics;
  events: readonly FaganEvent[];
  checklists: ReadonlyMap<string, Checklist>;
  generatorVersion: string;
  exportedAt: string;
}

/** Self-contained report model; includes only the checklists the packet uses. */
export function buildReport(args: BuildReportArgs): Report {
  const used = [...new Set(args.state.packet.files.map((f) => f.checklist))].sort();
  const checklists: Checklist[] = [];
  for (const id of used) {
    const c = args.checklists.get(id);
    if (c !== undefined) checklists.push(c);
  }
  return {
    schemaVersion: "fagan-report/1",
    generator: { name: "fagan-mcp", version: args.generatorVersion },
    exportedAt: args.exportedAt,
    inspection: args.state.inspection,
    packet: args.state.packet,
    checklists,
    readings: args.state.readings,
    defects: args.state.defects,
    rework: args.state.rework,
    followup: args.state.followup,
    metrics: args.metrics,
    events: [...args.events],
  };
}

export function serializeReport(report: Report): string {
  return toDeterministicJson(ReportSchema, report);
}

/** Parses report.json text; rejects other schema versions by name (FM-R11.7). */
export function parseReport(text: string): Report {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new FaganError("VALIDATION_ERROR", `report is not valid JSON: ${(err as Error).message}`, {});
  }
  const version =
    raw !== null && typeof raw === "object" && "schemaVersion" in raw ? (raw as { schemaVersion: unknown }).schemaVersion : undefined;
  if (version !== REPORT_SCHEMA_VERSION) {
    throw new FaganError(
      "VALIDATION_ERROR",
      `unsupported report schemaVersion ${JSON.stringify(version ?? null)}; expected ${REPORT_SCHEMA_VERSION}`,
      { found: version ?? null },
    );
  }
  const parsed = ReportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FaganError("VALIDATION_ERROR", "report does not match fagan-report/1", {
      issues: issuesToDetails(parsed.error.issues),
    });
  }
  return parsed.data;
}

// ---------------------------------------------------------------- report.txt

function codePoints(s: string): string[] {
  return [...s];
}

/** Makes text printable on one line: tabs become spaces to the next multiple of 4, other controls become `?`. */
export function printable(s: string): string {
  let out = "";
  let col = 0;
  for (const ch of codePoints(s)) {
    if (ch === "\t") {
      const pad = 4 - (col % 4);
      out += " ".repeat(pad);
      col += pad;
    } else if (/[\u0000-\u001f\u007f]/u.test(ch)) {
      out += "?";
      col++;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
}

/** Splits text into chunks of at most `width` code points. Empty text gives one empty chunk. */
export function chunk(s: string, width: number): string[] {
  const cps = codePoints(s);
  if (cps.length === 0) return [""];
  const out: string[] = [];
  for (let i = 0; i < cps.length; i += width) out.push(cps.slice(i, i + width).join(""));
  return out;
}

/** Word wrap with hard breaks for words longer than `width`. Newlines start new lines. */
export function wrap(s: string, width: number): string[] {
  return s.split(/\r?\n/).flatMap((para) => wrapLine(para, width));
}

function wrapLine(s: string, width: number): string[] {
  const words = printable(s).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const pieces = chunk(word, width);
    for (const piece of pieces) {
      const len = codePoints(line).length;
      if (len === 0) line = piece;
      else if (len + 1 + codePoints(piece).length <= width) line += ` ${piece}`;
      else {
        lines.push(line);
        line = piece;
      }
    }
  }
  lines.push(line);
  return lines;
}

function pad(s: string, n: number): string {
  const len = codePoints(s).length;
  return len >= n ? codePoints(s).slice(0, n).join("") : s + " ".repeat(n - len);
}

function padLeft(s: string, n: number): string {
  const len = codePoints(s).length;
  return len >= n ? s : " ".repeat(n - len) + s;
}

function fmt(n: number | null, reason: string | undefined): string {
  return n === null ? `n/a (${reason ?? "unknown"})` : n.toFixed(2);
}

/**
 * Renders the green-bar listing. Every line starts with a band column: `:`
 * for green-band rows and a space for white rows, alternating every three
 * listing rows, as on fan-fold line-printer paper.
 */
export function renderReportTxt(report: Report): string {
  const body: string[] = [];
  const inner = REPORT_WIDTH - 2;
  const rule = (ch: string): void => {
    body.push(ch.repeat(inner));
  };
  const text = (s: string, indent = 0): void => {
    for (const line of wrap(s, inner - indent)) body.push(" ".repeat(indent) + line);
  };
  const kv = (k: string, v: string): void => {
    const lines = wrap(v, inner - 14);
    lines.forEach((line, i) => body.push(`${pad(i === 0 ? k : "", 14)}${line}`));
  };

  const { inspection: insp, packet, readings, defects, rework, followup, metrics } = report;
  const t = insp.timestamps;
  rule("=");
  text(`FAGAN'S GHOST  INSPECTION LISTING  ${report.schemaVersion}  generated by ${report.generator.name} ${report.generator.version}`);
  rule("=");
  kv("INSPECTION", insp.id);
  kv("TITLE", insp.title);
  kv("RANGE", `${insp.range.base} (${insp.range.baseSha.slice(0, 12)}) .. ${insp.range.head}${insp.range.headSha === null ? "" : ` (${insp.range.headSha.slice(0, 12)})`}`);
  kv("PHASE", insp.phase);
  kv("OPENED", t.planningStart);
  kv("CLOSED", t.closedAt ?? (t.abandonedAt === null ? "-" : `abandoned ${t.abandonedAt}`));
  kv("EXPORTED", report.exportedAt);
  const check = (name: string, c: { ran: boolean; passed: boolean; exitCode: number | null; durationMs: number | null }): string =>
    `${name} ${c.ran ? (c.passed ? "PASS" : "FAIL") : "NOT RUN"}${c.exitCode === null ? "" : ` exit ${c.exitCode}`}${c.durationMs === null ? "" : ` ${c.durationMs} ms`}`;
  kv("ENTRY", `${check("BUILD", insp.entry.build)} | ${check("TESTS", insp.entry.tests)} | SIZE ${insp.entry.size.changedLoc}/${insp.entry.size.limit} LOC ${insp.entry.size.passed ? "PASS" : "FAIL"}`);
  if (insp.authorOverview !== null) kv("OVERVIEW", insp.authorOverview);
  if (insp.meetingNotes !== null) kv("MEETING NOTES", insp.meetingNotes);
  if (insp.abandonReason !== null) kv("ABANDONED", insp.abandonReason);
  kv("FILES", `${packet.files.length} files, ${packet.units.length} units, ${packet.changedLoc} changed LOC`);
  for (const f of packet.files) {
    text(`${pad(f.status.toUpperCase(), 9)} ${f.path}${f.oldPath === null ? "" : ` (from ${f.oldPath})`}  checklist ${f.checklist}${f.skipped === null ? "" : `  SKIPPED ${f.skipped}`}`, 2);
  }

  // Units with line numbers, defect markers and the Reader's paraphrase.
  const markWidth = 6;
  const codeIndent = markWidth + 1 + 6 + 1 + 6 + 1 + 1 + 1;
  const codeWidth = inner - codeIndent;
  for (const unit of packet.units) {
    rule("-");
    text(`UNIT ${unit.id}  ${unit.file}  ${unit.hunkHeader}  ${unit.changedLoc} changed LOC`);
    body.push(`${pad("MARK", markWidth)} ${padLeft("OLD", 6)} ${padLeft("NEW", 6)} K TEXT`);
    const unitDefects = defects.defects.filter((d) => d.unitId === unit.id);
    for (const line of unit.lines) {
      const hits = unitDefects.filter((d) => {
        const n = d.location.side === "new" ? line.newNo : line.oldNo;
        return n !== null && n >= d.location.lineStart && n <= d.location.lineEnd;
      });
      const mark = hits.length === 0 ? "" : hits.length === 1 ? (hits[0]?.id ?? "") : `${hits[0]?.id ?? ""}+`;
      const kind = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
      const chunks = chunk(printable(line.text), codeWidth);
      chunks.forEach((piece, i) => {
        if (i === 0) {
          body.push(
            `${pad(mark, markWidth)} ${padLeft(line.oldNo === null ? "" : String(line.oldNo), 6)} ${padLeft(line.newNo === null ? "" : String(line.newNo), 6)} ${kind} ${piece}`,
          );
        } else {
          body.push(`${" ".repeat(codeIndent - 2)}\\ ${piece}`);
        }
      });
    }
    const reading = readings.readings.find((r) => r.unitId === unit.id);
    if (reading === undefined) {
      text("READER: (no reading recorded)", 2);
    } else {
      text(`READER ${reading.id}: ${reading.paraphrase}`, 2);
      if (reading.judgmentFlags.length > 0) text(`JUDGMENT WORDS FLAGGED: ${reading.judgmentFlags.join(", ")}`, 2);
    }
  }

  rule("=");
  text(`DEFECT LOG  ${defects.defects.length} defects`);
  rule("-");
  body.push(`${pad("ID", 6)} ${pad("SEV", 6)} ${pad("TYPE", 14)} ${pad("CLASS", 8)} ${pad("RAISED BY", 21)} ${pad("UNIT", 6)} LOCATION`);
  for (const d of defects.defects) {
    const loc = `${d.location.file}:${d.location.side}:${d.location.lineStart}-${d.location.lineEnd}`;
    const head = `${pad(d.id, 6)} ${pad(d.severity, 6)} ${pad(d.type, 14)} ${pad(d.class ?? "-", 8)} ${pad(d.raisedBy, 21)} ${pad(d.unitId, 6)} `;
    const locLines = wrap(loc, inner - codePoints(head).length);
    locLines.forEach((l, i) => body.push(i === 0 ? head + l : " ".repeat(codePoints(head).length) + l));
    text(d.description, 7);
    if (d.checklistItemId !== null) text(`checklist item ${d.checklistItemId}`, 7);
  }

  rule("=");
  text(`REWORK  ${rework.items.length} items`);
  rule("-");
  for (const item of rework.items) {
    text(`${item.defectId} ${item.resolution.toUpperCase()} at ${item.recordedAt}: ${item.resolution === "fixed" ? (item.note ?? "") : (item.reason ?? "")}`);
  }

  rule("=");
  text(`FOLLOW-UP  ${followup.attempts.length} attempts`);
  rule("-");
  for (const a of followup.attempts) {
    text(`ATTEMPT ${a.n} at ${a.at}: ${a.passed ? "PASSED" : "FAILED"}  ${check("BUILD", a.checks.build)} | ${check("TESTS", a.checks.tests)}`);
    text(a.defects.map((d) => `${d.defectId} ${d.severity} ${d.status}`).join("; ") || "no defects", 2);
    if (a.blocking.length > 0) text(`BLOCKING: ${a.blocking.join(", ")}`, 2);
  }

  rule("=");
  text(`METRICS  computed ${metrics.computedAt}`);
  rule("-");
  const reasons = new Map(metrics.nullReasons.map((r) => [r.field, r.reason]));
  kv("CHANGED LOC", String(metrics.changedLoc));
  for (const k of ["planning", "overview", "preparation", "meeting", "rework", "followup"] as const) {
    kv(`${k.toUpperCase()} MS`, fmt(metrics.durationsMs[k], reasons.get(`durationsMs.${k}`)));
  }
  kv("PREP LOC/H", fmt(metrics.preparationRateLocPerHour, reasons.get("preparationRateLocPerHour")));
  kv("INSP LOC/H", fmt(metrics.inspectionRateLocPerHour, reasons.get("inspectionRateLocPerHour")));
  kv("DEFECTS/KLOC", fmt(metrics.defectsPerKloc, reasons.get("defectsPerKloc")));
  kv("MAJORS/KLOC", fmt(metrics.majorsPerKloc, reasons.get("majorsPerKloc")));
  kv("DEFECTS", `${metrics.defects.total} total, ${metrics.defects.major} major, ${metrics.defects.minor} minor`);
  kv("BY TYPE", Object.entries(metrics.byType).map(([k, v]) => `${k} ${v}`).join(", "));
  for (const w of metrics.warnings) kv("WARNING", `${w.code}: ${w.message}`);
  rule("=");
  text("END OF LISTING");

  const out = body.map((line, i) => `${Math.floor(i / 3) % 2 === 0 ? ":" : " "} ${line}`.trimEnd());
  return `${out.join("\n")}\n`;
}
