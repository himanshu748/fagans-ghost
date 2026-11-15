import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/core/metrics.js";
import type { Defect, Timestamps } from "../src/core/schema.js";

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
    const m = computeMetrics({ timestamps: base, changedLoc: 100, defects: [], attempts: [], rateWarnings: none, computedAt: base.planningStart });
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
      attempts: [],
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
      attempts: [],
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
      attempts: [],
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
      attempts: [],
      rateWarnings: none,
      computedAt: base.planningStart,
    });
    expect(m.inspectionRateLocPerHour).toBe(1 / (7000 / 3_600_000));
  });

  // Review v1 issue 1: rework time is the time spent in Rework, summed over
  // every Rework visit, and not `followupStart - reworkStart`.
  const major: Defect = {
    id: "D001",
    unitId: "U001",
    location: { file: "f.ts", side: "new", lineStart: 1, lineEnd: 1 },
    type: "logic",
    class: null,
    severity: "major",
    raisedBy: "inspector-logic",
    recordedBy: "scribe",
    description: "d",
    checklistItemId: null,
    loggedAt: "2026-11-15T10:40:00.000Z",
  };

  it("FM-R10.1 rework sums every Rework visit in a fail-then-pass loop", () => {
    const m = computeMetrics({
      // follow_up failed at 11:11 before any record_rework (11:15), so the
      // stored followupStart is earlier than reworkStart.
      timestamps: { ...base, reworkStart: "2026-11-15T11:15:00.000Z", followupStart: "2026-11-15T11:11:00.000Z", closedAt: "2026-11-15T11:31:00.000Z" },
      changedLoc: 100,
      defects: [major],
      attempts: [
        { at: "2026-11-15T11:11:00.000Z", passed: false },
        { at: "2026-11-15T11:31:00.000Z", passed: true },
      ],
      rateWarnings: none,
      computedAt: "2026-11-15T11:32:00.000Z",
    });
    expect(m.durationsMs.rework).toBe(30 * 60_000);
    expect(m.durationsMs.followup).toBe(0);
    expect(m.nullReasons.filter((r) => r.field.startsWith("durationsMs.r"))).toEqual([]);
  });

  it("FM-R10.1 FM-R10.3 follow-up time without defects, open and abandoned Rework", () => {
    const noDefects = computeMetrics({
      timestamps: { ...base, followupStart: base.meetingEnd, closedAt: "2026-11-15T11:06:00.000Z" },
      changedLoc: 100,
      defects: [],
      attempts: [{ at: "2026-11-15T11:06:00.000Z", passed: true }],
      rateWarnings: none,
      computedAt: "2026-11-15T11:07:00.000Z",
    });
    expect(noDefects.durationsMs.followup).toBe(5 * 60_000);
    expect(noDefects.durationsMs.rework).toBeNull();
    expect(noDefects.nullReasons).toContainEqual({ field: "durationsMs.rework", reason: "phase_not_reached" });

    const stillInRework = computeMetrics({
      timestamps: base,
      changedLoc: 100,
      defects: [major],
      attempts: [{ at: "2026-11-15T11:11:00.000Z", passed: false }],
      rateWarnings: none,
      computedAt: "2026-11-15T11:12:00.000Z",
    });
    expect(stillInRework.durationsMs.rework).toBeNull();
    expect(stillInRework.nullReasons).toContainEqual({ field: "durationsMs.rework", reason: "phase_not_reached" });

    const abandoned = computeMetrics({
      timestamps: { ...base, abandonedAt: "2026-11-15T11:21:00.000Z" },
      changedLoc: 100,
      defects: [major],
      attempts: [],
      rateWarnings: none,
      computedAt: "2026-11-15T11:22:00.000Z",
    });
    expect(abandoned.durationsMs.rework).toBe(20 * 60_000);
    expect(abandoned.durationsMs.followup).toBeNull();
  });
});
