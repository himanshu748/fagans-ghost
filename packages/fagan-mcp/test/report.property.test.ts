import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseReport, renderReportTxt, REPORT_WIDTH, serializeReport } from "../src/core/report.js";
import {
  DEFECT_STATUSES,
  DEFECT_TYPES,
  EVENT_TOOLS,
  FILE_STATUSES,
  METRIC_FIELDS,
  NULL_REASONS,
  PHASES,
  RAISED_BY_ROLES,
  ROLES,
  hasNegativeZero,
  hasProtoKey,
  type CheckResult,
  type Report,
} from "../src/core/schema.js";

const pad3 = (n: number): string => String(n).padStart(3, "0");
const iso = fc
  .date({ min: new Date("2000-01-01T00:00:00.000Z"), max: new Date("2100-01-01T00:00:00.000Z"), noInvalidDate: true })
  .map((d) => d.toISOString());
const text = (min = 0, max = 40): fc.Arbitrary<string> => fc.string({ unit: "binary", minLength: min, maxLength: max });
const sha = fc.stringMatching(/^[0-9a-f]{40}$/);
const nat = fc.nat({ max: 1_000_000 });
const num = fc.option(
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Object.is(n, -0)),
  { nil: null },
);

const checkArb: fc.Arbitrary<CheckResult> = fc.record({
  ran: fc.boolean(),
  passed: fc.boolean(),
  exitCode: fc.option(fc.integer({ min: -255, max: 255 }), { nil: null }),
  durationMs: fc.option(nat, { nil: null }),
});

/** Arrays of records that the serializer sorts are generated in ID order, as the store keeps them. */
const reportArb: fc.Arbitrary<Report> = fc
  .record({
    nUnits: fc.integer({ min: 0, max: 4 }),
    nDefects: fc.integer({ min: 0, max: 4 }),
    nChecklists: fc.integer({ min: 0, max: 3 }),
  })
  .chain(({ nUnits, nDefects, nChecklists }) => {
    const unitIds = Array.from({ length: nUnits }, (_, i) => `U${pad3(i + 1)}`);
    const defectIds = Array.from({ length: nDefects }, (_, i) => `D${pad3(i + 1)}`);
    const unitId = unitIds.length > 0 ? fc.constantFrom(...unitIds) : fc.constant("U001");
    const line = fc.record({
      kind: fc.constantFrom("add" as const, "del" as const, "ctx" as const),
      oldNo: fc.option(fc.integer({ min: 1, max: 1e6 }), { nil: null }),
      newNo: fc.option(fc.integer({ min: 1, max: 1e6 }), { nil: null }),
      text: text(),
    });
    return fc.record({
      schemaVersion: fc.constant("fagan-report/1" as const),
      generator: fc.record({ name: fc.constant("fagan-mcp" as const), version: text(1, 10) }),
      exportedAt: iso,
      inspection: fc.record({
        schemaVersion: fc.constant("fagan-inspection/1" as const),
        id: fc.stringMatching(/^insp-[0-9]{4}$/),
        title: text(1, 60),
        range: fc.record({ base: text(1, 20), head: text(1, 20), baseSha: sha, headSha: fc.option(sha, { nil: null }) }),
        phase: fc.constantFrom(...PHASES),
        timestamps: fc.record({
          planningStart: iso,
          planningEnd: iso,
          overviewStart: iso,
          preparationStart: fc.option(iso, { nil: null }),
          meetingStart: fc.option(iso, { nil: null }),
          meetingEnd: fc.option(iso, { nil: null }),
          reworkStart: fc.option(iso, { nil: null }),
          followupStart: fc.option(iso, { nil: null }),
          closedAt: fc.option(iso, { nil: null }),
          abandonedAt: fc.option(iso, { nil: null }),
        }),
        entry: fc.record({
          build: checkArb,
          tests: checkArb,
          size: fc.record({ changedLoc: nat, limit: fc.integer({ min: 1, max: 1e6 }), passed: fc.boolean() }),
        }),
        authorOverview: fc.option(text(0, 200), { nil: null }),
        meetingNotes: fc.option(text(0, 200), { nil: null }),
        abandonReason: fc.option(text(), { nil: null }),
      }),
      packet: fc.record({
        schemaVersion: fc.constant("fagan-packet/1" as const),
        changedLoc: nat,
        files: fc.array(
          fc.record({
            path: text(1, 30),
            oldPath: fc.option(text(1, 30), { nil: null }),
            status: fc.constantFrom(...FILE_STATUSES),
            blobBefore: fc.option(sha, { nil: null }),
            blobAfter: fc.option(sha, { nil: null }),
            checklist: text(1, 10),
            skipped: fc.constantFrom(null, "binary" as const, "excluded" as const),
          }),
          { maxLength: 4 },
        ),
        units: fc.tuple(
          ...unitIds.map((id) =>
            fc.record({
              id: fc.constant(id),
              file: text(1, 30),
              hunkHeader: text(1, 30),
              changedLoc: fc.integer({ min: 1, max: 500 }),
              lines: fc.array(line, { minLength: 1, maxLength: 6 }),
            }),
          ),
        ),
      }),
      checklists: fc.tuple(
        ...Array.from({ length: nChecklists }, (_, i) =>
          fc.record({
            schemaVersion: fc.constant("fagan-checklist/1" as const),
            id: fc.constant(`list-${i + 1}`),
            title: text(1, 20),
            items: fc
              .array(fc.record({ question: text(1, 40), typeHint: fc.constantFrom(...DEFECT_TYPES) }), { minLength: 1, maxLength: 3 })
              .map((items) => items.map((it, j) => ({ id: `item-${j + 1}`, ...it }))),
          }),
        ),
      ),
      readings: fc.record({
        schemaVersion: fc.constant("fagan-readings/1" as const),
        readings: fc
          .array(fc.record({ unitId, paraphrase: text(1, 200), judgmentFlags: fc.array(text(1, 10), { maxLength: 3 }), recordedAt: iso }), {
            maxLength: 4,
          })
          .map((rs) => rs.map((r, i) => ({ id: `R${pad3(i + 1)}`, ...r }))),
      }),
      defects: fc.record({
        schemaVersion: fc.constant("fagan-defects/1" as const),
        defects: fc.tuple(
          ...defectIds.map((id) =>
            fc.record({
              id: fc.constant(id),
              unitId,
              location: fc.record({
                file: text(1, 30),
                side: fc.constantFrom("new" as const, "old" as const),
                lineStart: fc.integer({ min: 1, max: 1e6 }),
                lineEnd: fc.integer({ min: 1, max: 1e6 }),
              }),
              type: fc.constantFrom(...DEFECT_TYPES),
              class: fc.constantFrom(null, "missing" as const, "wrong" as const, "extra" as const),
              severity: fc.constantFrom("major" as const, "minor" as const),
              raisedBy: fc.constantFrom(...RAISED_BY_ROLES),
              recordedBy: fc.constant("scribe" as const),
              description: text(1, 200),
              checklistItemId: fc.option(text(1, 10), { nil: null }),
              loggedAt: iso,
            }),
          ),
        ),
      }),
      rework: fc.record({
        schemaVersion: fc.constant("fagan-rework/1" as const),
        items: fc.subarray(defectIds).chain((ids) =>
          fc.tuple(
            ...ids.map((defectId) =>
              fc.record({
                defectId: fc.constant(defectId),
                resolution: fc.constantFrom("fixed" as const, "waived" as const),
                note: fc.option(text(), { nil: null }),
                reason: fc.option(text(), { nil: null }),
                recordedAt: iso,
              }),
            ),
          ),
        ),
      }),
      followup: fc.record({
        schemaVersion: fc.constant("fagan-followup/1" as const),
        attempts: fc
          .array(
            fc.record({
              at: iso,
              checks: fc.record({ build: checkArb, tests: checkArb }),
              defects: fc.subarray(defectIds).chain((ids) =>
                fc.tuple(
                  ...ids.map((defectId) =>
                    fc.record({
                      defectId: fc.constant(defectId),
                      severity: fc.constantFrom("major" as const, "minor" as const),
                      status: fc.constantFrom(...DEFECT_STATUSES),
                    }),
                  ),
                ),
              ),
              blocking: fc.subarray(defectIds),
              passed: fc.boolean(),
            }),
            { maxLength: 3 },
          )
          .map((as) => as.map((a, i) => ({ n: i + 1, ...a }))),
      }),
      metrics: fc.record({
        schemaVersion: fc.constant("fagan-metrics/1" as const),
        computedAt: iso,
        changedLoc: nat,
        durationsMs: fc.record({ planning: num, overview: num, preparation: num, meeting: num, rework: num, followup: num }),
        preparationRateLocPerHour: num,
        inspectionRateLocPerHour: num,
        defectsPerKloc: num,
        majorsPerKloc: num,
        defects: fc.record({ total: nat, major: nat, minor: nat }),
        byType: fc.record({ logic: nat, interface: nat, data: nat, documentation: nat, other: nat }),
        nullReasons: fc.array(fc.record({ field: fc.constantFrom(...METRIC_FIELDS), reason: fc.constantFrom(...NULL_REASONS) }), { maxLength: 4 }),
        warnings: fc.array(fc.record({ code: text(1, 20), message: text(1, 60) }), { maxLength: 2 }),
      }),
      events: fc
        .array(
          fc.record({
            at: iso,
            tool: fc.constantFrom(...EVENT_TOOLS),
            role: fc.constantFrom(null, "human" as const, ...ROLES),
            phase: fc.constantFrom(...PHASES),
            data: fc
              .dictionary(fc.oneof(fc.string(), fc.constantFrom("__proto__", "constructor", "toString")), fc.jsonValue(), { maxKeys: 4 })
              .filter((d) => !hasProtoKey(d) && !hasNegativeZero(d)),
          }),
          { maxLength: 5 },
        )
        .map((es) => es.map((e, i) => ({ seq: i + 1, ...e }))),
    });
  }) as fc.Arbitrary<Report>;

describe("report properties", () => {
  it("FM-R11.3 FM-R11.4 report round-trips and is byte-stable", () => {
    fc.assert(
      fc.property(reportArb, (model) => {
        const first = serializeReport(model);
        const parsed = parseReport(first);
        expect(parsed).toEqual(model);
        expect(serializeReport(parsed)).toBe(first);
        expect(serializeReport(model)).toBe(first);
      }),
      { numRuns: 300 },
    );
  });

  it("FM-R11.3 a metric of negative zero is rejected instead of coming back as 0", () => {
    fc.assert(
      fc.property(reportArb, (model) => {
        const bad = structuredClone(model);
        bad.metrics.durationsMs.planning = -0;
        expect(() => serializeReport(bad)).toThrow(/negative zero/);
      }),
      { numRuns: 50 },
    );
  });

  it("FM-R11.3 event data containing negative zero is rejected instead of coming back as 0", () => {
    fc.assert(
      fc.property(reportArb, fc.jsonValue(), (model, value) => {
        const bad = structuredClone(model);
        const data = { value, nested: [{ n: -0 }] };
        bad.events = [...bad.events, { seq: bad.events.length + 1, at: model.exportedAt, tool: "metrics", role: null, phase: "Planning", data: data as never }];
        expect(() => serializeReport(bad)).toThrow(/negative zero/);
      }),
      { numRuns: 50 },
    );
  });

  it("FM-R11.3 event data with a __proto__ key is rejected instead of silently dropped", () => {
    fc.assert(
      fc.property(reportArb, fc.jsonValue(), (model, value) => {
        const bad = structuredClone(model);
        const data: Record<string, unknown> = {};
        Object.defineProperty(data, "__proto__", { value, enumerable: true, writable: true, configurable: true });
        bad.events = [...bad.events, { seq: bad.events.length + 1, at: model.exportedAt, tool: "metrics", role: null, phase: "Planning", data: data as never }];
        expect(() => serializeReport(bad)).toThrow(/__proto__/);
        const raw = JSON.parse(serializeReport(model)) as { events: unknown[] };
        raw.events = [JSON.parse(`{"seq":1,"at":"2000-01-01T00:00:00.000Z","tool":"metrics","role":null,"phase":"Planning","data":{"__proto__":${JSON.stringify(value)}}}`)];
        expect(() => parseReport(JSON.stringify(raw))).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("FM-R11.5 report.txt lines never exceed 132 characters", () => {
    fc.assert(
      fc.property(reportArb, (model) => {
        for (const line of renderReportTxt(model).split("\n")) {
          expect([...line].length).toBeLessThanOrEqual(REPORT_WIDTH);
        }
      }),
      { numRuns: 200 },
    );
  });
});
