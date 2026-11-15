import { describe, expect, it } from "vitest";
import { FaganError } from "../src/core/errors.js";
import {
  abandon,
  closeMeeting,
  followUp,
  getPacket,
  logDefect,
  metricsOp,
  recordReading,
  recordRework,
  type LogDefectInput,
} from "../src/core/ops.js";
import { judgmentFlags, nextId } from "../src/core/readings.js";
import { checkEntry, checkSize, type InspectionState } from "../src/core/state.js";
import { FAIL, PASS, sampleState, testChecklists, testConfig } from "./helpers.js";

const T = (s: number): string => new Date(Date.parse("2026-11-15T10:00:00.000Z") + s * 1000).toISOString();

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof FaganError) return err.code;
    throw err;
  }
}

const packet = (s: InspectionState, role: string, phase: "overview" | "preparation" | "meeting", at = T(10)) =>
  getPacket(s, { role, phase, unitIds: null, cursor: null, limit: 20 }, at, testChecklists);

function inMeeting(): InspectionState {
  let s = sampleState();
  s = packet(s, "inspector-logic", "preparation", T(10)).state;
  s = packet(s, "moderator", "meeting", T(70)).state;
  return s;
}

const defect = (over: Partial<LogDefectInput> = {}): LogDefectInput => ({
  role: "scribe",
  unitId: "U002",
  file: "src/a.ts",
  lineStart: 2,
  lineEnd: 3,
  side: "new",
  type: "logic",
  class: "wrong",
  severity: "major",
  raisedBy: "inspector-logic",
  description: "b changed from 2 to 3",
  checklistItemId: null,
  ...over,
});

function readAll(s: InspectionState): InspectionState {
  let out = s;
  for (const u of s.packet.units) {
    out = recordReading(out, { role: "reader", unitId: u.id, paraphrase: `Unit ${u.id} sets values.` }, T(80), testConfig.judgmentWords).state;
  }
  return out;
}

describe("FM-R2.4 FM-R2.5 FM-R2.7 entry checks", () => {
  it("rejects empty and oversized diffs and failed checks", () => {
    expect(code(() => checkSize(0, 10))).toBe("EMPTY_DIFF");
    expect(code(() => checkSize(11, 10))).toBe("SIZE_LIMIT_EXCEEDED");
    expect(checkSize(10, 10)).toEqual({ changedLoc: 10, limit: 10, passed: true });
    const size = { changedLoc: 1, limit: 10, passed: true };
    expect(code(() => checkEntry({ build: FAIL, tests: PASS, size }))).toBe("ENTRY_CRITERIA_FAILED");
    expect(code(() => checkEntry({ build: PASS, tests: PASS, size }))).toBeNull();
  });
});

describe("FM-R3 get_packet", () => {
  it("FM-R3.1 FM-R3.2 first preparation request moves Overview to Preparation and records the role", () => {
    const out = packet(sampleState(), "inspector-interfaces", "preparation", T(10));
    expect(out.state.inspection.phase).toBe("Preparation");
    expect(out.state.inspection.timestamps.preparationStart).toBe(T(10));
    expect(out.event).toMatchObject({ tool: "get_packet", role: "inspector-interfaces" });
    const again = packet(out.state, "inspector-logic", "preparation", T(20));
    expect(again.state.inspection.timestamps.preparationStart).toBe(T(10));
  });

  it("FM-R3.3 FM-R3.4 meeting needs the moderator and a prior preparation", () => {
    expect(code(() => packet(sampleState(), "moderator", "meeting"))).toBe("WRONG_PHASE");
    const prep = packet(sampleState(), "reader", "preparation").state;
    expect(code(() => packet(prep, "reader", "meeting"))).toBe("ROLE_NOT_ALLOWED");
    const m = packet(prep, "moderator", "meeting", T(70));
    expect(m.state.inspection.phase).toBe("Meeting");
    expect(m.state.inspection.timestamps.meetingStart).toBe(T(70));
  });

  it("FM-R3.5 an earlier phase returns the packet without changes", () => {
    const s = inMeeting();
    const out = packet(s, "reader", "overview", T(99));
    expect(out.state).toEqual(s);
    expect(out.result.units).toHaveLength(2);
  });

  it("FM-R3.6 FM-R3.7 FM-R3.8 selection, paging, cursor and checklists", () => {
    const s = sampleState();
    expect(code(() => getPacket(s, { role: "reader", phase: "overview", unitIds: ["U999"], cursor: null, limit: 20 }, T(1), testChecklists))).toBe(
      "UNKNOWN_UNIT",
    );
    const p1 = getPacket(s, { role: "reader", phase: "overview", unitIds: null, cursor: null, limit: 1 }, T(1), testChecklists);
    expect(p1.result.units.map((u) => u.unit_id)).toEqual(["U001"]);
    expect(p1.result.next_cursor).toBe("insp-0001:U002");
    expect(Object.keys(p1.result.checklists)).toEqual(["docs"]);
    expect(p1.result.checklists["docs"]?.items[0]).toEqual({ id: "docs-01", question: "first docs question?", type_hint: "logic" });
    const p2 = getPacket(s, { role: "reader", phase: "overview", unitIds: null, cursor: p1.result.next_cursor, limit: 1 }, T(1), testChecklists);
    expect(p2.result.units.map((u) => [u.unit_id, u.checklist_id])).toEqual([["U002", "typescript"]]);
    expect(p2.result.next_cursor).toBeNull();
    expect(code(() => getPacket(s, { role: "reader", phase: "overview", unitIds: null, cursor: "insp-0002:U002", limit: 1 }, T(1), testChecklists))).toBe(
      "INVALID_CURSOR",
    );
    expect(code(() => getPacket(s, { role: "reader", phase: "overview", unitIds: null, cursor: null, limit: 51 }, T(1), testChecklists))).toBe(
      "VALIDATION_ERROR",
    );
  });
});

describe("FM-R5 record_reading", () => {
  it("FM-R5.1 FM-R5.2 role and phase", () => {
    expect(code(() => recordReading(inMeeting(), { role: "scribe", unitId: "U001", paraphrase: "x" }, T(1), []))).toBe("ROLE_NOT_ALLOWED");
    expect(code(() => recordReading(sampleState(), { role: "reader", unitId: "U001", paraphrase: "x" }, T(1), []))).toBe("WRONG_PHASE");
  });

  it("FM-R5.3 FM-R5.4 FM-R5.5 IDs, duplicates and judgment flags", () => {
    const s = inMeeting();
    const r1 = recordReading(s, { role: "reader", unitId: "U002", paraphrase: "This SHOULD fix the Bug; it shouldn't." }, T(80), testConfig.judgmentWords);
    expect(r1.result).toEqual({ reading_id: "R001", unit_id: "U002", judgment_flags: ["bug", "should", "shouldn't", "fix"] });
    expect(r1.state.readings.readings[0]).toMatchObject({ judgmentFlags: ["bug", "should", "shouldn't", "fix"], recordedAt: T(80) });
    expect(code(() => recordReading(r1.state, { role: "reader", unitId: "U002", paraphrase: "again" }, T(81), []))).toBe("DUPLICATE_READING");
    expect(code(() => recordReading(r1.state, { role: "reader", unitId: "U009", paraphrase: "x" }, T(81), []))).toBe("UNKNOWN_UNIT");
    const r2 = recordReading(r1.state, { role: "reader", unitId: "U001", paraphrase: "Adds a title and body." }, T(82), testConfig.judgmentWords);
    expect(r2.result.reading_id).toBe("R002");
    expect(r2.result.judgment_flags).toEqual([]);
  });

  it("matches whole words only", () => {
    expect(judgmentFlags("debugging is wrongful; buggy", ["bug", "wrong"])).toEqual([]);
    expect(judgmentFlags("a bug.", ["bug", "BUG"])).toEqual(["bug"]);
    expect(nextId("D", ["D001", "D009"])).toBe("D010");
    expect(nextId("D", ["D999"])).toBe("D1000");
  });
});

describe("FM-R6 log_defect", () => {
  it("FM-R6.1 FM-R6.2 role and phase", () => {
    expect(code(() => logDefect(inMeeting(), defect({ role: "inspector-logic" }), T(1), testChecklists))).toBe("ROLE_NOT_ALLOWED");
    expect(code(() => logDefect(sampleState(), defect(), T(1), testChecklists))).toBe("WRONG_PHASE");
  });

  it("FM-R6.3 FM-R6.4 FM-R6.5 FM-R6.6 location, range, checklist and raiser checks", () => {
    const s = inMeeting();
    expect(code(() => logDefect(s, defect({ unitId: "U777" }), T(1), testChecklists))).toBe("UNKNOWN_UNIT");
    expect(code(() => logDefect(s, defect({ file: "docs/x.md" }), T(1), testChecklists))).toBe("LOCATION_OUTSIDE_PACKET");
    expect(code(() => logDefect(s, defect({ lineEnd: 6 }), T(1), testChecklists))).toBe("LOCATION_OUTSIDE_PACKET");
    expect(code(() => logDefect(s, defect({ side: "old", lineStart: 4, lineEnd: 5 }), T(1), testChecklists))).toBe("LOCATION_OUTSIDE_PACKET");
    expect(code(() => logDefect(s, defect({ unitId: "U001", file: "docs/x.md", side: "old", lineStart: 1, lineEnd: 1 }), T(1), testChecklists))).toBe(
      "LOCATION_OUTSIDE_PACKET",
    );
    expect(code(() => logDefect(s, defect({ lineStart: 3, lineEnd: 2 }), T(1), testChecklists))).toBe("VALIDATION_ERROR");
    expect(code(() => logDefect(s, defect({ lineStart: 0 }), T(1), testChecklists))).toBe("VALIDATION_ERROR");
    expect(code(() => logDefect(s, defect({ checklistItemId: "docs-01" }), T(1), testChecklists))).toBe("UNKNOWN_CHECKLIST_ITEM");
    expect(code(() => logDefect(s, defect({ raisedBy: "scribe" }), T(1), testChecklists))).toBe("VALIDATION_ERROR");
  });

  it("FM-R6.7 assigns IDs and returns counts", () => {
    const s = inMeeting();
    const d1 = logDefect(s, defect({ checklistItemId: "typescript-01" }), T(90), testChecklists);
    expect(d1.result).toEqual({ defect_id: "D001", counts: { major: 1, minor: 0 } });
    expect(d1.state.defects.defects[0]).toMatchObject({ recordedBy: "scribe", loggedAt: T(90), checklistItemId: "typescript-01" });
    const d2 = logDefect(d1.state, defect({ severity: "minor", side: "old", lineStart: 1, lineEnd: 4 }), T(91), testChecklists);
    expect(d2.result).toEqual({ defect_id: "D002", counts: { major: 1, minor: 1 } });
  });
});

describe("FM-R7 close_meeting", () => {
  it("FM-R7.2 refuses while units are unread", () => {
    try {
      closeMeeting(inMeeting(), { role: "moderator", notes: null }, T(100));
      expect.unreachable();
    } catch (err) {
      expect((err as FaganError).code).toBe("UNREAD_UNITS");
      expect((err as FaganError).details).toEqual({ unit_ids: ["U001", "U002"] });
    }
  });

  it("FM-R7.3 FM-R7.4 goes to FollowUp without defects and Rework with them", () => {
    const read = readAll(inMeeting());
    const none = closeMeeting(read, { role: "moderator", notes: "quiet" }, T(130));
    expect(none.result).toMatchObject({ phase: "FollowUp", units_read: 2, units_total: 2, meeting_ms: 60000 });
    expect(none.state.inspection.timestamps).toMatchObject({ meetingEnd: T(130), followupStart: T(130) });
    expect(none.state.inspection.meetingNotes).toBe("quiet");
    const withDefect = logDefect(read, defect(), T(90), testChecklists).state;
    const rw = closeMeeting(withDefect, { role: "moderator", notes: null }, T(130));
    expect(rw.result.phase).toBe("Rework");
    expect(rw.result.defects).toEqual({
      total: 1,
      major: 1,
      minor: 0,
      by_type: { logic: 1, interface: 0, data: 0, documentation: 0, other: 0 },
    });
    expect(rw.state.inspection.timestamps.followupStart).toBeNull();
  });
});

function inRework(): InspectionState {
  let s = readAll(inMeeting());
  s = logDefect(s, defect(), T(90), testChecklists).state;
  s = logDefect(s, defect({ severity: "minor", type: "documentation" }), T(91), testChecklists).state;
  return closeMeeting(s, { role: "moderator", notes: null }, T(130)).state;
}

describe("FM-R8 record_rework", () => {
  it("FM-R8.1 FM-R8.2 role, phase and closed", () => {
    const item = { defectId: "D001", resolution: "fixed" as const, note: "changed it", reason: null };
    expect(code(() => recordRework(inRework(), { role: "moderator", items: [item] }, T(1), 20))).toBe("ROLE_NOT_ALLOWED");
    expect(code(() => recordRework(inMeeting(), { role: "author", items: [item] }, T(1), 20))).toBe("WRONG_PHASE");
    const closed = structuredClone(inRework());
    closed.inspection.phase = "Closed";
    expect(code(() => recordRework(closed, { role: "author", items: [item] }, T(1), 20))).toBe("ALREADY_CLOSED");
  });

  it("FM-R8.3 FM-R8.4 unknown, duplicate and short waiver reasons store nothing", () => {
    const s = inRework();
    const fixed = { defectId: "D001", resolution: "fixed" as const, note: "n", reason: null };
    expect(code(() => recordRework(s, { role: "author", items: [{ ...fixed, defectId: "D050" }] }, T(1), 20))).toBe("UNKNOWN_DEFECT");
    expect(code(() => recordRework(s, { role: "author", items: [fixed, fixed] }, T(1), 20))).toBe("DUPLICATE_DEFECT_IN_BATCH");
    const shortWaive = { defectId: "D002", resolution: "waived" as const, note: null, reason: "   too short        " };
    expect(code(() => recordRework(s, { role: "author", items: [fixed, shortWaive] }, T(1), 20))).toBe("WAIVER_REASON_REQUIRED");
  });

  it("FM-R8.5 later items replace earlier ones and reworkStart is set once", () => {
    const s = inRework();
    const a = recordRework(s, { role: "author", items: [{ defectId: "D001", resolution: "fixed", note: "first", reason: null }] }, T(200), 20);
    expect(a.state.inspection.timestamps.reworkStart).toBe(T(200));
    expect(a.result).toEqual({ items: [{ defect_id: "D001", resolution: "fixed", recorded_at: T(200) }], open_majors: 1 });
    const reason = "Accepted: the value is intentional here.";
    const b = recordRework(a.state, { role: "author", items: [{ defectId: "D001", resolution: "waived", note: null, reason }] }, T(210), 20);
    expect(b.state.inspection.timestamps.reworkStart).toBe(T(200));
    expect(b.state.rework.items).toEqual([{ defectId: "D001", resolution: "waived", note: null, reason, recordedAt: T(210) }]);
    expect(b.result.open_majors).toBe(0);
  });
});

describe("FM-R9 follow_up", () => {
  const blobs = (after: string) => new Map([["src/a.ts", after], ["docs/x.md", "3333333"]]);
  const fixD1 = (s: InspectionState) =>
    recordRework(s, { role: "author", items: [{ defectId: "D001", resolution: "fixed", note: "set b back", reason: null }] }, T(200), 20).state;

  it("FM-R9.1 role and phase", () => {
    expect(code(() => followUp(inRework(), { role: "reader", checks: { build: PASS, tests: PASS }, currentBlobs: blobs("x") }, T(1), testConfig))).toBe(
      "ROLE_NOT_ALLOWED",
    );
    expect(code(() => followUp(inMeeting(), { role: "author", checks: { build: PASS, tests: PASS }, currentBlobs: blobs("x") }, T(1), testConfig))).toBe(
      "WRONG_PHASE",
    );
  });

  it("FM-R9.3 FM-R9.5 a fixed major needs passing checks and a changed file", () => {
    const s = fixD1(inRework());
    const unchanged = followUp(s, { role: "author", checks: { build: PASS, tests: PASS }, currentBlobs: blobs("2222222") }, T(300), testConfig);
    expect(unchanged.result).toMatchObject({ passed: false, phase: "Rework", blocking: ["D001"] });
    expect(unchanged.result.defects[0]).toEqual({ defect_id: "D001", severity: "major", status: "fixed_unverified" });
    const failing = followUp(s, { role: "author", checks: { build: PASS, tests: FAIL }, currentBlobs: blobs("9999999") }, T(300), testConfig);
    expect(failing.result.passed).toBe(false);
    const ok = followUp(s, { role: "author", checks: { build: PASS, tests: PASS }, currentBlobs: blobs("9999999") }, T(300), testConfig);
    expect(ok.result).toMatchObject({ passed: true, phase: "Closed", blocking: [] });
    expect(ok.result.defects).toEqual([
      { defect_id: "D001", severity: "major", status: "verified" },
      { defect_id: "D002", severity: "minor", status: "open" },
    ]);
    expect(ok.state.inspection.timestamps).toMatchObject({ followupStart: T(300), closedAt: T(300) });
    const relaxed = followUp(s, { role: "author", checks: { build: PASS, tests: PASS }, currentBlobs: blobs("2222222") }, T(300), {
      ...testConfig,
      requireLocationChange: false,
    });
    expect(relaxed.result.passed).toBe(true);
  });

  it("FM-R9.5 FM-R9.6 a failed attempt goes back to Rework and attempts accumulate", () => {
    let s = inRework();
    const first = followUp(s, { role: "moderator", checks: { build: PASS, tests: PASS }, currentBlobs: blobs("2222222") }, T(250), testConfig);
    expect(first.state.inspection.phase).toBe("Rework");
    expect(first.state.followup.attempts).toHaveLength(1);
    s = fixD1(first.state);
    const second = followUp(s, { role: "moderator", checks: { build: PASS, tests: PASS }, currentBlobs: blobs("abc") }, T(400), testConfig);
    expect(second.state.inspection.phase).toBe("Closed");
    expect(second.state.followup.attempts.map((a) => [a.n, a.passed])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(second.state.inspection.timestamps.followupStart).toBe(T(250));
    expect(code(() => recordRework(second.state, { role: "author", items: [{ defectId: "D001", resolution: "fixed", note: "x", reason: null }] }, T(1), 20))).toBe(
      "ALREADY_CLOSED",
    );
  });

  it("FM-R9.4 follow-up from FollowUp with no defects passes", () => {
    const s = closeMeeting(readAll(inMeeting()), { role: "moderator", notes: null }, T(130)).state;
    const out = followUp(s, { role: "author", checks: { build: FAIL, tests: FAIL }, currentBlobs: new Map() }, T(140), testConfig);
    expect(out.result.passed).toBe(true);
    expect(out.state.inspection.phase).toBe("Closed");
  });
});

describe("FM-R15.5 abandon and FM-R10 metrics op", () => {
  it("abandons a non-terminal inspection with a valid reason", () => {
    const s = sampleState();
    expect(code(() => abandon(s, "short", T(5), 20))).toBe("WAIVER_REASON_REQUIRED");
    const out = abandon(s, "Superseded by a smaller inspection.", T(5), 20);
    expect(out.state.inspection).toMatchObject({ phase: "Abandoned", abandonReason: "Superseded by a smaller inspection." });
    expect(out.state.inspection.timestamps.abandonedAt).toBe(T(5));
    expect(code(() => abandon(out.state, "Superseded by a smaller inspection.", T(6), 20))).toBe("WRONG_PHASE");
  });

  it("computes metrics in any phase without changing state", () => {
    const s = inRework();
    const out = metricsOp(s, T(500), testConfig.rateWarnings);
    expect(out.state).toBe(s);
    expect(out.result.preparationRateLocPerHour).toBeCloseTo(5 / (60000 / 3_600_000));
    expect(out.result.inspectionRateLocPerHour).toBeCloseTo(5 / (60000 / 3_600_000));
    expect(out.result.defectsPerKloc).toBeCloseTo(2 / (5 / 1000));
  });
});
