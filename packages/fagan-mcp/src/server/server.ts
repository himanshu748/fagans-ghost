// The stdio MCP server: nine tools over src/service (FM-R14.5, FM-R14.6,
// FM-R14.8, FM-R15.1). APIs as documented in the SDK v1.x server docs:
// McpServer.registerTool with zod raw-shape input schemas, StdioServerTransport.
// stdout carries the protocol, so every log line goes to stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { isFaganError } from "../core/errors.js";
import {
  DEFECT_CLASSES,
  DEFECT_TYPES,
  DefectIdSchema,
  InspectionIdSchema,
  RAISED_BY_ROLES,
  SEVERITIES,
  UnitIdSchema,
} from "../core/schema.js";
import {
  closeMeetingService,
  exportReportService,
  followUpService,
  getPacketService,
  logDefectService,
  metricsService,
  openInspection,
  PACKAGE_VERSION,
  recordReadingService,
  recordReworkService,
  resolveRoot,
  type ServiceContext,
} from "../service/service.js";

export const TOOL_NAMES = [
  "open_inspection",
  "get_packet",
  "record_reading",
  "log_defect",
  "close_meeting",
  "record_rework",
  "follow_up",
  "metrics",
  "export_report",
] as const;

/** Writes one line to stderr. Never use console.log here: stdout is the protocol stream. */
export function log(message: string): void {
  process.stderr.write(`[fagan-mcp] ${message}\n`);
}

function ok(result: object): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result as Record<string, unknown>,
  };
}

/** `{ code, message, details }` as the text of an `isError` result (FM-R14.5). */
export function errorResult(err: unknown): CallToolResult {
  let body: { code: string; message: string; details: Record<string, unknown> };
  if (isFaganError(err)) {
    body = err.toJSON();
  } else {
    // Not a FaganError: a bug or an I/O failure. Keep the stack on stderr only.
    log(`internal error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    body = { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err), details: {} };
  }
  return { content: [{ type: "text", text: JSON.stringify(body) }], isError: true };
}

async function run(fn: () => Promise<object>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

// Role is a plain string so that a wrong or unknown role reaches the service
// and comes back as ROLE_NOT_ALLOWED (FM-R2.1, FM-R14.4) instead of an SDK
// schema error. The allowed roles are in each description.
const role = (allowed: string) => z.string().min(1).max(64).describe(`Your declared role. Allowed: ${allowed}.`);
const inspectionId = InspectionIdSchema.describe("Inspection ID, insp-NNNN");

export function createServer(ctx: ServiceContext): McpServer {
  const server = new McpServer({ name: "fagan-mcp", version: PACKAGE_VERSION });

  server.registerTool(
    "open_inspection",
    {
      title: "Open inspection",
      description:
        "Planning: check entry criteria (diff size, build, tests) for base..head and, if they pass, create a new inspection in phase Overview with its packet of units. Nothing is stored when a criterion fails.",
      inputSchema: {
        role: role("moderator"),
        title: z.string().min(1).max(200).describe("Short title for the inspection"),
        base: z.string().min(1).max(200).default("HEAD").describe("Base git revision; must not start with '-'"),
        head: z
          .string()
          .min(1)
          .max(200)
          .default("WORKTREE")
          .describe("Head git revision, or WORKTREE for the working tree including staged changes"),
        include_untracked: z.boolean().default(true).describe("With head WORKTREE, include untracked, non-ignored files"),
        author_overview: z.string().max(4000).optional().describe("The Author's overview note"),
      },
    },
    (a) =>
      run(() =>
        openInspection(ctx, {
          role: a.role,
          title: a.title,
          base: a.base,
          head: a.head,
          include_untracked: a.include_untracked,
          author_overview: a.author_overview ?? null,
        }),
      ),
  );

  server.registerTool(
    "get_packet",
    {
      title: "Get packet",
      description:
        "Return packet units (diff hunks with line numbers) and their checklists. phase 'preparation' moves Overview to Preparation; phase 'meeting' (moderator only) moves Preparation to Meeting. Paginated with cursor and limit.",
      inputSchema: {
        inspection_id: inspectionId,
        role: role("moderator, reader, inspector-logic, inspector-interfaces, scribe, author"),
        phase: z.enum(["overview", "preparation", "meeting"]).describe("Which phase the packet is requested for"),
        unit_ids: z.array(UnitIdSchema).min(1).max(1000).optional().describe("Only these units"),
        cursor: z.string().min(1).max(200).optional().describe("next_cursor from a previous call"),
        limit: z.int().min(1).max(50).default(20).describe("Units per page"),
      },
    },
    (a) =>
      run(() =>
        getPacketService(ctx, {
          inspection_id: a.inspection_id,
          role: a.role,
          phase: a.phase,
          unit_ids: a.unit_ids ?? null,
          cursor: a.cursor ?? null,
          limit: a.limit,
        }),
      ),
  );

  server.registerTool(
    "record_reading",
    {
      title: "Record reading",
      description:
        "Meeting: store the Reader's paraphrase of one unit. Configured judgment words in the text are flagged, and the reading is still stored. One reading per unit.",
      inputSchema: {
        inspection_id: inspectionId,
        role: role("reader"),
        unit_id: UnitIdSchema.describe("Unit ID, UNNN"),
        paraphrase: z.string().min(1).max(4000).describe("What the code does, in plain words, without judging it"),
      },
    },
    (a) => run(() => recordReadingService(ctx, a)),
  );

  server.registerTool(
    "log_defect",
    {
      title: "Log defect",
      description:
        "Meeting: the Scribe records one defect at a line range inside a packet unit, with type, severity and who raised it. Returns the new defect ID and severity counts.",
      inputSchema: {
        inspection_id: inspectionId,
        role: role("scribe"),
        unit_id: UnitIdSchema.describe("Unit the defect is in"),
        file: z.string().min(1).max(4096).describe("Repo-relative path of a file in the packet"),
        line_start: z.int().min(1).describe("First line, on the given side"),
        line_end: z.int().min(1).describe("Last line, at least line_start"),
        side: z.enum(["new", "old"]).describe("new: line numbers after the change; old: before"),
        type: z.enum(DEFECT_TYPES),
        class: z.enum(DEFECT_CLASSES).optional(),
        severity: z.enum(SEVERITIES).describe("A major blocks the exit and the commit gate until fixed and verified, or waived"),
        raised_by: z.enum(RAISED_BY_ROLES).describe("Role that found the defect"),
        description: z.string().min(1).max(2000),
        checklist_item_id: z.string().min(1).max(100).optional().describe("Checklist item the defect relates to"),
      },
    },
    (a) =>
      run(() =>
        logDefectService(ctx, {
          inspection_id: a.inspection_id,
          role: a.role,
          unit_id: a.unit_id,
          file: a.file,
          line_start: a.line_start,
          line_end: a.line_end,
          side: a.side,
          type: a.type,
          class: a.class ?? null,
          severity: a.severity,
          raised_by: a.raised_by,
          description: a.description,
          checklist_item_id: a.checklist_item_id ?? null,
        }),
      ),
  );

  server.registerTool(
    "close_meeting",
    {
      title: "Close meeting",
      description:
        "End the meeting once every unit has a reading. Moves to Rework if any defect was logged, else to FollowUp, and returns defect totals and the meeting duration.",
      inputSchema: {
        inspection_id: inspectionId,
        role: role("moderator"),
        notes: z.string().max(4000).optional().describe("Meeting notes"),
      },
    },
    (a) => run(() => closeMeetingService(ctx, { inspection_id: a.inspection_id, role: a.role, notes: a.notes ?? null })),
  );

  server.registerTool(
    "record_rework",
    {
      title: "Record rework",
      description:
        "Rework: the Author marks defects fixed (with a note) or waived (with a reason of at least waiverMinChars characters). A later item for the same defect replaces the earlier one.",
      inputSchema: {
        inspection_id: inspectionId,
        role: role("author"),
        items: z
          .array(
            z.discriminatedUnion("resolution", [
              z.object({
                defect_id: DefectIdSchema,
                resolution: z.literal("fixed"),
                note: z.string().min(1).max(2000).describe("What was changed"),
              }),
              z.object({
                defect_id: DefectIdSchema,
                resolution: z.literal("waived"),
                reason: z.string().max(4000).describe("Why the defect is accepted as is"),
              }),
            ]),
          )
          .min(1)
          .max(200),
      },
    },
    (a) => run(() => recordReworkService(ctx, a)),
  );

  server.registerTool(
    "follow_up",
    {
      title: "Follow up",
      description:
        "Re-run build and tests, verify each fixed defect (checks pass and its file changed), and apply the exit rule: Closed if every major is verified or validly waived, else back to Rework with the blocking defect IDs.",
      inputSchema: {
        inspection_id: inspectionId,
        role: role("moderator, author"),
        run_checks: z.boolean().default(true).describe("Run the configured build and test commands"),
      },
    },
    (a) =>
      run(() =>
        followUpService(ctx, { inspection_id: a.inspection_id, caller: { kind: "tool", role: a.role }, run_checks: a.run_checks }),
      ),
  );

  server.registerTool(
    "metrics",
    {
      title: "Metrics",
      description:
        "Compute durations, preparation and inspection rates (LOC per hour), defects per KLOC and counts by type from the stored timestamps, and write metrics.json. Values that cannot be computed yet are null with a reason.",
      inputSchema: { inspection_id: inspectionId },
    },
    (a) => run(() => metricsService(ctx, a)),
  );

  server.registerTool(
    "export_report",
    {
      title: "Export report",
      description:
        "Write the self-contained report.json and the 132-column report.txt listing for an inspection in any phase, and return each file's path, sha256 and size.",
      inputSchema: {
        inspection_id: inspectionId,
        role: role("moderator, author"),
        formats: z.array(z.enum(["json", "txt"])).min(1).max(2).default(["json", "txt"]),
      },
    },
    (a) =>
      run(() =>
        exportReportService(ctx, { inspection_id: a.inspection_id, caller: { kind: "tool", role: a.role }, formats: a.formats }),
      ),
  );

  return server;
}

/** `fagan serve`: connect the server to stdio and run until stdin closes. */
export async function startServer(ctx: ServiceContext): Promise<void> {
  try {
    const root = await resolveRoot(ctx.cwd);
    log(`serving repo ${root}`);
  } catch (err) {
    // Keep serving: every tool call will return NOT_A_GIT_REPO (FM-R14.7).
    log(`warning: ${err instanceof Error ? err.message : String(err)}`);
  }
  const server = createServer(ctx);
  await server.connect(new StdioServerTransport());
}
