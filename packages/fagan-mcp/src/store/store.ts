// `.fagan/` store: config, inspection folders, events (FM-R12, FM-R13, FM-R14.1).
import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { isoNow, type Clock } from "../clock.js";
import { FaganError, issuesToDetails } from "../core/errors.js";
import { toDeterministicJson, toDeterministicJsonLine } from "../core/json.js";
import {
  ConfigSchema,
  DefectsFileSchema,
  EventSchema,
  FollowupFileSchema,
  INSPECTION_ID_RE,
  InspectionSchema,
  MetricsSchema,
  PacketSchema,
  ReadingsFileSchema,
  ReworkFileSchema,
  type Config,
  type FaganEvent,
  type Metrics,
} from "../core/schema.js";
import type { InspectionState, OpOutcome, PendingEvent } from "../core/state.js";
import { withLock, writeFileAtomic } from "./fs.js";

export const STORE_DIR = ".fagan";
export const CONFIG_FILE = "config.json";
export const LOCK_FILE = ".lock";
export const INSPECTIONS_DIR = "inspections";
export const DIFF_FILE = "diff.patch";
export const EVENTS_FILE = "events.jsonl";
export const METRICS_FILE = "metrics.json";

const STATE_FILES = {
  inspection: { name: "inspection.json", schema: InspectionSchema },
  packet: { name: "packet.json", schema: PacketSchema },
  readings: { name: "readings.json", schema: ReadingsFileSchema },
  defects: { name: "defects.json", schema: DefectsFileSchema },
  rework: { name: "rework.json", schema: ReworkFileSchema },
  followup: { name: "followup.json", schema: FollowupFileSchema },
} as const;
type StateKey = keyof typeof STATE_FILES;
const STATE_KEYS = Object.keys(STATE_FILES) as StateKey[];

/** Files a transaction may write besides the state files. */
export type ExtraFileName = "metrics.json" | "report.json" | "report.txt";
export interface ExtraFile {
  name: ExtraFileName;
  content: string;
}

export function storeDir(repoRoot: string): string {
  return join(repoRoot, STORE_DIR);
}

export function lockPath(repoRoot: string): string {
  return join(repoRoot, STORE_DIR, LOCK_FILE);
}

export function inspectionsDir(repoRoot: string): string {
  return join(repoRoot, STORE_DIR, INSPECTIONS_DIR);
}

/** Rejects IDs that do not match `^insp-[0-9]{4}$` before any path is built (FM-R14.1). */
export function assertInspectionId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !INSPECTION_ID_RE.test(id)) {
    throw new FaganError("VALIDATION_ERROR", "inspection_id must match ^insp-[0-9]{4}$", {
      issues: [{ path: "inspection_id", message: "must match ^insp-[0-9]{4}$" }],
    });
  }
}

export function inspectionDir(repoRoot: string, id: unknown): string {
  assertInspectionId(id);
  return join(inspectionsDir(repoRoot), id);
}

function relName(id: string, file: string): string {
  return `${STORE_DIR}/${INSPECTIONS_DIR}/${id}/${file}`;
}

function errCode(err: unknown): unknown {
  return typeof err === "object" && err !== null && "code" in err ? (err as { code: unknown }).code : undefined;
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (errCode(err) === "ENOENT") return null;
    throw err;
  }
}

function parseStored<S extends z.ZodType>(schema: S, text: string | null, file: string): z.output<S> {
  if (text === null) throw new FaganError("STORE_CORRUPT", `${file} is missing`, { file });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FaganError("STORE_CORRUPT", `${file} is not valid JSON`, { file });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new FaganError("STORE_CORRUPT", `${file} fails its schema`, { file, issues: issuesToDetails(parsed.error.issues) });
  }
  return parsed.data;
}

/** Reads `.fagan/config.json`; `CONFIG_INVALID` with the failing paths (FM-R13.5). */
export async function loadConfig(repoRoot: string): Promise<Config> {
  const file = `${STORE_DIR}/${CONFIG_FILE}`;
  const text = await readText(join(repoRoot, STORE_DIR, CONFIG_FILE));
  if (text === null) throw new FaganError("CONFIG_INVALID", `${file} is missing`, { file, issues: [] });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FaganError("CONFIG_INVALID", `${file} is not valid JSON`, { file, issues: [] });
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FaganError("CONFIG_INVALID", `${file} is invalid`, { file, issues: issuesToDetails(parsed.error.issues) });
  }
  return parsed.data;
}

/** IDs of existing inspection folders, ascending. Missing store gives `[]`. */
export async function listInspectionIds(repoRoot: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(inspectionsDir(repoRoot));
  } catch (err) {
    if (errCode(err) === "ENOENT") return [];
    throw err;
  }
  return names.filter((n) => INSPECTION_ID_RE.test(n)).sort();
}

export async function nextInspectionId(repoRoot: string): Promise<string> {
  const ids = await listInspectionIds(repoRoot);
  const last = ids[ids.length - 1];
  const n = last === undefined ? 1 : Number(last.slice(5)) + 1;
  if (n > 9999) throw new FaganError("VALIDATION_ERROR", "no inspection IDs left (insp-9999 used)", {});
  return `insp-${String(n).padStart(4, "0")}`;
}

async function assertExists(repoRoot: string, id: string): Promise<string> {
  const dir = inspectionDir(repoRoot, id);
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) throw new FaganError("INSPECTION_NOT_FOUND", `inspection ${id} not found`, { inspection_id: id });
  } catch (err) {
    if (err instanceof FaganError) throw err;
    if (errCode(err) === "ENOENT") throw new FaganError("INSPECTION_NOT_FOUND", `inspection ${id} not found`, { inspection_id: id });
    throw err;
  }
  return dir;
}

interface Loaded {
  state: InspectionState;
  texts: Record<StateKey, string>;
  eventsText: string;
  events: FaganEvent[];
}

function parseEvents(text: string | null, id: string): FaganEvent[] {
  const file = relName(id, EVENTS_FILE);
  if (text === null) throw new FaganError("STORE_CORRUPT", `${file} is missing`, { file });
  const lines = text.split("\n").filter((l) => l.length > 0);
  return lines.map((line, i) => {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      throw new FaganError("STORE_CORRUPT", `${file} line ${i + 1} is not valid JSON`, { file, line: i + 1 });
    }
    const parsed = EventSchema.safeParse(raw);
    if (!parsed.success || parsed.data.seq !== i + 1) {
      throw new FaganError("STORE_CORRUPT", `${file} line ${i + 1} is not a valid event`, { file, line: i + 1 });
    }
    return parsed.data;
  });
}

async function load(repoRoot: string, id: string): Promise<Loaded> {
  const dir = await assertExists(repoRoot, id);
  const texts = {} as Record<StateKey, string>;
  const values = {} as Record<StateKey, unknown>;
  for (const key of STATE_KEYS) {
    const { name, schema } = STATE_FILES[key];
    const text = await readText(join(dir, name));
    values[key] = parseStored(schema, text, relName(id, name));
    texts[key] = text as string;
  }
  const state = values as unknown as InspectionState;
  if (state.inspection.id !== id) {
    throw new FaganError("STORE_CORRUPT", `${relName(id, "inspection.json")} has id ${state.inspection.id}`, {
      file: relName(id, "inspection.json"),
    });
  }
  const eventsText = (await readText(join(dir, EVENTS_FILE))) ?? null;
  const events = parseEvents(eventsText, id);
  return { state, texts, eventsText: eventsText ?? "", events };
}

/** Reads and validates every state file of one inspection (FM-R13.4). */
export async function loadState(repoRoot: string, id: unknown): Promise<InspectionState> {
  assertInspectionId(id);
  return (await load(repoRoot, id)).state;
}

export async function readEvents(repoRoot: string, id: unknown): Promise<FaganEvent[]> {
  assertInspectionId(id);
  const dir = await assertExists(repoRoot, id);
  return parseEvents(await readText(join(dir, EVENTS_FILE)), id);
}

export async function readDiff(repoRoot: string, id: unknown): Promise<string> {
  assertInspectionId(id);
  const dir = await assertExists(repoRoot, id);
  const text = await readText(join(dir, DIFF_FILE));
  if (text === null) throw new FaganError("STORE_CORRUPT", `${relName(id, DIFF_FILE)} is missing`, { file: relName(id, DIFF_FILE) });
  return text;
}

/** Last stored metrics, or null when `metrics` was never called. */
export async function readMetrics(repoRoot: string, id: unknown): Promise<Metrics | null> {
  assertInspectionId(id);
  const dir = await assertExists(repoRoot, id);
  const text = await readText(join(dir, METRICS_FILE));
  return text === null ? null : parseStored(MetricsSchema, text, relName(id, METRICS_FILE));
}

function eventLine(seq: number, at: string, phase: InspectionState["inspection"]["phase"], e: PendingEvent): { line: string; event: FaganEvent } {
  const event = { seq, at, tool: e.tool, role: e.role, phase, data: e.data } as FaganEvent;
  const line = toDeterministicJsonLine(EventSchema, event);
  return { line, event: EventSchema.parse(JSON.parse(line)) };
}

export type TransactFn<T> = (
  state: InspectionState,
  events: readonly FaganEvent[],
) => (OpOutcome<T> & { extraFiles?: readonly ExtraFile[] }) | Promise<OpOutcome<T> & { extraFiles?: readonly ExtraFile[] }>;

/**
 * Loads one inspection under the lock, runs `fn`, and writes the changed state
 * files, any extra files and one event line. If `fn` throws, nothing is
 * written (FM-R1.3, FM-R12.4).
 */
export async function transact<T>(
  repoRoot: string,
  id: unknown,
  clock: Clock,
  fn: TransactFn<T>,
): Promise<{ result: T; event: FaganEvent; state: InspectionState }> {
  assertInspectionId(id);
  await assertExists(repoRoot, id);
  return withLock(lockPath(repoRoot), async () => {
    const loaded = await load(repoRoot, id);
    const outcome = await fn(loaded.state, loaded.events);
    const dir = inspectionDir(repoRoot, id);
    const writes: Array<{ path: string; content: string }> = [];
    for (const key of STATE_KEYS) {
      const { name, schema } = STATE_FILES[key];
      const content = toDeterministicJson(schema as z.ZodType, outcome.state[key]);
      if (content !== loaded.texts[key]) writes.push({ path: join(dir, name), content });
    }
    for (const extra of outcome.extraFiles ?? []) writes.push({ path: join(dir, extra.name), content: extra.content });
    const { line, event } = eventLine(loaded.events.length + 1, isoNow(clock), outcome.state.inspection.phase, outcome.event);
    for (const w of writes) await writeFileAtomic(w.path, w.content);
    await writeFileAtomic(join(dir, EVENTS_FILE), loaded.eventsText + line);
    return { result: outcome.result, event, state: outcome.state };
  });
}

export interface CreatedInspection {
  state: InspectionState;
  diffText: string;
  event: PendingEvent;
}

/**
 * Allocates the next ID under the lock and writes a new inspection folder.
 * Files go to a hidden temp folder first, which is renamed into place, so a
 * failure leaves no partial inspection (FM-R2.9).
 */
export async function createInspection(
  repoRoot: string,
  clock: Clock,
  build: (id: string) => CreatedInspection | Promise<CreatedInspection>,
): Promise<{ id: string; state: InspectionState; event: FaganEvent }> {
  return withLock(lockPath(repoRoot), async () => {
    const id = await nextInspectionId(repoRoot);
    const created = await build(id);
    if (created.state.inspection.id !== id) throw new Error(`built inspection has id ${created.state.inspection.id}, expected ${id}`);
    await mkdir(inspectionsDir(repoRoot), { recursive: true });
    const tmpDir = join(inspectionsDir(repoRoot), `.tmp-${id}-${process.pid}`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir);
    try {
      for (const key of STATE_KEYS) {
        const { name, schema } = STATE_FILES[key];
        await writeFileAtomic(join(tmpDir, name), toDeterministicJson(schema as z.ZodType, created.state[key]));
      }
      await writeFileAtomic(join(tmpDir, DIFF_FILE), created.diffText);
      const { line, event } = eventLine(1, isoNow(clock), created.state.inspection.phase, created.event);
      await writeFileAtomic(join(tmpDir, EVENTS_FILE), line);
      await rename(tmpDir, inspectionDir(repoRoot, id));
      return { id, state: created.state, event };
    } catch (err) {
      await rm(tmpDir, { recursive: true, force: true });
      throw err;
    }
  });
}
