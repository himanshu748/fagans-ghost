import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Clock } from "../src/clock.js";
import { FaganError } from "../src/core/errors.js";
import { abandon, closeMeeting, followUp, getPacket, logDefect, metricsOp, recordReading, recordRework } from "../src/core/ops.js";
import type { Phase } from "../src/core/schema.js";
import type { InspectionState, OpOutcome } from "../src/core/state.js";
import { createInspection, inspectionDir, loadState, transact } from "../src/store/store.js";
import { fakeClock, PASS, SAMPLE_DIFF, sampleState, tempDir, testChecklists, testConfig } from "./helpers.js";

/**
 * Allowed phases written out from requirements FM-R1.1, FM-R1.4, FM-R3, FM-R5.2,
 * FM-R6.2, FM-R7.1, FM-R8.2, FM-R9.1 and FM-R15.5, independently of core/phase.ts.
 */
const ACTIVE: Phase[] = ["Overview", "Preparation", "Meeting", "Rework", "FollowUp"];
const SPEC_ALLOWED: Record<string, Phase[]> = {
  overview: [...ACTIVE, "Closed", "Abandoned"],
  preparation: ACTIVE,
  meeting: ["Preparation", "Meeting", "Rework", "FollowUp"],
  read: ["Meeting"],
  log: ["Meeting"],
  close: ["Meeting"],
  rework: ["Rework"],
  follow: ["Rework", "FollowUp"],
  metrics: [...ACTIVE, "Closed", "Abandoned"],
  abandon: ACTIVE,
};

interface Model {
  phase: Phase;
  read: Set<string>;
  majors: Set<string>;
  minors: Set<string>;
  resolved: Set<string>;
}

interface Real {
  root: string;
  id: string;
  clock: Clock;
}

const UNITS = ["U001", "U002"];
const UNIT_LOC: Record<string, { file: string; line: number }> = {
  U001: { file: "docs/x.md", line: 1 },
  U002: { file: "src/a.ts", line: 2 },
};

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) out[name] = readFileSync(join(dir, name), "utf8");
  return out;
}

type Op = (s: InspectionState, at: string) => OpOutcome<unknown>;

abstract class ToolCommand implements fc.AsyncCommand<Model, Real> {
  abstract readonly key: string;
  abstract op(m: Readonly<Model>): Op;
  /** Model update after a successful call. */
  abstract apply(m: Model): void;
  /** Error codes, other than WRONG_PHASE, that the call may return in an allowed phase. */
  expectedErrors(_m: Readonly<Model>): string[] {
    return [];
  }
  check(): boolean {
    return true;
  }
  async run(m: Model, r: Real): Promise<void> {
    const dir = inspectionDir(r.root, r.id);
    const before = snapshot(dir);
    const allowed = SPEC_ALLOWED[this.key]?.includes(m.phase) ?? false;
    const op = this.op(m);
    let error: FaganError | null = null;
    try {
      await transact(r.root, r.id, r.clock, (s) => op(s, r.clock.now().toISOString()));
    } catch (err) {
      if (!(err instanceof FaganError)) throw err;
      error = err;
    }
    if (!allowed) {
      // FM-R1.2: refused with WRONG_PHASE (record_rework on Closed is ALREADY_CLOSED, FM-R8.2).
      const expected = this.key === "rework" && m.phase === "Closed" ? "ALREADY_CLOSED" : "WRONG_PHASE";
      expect(error?.code, `${this.toString()} in ${m.phase}`).toBe(expected);
    } else if (error !== null) {
      expect(this.expectedErrors(m), `${this.toString()} in ${m.phase}: ${error.code} ${error.message}`).toContain(error.code);
    }
    if (error !== null) {
      // FM-R1.3: an error changes nothing on disk.
      expect(snapshot(dir)).toEqual(before);
      return;
    }
    this.apply(m);
    expect((await loadState(r.root, r.id)).inspection.phase).toBe(m.phase);
  }
  abstract toString(): string;
}

class GetPacket extends ToolCommand {
  constructor(readonly phase: "overview" | "preparation" | "meeting") {
    super();
  }
  get key(): string {
    return this.phase;
  }
  op(): Op {
    const role = this.phase === "meeting" ? "moderator" : "inspector-logic";
    return (s, at) => getPacket(s, { role, phase: this.phase, unitIds: null, cursor: null, limit: 20 }, at, testChecklists);
  }
  apply(m: Model): void {
    if (this.phase === "preparation" && m.phase === "Overview") m.phase = "Preparation";
    if (this.phase === "meeting" && m.phase === "Preparation") m.phase = "Meeting";
  }
  toString(): string {
    return `get_packet(${this.phase})`;
  }
}

class Read extends ToolCommand {
  readonly key = "read";
  constructor(readonly unit: string) {
    super();
  }
  op(): Op {
    return (s, at) => recordReading(s, { role: "reader", unitId: this.unit, paraphrase: `Reads ${this.unit}.` }, at, testConfig.judgmentWords);
  }
  override expectedErrors(m: Readonly<Model>): string[] {
    return m.read.has(this.unit) ? ["DUPLICATE_READING"] : [];
  }
  apply(m: Model): void {
    m.read.add(this.unit);
  }
  toString(): string {
    return `record_reading(${this.unit})`;
  }
}

class Log extends ToolCommand {
  readonly key = "log";
  constructor(
    readonly unit: string,
    readonly severity: "major" | "minor",
  ) {
    super();
  }
  op(): Op {
    const loc = UNIT_LOC[this.unit] as { file: string; line: number };
    return (s, at) =>
      logDefect(
        s,
        {
          role: "scribe",
          unitId: this.unit,
          file: loc.file,
          lineStart: loc.line,
          lineEnd: loc.line,
          side: "new",
          type: "logic",
          class: null,
          severity: this.severity,
          raisedBy: "inspector-logic",
          description: "generated defect",
          checklistItemId: null,
        },
        at,
        testChecklists,
      );
  }
  apply(m: Model): void {
    const id = `D${String(m.majors.size + m.minors.size + 1).padStart(3, "0")}`;
    (this.severity === "major" ? m.majors : m.minors).add(id);
  }
  toString(): string {
    return `log_defect(${this.unit}, ${this.severity})`;
  }
}

class Close extends ToolCommand {
  readonly key = "close";
  op(): Op {
    return (s, at) => closeMeeting(s, { role: "moderator", notes: null }, at);
  }
  override expectedErrors(m: Readonly<Model>): string[] {
    return UNITS.every((u) => m.read.has(u)) ? [] : ["UNREAD_UNITS"];
  }
  apply(m: Model): void {
    m.phase = m.majors.size + m.minors.size > 0 ? "Rework" : "FollowUp";
  }
  toString(): string {
    return "close_meeting";
  }
}

class Rework extends ToolCommand {
  readonly key = "rework";
  constructor(
    readonly n: number,
    readonly resolution: "fixed" | "waived",
  ) {
    super();
  }
  defectId(m: Readonly<Model>): string {
    const total = m.majors.size + m.minors.size;
    return `D${String((this.n % Math.max(total, 1)) + 1).padStart(3, "0")}`;
  }
  op(m: Readonly<Model>): Op {
    const defectId = this.defectId(m);
    return (s, at) =>
      recordRework(
        s,
        {
          role: "author",
          items: [
            this.resolution === "fixed"
              ? { defectId, resolution: "fixed", note: "changed the line", reason: null }
              : { defectId, resolution: "waived", note: null, reason: "The Author accepts this as intended behaviour." },
          ],
        },
        at,
        testConfig.waiverMinChars,
      );
  }
  apply(m: Model): void {
    m.resolved.add(this.defectId(m));
  }
  toString(): string {
    return `record_rework(#${this.n}, ${this.resolution})`;
  }
}

class Follow extends ToolCommand {
  readonly key = "follow";
  op(): Op {
    // Checks pass and every packet file has changed, so every fixed defect verifies.
    const blobs = new Map([
      ["docs/x.md", "changed-1"],
      ["src/a.ts", "changed-2"],
    ]);
    return (s, at) => followUp(s, { role: "author", checks: { build: PASS, tests: PASS }, currentBlobs: blobs }, at, testConfig);
  }
  apply(m: Model): void {
    const passes = [...m.majors].every((id) => m.resolved.has(id));
    m.phase = passes ? "Closed" : "Rework";
  }
  toString(): string {
    return "follow_up";
  }
}

class Metrics extends ToolCommand {
  readonly key = "metrics";
  op(): Op {
    return (s, at) => metricsOp(s, at, testConfig.rateWarnings);
  }
  apply(): void {}
  toString(): string {
    return "metrics";
  }
}

class Abandon extends ToolCommand {
  readonly key = "abandon";
  op(): Op {
    return (s, at) => abandon(s, "Abandoned by the generated scenario.", at, testConfig.waiverMinChars);
  }
  apply(m: Model): void {
    m.phase = "Abandoned";
  }
  toString(): string {
    return "abandon";
  }
}

const commandArbs = [
  fc.constantFrom("overview" as const, "preparation" as const, "meeting" as const).map((p) => new GetPacket(p)),
  fc.constantFrom(...UNITS).map((u) => new Read(u)),
  fc.tuple(fc.constantFrom(...UNITS), fc.constantFrom("major" as const, "minor" as const)).map(([u, s]) => new Log(u, s)),
  fc.constant(new Close()),
  fc.tuple(fc.nat({ max: 5 }), fc.constantFrom("fixed" as const, "waived" as const)).map(([n, r]) => new Rework(n, r)),
  fc.constant(new Follow()),
  fc.constant(new Metrics()),
  fc.constant(new Abandon()),
];

describe("phase properties", () => {
  it("FM-R1.2 FM-R1.3 wrong-phase calls never change the store", async () => {
    await fc.assert(
      fc.asyncProperty(fc.commands(commandArbs, { maxCommands: 25 }), async (cmds) => {
        const dir = tempDir("fagan-model-");
        try {
          mkdirSync(join(dir.path, ".fagan"));
          const clock = fakeClock();
          const { id } = await createInspection(dir.path, clock, (newId) => ({
            state: sampleState(newId),
            diffText: SAMPLE_DIFF,
            event: { tool: "open_inspection", role: "moderator", data: {} },
          }));
          const model: Model = { phase: "Overview", read: new Set(), majors: new Set(), minors: new Set(), resolved: new Set() };
          await fc.asyncModelRun(() => ({ model, real: { root: dir.path, id, clock } }), cmds);
        } finally {
          dir.cleanup();
        }
      }),
      { numRuns: 150 },
    );
  });
});
