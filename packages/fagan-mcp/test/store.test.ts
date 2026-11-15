import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FaganError } from "../src/core/errors.js";
import { getPacket, recordReading } from "../src/core/ops.js";
import { withLock, writeFileAtomic } from "../src/store/fs.js";
import {
  createInspection,
  inspectionDir,
  listInspectionIds,
  loadConfig,
  loadState,
  lockPath,
  readDiff,
  readEvents,
  transact,
} from "../src/store/store.js";
import { fakeClock, SAMPLE_DIFF, sampleState, tempDir, testChecklists, testConfig } from "./helpers.js";

let root: string;
let cleanup: () => void;

beforeEach(() => {
  const d = tempDir("fagan-store-");
  root = d.path;
  cleanup = d.cleanup;
  mkdirSync(join(root, ".fagan"));
  writeFileSync(join(root, ".fagan", "config.json"), JSON.stringify(testConfig));
});
afterEach(() => cleanup());

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    return err instanceof FaganError ? err.code : `OTHER: ${String(err)}`;
  }
}

async function create(): Promise<string> {
  const clock = fakeClock();
  const out = await createInspection(root, clock, (id) => ({
    state: sampleState(id),
    diffText: SAMPLE_DIFF,
    event: { tool: "open_inspection", role: "moderator", data: { title: "Sample" } },
  }));
  return out.id;
}

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) out[name] = readFileSync(join(dir, name), "utf8");
  return out;
}

describe("FM-R13.1 atomic writes", () => {
  it("replaces the target and leaves no temp file", async () => {
    const p = join(root, "f.json");
    writeFileSync(p, "old");
    await writeFileAtomic(p, "new\n");
    expect(readFileSync(p, "utf8")).toBe("new\n");
    expect(readdirSync(root).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
});

describe("FM-R13.2 FM-R13.3 lock", () => {
  it("returns LOCKED while a fresh lock is held and removes its own lock after", async () => {
    let inner: string | null = "not run";
    await withLock(lockPath(root), async () => {
      expect(existsSync(lockPath(root))).toBe(true);
      inner = await codeOf(withLock(lockPath(root), async () => undefined));
    });
    expect(inner).toBe("LOCKED");
    expect(existsSync(lockPath(root))).toBe(false);
  });

  it("removes the lock even when the work throws", async () => {
    await expect(withLock(lockPath(root), async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(existsSync(lockPath(root))).toBe(false);
  });

  it("takes over a stale lock", async () => {
    writeFileSync(lockPath(root), "{}");
    const old = new Date(Date.now() - 120_000);
    utimesSync(lockPath(root), old, old);
    await expect(withLock(lockPath(root), async () => "ok")).resolves.toBe("ok");
  });

  it("a held lock makes transact write nothing", async () => {
    const id = await create();
    const before = snapshot(inspectionDir(root, id));
    writeFileSync(lockPath(root), "{}");
    const c = await codeOf(
      transact(root, id, fakeClock(), (s) => getPacket(s, { role: "reader", phase: "preparation", unitIds: null, cursor: null, limit: 20 }, "2026-11-15T10:00:05.000Z", testChecklists)),
    );
    expect(c).toBe("LOCKED");
    expect(snapshot(inspectionDir(root, id))).toEqual(before);
  });
});

describe("FM-R2.9 FM-R12 create, transact and events", () => {
  it("allocates sequential IDs and writes every file", async () => {
    expect(await create()).toBe("insp-0001");
    expect(await create()).toBe("insp-0002");
    expect(await listInspectionIds(root)).toEqual(["insp-0001", "insp-0002"]);
    const files = readdirSync(inspectionDir(root, "insp-0001")).sort();
    expect(files).toEqual([
      "defects.json",
      "diff.patch",
      "events.jsonl",
      "followup.json",
      "inspection.json",
      "packet.json",
      "readings.json",
      "rework.json",
    ]);
    expect(await readDiff(root, "insp-0001")).toBe(SAMPLE_DIFF);
    expect(readdirSync(join(root, ".fagan", "inspections")).filter((n) => n.startsWith("."))).toEqual([]);
  });

  it("FM-R12.1 FM-R12.2 writes canonical JSON with schemaVersion first and a trailing newline", async () => {
    const id = await create();
    const text = readFileSync(join(inspectionDir(root, id), "inspection.json"), "utf8");
    expect(text.startsWith('{\n  "schemaVersion": "fagan-inspection/1",\n  "id": "insp-0001",')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("FM-R12.4 appends one event per successful call with increasing seq", async () => {
    const id = await create();
    const clock = fakeClock("2026-11-15T11:00:00.000Z");
    await transact(root, id, clock, (s) =>
      getPacket(s, { role: "inspector-logic", phase: "preparation", unitIds: null, cursor: null, limit: 20 }, "2026-11-15T11:00:00.000Z", testChecklists),
    );
    await transact(root, id, clock, (s) =>
      getPacket(s, { role: "moderator", phase: "meeting", unitIds: null, cursor: null, limit: 20 }, "2026-11-15T11:00:01.000Z", testChecklists),
    );
    const events = await readEvents(root, id);
    expect(events.map((e) => [e.seq, e.tool, e.role, e.phase])).toEqual([
      [1, "open_inspection", "moderator", "Overview"],
      [2, "get_packet", "inspector-logic", "Preparation"],
      [3, "get_packet", "moderator", "Meeting"],
    ]);
    expect((await loadState(root, id)).inspection.phase).toBe("Meeting");
  });

  it("FM-R1.3 a failing operation leaves every file unchanged", async () => {
    const id = await create();
    const before = snapshot(inspectionDir(root, id));
    const c = await codeOf(
      transact(root, id, fakeClock(), (s) => recordReading(s, { role: "reader", unitId: "U001", paraphrase: "x" }, "2026-11-15T10:00:05.000Z", [])),
    );
    expect(c).toBe("WRONG_PHASE");
    expect(snapshot(inspectionDir(root, id))).toEqual(before);
    expect(existsSync(lockPath(root))).toBe(false);
  });

  it("FM-R12.3 the same inputs and clock give byte-identical folders", async () => {
    const other = tempDir("fagan-store-b-");
    try {
      mkdirSync(join(other.path, ".fagan"));
      for (const r of [root, other.path]) {
        await createInspection(r, fakeClock(), (id) => ({
          state: sampleState(id),
          diffText: SAMPLE_DIFF,
          event: { tool: "open_inspection", role: "moderator", data: {} },
        }));
        await transact(r, "insp-0001", fakeClock("2026-11-15T12:00:00.000Z"), (s) =>
          getPacket(s, { role: "reader", phase: "preparation", unitIds: null, cursor: null, limit: 20 }, "2026-11-15T12:00:00.000Z", testChecklists),
        );
      }
      expect(snapshot(inspectionDir(other.path, "insp-0001"))).toEqual(snapshot(inspectionDir(root, "insp-0001")));
    } finally {
      other.cleanup();
    }
  });
});

describe("FM-R13.4 FM-R13.5 FM-R14.1 validation on read", () => {
  it("rejects bad inspection IDs before touching the file system", async () => {
    expect(() => inspectionDir(root, "../x")).toThrow(/insp-/);
    expect(await codeOf(loadState(root, "../../etc"))).toBe("VALIDATION_ERROR");
    expect(await codeOf(loadState(root, "insp-12345"))).toBe("VALIDATION_ERROR");
  });

  it("reports missing inspections and corrupt files", async () => {
    expect(await codeOf(loadState(root, "insp-0042"))).toBe("INSPECTION_NOT_FOUND");
    const id = await create();
    const p = join(inspectionDir(root, id), "defects.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: "fagan-defects/9", defects: [] }));
    try {
      await loadState(root, id);
      expect.unreachable();
    } catch (err) {
      expect((err as FaganError).code).toBe("STORE_CORRUPT");
      expect((err as FaganError).details["file"]).toBe(".fagan/inspections/insp-0001/defects.json");
    }
    writeFileSync(p, "{");
    expect(await codeOf(loadState(root, id))).toBe("STORE_CORRUPT");
  });

  it("reports an invalid config with failing paths", async () => {
    expect((await loadConfig(root)).maxUnitLines).toBe(80);
    writeFileSync(join(root, ".fagan", "config.json"), JSON.stringify({ ...testConfig, maxUnitLines: 0 }));
    try {
      await loadConfig(root);
      expect.unreachable();
    } catch (err) {
      expect((err as FaganError).code).toBe("CONFIG_INVALID");
      expect(JSON.stringify((err as FaganError).details)).toContain("maxUnitLines");
    }
  });
});
