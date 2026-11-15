import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/metrics.js";
import { MetricsSchema, METRIC_FIELDS, type Defect, type Timestamps } from "../src/core/schema.js";

const MIN = new Date("1970-01-01T00:00:00.000Z");
const MAX = new Date("9999-12-31T23:59:59.999Z");
const iso = fc.date({ min: MIN, max: MAX, noInvalidDate: true }).map((d) => d.toISOString());
const maybeIso = fc.option(iso, { nil: null });

const timestampsArb: fc.Arbitrary<Timestamps> = fc.record({
  planningStart: iso,
  planningEnd: iso,
  overviewStart: iso,
  preparationStart: maybeIso,
  meetingStart: maybeIso,
  meetingEnd: maybeIso,
  reworkStart: maybeIso,
  followupStart: maybeIso,
  closedAt: maybeIso,
  abandonedAt: maybeIso,
});

/** Timestamps that are often equal to each other, to hit zero durations. */
const clusteredTimestampsArb: fc.Arbitrary<Timestamps> = fc
  .tuple(fc.array(iso, { minLength: 1, maxLength: 2 }), fc.array(fc.nat(), { minLength: 10, maxLength: 10 }), fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }))
  .map(([pool, picks, present]) => {
    const pick = (i: number): string => pool[(picks[i] ?? 0) % pool.length] as string;
    const opt = (i: number): string | null => (present[i - 3] ? pick(i) : null);
    return {
      planningStart: pick(0),
      planningEnd: pick(1),
      overviewStart: pick(2),
      preparationStart: opt(3),
      meetingStart: opt(4),
      meetingEnd: opt(5),
      reworkStart: opt(6),
      followupStart: opt(7),
      closedAt: opt(8),
      abandonedAt: opt(9),
    };
  });

const locArb = fc.oneof(fc.constant(0), fc.nat({ max: 5000 }), fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }));

function defect(i: number, severity: "major" | "minor"): Defect {
  return {
    id: `D${String(i + 1).padStart(3, "0")}`,
    unitId: "U001",
    location: { file: "f.ts", side: "new", lineStart: 1, lineEnd: 1 },
    type: "logic",
    class: null,
    severity,
    raisedBy: "inspector-logic",
    recordedBy: "scribe",
    description: "d",
    checklistItemId: null,
    loggedAt: "2026-11-15T10:00:00.000Z",
  };
}

const defectsArb = fc.array(fc.constantFrom("major" as const, "minor" as const), { maxLength: 30 }).map((s) => s.map((sev, i) => defect(i, sev)));
const limitArb = fc.option(fc.double({ min: 0.001, max: 1e12, noNaN: true }), { nil: null });

function valueOf(m: ReturnType<typeof computeMetrics>, field: (typeof METRIC_FIELDS)[number]): number | null {
  if (field.startsWith("durationsMs.")) {
    return m.durationsMs[field.slice("durationsMs.".length) as keyof typeof m.durationsMs];
  }
  return m[field as "preparationRateLocPerHour" | "inspectionRateLocPerHour" | "defectsPerKloc" | "majorsPerKloc"];
}

describe("metrics properties", () => {
  it("FM-R10.3 FM-R10.4 FM-R10.5 metrics are finite or null with a reason", () => {
    fc.assert(
      fc.property(
        fc.oneof(timestampsArb, clusteredTimestampsArb),
        locArb,
        defectsArb,
        limitArb,
        limitArb,
        (timestamps, changedLoc, defects, maxPrep, maxInsp) => {
          const m = computeMetrics({
            timestamps,
            changedLoc,
            defects,
            rateWarnings: { maxPreparationLocPerHour: maxPrep, maxInspectionLocPerHour: maxInsp },
            computedAt: "2026-11-15T10:00:00.000Z",
          });
          for (const field of METRIC_FIELDS) {
            const v = valueOf(m, field);
            const reasons = m.nullReasons.filter((r) => r.field === field);
            if (v === null) {
              expect(reasons, field).toHaveLength(1);
            } else {
              expect(Number.isFinite(v), `${field}=${v}`).toBe(true);
              expect(reasons, field).toHaveLength(0);
            }
          }
          if (changedLoc === 0) {
            expect(m.defectsPerKloc).toBeNull();
            expect(m.nullReasons).toContainEqual({ field: "defectsPerKloc", reason: "zero_loc" });
          }
          expect(MetricsSchema.safeParse(m).success).toBe(true);
          expect(JSON.parse(JSON.stringify(m))).toEqual(m);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("FM-R10.6 rates never increase as duration grows", () => {
    const t0 = Date.parse("2026-01-01T00:00:00.000Z");
    const at = (ms: number): string => new Date(t0 + ms).toISOString();
    fc.assert(
      fc.property(
        locArb,
        fc.integer({ min: 1, max: 10 * 365 * 24 * 3_600_000 }),
        fc.integer({ min: 0, max: 10 * 365 * 24 * 3_600_000 }),
        (changedLoc, d1, extra) => {
          const d2 = d1 + extra;
          const run = (d: number) =>
            computeMetrics({
              timestamps: {
                planningStart: at(0),
                planningEnd: at(0),
                overviewStart: at(0),
                preparationStart: at(0),
                meetingStart: at(d),
                meetingEnd: at(2 * d),
                reworkStart: null,
                followupStart: null,
                closedAt: null,
                abandonedAt: null,
              },
              changedLoc,
              defects: [],
              rateWarnings: { maxPreparationLocPerHour: null, maxInspectionLocPerHour: null },
              computedAt: at(0),
            });
          const a = run(d1);
          const b = run(d2);
          expect(a.preparationRateLocPerHour).not.toBeNull();
          expect(a.inspectionRateLocPerHour).not.toBeNull();
          expect(a.preparationRateLocPerHour as number).toBeGreaterThanOrEqual(b.preparationRateLocPerHour as number);
          expect(a.inspectionRateLocPerHour as number).toBeGreaterThanOrEqual(b.inspectionRateLocPerHour as number);
        },
      ),
      { numRuns: 500 },
    );
  });
});
