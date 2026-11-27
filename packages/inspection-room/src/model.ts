import {
  parseReport,
  renderReportTxt,
} from "../../fagan-mcp/src/core/report.js";
import type {
  Report,
  Defect,
  ReworkItem,
} from "../../fagan-mcp/src/core/schema.js";
export { renderReportTxt };
export type { Report, Defect };
export const MAX_BYTES = 10 * 1024 * 1024;

export function loadReport(text: string): Report {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
    throw new Error(
      "Report exceeds the 10 MiB limit. Export a smaller inspection.",
    );
  const report = parseReport(text);
  const dates = [report.exportedAt, report.metrics.computedAt,
    ...Object.values(report.inspection.timestamps), ...report.events.map(e => e.at),
    ...report.readings.readings.map(r => r.recordedAt), ...report.defects.defects.map(d => d.loggedAt),
    ...report.rework.items.map(r => r.recordedAt), ...report.followup.attempts.map(a => a.at)];
  if (dates.some(value => value !== null && (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)))
    throw new Error('Report contains an invalid calendar timestamp.');
  // Shape validation alone cannot guarantee references or replay ordering.
  const units = new Set(report.packet.units.map((u) => u.id));
  if (units.size !== report.packet.units.length)
    throw new Error("Report contains duplicate reading units.");
  if (
    report.readings.readings.some((r) => !units.has(r.unitId)) ||
    report.defects.defects.some((d) => !units.has(d.unitId))
  )
    throw new Error("Report refers to a missing reading unit.");
  if (
    report.events.some(
      (event, i) =>
        i > 0 &&
        (event.seq <= report.events[i - 1]!.seq ||
          event.at < report.events[i - 1]!.at),
    )
  )
    throw new Error("Report events are not in chronological sequence.");
  return report;
}

export function reportUrl(input: string, base: string): URL {
  const url = new URL(input, base);
  const origin = new URL(base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== origin.origin ||
    url.username ||
    url.password
  )
    throw new Error(
      "Only report URLs from this site are allowed. Use Open a report for a local file.",
    );
  return url;
}

export async function fetchReport(
  input: string,
  base: string,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const response = await fetch(reportUrl(input, base), {
    signal,
    redirect: "error",
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(
      `Could not load report (HTTP ${response.status}). Choose another report or retry.`,
    );
  if (Number(response.headers.get("content-length")) > MAX_BYTES)
    throw new Error("Report exceeds the 10 MiB limit.");
  if (!response.body) throw new Error("The report response is empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BYTES)
        throw new Error("Report exceeds the 10 MiB limit.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export function atEvent(report: Report, cursor: number) {
  const index = Math.max(0, Math.min(report.events.length - 1, cursor));
  const event = report.events[index];
  const at = event?.at ?? report.exportedAt;
  const events = report.events.slice(0, index + 1);
  // Timestamps can tie. The event sequence, not wall-clock equality, reveals records.
  const readIds = new Set(
    events
      .filter((e) => e.tool === "record_reading")
      .map((e) => e.data["reading_id"]),
  );
  const defectIds = new Set(
    events
      .filter((e) => e.tool === "log_defect")
      .map((e) => e.data["defect_id"]),
  );
  const readings = report.readings.readings.filter((r) => readIds.has(r.id));
  const defects = report.defects.defects.filter((d) => defectIds.has(d.id));
  const latestReading = readings.at(-1);
  const dataUnit = event?.data["unit_id"];
  const unitId =
    typeof dataUnit === "string"
      ? dataUnit
      : (latestReading?.unitId ?? report.packet.units[0]?.id);
  const unit =
    report.packet.units.find((u) => u.id === unitId) ?? report.packet.units[0];
  const attempts = new Set(
    events
      .filter((e) => e.tool === "follow_up" || e.tool === "cli:follow-up")
      .map((e) => e.data["attempt"]),
  );
  const attempt = report.followup.attempts
    .filter((a) => attempts.has(a.n))
    .at(-1);
  return { event, at, unit, readings, defects, attempt };
}
/** Rework is upserted on disk. Its events retain earlier Author decisions for replay. */
export function reworkAt(report: Report, cursor: number): ReworkItem[] {
  const items = new Map<string, ReworkItem>();
  for (const event of report.events.slice(0, cursor + 1)) {
    if (event.tool !== "record_rework" || !Array.isArray(event.data["items"]))
      continue;
    for (const value of event.data["items"]) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const { defect_id, resolution, note, reason } = value;
      if (
        typeof defect_id !== "string" ||
        (resolution !== "fixed" && resolution !== "waived")
      )
        continue;
      items.set(defect_id, {
        defectId: defect_id,
        resolution,
        note: typeof note === "string" ? note : null,
        reason: typeof reason === "string" ? reason : null,
        recordedAt: event.at,
      });
    }
  }
  return [...items.values()];
}
export function defectStatus(
  report: Report,
  defect: Defect,
  cursor = report.events.length - 1,
): string {
  const { attempt } = atEvent(report, cursor);
  const rework = reworkAt(report, cursor).find(
    (item) => item.defectId === defect.id,
  );
  if (rework?.resolution === "waived") return "Bound by the Author: waived";
  const status = attempt?.defects.find((d) => d.defectId === defect.id)?.status;
  const events = report.events.slice(0, cursor + 1);
  const latestRework = events.findLastIndex(
    (e) =>
      e.tool === "record_rework" &&
      Array.isArray(e.data["items"]) &&
      e.data["items"].some(
        (i) =>
          i &&
          typeof i === "object" &&
          !Array.isArray(i) &&
          i["defect_id"] === defect.id,
      ),
  );
  const latestFollowup = events.findLastIndex(
    (e) =>
      (e.tool === "follow_up" || e.tool === "cli:follow-up") &&
      e.data["attempt"] === attempt?.n,
  );
  if (status === "verified" && latestRework <= latestFollowup)
    return "Exorcised: fixed and verified";
  if (status === "waived" && latestRework <= latestFollowup)
    return "Bound by the Author: waived";
  if (status === "fixed_unverified" || rework?.resolution === "fixed")
    return "Fixed, awaiting verification";
  return "Open";
}
export function replayHighlights(report: Report) {
  const { events } = report;
  const defects = new Map(report.defects.defects.map((defect) => [defect.id, defect]));
  const readings = new Map(report.readings.readings.map((reading) => [reading.id, reading]));
  const getDefect = (event: Report["events"][number]) => {
    const id = event.data["defect_id"];
    return typeof id === "string" ? defects.get(id) : undefined;
  };
  const finding = events.findIndex((event) => event.tool === "log_defect" && getDefect(event));
  const defect = finding >= 0 ? getDefect(events[finding]!) : undefined;
  const getReading = (event: Report["events"][number]) => {
    const id = event.data["reading_id"];
    return typeof id === "string" ? readings.get(id) : undefined;
  };
  const related = defect ? events.findIndex((event, index) => index < finding
    && event.tool === "record_reading" && getReading(event)?.unitId === defect.unitId) : -1;
  const firstReading = events.findIndex((event, index) => (finding < 0 || index < finding)
    && event.tool === "record_reading" && getReading(event));

  const author = defect ? events.findLastIndex((event, index) => index > finding
    && event.tool === "record_rework" && Array.isArray(event.data["items"])
    && event.data["items"].some((item) => item && typeof item === "object"
      && !Array.isArray(item) && item["defect_id"] === defect.id)) : -1;
  const attempts = new Set(report.followup.attempts.map((attempt) => attempt.n));
  const followup = events.findLastIndex((event, index) => index > Math.max(finding, author)
    && (event.tool === "follow_up" || event.tool === "cli:follow-up")
    && typeof event.data["attempt"] === "number" && attempts.has(event.data["attempt"]));
  return { reading: related >= 0 ? related : firstReading, finding, decision: followup >= 0 ? followup : author, defect };
}

/** Locate the recorded evidence for a specific finding in the full report. */
export function findingTrail(report: Report, defect: Defect) {
  const { events } = report;
  const finding = events.findIndex(
    (event) => event.tool === "log_defect" && event.data["defect_id"] === defect.id,
  );
  if (finding < 0) return [];

  const readings = new Set(report.readings.readings
    .filter((reading) => reading.unitId === defect.unitId)
    .map((reading) => reading.id));
  const attempts = new Set(report.followup.attempts
    .filter((attempt) => attempt.defects.some((result) => result.defectId === defect.id))
    .map((attempt) => attempt.n));
  const reading = events.findLastIndex((event, index) => index < finding
    && event.tool === "record_reading" && typeof event.data["reading_id"] === "string"
    && readings.has(event.data["reading_id"]));
  const author = events.findLastIndex((event, index) => index > finding
    && event.tool === "record_rework" && Array.isArray(event.data["items"])
    && event.data["items"].some((item) => item && typeof item === "object"
      && !Array.isArray(item) && item["defect_id"] === defect.id));
  const followup = events.findLastIndex((event, index) => index > Math.max(finding, author)
    && (event.tool === "follow_up" || event.tool === "cli:follow-up")
    && typeof event.data["attempt"] === "number" && attempts.has(event.data["attempt"]));
  return [
    { index: reading, label: "Reader’s paraphrase" },
    { index: finding, label: "Finding logged" },
    { index: author, label: "Author’s decision" },
    { index: followup, label: "Follow-up result" },
  ].filter(({ index }) => index >= 0);
}

export function eventName(tool: string): string {
  const names: Record<string, string> = {
    open_inspection: "Inspection opened",
    get_packet: "Packet consulted",
    record_reading: "The Reader speaks",
    log_defect: "A defect surfaces",
    close_meeting: "Meeting closed",
    record_rework: "Author records rework",
    follow_up: "Follow-up",
    metrics: "Metrics measured",
    export_report: "Report exported",
  };
  return names[tool] ?? tool.replaceAll("_", " ");
}
export const fmt = (n: number | null): string =>
  n === null
    ? "Not measured"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(n);
