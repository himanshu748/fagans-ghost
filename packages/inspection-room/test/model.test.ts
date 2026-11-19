import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  atEvent,
  defectStatus,
  loadReport,
  MAX_BYTES,
  replayHighlights,
  reportUrl,
} from "../src/model.js";
const text = readFileSync(
  new URL("../public/demo/report.json", import.meta.url),
  "utf8",
);
const report = loadReport(text);
describe("Inspection Room report boundary", () => {
  it("IR-R1 accepts the actual export, rejects malformed/version/schema inputs", () => {
    expect(report.inspection.id).toBe("insp-0001");
    expect(() => loadReport("no")).toThrow("not valid JSON");
    expect(() => loadReport('{"schemaVersion":"future/2"}')).toThrow(
      "unsupported",
    );
    expect(() => loadReport('{"schemaVersion":"fagan-report/1"}')).toThrow(
      "does not match",
    );
    expect(() => loadReport(" ".repeat(MAX_BYTES + 1))).toThrow("10 MiB");
    const invalidDate = structuredClone(report);
    invalidDate.events[0]!.at = '2026-99-17T05:00:00.000Z';
    expect(() => loadReport(JSON.stringify(invalidDate))).toThrow('calendar timestamp');
  });
  it("IR-R9 refuses external/credential/data URLs and keeps nested relative paths", () => {
    const base = "https://example.org/fagans-ghost/";
    expect(reportUrl("demo/report.json", base).href).toBe(
      `${base}demo/report.json`,
    );
    for (const url of [
      "https://evil.test/report.json",
      "//evil.test/x",
      "data:application/json,{}",
      "https://user:pw@example.org/x",
    ])
      expect(() => reportUrl(url, base)).toThrow("Only report URLs");
  });
  it("IR-R4 never reveals future readings or defects, and clamps cursor bounds", () => {
    const first = atEvent(report, -10);
    expect(first.readings).toEqual([]);
    expect(first.defects).toEqual([]);
    const readingIndex = report.events.findIndex(
      (e) => e.tool === "record_reading",
    );
    expect(atEvent(report, readingIndex).readings.length).toBeGreaterThan(0);
    expect(atEvent(report, readingIndex).unit?.id).toBe(
      report.events[readingIndex]?.data["unit_id"],
    );
    const end = atEvent(report, 10000);
    expect(end.defects).toEqual(report.defects.defects);
    expect(end.readings).toEqual(report.readings.readings);
  });
  it("IR-R5 keeps a recorded open major open and unreached follow-up absent", () => {
    const defect = report.defects.defects[0]!;
    expect(
      defectStatus(
        report,
        defect,
        report.events.findIndex((e) => e.tool === "log_defect"),
      ),
    ).toBe("Open");
    expect(atEvent(report, 0).attempt).toBeUndefined();
  });
  it("IR-R14 follows the same finding through its recorded reading and decision", () => {
    const highlights = replayHighlights(report);
    expect(report.events[highlights.reading]?.data["reading_id"]).toBe("R023");
    expect(report.events[highlights.finding]?.data["defect_id"]).toBe("D001");
    expect(report.events[highlights.decision]?.tool).toBe("follow_up");

    const partial = structuredClone(report);
    partial.events = partial.events.slice(0, highlights.finding + 1);
    partial.rework.items = [];
    partial.followup.attempts = [];
    expect(replayHighlights(partial).decision).toBe(-1);
    expect(replayHighlights(partial).finding).toBe(highlights.finding);
  });
  it("IR-R5 replays the actual Author waiver and passing follow-up", () => {
    const defect = report.defects.defects[0]!;
    const decision = report.events.findIndex(e => e.tool === 'record_rework');
    const followup = report.events.findIndex(e => e.tool === 'follow_up');
    expect(report.inspection.phase).toBe('Closed');
    expect(defectStatus(report, defect, decision - 1)).toBe('Open');
    expect(defectStatus(report, defect, decision)).toBe('Bound by the Author: waived');
    expect(atEvent(report, followup - 1).attempt).toBeUndefined();
    expect(atEvent(report, followup).attempt?.passed).toBe(true);
    expect(atEvent(report, followup).attempt?.defects[0]?.status).toBe('waived');
    expect(report.rework.items[0]?.reason).toBe('False positive: Git requires a separate -C argument and rejects the alleged attached form');
  });
  it("IR-R1 rejects duplicate units, missing references and reordered events", () => {
    const duplicate = structuredClone(report);
    duplicate.packet.units.push(duplicate.packet.units[0]!);
    expect(() => loadReport(JSON.stringify(duplicate))).toThrow("duplicate");
    const orphan = structuredClone(report);
    orphan.readings.readings[0]!.unitId = "U999";
    expect(() => loadReport(JSON.stringify(orphan))).toThrow(
      "missing reading unit",
    );
    const reordered = structuredClone(report);
    reordered.events.reverse();
    expect(() => loadReport(JSON.stringify(reordered))).toThrow(
      "chronological",
    );
  });
  it("IR-R4 uses event sequence when timestamps tie", () => {
    const tied = structuredClone(report);
    const at = tied.events[0]!.at;
    tied.events.forEach((e) => (e.at = at));
    tied.readings.readings.forEach((r) => (r.recordedAt = at));
    tied.defects.defects.forEach((d) => (d.loggedAt = at));
    expect(atEvent(tied, 0).readings).toEqual([]);
    expect(atEvent(tied, 0).defects).toEqual([]);
    const first = tied.events.findIndex((e) => e.tool === "record_reading");
    expect(atEvent(tied, first).readings).toHaveLength(1);
  });
  it("IR-R5 shows Author rework only when recorded, never invents verification", () => {
    const fixture = structuredClone(report);
    // Build a test-only pre-adjudication snapshot even after the genuine demo closes.
    const adjudication = fixture.events.findIndex(e => e.tool === 'record_rework' || e.tool === 'follow_up');
    if (adjudication >= 0) fixture.events.splice(adjudication);
    fixture.rework.items = [];
    fixture.followup.attempts = [];
    const before = fixture.events.length - 1;
    const defect = fixture.defects.defects[0]!;
    const at = fixture.exportedAt;
    fixture.events.push({
      seq: 999,
      at,
      tool: "record_rework",
      role: "author",
      phase: "Rework",
      data: {
        items: [
          {
            defect_id: defect.id,
            resolution: "fixed",
            note: "Synthetic unit test only",
            reason: null,
          },
        ],
      },
    });
    expect(defectStatus(fixture, defect, before)).toBe("Open");
    expect(defectStatus(fixture, defect, before + 1)).toBe(
      "Fixed, awaiting verification",
    );
    fixture.events.push({
      seq: 1000,
      at,
      tool: "record_rework",
      role: "author",
      phase: "Rework",
      data: {
        items: [
          {
            defect_id: defect.id,
            resolution: "waived",
            note: null,
            reason: "Synthetic unit test only",
          },
        ],
      },
    });
    expect(defectStatus(fixture, defect, before + 1)).toBe(
      "Fixed, awaiting verification",
    );
    expect(defectStatus(fixture, defect, before + 2)).toBe(
      "Bound by the Author: waived",
    );
    // Test-only transitions: a later fixed claim is not an earlier waiver,
    // and only the matching follow-up event can reveal verification.
    fixture.events.push({ ...fixture.events[before + 1]!, seq: 1001 });
    expect(defectStatus(fixture, defect, before + 3)).toBe('Fixed, awaiting verification');
    const check = { ran: true, passed: true, exitCode: 0, durationMs: 1 };
    fixture.followup.attempts.push({ n: 1, at, checks: {build: check, tests: check}, defects: [{defectId: defect.id, severity: 'major', status: 'verified'}], blocking: [], passed: true, blobs: [] });
    fixture.events.push({seq: 1002, at, tool: 'follow_up', role: 'moderator', phase: 'Closed', data: {attempt: 1, passed: true, blocking: []}});
    expect(defectStatus(fixture, defect, before + 3)).toBe('Fixed, awaiting verification');
    expect(defectStatus(fixture, defect, before + 4)).toBe('Exorcised: fixed and verified');
    fixture.events.push({...fixture.events[before + 1]!, seq: 1003});
    expect(defectStatus(fixture, defect, before + 5)).toBe('Fixed, awaiting verification');
  });
});
