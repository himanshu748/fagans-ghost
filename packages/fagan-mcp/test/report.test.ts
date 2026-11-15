import { describe, expect, it } from "vitest";
import { FaganError } from "../src/core/errors.js";
import { computeMetrics } from "../src/core/metrics.js";
import { closeMeeting, getPacket, logDefect, recordReading } from "../src/core/ops.js";
import { buildReport, parseReport, renderReportTxt, REPORT_WIDTH, serializeReport } from "../src/core/report.js";
import { SAMPLE_DIFF, sampleState, testChecklists, testConfig } from "./helpers.js";

function sampleReport() {
  const longLine = `${"x".repeat(150)}\tend`;
  const diff = SAMPLE_DIFF.replace("+Body", `+${longLine}`);
  let s = sampleState("insp-0001", diff);
  s = getPacket(s, { role: "reader", phase: "preparation", unitIds: null, cursor: null, limit: 20 }, "2026-11-15T10:01:00.000Z", testChecklists).state;
  s = getPacket(s, { role: "moderator", phase: "meeting", unitIds: null, cursor: null, limit: 20 }, "2026-11-15T10:10:00.000Z", testChecklists).state;
  s = recordReading(s, { role: "reader", unitId: "U001", paraphrase: `Adds a heading and a very long line. ${"word ".repeat(60)}\nSecond paragraph.` }, "2026-11-15T10:11:00.000Z", testConfig.judgmentWords).state;
  s = recordReading(s, { role: "reader", unitId: "U002", paraphrase: "Changes b and adds c; this should be checked." }, "2026-11-15T10:12:00.000Z", testConfig.judgmentWords).state;
  s = logDefect(
    s,
    {
      role: "scribe",
      unitId: "U002",
      file: "src/a.ts",
      lineStart: 2,
      lineEnd: 2,
      side: "new",
      type: "logic",
      class: "wrong",
      severity: "major",
      raisedBy: "inspector-logic",
      description: "b is 3 but callers expect 2. ".repeat(10),
      checklistItemId: "typescript-01",
    },
    "2026-11-15T10:13:00.000Z",
    testChecklists,
  ).state;
  s = closeMeeting(s, { role: "moderator", notes: null }, "2026-11-15T10:20:00.000Z").state;
  const metrics = computeMetrics({
    timestamps: s.inspection.timestamps,
    changedLoc: s.packet.changedLoc,
    defects: s.defects.defects,
    attempts: s.followup.attempts,
    rateWarnings: testConfig.rateWarnings,
    computedAt: "2026-11-15T10:21:00.000Z",
  });
  return buildReport({ state: s, metrics, events: [], checklists: testChecklists, generatorVersion: "0.0.0", exportedAt: "2026-11-15T10:21:00.000Z" });
}

describe("FM-R11 report", () => {
  it("FM-R11.3 FM-R11.4 round-trips and serializes byte-identically", () => {
    const r = sampleReport();
    const text = serializeReport(r);
    expect(parseReport(text)).toEqual(r);
    expect(serializeReport(parseReport(text))).toBe(text);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.startsWith('{\n  "schemaVersion": "fagan-report/1",\n  "generator"')).toBe(true);
    expect(r.checklists.map((c) => c.id)).toEqual(["docs", "typescript"]);
  });

  it("FM-R11.7 rejects other schema versions by name", () => {
    const text = serializeReport(sampleReport()).replace('"fagan-report/1"', '"fagan-report/2"');
    expect(() => parseReport(text)).toThrow(/fagan-report\/2/);
    expect(() => parseReport("not json")).toThrow(FaganError);
  });

  it("FM-R11.5 report.txt keeps every line within 132 characters and has every section", () => {
    const txt = renderReportTxt(sampleReport());
    const lines = txt.split("\n");
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(REPORT_WIDTH);
    expect(lines.some((l) => [...l].length === REPORT_WIDTH)).toBe(true);
    for (const heading of ["INSPECTION", "UNIT U001", "UNIT U002", "READER R001", "DEFECT LOG", "REWORK", "FOLLOW-UP", "METRICS", "END OF LISTING"]) {
      expect(txt).toContain(heading);
    }
    expect(txt).toMatch(/D001 +\s+2 \+ const b = 3;/);
    expect(txt).toContain("JUDGMENT WORDS FLAGGED: should");
    expect(txt).toContain("n/a (phase_not_reached)");
    expect(txt).not.toContain("\t");
    expect(lines.slice(0, 6).map((l) => l[0])).toEqual([":", ":", ":", " ", " ", " "]);
    expect(renderReportTxt(sampleReport())).toBe(txt);
  });
});
