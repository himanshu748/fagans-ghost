// Inspection phase state machine (FM-R1.1, FM-R1.2, FM-R1.4, design.md "Phase rules").
import { FaganError } from "./errors.js";
import type { Phase } from "./schema.js";

export const TERMINAL_PHASES: readonly Phase[] = ["Closed", "Abandoned"];
export const NON_TERMINAL_PHASES: readonly Phase[] = [
  "Planning",
  "Overview",
  "Preparation",
  "Meeting",
  "Rework",
  "FollowUp",
];
const ALL_PHASES: readonly Phase[] = [...NON_TERMINAL_PHASES, ...TERMINAL_PHASES];

/** Operations that the phase table governs. `get_packet` is split by its `phase` argument. */
export type PhaseOp =
  | "get_packet:overview"
  | "get_packet:preparation"
  | "get_packet:meeting"
  | "record_reading"
  | "log_defect"
  | "close_meeting"
  | "record_rework"
  | "follow_up"
  | "metrics"
  | "export_report"
  | "abandon";

export const ALLOWED_PHASES: Readonly<Record<PhaseOp, readonly Phase[]>> = {
  "get_packet:overview": ALL_PHASES,
  "get_packet:preparation": ["Overview", "Preparation", "Meeting", "Rework", "FollowUp"],
  "get_packet:meeting": ["Preparation", "Meeting", "Rework", "FollowUp"],
  record_reading: ["Meeting"],
  log_defect: ["Meeting"],
  close_meeting: ["Meeting"],
  record_rework: ["Rework"],
  follow_up: ["Rework", "FollowUp"],
  metrics: ALL_PHASES,
  export_report: ALL_PHASES,
  abandon: NON_TERMINAL_PHASES,
};

/** Every allowed phase change (FM-R1.1). Abandoned is reachable from any non-terminal phase. */
export const TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  Planning: ["Overview", "Abandoned"],
  Overview: ["Preparation", "Abandoned"],
  Preparation: ["Meeting", "Abandoned"],
  Meeting: ["Rework", "FollowUp", "Abandoned"],
  Rework: ["FollowUp", "Abandoned"],
  FollowUp: ["Closed", "Rework", "Abandoned"],
  Closed: [],
  Abandoned: [],
};

export function isTerminal(phase: Phase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

export function isAllowed(op: PhaseOp, phase: Phase): boolean {
  return ALLOWED_PHASES[op].includes(phase);
}

/** Throws `WRONG_PHASE` with the current and allowed phases (FM-R1.2). */
export function assertPhase(op: PhaseOp, phase: Phase): void {
  if (!isAllowed(op, phase)) {
    throw new FaganError("WRONG_PHASE", `${op} is not allowed in phase ${phase}`, {
      phase,
      allowed: [...ALLOWED_PHASES[op]],
    });
  }
}

export function canTransition(from: Phase, to: Phase): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws if `from -> to` is not in the transition table. Guards every phase change in core. */
export function assertTransition(from: Phase, to: Phase): void {
  if (!canTransition(from, to)) {
    throw new FaganError("WRONG_PHASE", `cannot move from ${from} to ${to}`, {
      phase: from,
      allowed: [...TRANSITIONS[from]],
    });
  }
}
