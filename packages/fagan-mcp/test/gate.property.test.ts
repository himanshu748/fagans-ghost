import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isGitCommitCommand } from "../src/core/gate.js";
import { commitSegment, join, safeSegment, separator } from "./gate-arbitraries.js";

describe("gate properties", () => {
  it("FM-R16.1 FM-R16.2 the gate matches only git commit commands", () => {
    const segmentArb = fc.oneof(
      { weight: 1, arbitrary: commitSegment.map((s) => ({ s, commit: true })) },
      { weight: 3, arbitrary: safeSegment.map((s) => ({ s, commit: false })) },
    );
    fc.assert(
      fc.property(fc.array(segmentArb, { minLength: 1, maxLength: 5 }), fc.array(separator, { minLength: 1, maxLength: 4 }), (segs, seps) => {
        const command = join(
          segs.map((x) => x.s),
          seps,
        );
        expect(isGitCommitCommand(command)).toBe(segs.some((x) => x.commit));
      }),
      { numRuns: 2000 },
    );
  });

  it("FM-R16.1 commands built without a git commit segment never match", () => {
    fc.assert(
      fc.property(fc.array(safeSegment, { minLength: 1, maxLength: 5 }), fc.array(separator, { minLength: 1, maxLength: 4 }), (segs, seps) => {
        expect(isGitCommitCommand(join(segs, seps))).toBe(false);
      }),
      { numRuns: 2000 },
    );
  });
});
