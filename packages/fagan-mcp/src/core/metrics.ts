// Metrics from real timestamps (FM-R10.1 to FM-R10.8, PLAN.md section 9).
// Values are stored unrounded. Every number is finite or null with a reason.
import type { Attempt, ByType, Config, Defect, MetricField, Metrics, NullReason, Timestamps } from "./schema.js";

const MS_PER_HOUR = 3_600_000;

export interface MetricsInput {
  timestamps: Timestamps;
  changedLoc: number;
  defects: readonly Defect[];
  /** Follow-up attempts in order (`followup.json`); each one ends a Rework visit. */
  attempts: ReadonlyArray<Pick<Attempt, "at" | "passed">>;
  rateWarnings: Config["rateWarnings"];
  computedAt: string;
}

type Valued = { value: number; reason: null } | { value: null; reason: NullReason };

function ms(iso: string | null): number | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** `end - start` in ms, or null when either timestamp is missing. */
export function durationMs(start: string | null, end: string | null): Valued {
  const a = ms(start);
  const b = ms(end);
  if (a === null || b === null) return { value: null, reason: "phase_not_reached" };
  return { value: b - a, reason: null };
}

/** `loc / (duration / 1h)`; null for a missing or non-positive duration. */
export function ratePerHour(loc: number, duration: Valued): Valued {
  if (duration.value === null) return { value: null, reason: duration.reason };
  if (!(duration.value > 0)) return { value: null, reason: "non_positive_duration" };
  const rate = loc / (duration.value / MS_PER_HOUR);
  return Number.isFinite(rate) ? { value: rate, reason: null } : { value: null, reason: "non_positive_duration" };
}

/** `count / (loc / 1000)`; null when `loc` is zero. */
export function perKloc(count: number, loc: number): Valued {
  if (!(loc > 0)) return { value: null, reason: "zero_loc" };
  const v = count / (loc / 1000);
  return Number.isFinite(v) ? { value: v, reason: null } : { value: null, reason: "zero_loc" };
}

export function countByType(defects: readonly Defect[]): ByType {
  const out: ByType = { logic: 0, interface: 0, data: 0, documentation: 0, other: 0 };
  for (const d of defects) out[d.type]++;
  return out;
}

/**
 * Total time spent in Rework and in FollowUp (FM-R10.1, design.md "Metrics").
 * The phase after the meeting is Rework when the meeting logged defects, else
 * FollowUp, and it starts at `meetingEnd`. Each follow-up attempt ends the
 * current visit at its `at`; a call made from Rework passes through FollowUp
 * inside the call, so it adds a zero-length FollowUp visit. A failed attempt
 * starts a new Rework visit. A visit still open (the inspection is still in
 * that phase) makes the total `phase_not_reached`; abandoning ends the open
 * visit at `abandonedAt`. A phase never entered is `phase_not_reached`.
 */
export function reworkAndFollowupMs(
  t: Pick<Timestamps, "meetingEnd" | "abandonedAt">,
  meetingHadDefects: boolean,
  attempts: ReadonlyArray<Pick<Attempt, "at" | "passed">>,
): { rework: Valued; followup: Valued } {
  const notReached: Valued = { value: null, reason: "phase_not_reached" };
  const start = ms(t.meetingEnd);
  if (start === null) return { rework: notReached, followup: notReached };
  const total = { Rework: 0, FollowUp: 0 };
  const entered = { Rework: false, FollowUp: false };
  let phase: "Rework" | "FollowUp" | "Closed" = meetingHadDefects ? "Rework" : "FollowUp";
  let since = start;
  entered[phase] = true;
  for (const a of attempts) {
    if (phase === "Closed") break;
    const at = ms(a.at);
    if (at === null) return { rework: notReached, followup: notReached };
    total[phase] += at - since;
    entered.FollowUp = true;
    phase = a.passed ? "Closed" : "Rework";
    if (phase === "Rework") entered.Rework = true;
    since = at;
  }
  const open = { Rework: false, FollowUp: false };
  if (phase !== "Closed") {
    const end = ms(t.abandonedAt);
    if (end === null) open[phase] = true;
    else total[phase] += end - since;
  }
  const result = (p: "Rework" | "FollowUp"): Valued =>
    entered[p] && !open[p] && Number.isFinite(total[p]) ? { value: total[p], reason: null } : notReached;
  return { rework: result("Rework"), followup: result("FollowUp") };
}

export function computeMetrics(input: MetricsInput): Metrics {
  const t = input.timestamps;
  const loc = input.changedLoc;
  const later = reworkAndFollowupMs(t, input.defects.length > 0, input.attempts);
  const durations: Record<string, Valued> = {
    planning: durationMs(t.planningStart, t.planningEnd),
    overview: durationMs(t.overviewStart, t.preparationStart),
    preparation: durationMs(t.preparationStart, t.meetingStart),
    meeting: durationMs(t.meetingStart, t.meetingEnd),
    rework: later.rework,
    followup: later.followup,
  };
  const prep = ratePerHour(loc, durations["preparation"] as Valued);
  const insp = ratePerHour(loc, durations["meeting"] as Valued);
  const majors = input.defects.filter((d) => d.severity === "major").length;
  const dpk = perKloc(input.defects.length, loc);
  const mpk = perKloc(majors, loc);

  const nullReasons: Metrics["nullReasons"] = [];
  const note = (field: MetricField, v: Valued): number | null => {
    if (v.value === null) nullReasons.push({ field, reason: v.reason });
    // `x + 0` turns -0 into 0 and leaves every other number unchanged.
    return v.value === null ? null : v.value + 0;
  };
  const durationsMs = {
    planning: note("durationsMs.planning", durations["planning"] as Valued),
    overview: note("durationsMs.overview", durations["overview"] as Valued),
    preparation: note("durationsMs.preparation", durations["preparation"] as Valued),
    meeting: note("durationsMs.meeting", durations["meeting"] as Valued),
    rework: note("durationsMs.rework", durations["rework"] as Valued),
    followup: note("durationsMs.followup", durations["followup"] as Valued),
  };
  const preparationRateLocPerHour = note("preparationRateLocPerHour", prep);
  const inspectionRateLocPerHour = note("inspectionRateLocPerHour", insp);
  const defectsPerKloc = note("defectsPerKloc", dpk);
  const majorsPerKloc = note("majorsPerKloc", mpk);

  const warnings: Metrics["warnings"] = [];
  const maxPrep = input.rateWarnings.maxPreparationLocPerHour;
  if (maxPrep !== null && preparationRateLocPerHour !== null && preparationRateLocPerHour > maxPrep) {
    warnings.push({
      code: "PREPARATION_RATE_ABOVE_LIMIT",
      message: `preparation rate ${preparationRateLocPerHour.toFixed(2)} LOC/h is above the configured limit ${maxPrep}; too fast to be a real reading`,
    });
  }
  const maxInsp = input.rateWarnings.maxInspectionLocPerHour;
  if (maxInsp !== null && inspectionRateLocPerHour !== null && inspectionRateLocPerHour > maxInsp) {
    warnings.push({
      code: "INSPECTION_RATE_ABOVE_LIMIT",
      message: `inspection rate ${inspectionRateLocPerHour.toFixed(2)} LOC/h is above the configured limit ${maxInsp}`,
    });
  }

  return {
    schemaVersion: "fagan-metrics/1",
    computedAt: input.computedAt,
    changedLoc: loc,
    durationsMs,
    preparationRateLocPerHour,
    inspectionRateLocPerHour,
    defectsPerKloc,
    majorsPerKloc,
    defects: { total: input.defects.length, major: majors, minor: input.defects.length - majors },
    byType: countByType(input.defects),
    nullReasons,
    warnings,
  };
}
