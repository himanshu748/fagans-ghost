import { describe, expect, it } from "vitest";
import { FaganError } from "../src/core/errors.js";
import { ALLOWED_PHASES, assertPhase, assertTransition, canTransition, isAllowed, type PhaseOp } from "../src/core/phase.js";
import { assertRole, ALLOWED_ROLES, type ToolName } from "../src/core/roles.js";
import { PHASES, ROLES, type Phase } from "../src/core/schema.js";

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof FaganError ? err.code : "OTHER";
  }
}

describe("FM-R1.1 transitions", () => {
  const allowed: Array<[Phase, Phase]> = [
    ["Overview", "Preparation"],
    ["Preparation", "Meeting"],
    ["Meeting", "Rework"],
    ["Meeting", "FollowUp"],
    ["Rework", "FollowUp"],
    ["FollowUp", "Closed"],
    ["FollowUp", "Rework"],
    ["Planning", "Overview"],
  ];

  it("allows exactly the listed transitions plus abandon from non-terminal phases", () => {
    for (const from of PHASES) {
      for (const to of PHASES) {
        const expected =
          allowed.some(([a, b]) => a === from && b === to) ||
          (to === "Abandoned" && from !== "Closed" && from !== "Abandoned");
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("throws WRONG_PHASE for a backward move", () => {
    expect(codeOf(() => assertTransition("Meeting", "Preparation"))).toBe("WRONG_PHASE");
  });
});

describe("FM-R1.2 FM-R1.4 allowed phases per operation", () => {
  it("reports current and allowed phases in details", () => {
    try {
      assertPhase("log_defect", "Overview");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FaganError);
      expect((err as FaganError).code).toBe("WRONG_PHASE");
      expect((err as FaganError).details).toEqual({ phase: "Overview", allowed: ["Meeting"] });
    }
  });

  it("terminal phases accept only overview packets, metrics and export", () => {
    const ops = Object.keys(ALLOWED_PHASES) as PhaseOp[];
    for (const phase of ["Closed", "Abandoned"] as const) {
      const ok = ops.filter((op) => isAllowed(op, phase)).sort();
      expect(ok).toEqual(["export_report", "get_packet:overview", "metrics"]);
    }
  });

  it("meeting-only tools are refused in every other phase", () => {
    for (const op of ["record_reading", "log_defect", "close_meeting"] as const) {
      for (const phase of PHASES) {
        expect(codeOf(() => assertPhase(op, phase))).toBe(phase === "Meeting" ? null : "WRONG_PHASE");
      }
    }
  });

  it("follow_up runs only in Rework or FollowUp, record_rework only in Rework", () => {
    expect(PHASES.filter((p) => isAllowed("follow_up", p))).toEqual(["Rework", "FollowUp"]);
    expect(PHASES.filter((p) => isAllowed("record_rework", p))).toEqual(["Rework"]);
    expect(PHASES.filter((p) => isAllowed("get_packet:meeting", p))).toEqual(["Preparation", "Meeting", "Rework", "FollowUp"]);
  });
});

describe("FM-R14.4 roles", () => {
  it("accepts only the listed roles per tool", () => {
    for (const tool of Object.keys(ALLOWED_ROLES) as ToolName[]) {
      for (const role of ROLES) {
        const expected = ALLOWED_ROLES[tool].includes(role) ? null : "ROLE_NOT_ALLOWED";
        expect(codeOf(() => assertRole(tool, role)), `${tool} ${role}`).toBe(expected);
      }
    }
  });

  it("rejects unknown and non-string roles", () => {
    expect(codeOf(() => assertRole("metrics", "ghost"))).toBe("ROLE_NOT_ALLOWED");
    expect(codeOf(() => assertRole("metrics", 3))).toBe("ROLE_NOT_ALLOWED");
  });

  it("only the scribe logs defects and only the reader records readings", () => {
    expect(ALLOWED_ROLES.log_defect).toEqual(["scribe"]);
    expect(ALLOWED_ROLES.record_reading).toEqual(["reader"]);
    expect(ALLOWED_ROLES.record_rework).toEqual(["author"]);
  });
});
