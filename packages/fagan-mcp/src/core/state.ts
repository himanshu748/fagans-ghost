// The in-memory form of one inspection folder, and the pure helpers that
// create it. Every tool operation in core/ops.ts maps a state to a new state.
import { FaganError } from "./errors.js";
import type {
  DefectsFile,
  Entry,
  EventTool,
  FollowupFile,
  Inspection,
  Packet,
  Range,
  ReadingsFile,
  ReworkFile,
  Role,
} from "./schema.js";

export interface InspectionState {
  inspection: Inspection;
  packet: Packet;
  readings: ReadingsFile;
  defects: DefectsFile;
  rework: ReworkFile;
  followup: FollowupFile;
}

/** An event before the store gives it `seq`, `at` and `phase`. */
export interface PendingEvent {
  tool: EventTool;
  role: Role | "human" | null;
  data: Record<string, unknown>;
}

export interface OpOutcome<T> {
  state: InspectionState;
  result: T;
  event: PendingEvent;
}

export interface CreateInspectionArgs {
  id: string;
  title: string;
  range: Range;
  authorOverview: string | null;
  entry: Entry;
  packet: Packet;
  planningStart: string;
  planningEnd: string;
}

/** State right after Planning passes: phase Overview (FM-R1.1, FM-R2.9). */
export function createInspectionState(args: CreateInspectionArgs): InspectionState {
  return {
    inspection: {
      schemaVersion: "fagan-inspection/1",
      id: args.id,
      title: args.title,
      range: args.range,
      phase: "Overview",
      timestamps: {
        planningStart: args.planningStart,
        planningEnd: args.planningEnd,
        overviewStart: args.planningEnd,
        preparationStart: null,
        meetingStart: null,
        meetingEnd: null,
        reworkStart: null,
        followupStart: null,
        closedAt: null,
        abandonedAt: null,
      },
      entry: args.entry,
      authorOverview: args.authorOverview,
      meetingNotes: null,
      abandonReason: null,
    },
    packet: args.packet,
    readings: { schemaVersion: "fagan-readings/1", readings: [] },
    defects: { schemaVersion: "fagan-defects/1", defects: [] },
    rework: { schemaVersion: "fagan-rework/1", items: [] },
    followup: { schemaVersion: "fagan-followup/1", attempts: [] },
  };
}

/** `EMPTY_DIFF` and `SIZE_LIMIT_EXCEEDED` checks, run before any command (FM-R2.4, FM-R2.5). */
export function checkSize(changedLoc: number, limit: number): Entry["size"] {
  if (changedLoc === 0) {
    throw new FaganError("EMPTY_DIFF", "the diff has no changed lines after exclusions", { changed_loc: 0 });
  }
  if (changedLoc > limit) {
    throw new FaganError("SIZE_LIMIT_EXCEEDED", `changed LOC ${changedLoc} is over the limit ${limit}`, {
      changed_loc: changedLoc,
      limit,
    });
  }
  return { changedLoc, limit, passed: true };
}

/** Throws `ENTRY_CRITERIA_FAILED` with the full entry object unless build and tests passed (FM-R2.7). */
export function checkEntry(entry: Entry): void {
  if (!entry.build.passed || !entry.tests.passed || !entry.size.passed) {
    throw new FaganError("ENTRY_CRITERIA_FAILED", "entry criteria failed: build and tests must pass", { entry });
  }
}
