// Pure tool operations over an InspectionState. Each one checks role, then
// phase, then input, and only then builds a new state, so a thrown FaganError
// means nothing changed (FM-R1.3). The store persists the returned state and
// event; the service layer (FEAT-003) adds git, the runner and the clock.
import { checkChecklistItem, checkDefectLocation, severityCounts } from "./defects.js";
import { FaganError } from "./errors.js";
import { blockingIds, evaluateDefect, exitPasses, fileChangedFn, openMajorIds } from "./followup.js";
import { computeMetrics, countByType } from "./metrics.js";
import { assertPhase, assertTransition, type PhaseOp } from "./phase.js";
import { judgmentFlags, nextId } from "./readings.js";
import { isValidWaiverReason, mergeReworkItems, validateReworkBatch, type ReworkInput } from "./rework.js";
import { assertRole } from "./roles.js";
import type {
  Checklist,
  CheckResult,
  Config,
  DefectStatus,
  DefectType,
  LineKind,
  Metrics,
  Phase,
  Severity,
} from "./schema.js";
import type { InspectionState, OpOutcome } from "./state.js";

function clone(state: InspectionState): InspectionState {
  return structuredClone(state);
}

function setPhase(state: InspectionState, to: Phase): void {
  assertTransition(state.inspection.phase, to);
  state.inspection.phase = to;
}

// ---------------------------------------------------------------- get_packet

export type PacketPhase = "overview" | "preparation" | "meeting";

export interface GetPacketInput {
  role: unknown;
  phase: PacketPhase;
  unitIds: readonly string[] | null;
  cursor: string | null;
  limit: number;
}

export interface PacketUnitView {
  unit_id: string;
  file: string;
  hunk_header: string;
  changed_loc: number;
  checklist_id: string;
  lines: Array<{ kind: LineKind; old_no: number | null; new_no: number | null; text: string }>;
}

export interface GetPacketResult {
  inspection_id: string;
  phase: Phase;
  units: PacketUnitView[];
  checklists: Record<string, { title: string; items: Array<{ id: string; question: string; type_hint: DefectType }> }>;
  next_cursor: string | null;
}

export function cursorFor(inspectionId: string, unitId: string): string {
  return `${inspectionId}:${unitId}`;
}

export function getPacket(
  state: InspectionState,
  input: GetPacketInput,
  at: string,
  checklists: ReadonlyMap<string, Checklist>,
): OpOutcome<GetPacketResult> {
  assertRole("get_packet", input.role);
  if (input.phase === "meeting") assertRole("get_packet:meeting", input.role);
  const op: PhaseOp = `get_packet:${input.phase}`;
  const phase = state.inspection.phase;
  assertPhase(op, phase);
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
    throw new FaganError("VALIDATION_ERROR", "limit must be an integer from 1 to 50", {
      issues: [{ path: "limit", message: "out of range" }],
    });
  }

  const { packet } = state;
  let selected = packet.units;
  if (input.unitIds !== null) {
    const unknown = input.unitIds.filter((id) => !packet.units.some((u) => u.id === id));
    if (unknown.length > 0) {
      throw new FaganError("UNKNOWN_UNIT", `unknown unit IDs: ${unknown.join(", ")}`, { unit_ids: unknown });
    }
    const wanted = new Set(input.unitIds);
    selected = packet.units.filter((u) => wanted.has(u.id));
  }
  let start = 0;
  if (input.cursor !== null) {
    const prefix = `${state.inspection.id}:`;
    const unitId = input.cursor.startsWith(prefix) ? input.cursor.slice(prefix.length) : null;
    const index = unitId === null ? -1 : selected.findIndex((u) => u.id === unitId);
    if (index < 0) throw new FaganError("INVALID_CURSOR", "cursor was not issued for this inspection and selection", {});
    start = index;
  }
  const page = selected.slice(start, start + input.limit);
  const after = selected[start + input.limit];
  const checklistOf = new Map(packet.files.map((f) => [f.path, f.checklist]));

  const units: PacketUnitView[] = page.map((u) => ({
    unit_id: u.id,
    file: u.file,
    hunk_header: u.hunkHeader,
    changed_loc: u.changedLoc,
    checklist_id: checklistOf.get(u.file) ?? "",
    lines: u.lines.map((l) => ({ kind: l.kind, old_no: l.oldNo, new_no: l.newNo, text: l.text })),
  }));
  const usedIds = [...new Set(units.map((u) => u.checklist_id))].sort();
  const checklistViews: GetPacketResult["checklists"] = {};
  for (const id of usedIds) {
    const c = checklists.get(id);
    if (c === undefined) throw new FaganError("CONFIG_INVALID", `checklist ${id} is not available`, { checklist: id });
    checklistViews[id] = {
      title: c.title,
      items: c.items.map((item) => ({ id: item.id, question: item.question, type_hint: item.typeHint })),
    };
  }

  const next = clone(state);
  if (input.phase === "preparation" && phase === "Overview") {
    setPhase(next, "Preparation");
    next.inspection.timestamps.preparationStart ??= at;
  }
  if (input.phase === "meeting" && phase === "Preparation") {
    setPhase(next, "Meeting");
    next.inspection.timestamps.meetingStart ??= at;
  }
  return {
    state: next,
    result: {
      inspection_id: state.inspection.id,
      phase: next.inspection.phase,
      units,
      checklists: checklistViews,
      next_cursor: after === undefined ? null : cursorFor(state.inspection.id, after.id),
    },
    event: {
      tool: "get_packet",
      role: input.role,
      data: { requested_phase: input.phase, units: units.map((u) => u.unit_id) },
    },
  };
}

// ---------------------------------------------------------------- record_reading

export interface RecordReadingInput {
  role: unknown;
  unitId: string;
  paraphrase: string;
}

export interface RecordReadingResult {
  reading_id: string;
  unit_id: string;
  judgment_flags: string[];
}

export function recordReading(
  state: InspectionState,
  input: RecordReadingInput,
  at: string,
  judgmentWords: readonly string[],
): OpOutcome<RecordReadingResult> {
  assertRole("record_reading", input.role);
  assertPhase("record_reading", state.inspection.phase);
  if (input.paraphrase.length < 1 || input.paraphrase.length > 4000) {
    throw new FaganError("VALIDATION_ERROR", "paraphrase must be 1 to 4000 characters", {
      issues: [{ path: "paraphrase", message: "length" }],
    });
  }
  if (!state.packet.units.some((u) => u.id === input.unitId)) {
    throw new FaganError("UNKNOWN_UNIT", `unit ${input.unitId} is not in the packet`, { unit_id: input.unitId });
  }
  if (state.readings.readings.some((r) => r.unitId === input.unitId)) {
    throw new FaganError("DUPLICATE_READING", `unit ${input.unitId} already has a reading`, { unit_id: input.unitId });
  }
  const id = nextId("R", state.readings.readings.map((r) => r.id));
  const flags = judgmentFlags(input.paraphrase, judgmentWords);
  const next = clone(state);
  next.readings.readings.push({
    id,
    unitId: input.unitId,
    paraphrase: input.paraphrase,
    judgmentFlags: flags,
    recordedAt: at,
  });
  return {
    state: next,
    result: { reading_id: id, unit_id: input.unitId, judgment_flags: flags },
    event: { tool: "record_reading", role: input.role, data: { reading_id: id, unit_id: input.unitId, judgment_flags: flags } },
  };
}

// ---------------------------------------------------------------- log_defect

export interface LogDefectInput {
  role: unknown;
  unitId: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  side: "new" | "old";
  type: DefectType;
  class: "missing" | "wrong" | "extra" | null;
  severity: Severity;
  raisedBy: string;
  description: string;
  checklistItemId: string | null;
}

export interface LogDefectResult {
  defect_id: string;
  counts: { major: number; minor: number };
}

const RAISERS = ["moderator", "reader", "inspector-logic", "inspector-interfaces", "author"] as const;

export function logDefect(
  state: InspectionState,
  input: LogDefectInput,
  at: string,
  checklists: ReadonlyMap<string, Checklist>,
): OpOutcome<LogDefectResult> {
  assertRole("log_defect", input.role);
  assertPhase("log_defect", state.inspection.phase);
  const raisedBy = RAISERS.find((r) => r === input.raisedBy);
  if (raisedBy === undefined) {
    throw new FaganError("VALIDATION_ERROR", `raised_by must be one of ${RAISERS.join(", ")}`, {
      issues: [{ path: "raised_by", message: "invalid enum value" }],
    });
  }
  if (input.description.length < 1 || input.description.length > 2000) {
    throw new FaganError("VALIDATION_ERROR", "description must be 1 to 2000 characters", {
      issues: [{ path: "description", message: "length" }],
    });
  }
  const unit = checkDefectLocation(state.packet, input);
  checkChecklistItem(state.packet, unit, input.checklistItemId, checklists);

  const id = nextId("D", state.defects.defects.map((d) => d.id));
  const next = clone(state);
  next.defects.defects.push({
    id,
    unitId: unit.id,
    location: { file: input.file, side: input.side, lineStart: input.lineStart, lineEnd: input.lineEnd },
    type: input.type,
    class: input.class,
    severity: input.severity,
    raisedBy,
    recordedBy: "scribe",
    description: input.description,
    checklistItemId: input.checklistItemId,
    loggedAt: at,
  });
  const counts = severityCounts(next.defects.defects);
  return {
    state: next,
    result: { defect_id: id, counts },
    event: {
      tool: "log_defect",
      role: input.role,
      data: { defect_id: id, unit_id: unit.id, severity: input.severity, type: input.type, raised_by: raisedBy },
    },
  };
}

// ---------------------------------------------------------------- close_meeting

export interface CloseMeetingResult {
  phase: "Rework" | "FollowUp";
  defects: { total: number; major: number; minor: number; by_type: Record<DefectType, number> };
  units_read: number;
  units_total: number;
  meeting_ms: number | null;
}

export function closeMeeting(
  state: InspectionState,
  input: { role: unknown; notes: string | null },
  at: string,
): OpOutcome<CloseMeetingResult> {
  assertRole("close_meeting", input.role);
  assertPhase("close_meeting", state.inspection.phase);
  if (input.notes !== null && input.notes.length > 4000) {
    throw new FaganError("VALIDATION_ERROR", "notes must be at most 4000 characters", {
      issues: [{ path: "notes", message: "too long" }],
    });
  }
  const read = new Set(state.readings.readings.map((r) => r.unitId));
  const missing = state.packet.units.filter((u) => !read.has(u.id)).map((u) => u.id);
  if (missing.length > 0) {
    throw new FaganError("UNREAD_UNITS", `${missing.length} unit(s) have no reading`, { unit_ids: missing });
  }
  const defects = state.defects.defects;
  const to = defects.length > 0 ? "Rework" : "FollowUp";
  const next = clone(state);
  setPhase(next, to);
  next.inspection.timestamps.meetingEnd ??= at;
  if (to === "FollowUp") next.inspection.timestamps.followupStart ??= at;
  next.inspection.meetingNotes = input.notes;
  const start = next.inspection.timestamps.meetingStart;
  const end = next.inspection.timestamps.meetingEnd;
  const counts = severityCounts(defects);
  const result: CloseMeetingResult = {
    phase: to,
    defects: { total: defects.length, ...counts, by_type: countByType(defects) },
    units_read: read.size,
    units_total: state.packet.units.length,
    meeting_ms: start === null ? null : Date.parse(end) - Date.parse(start),
  };
  return {
    state: next,
    result,
    event: { tool: "close_meeting", role: input.role, data: { phase: to, defects: defects.length } },
  };
}

// ---------------------------------------------------------------- record_rework

export interface RecordReworkResult {
  items: Array<{ defect_id: string; resolution: "fixed" | "waived"; recorded_at: string }>;
  open_majors: number;
}

export function recordRework(
  state: InspectionState,
  input: { role: unknown; items: readonly ReworkInput[] },
  at: string,
  waiverMinChars: number,
): OpOutcome<RecordReworkResult> {
  assertRole("record_rework", input.role);
  if (state.inspection.phase === "Closed") {
    throw new FaganError("ALREADY_CLOSED", "the inspection is closed", { phase: "Closed" });
  }
  assertPhase("record_rework", state.inspection.phase);
  validateReworkBatch(input.items, state.defects.defects, waiverMinChars);

  const added = input.items.map((item) => ({
    defectId: item.defectId,
    resolution: item.resolution,
    note: item.resolution === "fixed" ? item.note : null,
    reason: item.resolution === "waived" ? item.reason : null,
    recordedAt: at,
  }));
  const next = clone(state);
  next.inspection.timestamps.reworkStart ??= at;
  next.rework.items = mergeReworkItems(next.rework.items, added);
  const open = openMajorIds(next.defects.defects, next.rework.items, next.followup.attempts, waiverMinChars);
  return {
    state: next,
    result: {
      items: added.map((i) => ({ defect_id: i.defectId, resolution: i.resolution, recorded_at: i.recordedAt })),
      open_majors: open.length,
    },
    event: {
      tool: "record_rework",
      role: input.role,
      data: { items: added.map((i) => ({ defect_id: i.defectId, resolution: i.resolution, note: i.note, reason: i.reason })) },
    },
  };
}

// ---------------------------------------------------------------- follow_up

export interface FollowUpInput {
  role: unknown;
  checks: { build: CheckResult; tests: CheckResult };
  /** Current blob hash of each packet file (null when the file is gone). */
  currentBlobs: ReadonlyMap<string, string | null>;
}

export interface FollowUpResult {
  passed: boolean;
  phase: "Closed" | "Rework";
  checks: { build: CheckResult; tests: CheckResult };
  defects: Array<{ defect_id: string; severity: Severity; status: DefectStatus }>;
  blocking: string[];
}

export function followUp(
  state: InspectionState,
  input: FollowUpInput,
  at: string,
  config: Pick<Config, "requireLocationChange" | "waiverMinChars">,
): OpOutcome<FollowUpResult> {
  assertRole("follow_up", input.role);
  assertPhase("follow_up", state.inspection.phase);
  const checksPassed = input.checks.build.passed && input.checks.tests.passed;
  const ctx = {
    checksPassed,
    requireLocationChange: config.requireLocationChange,
    waiverMinChars: config.waiverMinChars,
    fileChanged: fileChangedFn(state.packet, input.currentBlobs),
  };
  const statuses = state.defects.defects.map((d) => ({
    defectId: d.id,
    severity: d.severity,
    status: evaluateDefect(
      d,
      state.rework.items.find((r) => r.defectId === d.id),
      ctx,
    ),
  }));
  const passed = exitPasses(statuses);
  const blocking = blockingIds(statuses);

  const next = clone(state);
  if (next.inspection.phase === "Rework") setPhase(next, "FollowUp");
  next.inspection.timestamps.followupStart ??= at;
  setPhase(next, passed ? "Closed" : "Rework");
  if (passed) next.inspection.timestamps.closedAt = at;
  const n = next.followup.attempts.length + 1;
  next.followup.attempts.push({ n, at, checks: input.checks, defects: statuses, blocking, passed });
  return {
    state: next,
    result: {
      passed,
      phase: passed ? "Closed" : "Rework",
      checks: input.checks,
      defects: statuses.map((s) => ({ defect_id: s.defectId, severity: s.severity, status: s.status })),
      blocking,
    },
    event: { tool: "follow_up", role: input.role, data: { attempt: n, passed, blocking } },
  };
}

// ---------------------------------------------------------------- metrics

export function metricsOp(
  state: InspectionState,
  at: string,
  rateWarnings: Config["rateWarnings"],
): OpOutcome<Metrics> {
  assertPhase("metrics", state.inspection.phase);
  const metrics = computeMetrics({
    timestamps: state.inspection.timestamps,
    changedLoc: state.packet.changedLoc,
    defects: state.defects.defects,
    rateWarnings,
    computedAt: at,
  });
  return { state, result: metrics, event: { tool: "metrics", role: null, data: {} } };
}

// ---------------------------------------------------------------- abandon (CLI only)

export function abandon(
  state: InspectionState,
  reason: string,
  at: string,
  waiverMinChars: number,
): OpOutcome<{ phase: "Abandoned" }> {
  assertPhase("abandon", state.inspection.phase);
  if (!isValidWaiverReason(reason, waiverMinChars)) {
    throw new FaganError("WAIVER_REASON_REQUIRED", `abandoning needs a reason of at least ${waiverMinChars} characters`, {
      min_chars: waiverMinChars,
    });
  }
  const next = clone(state);
  setPhase(next, "Abandoned");
  next.inspection.timestamps.abandonedAt = at;
  next.inspection.abandonReason = reason;
  return { state: next, result: { phase: "Abandoned" }, event: { tool: "cli:abandon", role: "human", data: { reason } } };
}
