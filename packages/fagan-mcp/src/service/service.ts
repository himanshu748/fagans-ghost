// Tool services: one function per tool, shared by the MCP server and the CLI
// (design.md "Module layout"). Each one resolves the repo, loads config and
// checklists, and runs the pure core operation inside a store transaction, so
// a thrown FaganError leaves the store unchanged (FM-R1.3).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isoNow, type Clock } from "../clock.js";
import { FaganError } from "../core/errors.js";
import { openMajorIds } from "../core/followup.js";
import { toDeterministicJson } from "../core/json.js";
import {
  closeMeeting,
  followUp,
  getPacket,
  logDefect,
  metricsOp,
  recordReading,
  recordRework,
  abandon,
  type CloseMeetingResult,
  type FollowUpResult,
  type GetPacketResult,
  type LogDefectResult,
  type PacketPhase,
  type RecordReadingResult,
  type RecordReworkResult,
} from "../core/ops.js";
import { countChangedLoc, buildPacket } from "../core/packet.js";
import { assertPhase, isTerminal } from "../core/phase.js";
import { buildReport, renderReportTxt, serializeReport } from "../core/report.js";
import { assertRole } from "../core/roles.js";
import { MetricsSchema, type CheckResult, type DefectType, type EventTool, type Metrics, type Phase, type Role, type Severity } from "../core/schema.js";
import { checkEntry, checkSize, createInspectionState, type OpOutcome } from "../core/state.js";
import type { ReworkInput } from "../core/rework.js";
import { collectDiff, currentBlobs, repoRoot, WORKTREE } from "../git/git.js";
import { runChecks, NOT_RUN } from "../runner/runner.js";
import { assertConfigChecklists, loadChecklists } from "../store/checklists.js";
import {
  createInspection,
  INSPECTIONS_DIR,
  listInspectionIds,
  loadConfig,
  loadState,
  readDiff,
  STORE_DIR,
  transact,
  type ExtraFile,
  type ExtraFileName,
} from "../store/store.js";

/**
 * Paths that are never part of an inspected diff: the inspection records
 * themselves and the store lock. Without this, the second inspection would
 * inspect the first one's files, and `hook suggest` would count them.
 */
export const STORE_EXCLUDE_PATHS: readonly string[] = [".fagan/inspections", ".fagan/.lock"];

/** `version` from this package's package.json (src/service and dist/service are two levels below it). */
export const PACKAGE_VERSION: string = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }
).version;

export interface ServiceContext {
  /** Directory the process (or hook payload) runs in; the repo root is found from here. */
  cwd: string;
  clock: Clock;
}

/**
 * `git rev-parse --show-toplevel` from `FAGAN_REPO_ROOT` if set (tests only,
 * design.md "Repo root and config"), else from `ctx.cwd` (FM-R14.7).
 */
export async function resolveRoot(cwd: string): Promise<string> {
  const override = process.env["FAGAN_REPO_ROOT"];
  return repoRoot(override !== undefined && override.length > 0 ? override : cwd);
}

function validationError(path: string, message: string): FaganError {
  return new FaganError("VALIDATION_ERROR", `${path} ${message}`, { issues: [{ path, message }] });
}

function checkLength(path: string, value: string | null, min: number, max: number): void {
  if (value === null) return;
  if (value.length < min || value.length > max) throw validationError(path, `must be ${min} to ${max} characters`);
}

export interface CheckView {
  ran: boolean;
  passed: boolean;
  exit_code: number | null;
  duration_ms: number | null;
}

function checkView(c: CheckResult): CheckView {
  return { ran: c.ran, passed: c.passed, exit_code: c.exitCode, duration_ms: c.durationMs };
}

// ---------------------------------------------------------------- open_inspection

export interface OpenInspectionInput {
  role: string;
  title: string;
  base: string;
  head: string;
  include_untracked: boolean;
  author_overview: string | null;
}

export interface OpenInspectionResult {
  inspection_id: string;
  phase: "Overview";
  range: { base: string; head: string; base_sha: string; head_sha: string | null };
  entry: {
    build: CheckView;
    tests: CheckView;
    size: { changed_loc: number; limit: number; passed: boolean };
  };
  files: number;
  units: number;
  checklists: string[];
}

/** Planning: entry criteria, then a new inspection folder in Overview (FM-R2). */
export async function openInspection(ctx: ServiceContext, input: OpenInspectionInput): Promise<OpenInspectionResult> {
  assertRole("open_inspection", input.role);
  checkLength("title", input.title, 1, 200);
  checkLength("author_overview", input.author_overview, 0, 4000);
  const root = await resolveRoot(ctx.cwd);
  const config = await loadConfig(root);
  const checklists = await loadChecklists();
  assertConfigChecklists(config, checklists);
  const planningStart = isoNow(ctx.clock);

  const diff = await collectDiff(root, {
    base: input.base,
    head: input.head,
    includeUntracked: input.include_untracked,
    excludePaths: STORE_EXCLUDE_PATHS,
  });
  const packet = buildPacket(
    diff.files,
    {
      maxUnitLines: config.maxUnitLines,
      exclude: config.exclude,
      checklists: config.checklists,
      defaultChecklist: config.defaultChecklist,
    },
    diff.blobs,
  );
  // Size first, so an oversized diff never runs the build (FM-R2.5).
  const size = checkSize(packet.changedLoc, config.sizeLimitLoc);
  const checks = await runChecks(config, root);
  const entry = { build: checks.build, tests: checks.tests, size };
  checkEntry(entry);
  const planningEnd = isoNow(ctx.clock);
  const role = input.role;
  const range = { base: input.base, head: input.head, baseSha: diff.baseSha, headSha: diff.headSha };

  const created = await createInspection(root, ctx.clock, (id) => ({
    state: createInspectionState({
      id,
      title: input.title,
      range,
      authorOverview: input.author_overview,
      entry,
      packet,
      planningStart,
      planningEnd,
    }),
    diffText: diff.diffText,
    event: {
      tool: "open_inspection",
      role,
      data: {
        title: input.title,
        base: input.base,
        head: input.head,
        changed_loc: packet.changedLoc,
        files: packet.files.length,
        units: packet.units.length,
      },
    },
  }));

  const used = [...new Set(packet.files.filter((f) => f.skipped === null).map((f) => f.checklist))].sort();
  return {
    inspection_id: created.id,
    phase: "Overview",
    range: { base: range.base, head: range.head, base_sha: range.baseSha, head_sha: range.headSha },
    entry: {
      build: checkView(entry.build),
      tests: checkView(entry.tests),
      size: { changed_loc: size.changedLoc, limit: size.limit, passed: size.passed },
    },
    files: packet.files.length,
    units: packet.units.length,
    checklists: used,
  };
}

// ---------------------------------------------------------------- get_packet

export interface GetPacketToolInput {
  inspection_id: string;
  role: string;
  phase: PacketPhase;
  unit_ids: readonly string[] | null;
  cursor: string | null;
  limit: number;
}

export async function getPacketService(ctx: ServiceContext, input: GetPacketToolInput): Promise<GetPacketResult> {
  const root = await resolveRoot(ctx.cwd);
  const checklists = await loadChecklists();
  const out = await transact(root, input.inspection_id, ctx.clock, (state) =>
    getPacket(
      state,
      { role: input.role, phase: input.phase, unitIds: input.unit_ids, cursor: input.cursor, limit: input.limit },
      isoNow(ctx.clock),
      checklists,
    ),
  );
  return out.result;
}

// ---------------------------------------------------------------- record_reading

export async function recordReadingService(
  ctx: ServiceContext,
  input: { inspection_id: string; role: string; unit_id: string; paraphrase: string },
): Promise<RecordReadingResult> {
  const root = await resolveRoot(ctx.cwd);
  const config = await loadConfig(root);
  const out = await transact(root, input.inspection_id, ctx.clock, (state) =>
    recordReading(state, { role: input.role, unitId: input.unit_id, paraphrase: input.paraphrase }, isoNow(ctx.clock), config.judgmentWords),
  );
  return out.result;
}

// ---------------------------------------------------------------- log_defect

export interface LogDefectToolInput {
  inspection_id: string;
  role: string;
  unit_id: string;
  file: string;
  line_start: number;
  line_end: number;
  side: "new" | "old";
  type: DefectType;
  class: "missing" | "wrong" | "extra" | null;
  severity: Severity;
  raised_by: string;
  description: string;
  checklist_item_id: string | null;
}

export async function logDefectService(ctx: ServiceContext, input: LogDefectToolInput): Promise<LogDefectResult> {
  const root = await resolveRoot(ctx.cwd);
  const checklists = await loadChecklists();
  const out = await transact(root, input.inspection_id, ctx.clock, (state) =>
    logDefect(
      state,
      {
        role: input.role,
        unitId: input.unit_id,
        file: input.file,
        lineStart: input.line_start,
        lineEnd: input.line_end,
        side: input.side,
        type: input.type,
        class: input.class,
        severity: input.severity,
        raisedBy: input.raised_by,
        description: input.description,
        checklistItemId: input.checklist_item_id,
      },
      isoNow(ctx.clock),
      checklists,
    ),
  );
  return out.result;
}

// ---------------------------------------------------------------- close_meeting

export async function closeMeetingService(
  ctx: ServiceContext,
  input: { inspection_id: string; role: string; notes: string | null },
): Promise<CloseMeetingResult> {
  const root = await resolveRoot(ctx.cwd);
  const out = await transact(root, input.inspection_id, ctx.clock, (state) =>
    closeMeeting(state, { role: input.role, notes: input.notes }, isoNow(ctx.clock)),
  );
  return out.result;
}

// ---------------------------------------------------------------- record_rework

export type ReworkToolItem =
  | { defect_id: string; resolution: "fixed"; note: string }
  | { defect_id: string; resolution: "waived"; reason: string };

export async function recordReworkService(
  ctx: ServiceContext,
  input: { inspection_id: string; role: string; items: readonly ReworkToolItem[] },
): Promise<RecordReworkResult> {
  const root = await resolveRoot(ctx.cwd);
  const config = await loadConfig(root);
  const items: ReworkInput[] = input.items.map((i) =>
    i.resolution === "fixed"
      ? { defectId: i.defect_id, resolution: "fixed", note: i.note, reason: null }
      : { defectId: i.defect_id, resolution: "waived", note: null, reason: i.reason },
  );
  const out = await transact(root, input.inspection_id, ctx.clock, (state) =>
    recordRework(state, { role: input.role, items }, isoNow(ctx.clock), config.waiverMinChars),
  );
  return out.result;
}

// ---------------------------------------------------------------- follow_up

export interface FollowUpView {
  inspection_id: string;
  passed: boolean;
  phase: "Closed" | "Rework";
  checks: { build: CheckView; tests: CheckView };
  defects: FollowUpResult["defects"];
  blocking: string[];
}

/** Who runs follow-up: an MCP caller with a role, or the CLI on behalf of the human Author. */
export type Caller = { kind: "tool"; role: string } | { kind: "cli" };

/**
 * Runs the build and tests (unless `runChecks` is false), reads current blob
 * hashes, then records one attempt (FM-R9). Role and phase are checked before
 * any command runs, and again under the lock.
 */
export async function followUpService(
  ctx: ServiceContext,
  input: { inspection_id: string; caller: Caller; run_checks: boolean },
): Promise<FollowUpView> {
  const root = await resolveRoot(ctx.cwd);
  const config = await loadConfig(root);
  // The CLI acts for the human, who is the Author (design.md "CLI").
  const role = input.caller.kind === "tool" ? input.caller.role : "author";
  const before = await loadState(root, input.inspection_id);
  assertRole("follow_up", role);
  assertPhase("follow_up", before.inspection.phase);
  const checks = input.run_checks ? await runChecks(config, root) : { build: NOT_RUN, tests: NOT_RUN };
  const blobs = await currentBlobs(
    root,
    before.packet.files.map((f) => f.path),
  );
  const out = await transact(root, input.inspection_id, ctx.clock, (state) => {
    const outcome = followUp(state, { role, checks, currentBlobs: blobs }, isoNow(ctx.clock), config);
    if (input.caller.kind === "cli") outcome.event = { ...outcome.event, tool: "cli:follow-up", role: "human" };
    return outcome;
  });
  const r = out.result;
  return {
    inspection_id: input.inspection_id,
    passed: r.passed,
    phase: r.phase,
    checks: { build: checkView(r.checks.build), tests: checkView(r.checks.tests) },
    defects: r.defects,
    blocking: r.blocking,
  };
}

/** Highest-numbered inspection in Rework or FollowUp, or null (FM-R15.4). */
export async function latestFollowUpCandidate(ctx: ServiceContext): Promise<string | null> {
  const root = await resolveRoot(ctx.cwd);
  const ids = await listInspectionIds(root);
  for (const id of [...ids].reverse()) {
    const state = await loadState(root, id);
    if (state.inspection.phase === "Rework" || state.inspection.phase === "FollowUp") return id;
  }
  return null;
}

// ---------------------------------------------------------------- metrics

export async function metricsService(ctx: ServiceContext, input: { inspection_id: string }): Promise<Metrics> {
  const root = await resolveRoot(ctx.cwd);
  const config = await loadConfig(root);
  const out = await transact(root, input.inspection_id, ctx.clock, (state) => {
    const outcome = metricsOp(state, isoNow(ctx.clock), config.rateWarnings);
    return { ...outcome, extraFiles: [{ name: "metrics.json", content: toDeterministicJson(MetricsSchema, outcome.result) }] };
  });
  return out.result;
}

// ---------------------------------------------------------------- export_report

export type ReportFormat = "json" | "txt";

export interface ExportResult {
  files: Array<{ path: string; sha256: string; bytes: number }>;
  schema_version: "fagan-report/1";
  phase: Phase;
}

/** Writes report.json and/or report.txt (FM-R11.2, FM-R15.6). */
export async function exportReportService(
  ctx: ServiceContext,
  input: { inspection_id: string; caller: Caller; formats: readonly ReportFormat[] },
): Promise<ExportResult> {
  const root = await resolveRoot(ctx.cwd);
  const config = await loadConfig(root);
  const checklists = await loadChecklists();
  const formats = (["json", "txt"] as const).filter((f) => input.formats.includes(f));
  if (formats.length === 0) throw validationError("formats", "must list json, txt or both");
  const role: Role | "human" = input.caller.kind === "tool" ? (input.caller.role as Role) : "human";
  const tool: EventTool = input.caller.kind === "tool" ? "export_report" : "cli:export";
  const id = input.inspection_id;

  const out = await transact(root, id, ctx.clock, (state, events): OpOutcome<ExportResult> & { extraFiles: ExtraFile[] } => {
    if (input.caller.kind === "tool") assertRole("export_report", input.caller.role);
    assertPhase("export_report", state.inspection.phase);
    const at = isoNow(ctx.clock);
    const metrics = metricsOp(state, at, config.rateWarnings).result;
    const report = buildReport({ state, metrics, events, checklists, generatorVersion: PACKAGE_VERSION, exportedAt: at });
    const contents: Record<ReportFormat, { name: ExtraFileName; content: string }> = {
      json: { name: "report.json", content: serializeReport(report) },
      txt: { name: "report.txt", content: renderReportTxt(report) },
    };
    const extraFiles = formats.map((f) => contents[f]);
    const files = extraFiles.map((f) => ({
      path: `${STORE_DIR}/${INSPECTIONS_DIR}/${id}/${f.name}`,
      sha256: createHash("sha256").update(f.content, "utf8").digest("hex"),
      bytes: Buffer.byteLength(f.content, "utf8"),
    }));
    return {
      state,
      result: { files, schema_version: "fagan-report/1", phase: state.inspection.phase },
      event: { tool, role, data: { formats: [...formats], files: files.map((f) => ({ path: f.path, sha256: f.sha256 })) } },
      extraFiles,
    };
  });
  return out.result;
}

// ---------------------------------------------------------------- abandon (CLI)

export async function abandonService(
  ctx: ServiceContext,
  input: { inspection_id: string; reason: string },
): Promise<{ inspection_id: string; phase: "Abandoned" }> {
  const root = await resolveRoot(ctx.cwd);
  const config = await loadConfig(root);
  await transact(root, input.inspection_id, ctx.clock, (state) =>
    abandon(state, input.reason, isoNow(ctx.clock), config.waiverMinChars),
  );
  return { inspection_id: input.inspection_id, phase: "Abandoned" };
}

// ---------------------------------------------------------------- hooks

/**
 * The `hook suggest` check (FM-R15.2). Returns the suggestion text, or null
 * when nothing should be printed. Errors propagate; the CLI swallows them.
 */
export async function suggestion(cwd: string): Promise<string | null> {
  const root = await resolveRoot(cwd);
  const config = await loadConfig(root);
  const closedDiffs: string[] = [];
  for (const id of await listInspectionIds(root)) {
    const state = await loadState(root, id);
    if (!isTerminal(state.inspection.phase)) return null;
    if (state.inspection.phase === "Closed") closedDiffs.push(await readDiff(root, id));
  }
  const diff = await collectDiff(root, { base: "HEAD", head: WORKTREE, includeUntracked: true, excludePaths: STORE_EXCLUDE_PATHS });
  const loc = countChangedLoc(diff.files, config.exclude);
  if (loc <= config.suggestThresholdLoc) return null;
  if (closedDiffs.includes(diff.diffText)) return null;
  return (
    `fagan: ${loc} changed lines against HEAD (threshold ${config.suggestThresholdLoc}) and no inspection covers them. ` +
    "Consider asking the moderator agent to open an inspection with open_inspection."
  );
}

export interface GateBlock {
  inspection_id: string;
  defect_ids: string[];
}

/**
 * Inspections in a non-terminal phase with open majors (FM-R16.3, FM-R16.4).
 * An empty list allows the commit. A missing repo or store allows; an
 * unreadable store throws, and the CLI blocks on that (FM-R16.6).
 */
export async function gateBlocks(cwd: string): Promise<GateBlock[]> {
  let root: string;
  try {
    root = await resolveRoot(cwd);
  } catch (err) {
    if (err instanceof FaganError && err.code === "NOT_A_GIT_REPO") return [];
    throw err;
  }
  const ids = await listInspectionIds(root);
  if (ids.length === 0) return [];
  const config = await loadConfig(root);
  const blocks: GateBlock[] = [];
  for (const id of ids) {
    const s = await loadState(root, id);
    if (isTerminal(s.inspection.phase)) continue;
    const open = openMajorIds(s.defects.defects, s.rework.items, s.followup.attempts, config.waiverMinChars);
    if (open.length > 0) blocks.push({ inspection_id: id, defect_ids: open });
  }
  return blocks;
}
