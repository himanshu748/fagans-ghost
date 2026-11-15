#!/usr/bin/env node
// `fagan` CLI: the MCP server entry and the commands hooks run, because hooks
// cannot call MCP tools (design.md "CLI", FM-R15, FM-R16). Arguments are
// parsed with node:util parseArgs.
import { parseArgs } from "node:util";
import { systemClock } from "./clock.js";
import { isFaganError } from "./core/errors.js";
import { isGitCommitCommand } from "./core/gate.js";
import { startServer } from "./server/server.js";
import {
  abandonService,
  exportReportService,
  followUpService,
  gateBlocks,
  latestFollowUpCandidate,
  suggestion,
  type ReportFormat,
  type ServiceContext,
} from "./service/service.js";

const USAGE = `Usage:
  fagan serve                              Start the MCP server on stdio
  fagan hook suggest                       Hook: suggest an inspection (reads the hook payload on stdin, always exits 0)
  fagan hook gate                          Hook: block git commit while an open major exists (exit 2 blocks)
  fagan follow-up --latest | <id>          Run follow-up for the latest inspection in Rework or FollowUp, or for <id>
  fagan abandon <id> --reason <text>       Move an inspection to Abandoned
  fagan export <id> [--format json|txt]    Write report.json and/or report.txt
`;

/** Exit code for a blocked commit. Exit 2 blocks under both readings of the hooks docs (PLAN.md section 11.2). */
export const EXIT_BLOCK = 2;

function out(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

function err(text: string): void {
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
}

/** Prints `{ code, message }` to stderr for a failed command and returns exit code 1 (FM-R15.7). */
function fail(e: unknown): number {
  const body = isFaganError(e)
    ? { code: e.code, message: e.message }
    : { code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : String(e) };
  err(JSON.stringify(body));
  return 1;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY === true) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parsePayload(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** `cwd` from the hook payload when it is a non-empty string, else the process working directory. */
function payloadCwd(payload: unknown): string {
  return isObject(payload) && typeof payload["cwd"] === "string" && payload["cwd"].length > 0 ? payload["cwd"] : process.cwd();
}

/**
 * Candidate fields for the shell command in `tool_input` (FM-R16.5). The real
 * field name is confirmed by experiment E2 in step 3; until then both are read.
 */
export const COMMAND_FIELDS = ["command", "cmd"] as const;

export function commandFromPayload(payload: unknown): string | null {
  if (!isObject(payload) || !isObject(payload["tool_input"])) return null;
  const input = payload["tool_input"];
  for (const field of COMMAND_FIELDS) {
    const v = input[field];
    if (typeof v === "string") return v;
  }
  return null;
}

async function hookSuggest(): Promise<number> {
  try {
    const payload = parsePayload(await readStdin());
    const text = await suggestion(payloadCwd(payload));
    if (text !== null) out(text);
  } catch (e) {
    // Never interrupt the session (FM-R15.3).
    err(`fagan hook suggest: skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
  return 0;
}

async function hookGate(): Promise<number> {
  let text: string;
  try {
    text = await readStdin();
  } catch (e) {
    err(`fagan commit gate: warning: cannot read the hook payload (${e instanceof Error ? e.message : String(e)}); allowing`);
    return 0;
  }
  const payload = parsePayload(text);
  if (payload === undefined) {
    err("fagan commit gate: warning: the hook payload is not JSON; allowing");
    return 0;
  }
  const command = commandFromPayload(payload);
  if (command === null) {
    err(`fagan commit gate: warning: no command string in tool_input (checked ${COMMAND_FIELDS.join(", ")}); allowing`);
    return 0;
  }
  if (!isGitCommitCommand(command)) return 0;
  try {
    const blocks = await gateBlocks(payloadCwd(payload));
    if (blocks.length === 0) return 0;
    const list = blocks.map((b) => `${b.inspection_id}: ${b.defect_ids.join(", ")}`).join("; ");
    const message =
      `fagan commit gate: blocked. Open major defects: ${list}. ` +
      "Fix them and run follow_up, or have the Author waive them with a reason, before committing.";
    out(message);
    err(message);
  } catch (e) {
    const reason = isFaganError(e) ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
    const message = `fagan commit gate: blocked. The .fagan store could not be read (${reason}).`;
    out(message);
    err(message);
  }
  return EXIT_BLOCK;
}

function ctx(): ServiceContext {
  return { cwd: process.cwd(), clock: systemClock };
}

async function followUpCmd(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, options: { latest: { type: "boolean" } }, allowPositionals: true, strict: true });
  const latest = values.latest === true;
  if (latest === (positionals.length > 0) || positionals.length > 1) {
    err(USAGE);
    return 1;
  }
  try {
    const id = latest ? await latestFollowUpCandidate(ctx()) : (positionals[0] as string);
    if (id === null) {
      out("fagan follow-up: no inspection is in Rework or FollowUp; nothing to do.");
      return 0;
    }
    const result = await followUpService(ctx(), { inspection_id: id, caller: { kind: "cli" }, run_checks: true });
    out(JSON.stringify(result, null, 2));
    return 0;
  } catch (e) {
    return fail(e);
  }
}

async function abandonCmd(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, options: { reason: { type: "string" } }, allowPositionals: true, strict: true });
  const id = positionals[0];
  if (id === undefined || positionals.length > 1 || values.reason === undefined) {
    err(USAGE);
    return 1;
  }
  try {
    out(JSON.stringify(await abandonService(ctx(), { inspection_id: id, reason: values.reason }), null, 2));
    return 0;
  } catch (e) {
    return fail(e);
  }
}

async function exportCmd(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: { format: { type: "string", multiple: true } },
    allowPositionals: true,
    strict: true,
  });
  const id = positionals[0];
  const formats = values.format ?? ["json", "txt"];
  if (id === undefined || positionals.length > 1 || formats.some((f) => f !== "json" && f !== "txt")) {
    err(USAGE);
    return 1;
  }
  try {
    const result = await exportReportService(ctx(), {
      inspection_id: id,
      caller: { kind: "cli" },
      formats: formats as ReportFormat[],
    });
    for (const f of result.files) out(`${f.path} sha256 ${f.sha256} ${f.bytes} bytes`);
    return 0;
  } catch (e) {
    return fail(e);
  }
}

/** Runs one command. Returns the exit code, or null for `serve`, which keeps running. */
export async function main(argv: readonly string[]): Promise<number | null> {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "serve":
        if (rest.length > 0) break;
        await startServer(ctx());
        return null;
      case "hook":
        if (rest.length === 1 && rest[0] === "suggest") return await hookSuggest();
        if (rest.length === 1 && rest[0] === "gate") return await hookGate();
        break;
      case "follow-up":
        return await followUpCmd(rest);
      case "abandon":
        return await abandonCmd(rest);
      case "export":
        return await exportCmd(rest);
      case "help":
      case "--help":
      case "-h":
        out(USAGE);
        return 0;
      default:
        break;
    }
  } catch (e) {
    // parseArgs throws TypeError with an ERR_PARSE_ARGS_* code for unknown or malformed options.
    err(`fagan: ${e instanceof Error ? e.message : String(e)}`);
    err(USAGE);
    return 1;
  }
  err(USAGE);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code !== null) process.exitCode = code;
  },
  (e: unknown) => {
    err(`fagan: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exitCode = 1;
  },
);
