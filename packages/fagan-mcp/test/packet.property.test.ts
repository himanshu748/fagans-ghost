import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/core/diff.js";
import { buildPacket, formatUnitId } from "../src/core/packet.js";
import { testConfig } from "./helpers.js";

type Kind = "add" | "del" | "ctx";
interface GenLine {
  kind: Kind;
  text: string;
}
interface GenFile {
  path: string;
  hunks: GenLine[][];
  gaps: number[];
}

const segment = fc.stringMatching(/^[a-z0-9][a-z0-9 ._-]{0,8}$/).filter((s) => !s.endsWith(" ") && !s.endsWith("."));
const pathArb = fc.array(segment, { minLength: 1, maxLength: 3 }).map((parts) => parts.join("/"));
// Line text: anything without a newline, including text that looks like diff syntax.
const textArb = fc.oneof(
  fc.string({ maxLength: 30 }).map((s) => s.replace(/[\r\n]/g, "")),
  fc.constantFrom("", "+", "-", "--- a/x", "+++ b/x", "@@ -1 +1 @@", "\\ No newline", "diff --git a/x b/x"),
);
const lineArb = fc.record({ kind: fc.constantFrom<Kind>("add", "del", "ctx", "add", "del"), text: textArb });
const hunkArb = fc
  .array(lineArb, { minLength: 1, maxLength: 40 })
  .filter((lines) => lines.some((l) => l.kind !== "ctx"));
const fileArb = (path: string): fc.Arbitrary<GenFile> =>
  fc
    .array(hunkArb, { minLength: 1, maxLength: 4 })
    .chain((hunks) => fc.array(fc.integer({ min: 0, max: 20 }), { minLength: hunks.length, maxLength: hunks.length }).map((gaps) => ({ path, hunks, gaps })));
const filesArb = fc
  .uniqueArray(pathArb, { minLength: 1, maxLength: 5 })
  .chain((paths) => fc.tuple(...paths.map(fileArb)));

function range(start: number, count: number): string {
  return count === 1 ? `${start}` : `${start},${count}`;
}

/** Renders files as `git diff` would, and returns the expected changed lines. */
function render(files: readonly GenFile[]): { diff: string; expected: string[] } {
  const out: string[] = [];
  const expected: string[] = [];
  for (const f of files) {
    const tab = f.path.includes(" ") ? "\t" : "";
    out.push(`diff --git a/${f.path} b/${f.path}`, "index 1111111..2222222 100644", `--- a/${f.path}${tab}`, `+++ b/${f.path}${tab}`);
    let oldNo = 1;
    let newNo = 1;
    f.hunks.forEach((lines, h) => {
      const gap = f.gaps[h] ?? 0;
      oldNo += gap;
      newNo += gap;
      const oldCount = lines.filter((l) => l.kind !== "add").length;
      const newCount = lines.filter((l) => l.kind !== "del").length;
      const oldStart = oldCount === 0 ? oldNo - 1 : oldNo;
      const newStart = newCount === 0 ? newNo - 1 : newNo;
      out.push(`@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@`);
      for (const l of lines) {
        if (l.kind === "ctx") {
          out.push(` ${l.text}`);
          oldNo++;
          newNo++;
        } else if (l.kind === "del") {
          out.push(`-${l.text}`);
          expected.push(`${f.path}|del|${oldNo}|${l.text}`);
          oldNo++;
        } else {
          out.push(`+${l.text}`);
          expected.push(`${f.path}|add|${newNo}|${l.text}`);
          newNo++;
        }
      }
    });
  }
  return { diff: `${out.join("\n")}\n`, expected };
}

describe("packet properties", () => {
  it("FM-R4.1 FM-R4.2 every changed line is in exactly one unit", () => {
    fc.assert(
      fc.property(filesArb, fc.integer({ min: 1, max: 200 }), (files, maxUnitLines) => {
        const { diff, expected } = render(files);
        const packet = buildPacket(parseUnifiedDiff(diff), { ...testConfig, exclude: [], maxUnitLines });

        const got = packet.units.flatMap((u) =>
          u.lines.filter((l) => l.kind !== "ctx").map((l) => `${u.file}|${l.kind}|${l.kind === "add" ? l.newNo : l.oldNo}|${l.text}`),
        );
        // Same multiset: nothing dropped, nothing duplicated.
        expect([...got].sort()).toEqual([...expected].sort());
        expect(new Set(got).size).toBe(got.length);

        // FM-R4.2: cap respected, every unit has a change, lines keep diff order per file.
        for (const u of packet.units) {
          expect(u.changedLoc).toBeGreaterThanOrEqual(1);
          expect(u.changedLoc).toBeLessThanOrEqual(maxUnitLines);
          expect(u.changedLoc).toBe(u.lines.filter((l) => l.kind !== "ctx").length);
        }
        for (const f of files) {
          const unitLines = packet.units.filter((u) => u.file === f.path).flatMap((u) => u.lines.map((l) => `${l.kind}|${l.text}`));
          expect(unitLines).toEqual(f.hunks.flat().map((l) => `${l.kind}|${l.text}`));
        }

        // FM-R4.3 and FM-R4.4: gapless IDs, byte-ordered files, total changed LOC.
        expect(packet.units.map((u) => u.id)).toEqual(packet.units.map((_, i) => formatUnitId(i + 1)));
        const order = packet.units.map((u) => u.file);
        const sortedPaths = [...files.map((f) => f.path)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
        expect([...new Set(order)]).toEqual(sortedPaths);
        expect(packet.changedLoc).toBe(expected.length);
      }),
      { numRuns: 300 },
    );
  });
});
