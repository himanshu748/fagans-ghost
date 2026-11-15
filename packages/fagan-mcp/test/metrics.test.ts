import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/metrics.js";
import type { Timestamps } from "../src/core/schema.js";

const base: Timestamps = {
  planningStart: "2026-11-15T10:00:00.000Z",
  planningEnd: "2026-11-15T10:00:02.000Z",
  overviewStart: "2026-11-15T10:00:02.000Z",
  preparationStart: "2026-11-15T10:01:00.000Z",
  meetingStart: "2026-11-15T10:31:00.000Z",
  meetingEnd: "2026-11-15T11:01:00.000Z",
  reworkStart: null,
  followupStart: null,
  closedAt: null,
  abandonedAt: null,
};

const none = { maxPreparationLocPerHour: null, maxInspectionLocPerHour: null };

describe("FM-R10 metrics", () => {
  it("FM-R10.1 FM-R10.2 computes durations and rates from timestamps", () => {
    const m = computeMetrics({ timestamps: base, changedLoc: 100, defects: [], rateWarnings: none, computedAt: base.planningStart });
    expect(m.durationsMs).toEqual({ planning: 2000, overview: 58000, preparation: 1_800_000, meeting: 1_800_000, rework: null, followup: null });
    expect(m.preparationRateLocPerHour).toBe(200);
    expect(m.inspectionRateLocPerHour).toBe(200);
    expect(m.defectsPerKloc).toBe(0);
  });

  it("FM-R10.3 FM-R10.4 FM-R10.5 null reasons", () => {
    const m = computeMetrics({
      timestamps: { ...base, meetingStart: null, meetingEnd: null },
      changedLoc: 0,
      defects: [],
      rateWarnings: none,
      computedAt: base.planningStart,
    });
    const reasons = Object.fromEntries(m.nullReasons.map((r) => [r.field, r.reason]));
    expect(m.preparationRateLocPerHour).toBeNull();
    expect(reasons["preparationRateLocPerHour"]).toBe("phase_not_reached");
    expect(reasons["defectsPerKloc"]).toBe("zero_loc");
    expect(reasons["majorsPerKloc"]).toBe("zero_loc");

    const skew = computeMetrics({
      timestamps: { ...base, meetingEnd: base.meetingStart },
      changedLoc: 10,
      defects: [],
      rateWarnings: none,
      computedAt: base.planningStart,
    });
    expect(skew.inspectionRateLocPerHour).toBeNull();
    expect(skew.nullReasons).toContainEqual({ field: "inspectionRateLocPerHour", reason: "non_positive_duration" });
  });

  it("FM-R10.7 warns only when a limit is set and exceeded", () => {
    const m = computeMetrics({
      timestamps: base,
      changedLoc: 100,
      defects: [],
      rateWarnings: { maxPreparationLocPerHour: 150, maxInspectionLocPerHour: 500 },
      computedAt: base.planningStart,
    });
    expect(m.warnings.map((w) => w.code)).toEqual(["PREPARATION_RATE_ABOVE_LIMIT"]);
  });

  it("FM-R10.8 stores unrounded values", () => {
    const m = computeMetrics({
      timestamps: { ...base, meetingEnd: "2026-11-15T10:31:07.000Z" },
      changedLoc: 1,
      defects: [],
      rateWarnings: none,
      computedAt: base.planningStart,
    });
    expect(m.inspectionRateLocPerHour).toBe(1 / (7000 / 3_600_000));
  });
});
