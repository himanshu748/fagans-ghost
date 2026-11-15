// zod schemas and inferred types for every stored file (PLAN.md section 7,
// design.md "Schemas and file formats"). Key order in each object schema is the
// key order on disk, because core/json.ts serializes the zod parse output.
import { z } from "zod";

export const ROLES = [
  "moderator",
  "reader",
  "inspector-logic",
  "inspector-interfaces",
  "scribe",
  "author",
] as const;
export type Role = (typeof ROLES)[number];
export const RoleSchema = z.enum(ROLES);

export const RAISED_BY_ROLES = [
  "moderator",
  "reader",
  "inspector-logic",
  "inspector-interfaces",
  "author",
] as const;
export const RaisedBySchema = z.enum(RAISED_BY_ROLES);

export const PHASES = [
  "Planning",
  "Overview",
  "Preparation",
  "Meeting",
  "Rework",
  "FollowUp",
  "Closed",
  "Abandoned",
] as const;
export type Phase = (typeof PHASES)[number];
export const PhaseSchema = z.enum(PHASES);

export const DEFECT_TYPES = ["logic", "interface", "data", "documentation", "other"] as const;
export type DefectType = (typeof DEFECT_TYPES)[number];
export const DEFECT_CLASSES = ["missing", "wrong", "extra"] as const;
export const SEVERITIES = ["major", "minor"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INSPECTION_ID_RE = /^insp-[0-9]{4}$/;
export const UNIT_ID_RE = /^U[0-9]{3,}$/;
export const DEFECT_ID_RE = /^D[0-9]{3,}$/;
export const READING_ID_RE = /^R[0-9]{3,}$/;
/** `Date.prototype.toISOString()` output for years 0000 to 9999. */
export const ISO_TIME_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

export const InspectionIdSchema = z.string().regex(INSPECTION_ID_RE, "must match ^insp-[0-9]{4}$");
export const UnitIdSchema = z.string().regex(UNIT_ID_RE, "must match ^U[0-9]{3,}$");
export const DefectIdSchema = z.string().regex(DEFECT_ID_RE, "must match ^D[0-9]{3,}$");
export const ReadingIdSchema = z.string().regex(READING_ID_RE, "must match ^R[0-9]{3,}$");
export const IsoTimeSchema = z.string().regex(ISO_TIME_RE, "must be an ISO 8601 UTC time with milliseconds");

const Count = z.int().min(0);
const LineNo = z.int().min(1);

// ---------------------------------------------------------------- config

export const ChecklistRuleSchema = z.strictObject({
  match: z.array(z.string().min(1)).min(1),
  checklist: z.string().min(1),
});

export const ConfigSchema = z.strictObject({
  schemaVersion: z.literal("fagan-config/1"),
  sizeLimitLoc: z.int().min(1),
  suggestThresholdLoc: Count,
  maxUnitLines: z.int().min(1).max(1000),
  build: z.array(z.string().min(1)).min(1),
  test: z.array(z.string().min(1)).min(1),
  commandTimeoutMs: z.int().min(1),
  exclude: z.array(z.string().min(1)),
  checklists: z.array(ChecklistRuleSchema),
  defaultChecklist: z.string().min(1),
  requireLocationChange: z.boolean(),
  waiverMinChars: z.int().min(1),
  judgmentWords: z.array(z.string().min(1)),
  rateWarnings: z.strictObject({
    maxPreparationLocPerHour: z.number().positive().nullable(),
    maxInspectionLocPerHour: z.number().positive().nullable(),
  }),
});
export type Config = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------- checklists

export const ChecklistItemSchema = z.strictObject({
  id: z.string().min(1),
  question: z.string().min(1),
  typeHint: z.enum(DEFECT_TYPES),
});

export const ChecklistSchema = z.strictObject({
  schemaVersion: z.literal("fagan-checklist/1"),
  id: z.string().min(1),
  title: z.string().min(1),
  items: z.array(ChecklistItemSchema).min(1),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

// ---------------------------------------------------------------- inspection

/** Outcome of one build or test command. A check that did not run is `{ ran: false, passed: false, exitCode: null, durationMs: null }`. */
export const CheckResultSchema = z.strictObject({
  ran: z.boolean(),
  passed: z.boolean(),
  exitCode: z.int().nullable(),
  durationMs: Count.nullable(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const SizeCheckSchema = z.strictObject({
  changedLoc: Count,
  limit: z.int().min(1),
  passed: z.boolean(),
});

export const EntrySchema = z.strictObject({
  build: CheckResultSchema,
  tests: CheckResultSchema,
  size: SizeCheckSchema,
});
export type Entry = z.infer<typeof EntrySchema>;

export const TimestampsSchema = z.strictObject({
  planningStart: IsoTimeSchema,
  planningEnd: IsoTimeSchema,
  overviewStart: IsoTimeSchema,
  preparationStart: IsoTimeSchema.nullable(),
  meetingStart: IsoTimeSchema.nullable(),
  meetingEnd: IsoTimeSchema.nullable(),
  reworkStart: IsoTimeSchema.nullable(),
  followupStart: IsoTimeSchema.nullable(),
  closedAt: IsoTimeSchema.nullable(),
  abandonedAt: IsoTimeSchema.nullable(),
});
export type Timestamps = z.infer<typeof TimestampsSchema>;

export const RangeSchema = z.strictObject({
  base: z.string().min(1).max(200),
  head: z.string().min(1).max(200),
  baseSha: z.string().regex(/^[0-9a-f]{40,64}$/),
  headSha: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(),
});
export type Range = z.infer<typeof RangeSchema>;

export const InspectionSchema = z.strictObject({
  schemaVersion: z.literal("fagan-inspection/1"),
  id: InspectionIdSchema,
  title: z.string().min(1).max(200),
  range: RangeSchema,
  phase: PhaseSchema,
  timestamps: TimestampsSchema,
  entry: EntrySchema,
  authorOverview: z.string().max(4000).nullable(),
  meetingNotes: z.string().max(4000).nullable(),
  abandonReason: z.string().nullable(),
});
export type Inspection = z.infer<typeof InspectionSchema>;

// ---------------------------------------------------------------- packet

export const FILE_STATUSES = ["added", "modified", "deleted", "renamed"] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

export const PacketFileSchema = z.strictObject({
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable(),
  status: z.enum(FILE_STATUSES),
  blobBefore: z.string().nullable(),
  blobAfter: z.string().nullable(),
  checklist: z.string().min(1),
  skipped: z.enum(["binary", "excluded"]).nullable(),
});
export type PacketFile = z.infer<typeof PacketFileSchema>;

export const LINE_KINDS = ["add", "del", "ctx"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const UnitLineSchema = z.strictObject({
  kind: z.enum(LINE_KINDS),
  oldNo: LineNo.nullable(),
  newNo: LineNo.nullable(),
  text: z.string(),
  /** True when git printed `\ No newline at end of file` after this line (FM-R4.7). */
  noNewlineAtEof: z.boolean(),
});
export type UnitLine = z.infer<typeof UnitLineSchema>;

export const UnitSchema = z.strictObject({
  id: UnitIdSchema,
  file: z.string().min(1),
  hunkHeader: z.string().min(1),
  changedLoc: z.int().min(1),
  lines: z.array(UnitLineSchema).min(1),
});
export type Unit = z.infer<typeof UnitSchema>;

export const PacketSchema = z.strictObject({
  schemaVersion: z.literal("fagan-packet/1"),
  changedLoc: Count,
  files: z.array(PacketFileSchema),
  units: z.array(UnitSchema),
});
export type Packet = z.infer<typeof PacketSchema>;

// ---------------------------------------------------------------- readings

export const ReadingSchema = z.strictObject({
  id: ReadingIdSchema,
  unitId: UnitIdSchema,
  paraphrase: z.string().min(1).max(4000),
  judgmentFlags: z.array(z.string()),
  recordedAt: IsoTimeSchema,
});
export type Reading = z.infer<typeof ReadingSchema>;

export const ReadingsFileSchema = z.strictObject({
  schemaVersion: z.literal("fagan-readings/1"),
  readings: z.array(ReadingSchema),
});
export type ReadingsFile = z.infer<typeof ReadingsFileSchema>;

// ---------------------------------------------------------------- defects

export const LocationSchema = z.strictObject({
  file: z.string().min(1),
  side: z.enum(["new", "old"]),
  lineStart: LineNo,
  lineEnd: LineNo,
});

export const DefectSchema = z.strictObject({
  id: DefectIdSchema,
  unitId: UnitIdSchema,
  location: LocationSchema,
  type: z.enum(DEFECT_TYPES),
  class: z.enum(DEFECT_CLASSES).nullable(),
  severity: z.enum(SEVERITIES),
  raisedBy: RaisedBySchema,
  recordedBy: z.literal("scribe"),
  description: z.string().min(1).max(2000),
  checklistItemId: z.string().min(1).nullable(),
  loggedAt: IsoTimeSchema,
});
export type Defect = z.infer<typeof DefectSchema>;

export const DefectsFileSchema = z.strictObject({
  schemaVersion: z.literal("fagan-defects/1"),
  defects: z.array(DefectSchema),
});
export type DefectsFile = z.infer<typeof DefectsFileSchema>;

// ---------------------------------------------------------------- rework

export const ReworkItemSchema = z.strictObject({
  defectId: DefectIdSchema,
  resolution: z.enum(["fixed", "waived"]),
  note: z.string().nullable(),
  reason: z.string().nullable(),
  recordedAt: IsoTimeSchema,
});
export type ReworkItem = z.infer<typeof ReworkItemSchema>;

export const ReworkFileSchema = z.strictObject({
  schemaVersion: z.literal("fagan-rework/1"),
  items: z.array(ReworkItemSchema),
});
export type ReworkFile = z.infer<typeof ReworkFileSchema>;

// ---------------------------------------------------------------- followup

export const DEFECT_STATUSES = ["verified", "fixed_unverified", "waived", "open"] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export const AttemptDefectSchema = z.strictObject({
  defectId: DefectIdSchema,
  severity: z.enum(SEVERITIES),
  status: z.enum(DEFECT_STATUSES),
});

export const AttemptSchema = z.strictObject({
  n: z.int().min(1),
  at: IsoTimeSchema,
  checks: z.strictObject({ build: CheckResultSchema, tests: CheckResultSchema }),
  defects: z.array(AttemptDefectSchema),
  blocking: z.array(DefectIdSchema),
  passed: z.boolean(),
  /**
   * Working-tree blob hash of each packet file when the attempt ran, by path
   * in byte order (null when the file was gone). `hook suggest` uses the
   * passing attempt's hashes to know which content a Closed inspection
   * accepted after rework (FM-R9.6, FM-R15.2).
   */
  blobs: z.array(z.strictObject({ path: z.string().min(1), blob: z.string().nullable() })),
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const FollowupFileSchema = z.strictObject({
  schemaVersion: z.literal("fagan-followup/1"),
  attempts: z.array(AttemptSchema),
});
export type FollowupFile = z.infer<typeof FollowupFileSchema>;

// ---------------------------------------------------------------- metrics

export const NULL_REASONS = ["phase_not_reached", "non_positive_duration", "zero_loc"] as const;
export type NullReason = (typeof NULL_REASONS)[number];

export const METRIC_FIELDS = [
  "durationsMs.planning",
  "durationsMs.overview",
  "durationsMs.preparation",
  "durationsMs.meeting",
  "durationsMs.rework",
  "durationsMs.followup",
  "preparationRateLocPerHour",
  "inspectionRateLocPerHour",
  "defectsPerKloc",
  "majorsPerKloc",
] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];

/**
 * Metric values. JSON has no negative zero, so -0 would come back as 0 after
 * export and import (found by property P4, see docs/experiments.md); it is
 * rejected here and computeMetrics never produces it.
 */
const MaybeNumber = z
  .number()
  .refine((n) => !Object.is(n, -0), "negative zero cannot round-trip through JSON")
  .nullable();

export const ByTypeSchema = z.strictObject({
  logic: Count,
  interface: Count,
  data: Count,
  documentation: Count,
  other: Count,
});
export type ByType = z.infer<typeof ByTypeSchema>;

export const MetricsSchema = z.strictObject({
  schemaVersion: z.literal("fagan-metrics/1"),
  computedAt: IsoTimeSchema,
  changedLoc: Count,
  durationsMs: z.strictObject({
    planning: MaybeNumber,
    overview: MaybeNumber,
    preparation: MaybeNumber,
    meeting: MaybeNumber,
    rework: MaybeNumber,
    followup: MaybeNumber,
  }),
  preparationRateLocPerHour: MaybeNumber,
  inspectionRateLocPerHour: MaybeNumber,
  defectsPerKloc: MaybeNumber,
  majorsPerKloc: MaybeNumber,
  defects: z.strictObject({ total: Count, major: Count, minor: Count }),
  byType: ByTypeSchema,
  nullReasons: z.array(z.strictObject({ field: z.enum(METRIC_FIELDS), reason: z.enum(NULL_REASONS) })),
  warnings: z.array(z.strictObject({ code: z.string().min(1), message: z.string().min(1) })),
});
export type Metrics = z.infer<typeof MetricsSchema>;

// ---------------------------------------------------------------- events

export const EVENT_TOOLS = [
  "open_inspection",
  "get_packet",
  "record_reading",
  "log_defect",
  "close_meeting",
  "record_rework",
  "follow_up",
  "metrics",
  "export_report",
  "cli:abandon",
  "cli:follow-up",
  "cli:export",
] as const;
export type EventTool = (typeof EVENT_TOOLS)[number];

/** True when any object inside `value` has an own `__proto__` key. */
export function hasProtoKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasProtoKey);
  if (value !== null && typeof value === "object") {
    if (Object.hasOwn(value, "__proto__")) return true;
    return Object.values(value).some(hasProtoKey);
  }
  return false;
}

/** True when `value` is -0 or contains -0 at any depth. */
export function hasNegativeZero(value: unknown): boolean {
  if (typeof value === "number") return Object.is(value, -0);
  if (Array.isArray(value)) return value.some(hasNegativeZero);
  if (value !== null && typeof value === "object") return Object.values(value).some(hasNegativeZero);
  return false;
}

/**
 * Free-form event data. zod's record parsing silently drops `__proto__` keys,
 * which lost data on export and import (found by property P4, see
 * docs/experiments.md), so such keys are rejected before parsing. Negative
 * zero is rejected for the same reason as in metrics: JSON writes it as 0
 * (also found by P4).
 */
export const EventDataSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (hasProtoKey(value)) ctx.addIssue({ code: "custom", message: "__proto__ keys are not allowed in event data" });
    if (hasNegativeZero(value)) ctx.addIssue({ code: "custom", message: "negative zero cannot round-trip through JSON" });
  })
  .pipe(z.record(z.string(), z.json()));

export const EventSchema = z.strictObject({
  seq: z.int().min(1),
  at: IsoTimeSchema,
  tool: z.enum(EVENT_TOOLS),
  /** Declared caller role; `human` for CLI commands; null for tools that take no role (`metrics`). */
  role: z.union([RoleSchema, z.literal("human")]).nullable(),
  phase: PhaseSchema,
  data: EventDataSchema,
});
export type FaganEvent = z.infer<typeof EventSchema>;

// ---------------------------------------------------------------- report

export const ReportSchema = z.strictObject({
  schemaVersion: z.literal("fagan-report/1"),
  generator: z.strictObject({ name: z.literal("fagan-mcp"), version: z.string().min(1) }),
  exportedAt: IsoTimeSchema,
  inspection: InspectionSchema,
  packet: PacketSchema,
  checklists: z.array(ChecklistSchema),
  readings: ReadingsFileSchema,
  defects: DefectsFileSchema,
  rework: ReworkFileSchema,
  followup: FollowupFileSchema,
  metrics: MetricsSchema,
  events: z.array(EventSchema),
});
export type Report = z.infer<typeof ReportSchema>;
