#!/usr/bin/env node
// ACP probe: a minimal Agent Client Protocol client for the step 3 Kiro
// experiments (docs/experiments.md, .kiro/specs/role-agents/design.md).
//
// Usage:
//   node scripts/acp-probe.mjs --cwd <repo> --transcript <file.jsonl>
//       [--allow <pattern>]... [--mode <modeId>] [--mode-via auto|meta|set_mode]
//       [--timeout <seconds>] [--linger <seconds>] [--kiro <kiro-cli path>]
//       [--stderr <file>] [--hooks-meta on|off] <prompt> [<prompt>...]
//
// It starts `kiro-cli acp --agent-engine=v3 --auth-method=cli` with cwd
// <repo> and no shell, the way T3 Code starts Kiro, and speaks
// newline-delimited JSON-RPC 2.0 on the child's stdin and stdout
// (https://kiro.dev/docs/cli/v3/acp-migration.md, https://agentclientprotocol.com).
// Every message in either direction is appended to <file.jsonl> as one JSON
// line { t, dir, msg }, with string values under token, secret, password,
// authorization or cookie keys replaced by "[redacted]". The child's stderr
// goes to --stderr (default <file.jsonl>.stderr.log).
//
// Flow: initialize, then session/new { cwd, mcpServers: [] }, then each
// prompt in order as session/prompt, waiting for its response (the response,
// not any update, ends a turn). It prints the advertised modes, config
// options and agentCapabilities._meta.kiro.extensionMethods. --mode selects
// a mode: "meta" sends _meta.kiro.modeId on session/new, "set_mode" calls
// session/set_mode after it, and "auto" (the default) does the first and
// then the second if session/new reports a different current mode.
//
// Hooks: initialize sends clientCapabilities._meta.kiro.hooks
// { enabled: true, v2: true } unless --hooks-meta off is given. kiro.dev does
// not document this field. In kiro-cli 3.3.0 the agent server builds its
// hook cache for .kiro/hooks/*.json only when the client sends it (read in
// the installed @kiro/agent bundle, docs/experiments.md E1), and T3 Code's
// own sessions log "v2 hooks cache initialized", so T3 Code sends it too.
// Without it no workspace hook runs.
//
// Permission policy: each session/request_permission is matched against the
// --allow patterns (* is the only wildcard; the whole key must match). The
// keys are "@<server>/<tool>" from _meta.kiro.mcpTool.identity and
// "<capability>:<resource>" from _meta.kiro.consent (both seen live for an
// MCP call, docs/experiments.md E4), and "hook-confirm" for a Stop hook's
// confirm prompt, whose toolCall.toolCallId starts with "hook-confirm-" and
// whose options carry the hook's own ids (E5). On a match the probe
// picks the option whose kind is allow_once; otherwise reject_once. It never
// picks allow_always or reject_always, and it answers "cancelled" when no
// such one-time option exists. Every decision is printed and logged.
// Any other agent-to-client request gets JSON-RPC error -32601 (method not
// found).
//
// Exit code: 0 when every prompt got a response, 1 on an error, 124 when the
// --timeout (default 300 s) ran out. The probe itself calls no model or
// network API; it only drives the local kiro-cli.
import { spawn } from "node:child_process";
import { appendFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** The kiro-cli arguments, the same as T3 Code's launch. */
export const ARGV = ["acp", "--agent-engine=v3", "--auth-method=cli"];
const SECRET_KEY = /token|secret|password|authorization|cookie/i;

/** A deep copy of `value` with string values under secret-looking keys replaced. */
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== "object" || value === null) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) && typeof v === "string" ? "[redacted]" : redact(v);
  return out;
}

/** True when `key` matches `pattern` as a whole, with * matching any run of characters. */
export function globMatch(pattern, key) {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "s").test(key);
}

/** The keys a permission request is matched on (see the policy above). */
export function permissionKeys(params) {
  const keys = [];
  const kiro = params?._meta?.kiro;
  const identity = kiro?.mcpTool?.identity;
  if (typeof identity?.serverName === "string" && typeof identity?.toolName === "string") {
    keys.push(`@${identity.serverName}/${identity.toolName}`);
  }
  const consent = kiro?.consent;
  if (typeof consent?.capability === "string") {
    keys.push(`${consent.capability}:${typeof consent.resource === "string" ? consent.resource : ""}`);
  }
  const toolCallId = params?.toolCall?.toolCallId;
  if (typeof toolCallId === "string" && toolCallId.startsWith("hook-confirm-")) keys.push("hook-confirm");
  return keys;
}

/** The permission outcome for `params` under `allow`: one-time options only. */
export function decide(params, allow) {
  const keys = permissionKeys(params);
  const options = Array.isArray(params?.options) ? params.options : [];
  const allowed = keys.some((k) => allow.some((p) => globMatch(p, k)));
  const option = options.find((o) => o?.kind === (allowed ? "allow_once" : "reject_once"));
  if (option === undefined || typeof option.optionId !== "string") {
    return { keys, allowed, kind: null, outcome: { outcome: "cancelled" } };
  }
  return { keys, allowed, kind: option.kind, outcome: { outcome: "selected", optionId: option.optionId } };
}

function short(value, max = 600) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return "";
  return text.length > max ? `${text.slice(0, max)}... (${text.length} chars)` : text;
}

function textOfContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c?.type === "content" && c.content?.type === "text" ? c.content.text : c?.type === "text" ? c.text : ""))
    .filter((t) => typeof t === "string" && t.length > 0)
    .join("\n");
}

function usage(message) {
  process.stderr.write(`acp-probe: ${message}\nSee the usage comment at the top of scripts/acp-probe.mjs.\n`);
  return 1;
}

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        cwd: { type: "string" },
        transcript: { type: "string" },
        allow: { type: "string", multiple: true },
        mode: { type: "string" },
        "mode-via": { type: "string" },
        timeout: { type: "string" },
        linger: { type: "string" },
        kiro: { type: "string" },
        stderr: { type: "string" },
        "hooks-meta": { type: "string" },
      },
    });
  } catch (e) {
    return usage(e instanceof Error ? e.message : String(e));
  }
  const { values, positionals: prompts } = parsed;
  if (values.cwd === undefined || values.transcript === undefined) return usage("--cwd and --transcript are required");
  if (prompts.length === 0) return usage("give at least one prompt");
  const modeVia = values["mode-via"] ?? "auto";
  if (!["auto", "meta", "set_mode"].includes(modeVia)) return usage("--mode-via is auto, meta or set_mode");
  const hooksMeta = values["hooks-meta"] ?? "on";
  if (hooksMeta !== "on" && hooksMeta !== "off") return usage("--hooks-meta is on or off");
  const timeoutS = Number(values.timeout ?? "300");
  const lingerS = Number(values.linger ?? "3");
  if (!(timeoutS > 0) || !(lingerS >= 0)) return usage("--timeout must be > 0 and --linger >= 0");

  const cwd = resolve(values.cwd);
  const transcript = resolve(values.transcript);
  const stderrFile = resolve(values.stderr ?? `${transcript}.stderr.log`);
  const allow = values.allow ?? [];
  const kiro = values.kiro ?? "kiro-cli";

  const log = (dir, msg) => appendFileSync(transcript, `${JSON.stringify({ t: new Date().toISOString(), dir, msg: redact(msg) })}\n`);
  const say = (text) => process.stdout.write(`[probe] ${text}\n`);

  log("note", { argv: [kiro, ...ARGV], cwd, allow, mode: values.mode ?? null, modeVia, hooksMeta, prompts });
  const child = spawn(kiro, ARGV, { cwd, stdio: ["pipe", "pipe", "pipe"], shell: false });
  let childExited = false;
  const exited = new Promise((res) => {
    child.on("exit", (code, signal) => {
      childExited = true;
      log("note", { childExit: { code, signal } });
      say(`kiro-cli pid ${child.pid} exited (code ${code}, signal ${signal})`);
      res();
    });
  });
  child.on("error", (e) => {
    log("note", { spawnError: e.message });
    say(`cannot start ${kiro}: ${e.message}`);
  });
  say(`started kiro-cli pid ${child.pid} in ${cwd}`);
  child.stderr.on("data", (chunk) => appendFileSync(stderrFile, chunk));

  let nextId = 0;
  const pending = new Map();
  const openPermissions = new Set();
  let sessionId = null;
  let agentText = "";

  const send = (msg) => {
    log("out", msg);
    if (!child.stdin.destroyed) child.stdin.write(`${JSON.stringify(msg)}\n`);
  };
  const request = (method, params) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej, method });
      send({ jsonrpc: "2.0", id, method, params });
    });
  const respond = (id, body) => send({ jsonrpc: "2.0", id, ...body });

  const onUpdate = (params) => {
    const u = params?.update;
    if (u === undefined) return;
    const kind = u.sessionUpdate;
    if (kind === "agent_message_chunk") {
      if (u.content?.type === "text") agentText += u.content.text;
    } else if (kind === "tool_call") {
      say(`tool_call ${u.toolCallId} kind=${u.kind} status=${u.status} title=${short(u.title, 200)} rawInput=${short(u.rawInput, 400)}`);
    } else if (kind === "tool_call_update") {
      const text = textOfContent(u.content);
      say(`tool_call_update ${u.toolCallId} status=${u.status ?? "-"}${text.length > 0 ? ` content=${short(text, 800)}` : ""}`);
    } else if (kind === "current_mode_update") {
      say(`current_mode_update ${u.currentModeId}`);
    } else if (kind === "session_info_update") {
      say(`session_info_update kind=${u._meta?.kiro?.kind ?? "-"}`);
    } else if (kind !== "agent_thought_chunk" && kind !== "user_message_chunk") {
      say(`session/update ${kind}`);
    }
  };

  const onRequest = (msg) => {
    if (msg.method === "session/request_permission") {
      const d = decide(msg.params, allow);
      const tc = msg.params?.toolCall ?? {};
      log("note", { permissionDecision: { requestId: msg.id, toolCallId: tc.toolCallId, keys: d.keys, allowed: d.allowed, kind: d.kind } });
      say(
        `permission ${tc.toolCallId} title=${short(tc.title, 200)} keys=${JSON.stringify(d.keys)} options=${JSON.stringify(
          (msg.params?.options ?? []).map((o) => o?.kind),
        )} -> ${d.kind ?? "cancelled"}`,
      );
      respond(msg.id, { result: { outcome: d.outcome } });
      return;
    }
    say(`agent request ${msg.method}: answered method not found`);
    respond(msg.id, { error: { code: -32601, message: `Method not found: ${msg.method}` } });
  };

  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length === 0) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        log("in-raw", line);
        continue;
      }
      log("in", msg);
      if (msg.method === undefined && msg.id !== undefined) {
        const p = pending.get(msg.id);
        if (p === undefined) continue;
        pending.delete(msg.id);
        if (msg.error !== undefined) p.rej(Object.assign(new Error(`${p.method}: ${short(msg.error)}`), { rpc: msg.error }));
        else p.res(msg.result);
      } else if (msg.method !== undefined && msg.id !== undefined) {
        if (msg.method === "session/request_permission") openPermissions.add(msg.id);
        onRequest(msg);
        openPermissions.delete(msg.id);
      } else if (msg.method === "session/update") {
        onUpdate(msg.params);
      } else if (msg.method !== undefined) {
        say(`notification ${msg.method} ${short(msg.params, 400)}`);
      }
    }
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    log("note", { timeout: timeoutS });
    say(`timeout after ${timeoutS} s`);
    for (const id of openPermissions) respond(id, { result: { outcome: { outcome: "cancelled" } } });
    if (sessionId !== null) send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
    for (const p of pending.values()) p.rej(new Error(`timeout waiting for ${p.method}`));
    pending.clear();
  }, timeoutS * 1000);

  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  let code = 0;
  try {
    const clientCapabilities = { fs: { readTextFile: false, writeTextFile: false }, terminal: false };
    if (hooksMeta === "on") clientCapabilities._meta = { kiro: { hooks: { enabled: true, v2: true } } };
    const init = await request("initialize", {
      protocolVersion: 1,
      clientCapabilities,
      clientInfo: { name: "fagan-acp-probe", version: "0.1.0" },
    });
    const caps = init?.agentCapabilities ?? {};
    say(`initialize: protocolVersion=${init?.protocolVersion} agentInfo=${short(init?.agentInfo, 200)}`);
    say(`agentCapabilities keys=${JSON.stringify(Object.keys(caps))}`);
    say(`extensionMethods=${JSON.stringify(caps?._meta?.kiro?.extensionMethods ?? null)}`);
    say(`authMethods=${short(init?.authMethods, 300)}`);

    const newParams = { cwd, mcpServers: [] };
    if (values.mode !== undefined && modeVia !== "set_mode") newParams._meta = { kiro: { modeId: values.mode } };
    const session = await request("session/new", newParams);
    sessionId = session?.sessionId ?? null;
    say(`session/new: sessionId=${sessionId}`);
    say(
      `modes: current=${session?.modes?.currentModeId ?? "-"} available=${JSON.stringify(
        (session?.modes?.availableModes ?? []).map((m) => m?.id),
      )}`,
    );
    for (const o of session?.configOptions ?? []) {
      say(`configOption ${o?.id} current=${short(o?.currentValue, 80)} options=${short((o?.options ?? []).map((x) => x?.value ?? x?.id), 300)}`);
    }
    if (sessionId === null) throw new Error("session/new returned no sessionId");

    if (values.mode !== undefined) {
      const current = session?.modes?.currentModeId;
      if (modeVia === "set_mode" || (modeVia === "auto" && current !== values.mode)) {
        await request("session/set_mode", { sessionId, modeId: values.mode });
        say(`session/set_mode ${values.mode}: ok`);
      } else {
        say(`mode ${values.mode} via _meta.kiro.modeId: current=${current ?? "-"}`);
      }
    }

    for (const [i, text] of prompts.entries()) {
      agentText = "";
      say(`prompt ${i + 1}/${prompts.length}: ${short(text, 300)}`);
      const r = await request("session/prompt", { sessionId, prompt: [{ type: "text", text }] });
      say(`prompt ${i + 1} stopReason=${r?.stopReason}`);
      say(`agent said: ${short(agentText, 2000)}`);
    }
    if (lingerS > 0) await wait(lingerS * 1000);
  } catch (e) {
    code = timedOut ? 124 : 1;
    say(`error: ${e instanceof Error ? e.message : String(e)}`);
    log("note", { error: e instanceof Error ? e.message : String(e) });
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) code = 124;

  if (!childExited) {
    child.stdin.end();
    await Promise.race([exited, wait(5000)]);
  }
  if (!childExited) {
    child.kill("SIGTERM");
    await Promise.race([exited, wait(5000)]);
  }
  if (!childExited) {
    child.kill("SIGKILL");
    await Promise.race([exited, wait(2000)]);
  }
  say(`done, exit ${code}`);
  return code;
}

function isEntryPoint() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write(`acp-probe: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
      process.exitCode = 1;
    },
  );
}
