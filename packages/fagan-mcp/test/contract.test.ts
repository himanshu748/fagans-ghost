// MCP contract test: spawns the built `fagan serve` over stdio with the SDK
// client and drives a full inspection in a temp git repo (task 13).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseReport } from "../src/core/report.js";
import { EventSchema, MetricsSchema } from "../src/core/schema.js";
import { CALC_V3, CLI, assertBuilt, fixtureRepo } from "./fixture.js";

const NINE = [
  "close_meeting",
  "export_report",
  "follow_up",
  "get_packet",
  "log_defect",
  "metrics",
  "open_inspection",
  "record_reading",
  "record_rework",
];

let repo: { path: string; cleanup: () => void };
let client: Client;
let stderrText = "";
let successes = 0;

function textOf(r: CallToolResult): string {
  const first = r.content[0];
  if (first === undefined || first.type !== "text") throw new Error(`expected a text block, got ${JSON.stringify(r.content)}`);
  return first.text;
}

async function call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

/** A success: structuredContent and the same object as JSON text (FM-R14.6). Counts toward events.jsonl. */
async function ok(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await call(name, args);
  if (r.isError === true) throw new Error(`${name} failed: ${textOf(r)}`);
  const parsed = JSON.parse(textOf(r)) as Record<string, unknown>;
  expect(r.structuredContent).toEqual(parsed);
  successes++;
  return parsed;
}

/** A failure: isError with `{ code, message, details }` text (FM-R14.5). */
async function fails(name: string, args: Record<string, unknown>): Promise<{ code: string; message: string; details: Record<string, unknown> }> {
  const r = await call(name, args);
  expect(r.isError).toBe(true);
  const body = JSON.parse(textOf(r)) as { code: string; message: string; details: Record<string, unknown> };
  expect(Object.keys(body).sort()).toEqual(["code", "details", "message"]);
  return body;
}

const inspDir = (): string => join(repo.path, ".fagan", "inspections", "insp-0001");
const eventLines = (): string[] => readFileSync(join(inspDir(), "events.jsonl"), "utf8").split("\n").filter((l) => l.length > 0);

beforeAll(async () => {
  assertBuilt();
  repo = fixtureRepo();
  const transport = new StdioClientTransport({ command: process.execPath, args: [CLI, "serve"], cwd: repo.path, stderr: "pipe" });
  transport.stderr?.on("data", (chunk: Buffer) => {
    stderrText += chunk.toString("utf8");
  });
  client = new Client({ name: "fagan-contract-test", version: "0.0.0" });
  await client.connect(transport);
});

afterAll(async () => {
  await client?.close();
  repo?.cleanup();
});

describe("fagan-mcp over stdio", () => {
  it("FM-R14.8 lists exactly the nine tools with descriptions and input schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(NINE);
    for (const t of tools) {
      expect(t.description?.trim().length ?? 0).toBeGreaterThan(0);
      expect(t.inputSchema.type).toBe("object");
      expect(Object.keys(t.inputSchema.properties ?? {}).length).toBeGreaterThan(0);
    }
    const byName = new Map(tools.map((t) => [t.name, t]));
    const props = (name: string) => (byName.get(name)?.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
    expect(props("get_packet")["inspection_id"]?.["pattern"]).toBe("^insp-[0-9]{4}$");
    expect(props("record_reading")["unit_id"]?.["pattern"]).toBe("^U[0-9]{3,}$");
    expect(props("open_inspection")["title"]?.["maxLength"]).toBe(200);
    expect(props("open_inspection")["base"]?.["default"]).toBe("HEAD");
    expect(props("open_inspection")["head"]?.["default"]).toBe("WORKTREE");
    expect(props("get_packet")["limit"]?.["default"]).toBe(20);
    expect(props("log_defect")["severity"]?.["enum"]).toEqual(["major", "minor"]);
    expect(Object.keys(props("metrics"))).toEqual(["inspection_id"]);
    expect(byName.get("open_inspection")?.inputSchema.required).toEqual(expect.arrayContaining(["role", "title"]));
  });

  it("FM-R14.1 rejects a path traversal inspection_id before touching the store", async () => {
    const r = await call("get_packet", { inspection_id: "../x", role: "moderator", phase: "overview" });
    // The SDK checks arguments against the advertised input schema first, so
    // this comes back as the SDK's own isError text, not fagan's JSON body
    // (design.md "MCP server").
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("inspection_id");
    expect(textOf(r)).toContain("Input validation error");
    expect(existsSync(join(repo.path, ".fagan", "inspections"))).toBe(false);
    expect(existsSync(join(repo.path, "x"))).toBe(false);
  });

  it("FM-R2.1 FM-R14.4 rejects open_inspection from a non-moderator and stores nothing", async () => {
    const body = await fails("open_inspection", { role: "reader", title: "nope" });
    expect(body.code).toBe("ROLE_NOT_ALLOWED");
    expect(body.details["allowed"]).toEqual(["moderator"]);
    expect((await fails("open_inspection", { role: "ghost", title: "nope" })).code).toBe("ROLE_NOT_ALLOWED");
    expect(existsSync(join(repo.path, ".fagan", "inspections"))).toBe(false);
  });

  it("FM-R2.9 FM-R3 FM-R5 FM-R6 FM-R7 FM-R8 FM-R9 FM-R10 FM-R11 drives a full inspection to Closed", async () => {
    // Planning and Overview.
    const opened = await ok("open_inspection", { role: "moderator", title: "Add sub()", author_overview: "Adds subtraction." });
    expect(opened["inspection_id"]).toBe("insp-0001");
    expect(opened["phase"]).toBe("Overview");
    expect(opened["files"]).toBe(2);
    expect(opened["units"]).toBe(2);
    expect(opened["checklists"]).toEqual(["docs", "typescript"]);
    expect(opened["entry"]).toMatchObject({ build: { passed: true, exit_code: 0 }, tests: { passed: true, exit_code: 0 }, size: { passed: true } });
    const id = "insp-0001";

    // FM-R3.4: the meeting cannot open from Overview.
    const early = await fails("get_packet", { inspection_id: id, role: "moderator", phase: "meeting" });
    expect(early.code).toBe("WRONG_PHASE");
    expect(early.details["phase"]).toBe("Overview");

    // Preparation by both inspectors (FM-R3.1, FM-R3.2, FM-R3.8).
    const prep = await ok("get_packet", { inspection_id: id, role: "inspector-logic", phase: "preparation" });
    expect(prep["phase"]).toBe("Preparation");
    const units = prep["units"] as Array<{ unit_id: string; file: string; checklist_id: string }>;
    expect(units.map((u) => [u.unit_id, u.file, u.checklist_id])).toEqual([
      ["U001", "docs/notes.md", "docs"],
      ["U002", "src/calc.ts", "typescript"],
    ]);
    expect(Object.keys(prep["checklists"] as object).sort()).toEqual(["docs", "typescript"]);
    // FM-R4.7: unit lines carry the no-newline flag over stdio (every fixture file ends in a newline).
    const lines = (prep["units"] as Array<{ lines: Array<Record<string, unknown>> }>).flatMap((u) => u.lines);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l["no_newline_at_eof"] === false)).toBe(true);
    expect((await ok("get_packet", { inspection_id: id, role: "inspector-interfaces", phase: "preparation", limit: 1 }))["next_cursor"]).toBe(
      "insp-0001:U002",
    );

    // FM-R3.3: only the moderator opens the meeting.
    expect((await fails("get_packet", { inspection_id: id, role: "reader", phase: "meeting" })).code).toBe("ROLE_NOT_ALLOWED");
    expect((await ok("get_packet", { inspection_id: id, role: "moderator", phase: "meeting" }))["phase"]).toBe("Meeting");

    // Meeting: readings, then FM-R7.2 UNREAD_UNITS, then the second reading.
    await ok("record_reading", { inspection_id: id, role: "reader", unit_id: "U001", paraphrase: "A new notes page says subtraction is new." });
    const unread = await fails("close_meeting", { inspection_id: id, role: "moderator" });
    expect(unread.code).toBe("UNREAD_UNITS");
    expect(unread.details["unit_ids"]).toEqual(["U002"]);
    const reading = await ok("record_reading", {
      inspection_id: id,
      role: "reader",
      unit_id: "U002",
      paraphrase: "sub takes a and b and returns a minus b plus one.",
    });
    expect(reading).toEqual({ reading_id: "R002", unit_id: "U002", judgment_flags: [] });

    // Defects: one major, one minor.
    const major = await ok("log_defect", {
      inspection_id: id,
      role: "scribe",
      unit_id: "U002",
      file: "src/calc.ts",
      line_start: 6,
      line_end: 6,
      side: "new",
      type: "logic",
      class: "extra",
      severity: "major",
      raised_by: "inspector-logic",
      description: "sub adds 1 to the difference.",
      checklist_item_id: "typescript-01",
    });
    expect(major).toEqual({ defect_id: "D001", counts: { major: 1, minor: 0 } });
    const minor = await ok("log_defect", {
      inspection_id: id,
      role: "scribe",
      unit_id: "U001",
      file: "docs/notes.md",
      line_start: 2,
      line_end: 2,
      side: "new",
      type: "documentation",
      severity: "minor",
      raised_by: "reader",
      description: "The note does not name the function.",
    });
    expect(minor).toEqual({ defect_id: "D002", counts: { major: 1, minor: 1 } });

    // FM-R8.2: no rework during the meeting.
    expect(
      (await fails("record_rework", { inspection_id: id, role: "author", items: [{ defect_id: "D001", resolution: "fixed", note: "x" }] })).code,
    ).toBe("WRONG_PHASE");

    const closed = await ok("close_meeting", { inspection_id: id, role: "moderator", notes: "Two defects." });
    expect(closed).toMatchObject({ phase: "Rework", defects: { total: 2, major: 1, minor: 1 }, units_read: 2, units_total: 2 });

    // FM-R9.4: follow-up fails while the major is open.
    const early1 = await ok("follow_up", { inspection_id: id, role: "moderator" });
    expect(early1).toMatchObject({ passed: false, phase: "Rework", blocking: ["D001"] });

    // Rework: really fix the file, waive the minor.
    writeFileSync(join(repo.path, "src", "calc.ts"), CALC_V3);
    const rework = await ok("record_rework", {
      inspection_id: id,
      role: "author",
      items: [
        { defect_id: "D001", resolution: "fixed", note: "Removed the + 1." },
        { defect_id: "D002", resolution: "waived", reason: "The notes page is replaced in the next change." },
      ],
    });
    expect(rework["open_majors"]).toBe(1);

    // Follow-up passes: D001 verified (checks pass and the file changed), D002 waived.
    const passed = await ok("follow_up", { inspection_id: id, role: "author" });
    expect(passed).toMatchObject({
      passed: true,
      phase: "Closed",
      blocking: [],
      defects: [
        { defect_id: "D001", severity: "major", status: "verified" },
        { defect_id: "D002", severity: "minor", status: "waived" },
      ],
    });
    expect(
      (await fails("record_rework", { inspection_id: id, role: "author", items: [{ defect_id: "D001", resolution: "fixed", note: "x" }] })).code,
    ).toBe("ALREADY_CLOSED");

    // Metrics and the report.
    const metrics = await ok("metrics", { inspection_id: id });
    expect(MetricsSchema.parse(metrics).defects).toEqual({ total: 2, major: 1, minor: 1 });
    // Review v1 issue 1: this flow runs follow_up before the first record_rework,
    // which used to give rework null (non_positive_duration). Rework is the time
    // from meetingEnd to the passing attempt; the failed attempt does not end it.
    const dir = join(repo.path, ".fagan", "inspections", id);
    const timestamps = (JSON.parse(readFileSync(join(dir, "inspection.json"), "utf8")) as { timestamps: { meetingEnd: string } }).timestamps;
    const attempts = (JSON.parse(readFileSync(join(dir, "followup.json"), "utf8")) as { attempts: Array<{ at: string; passed: boolean }> }).attempts;
    expect(attempts.map((a) => a.passed)).toEqual([false, true]);
    const durations = MetricsSchema.parse(metrics).durationsMs;
    expect(durations.rework).toBe(Date.parse(attempts[1]?.at ?? "") - Date.parse(timestamps.meetingEnd));
    expect(durations.followup).toBe(0);
    const exported = await ok("export_report", { inspection_id: id, role: "author" });
    expect(exported["schema_version"]).toBe("fagan-report/1");
    expect(exported["phase"]).toBe("Closed");
    const files = exported["files"] as Array<{ path: string; sha256: string; bytes: number }>;
    expect(files.map((f) => f.path)).toEqual([".fagan/inspections/insp-0001/report.json", ".fagan/inspections/insp-0001/report.txt"]);
    for (const f of files) {
      const bytes = readFileSync(join(repo.path, f.path));
      expect(bytes.length).toBe(f.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(f.sha256);
    }

    // Files on disk.
    expect(readdirSync(inspDir()).sort()).toEqual([
      "defects.json",
      "diff.patch",
      "events.jsonl",
      "followup.json",
      "inspection.json",
      "metrics.json",
      "packet.json",
      "readings.json",
      "report.json",
      "report.txt",
      "rework.json",
    ]);
    const report = parseReport(readFileSync(join(inspDir(), "report.json"), "utf8"));
    expect(report.inspection.phase).toBe("Closed");
    expect(report.inspection.id).toBe(id);
    expect(report.readings.readings.map((r) => r.unitId)).toEqual(["U001", "U002"]);
    expect(report.defects.defects.map((d) => [d.id, d.severity])).toEqual([
      ["D001", "major"],
      ["D002", "minor"],
    ]);
    expect(report.followup.attempts.map((a) => a.passed)).toEqual([false, true]);
    expect(report.checklists.map((c) => c.id)).toEqual(["docs", "typescript"]);

    // FM-R12.4 FM-R14.4: one event per successful call, none for failures.
    const events = eventLines().map((l) => EventSchema.parse(JSON.parse(l)));
    expect(events.length).toBe(successes);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(report.events.length).toBe(successes - 1);
    expect(events.filter((e) => e.tool === "get_packet").map((e) => e.role)).toEqual(["inspector-logic", "inspector-interfaces", "moderator"]);
    expect(events.at(-1)?.tool).toBe("export_report");
  });

  it("FM-R1.2 FM-R13.4 returns WRONG_PHASE after Closed and INSPECTION_NOT_FOUND for a missing ID", async () => {
    const before = eventLines().length;
    expect((await fails("log_defect", {
      inspection_id: "insp-0001",
      role: "scribe",
      unit_id: "U002",
      file: "src/calc.ts",
      line_start: 6,
      line_end: 6,
      side: "new",
      type: "logic",
      severity: "major",
      raised_by: "reader",
      description: "late",
    })).code).toBe("WRONG_PHASE");
    expect((await fails("metrics", { inspection_id: "insp-0002" })).code).toBe("INSPECTION_NOT_FOUND");
    expect(eventLines().length).toBe(before);
  });

  it("FM-R15.1 keeps stdout for the protocol and logs on stderr", () => {
    expect(stderrText).toContain("[fagan-mcp] serving repo");
  });
});
