import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { followUp } from "../src/core/ops.js";
import type { CheckResult, Defect, PacketFile, ReworkItem } from "../src/core/schema.js";
import type { InspectionState } from "../src/core/state.js";
import { sampleState } from "./helpers.js";

const FILES = ["a.ts", "b.ts", "c.md"] as const;

const check = (passed: boolean): CheckResult => ({ ran: true, passed, exitCode: passed ? 0 : 1, durationMs: 1 });

const reworkArb = fc.oneof(
  fc.constant({ kind: "none" as const }),
  fc.constant({ kind: "fixed" as const }),
  fc.string({ maxLength: 40 }).map((reason) => ({ kind: "waived" as const, reason })),
  // Reasons made mostly of whitespace, to test trimming at the boundary.
  fc
    .tuple(fc.string({ unit: fc.constantFrom(" ", "\t", "\n"), maxLength: 10 }), fc.string({ maxLength: 25 }))
    .map(([ws, core]) => ({ kind: "waived" as const, reason: `${ws}${core}${ws}` })),
);

const defectArb = fc.record({
  severity: fc.constantFrom("major" as const, "minor" as const),
  file: fc.constantFrom(...FILES),
  rework: reworkArb,
});

const scenarioArb = fc.record({
  defects: fc.array(defectArb, { minLength: 1, maxLength: 8 }),
  changed: fc.record({ "a.ts": fc.boolean(), "b.ts": fc.boolean(), "c.md": fc.boolean() }),
  build: fc.boolean(),
  tests: fc.boolean(),
  requireLocationChange: fc.boolean(),
  waiverMinChars: fc.integer({ min: 1, max: 30 }),
  phase: fc.constantFrom("Rework" as const, "FollowUp" as const),
});

type Scenario = typeof scenarioArb extends fc.Arbitrary<infer S> ? S : never;

function stateFor(sc: Scenario): InspectionState {
  const s = structuredClone(sampleState());
  s.inspection.phase = sc.phase;
  s.packet.files = FILES.map(
    (path): PacketFile => ({ path, oldPath: null, status: "modified", blobBefore: "old", blobAfter: `after-${path}`, checklist: "general", skipped: null }),
  );
  s.defects.defects = sc.defects.map(
    (d, i): Defect => ({
      id: `D${String(i + 1).padStart(3, "0")}`,
      unitId: "U001",
      location: { file: d.file, side: "new", lineStart: 1, lineEnd: 1 },
      type: "logic",
      class: null,
      severity: d.severity,
      raisedBy: "inspector-logic",
      recordedBy: "scribe",
      description: "d",
      checklistItemId: null,
      loggedAt: "2026-11-15T10:00:00.000Z",
    }),
  );
  s.rework.items = sc.defects.flatMap((d, i): ReworkItem[] =>
    d.rework.kind === "none"
      ? []
      : [
          {
            defectId: `D${String(i + 1).padStart(3, "0")}`,
            resolution: d.rework.kind,
            note: d.rework.kind === "fixed" ? "fixed it" : null,
            reason: d.rework.kind === "waived" ? d.rework.reason : null,
            recordedAt: "2026-11-15T10:05:00.000Z",
          },
        ],
  );
  return s;
}

/** Independent statement of the exit rule from FM-R9.3 and FM-R9.4. */
function oracleBlocking(sc: Scenario): string[] {
  const checksPassed = sc.build && sc.tests;
  return sc.defects.flatMap((d, i) => {
    if (d.severity !== "major") return [];
    const ok =
      (d.rework.kind === "fixed" && checksPassed && (!sc.requireLocationChange || sc.changed[d.file])) ||
      (d.rework.kind === "waived" && [...d.rework.reason.trim()].length >= sc.waiverMinChars);
    return ok ? [] : [`D${String(i + 1).padStart(3, "0")}`];
  });
}

describe("follow-up properties", () => {
  it("FM-R9.3 FM-R9.4 follow-up passes iff every major is verified or validly waived", () => {
    fc.assert(
      fc.property(scenarioArb, (sc) => {
        const state = stateFor(sc);
        const blobs = new Map(FILES.map((f) => [f, sc.changed[f] ? `now-${f}` : `after-${f}`]));
        const out = followUp(
          state,
          { role: "author", checks: { build: check(sc.build), tests: check(sc.tests) }, currentBlobs: blobs },
          "2026-11-15T11:00:00.000Z",
          { requireLocationChange: sc.requireLocationChange, waiverMinChars: sc.waiverMinChars },
        );
        const blocking = oracleBlocking(sc);
        expect(out.result.blocking).toEqual(blocking);
        expect(out.result.passed).toBe(blocking.length === 0);
        expect(out.state.inspection.phase).toBe(blocking.length === 0 ? "Closed" : "Rework");
        // Minors never block, whatever their status.
        const minorsOnly = sc.defects.every((d) => d.severity === "minor");
        if (minorsOnly) expect(out.result.passed).toBe(true);
        // A major that is open or fixed-but-unverified is always blocking.
        for (const d of out.result.defects) {
          if (d.severity === "major" && (d.status === "open" || d.status === "fixed_unverified")) {
            expect(out.result.blocking).toContain(d.defect_id);
          }
        }
      }),
      { numRuns: 1000 },
    );
  });
});
