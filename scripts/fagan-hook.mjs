#!/usr/bin/env node
// Hook launcher for Fagan's Ghost (.kiro/specs/role-agents/design.md
// "Hook launcher", RA-R7). The hooks in .kiro/hooks/ run
// `node scripts/fagan-hook.mjs <args>` from the project root.
//
// When packages/fagan-mcp/dist/cli.js exists, the launcher runs it with the
// same arguments, stdin, stdout and stderr, and exits with its status.
// When it is missing (a fresh clone before `npm run build`), the launcher
// answers by itself. A PreToolUse hook whose command exits non-zero blocks
// the tool call (https://kiro.dev/docs/hooks/actions/), so a gate that failed
// only because the CLI is missing would block every shell call, including the
// `npm run build` that fixes it. The fallback blocks only commands that could
// be a git commit, and the other hooks warn and exit 0.
//
// Node built-ins only, no shell: the CLI is started with an argument array.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The built fagan CLI, resolved from this file's folder, not from the working directory. */
export const CLI_PATH = fileURLToPath(new URL("../packages/fagan-mcp/dist/cli.js", import.meta.url));

/** Exit code that blocks a PreToolUse call, the same as the CLI's EXIT_BLOCK. */
export const EXIT_BLOCK = 2;

/** Fields of `tool_input` that may hold the shell command, in the order the CLI reads them (FM-R16.5). */
export const COMMAND_FIELDS = ["command", "cmd"];

const MISSING = 'packages/fagan-mcp/dist/cli.js is missing. Run "npm run build" in the repo root to enable the Fagan\'s Ghost hooks.';

function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The command string from a hook payload, read the same way as the CLI: `tool_input.command`, then `tool_input.cmd`. */
export function commandFromPayload(payload) {
  if (!isObject(payload) || !isObject(payload.tool_input)) return null;
  for (const field of COMMAND_FIELDS) {
    const v = payload.tool_input[field];
    if (typeof v === "string") return v;
  }
  return null;
}

/** Characters the built gate's tokeniser can drop from inside a word: quotes, backslashes and escaped newlines. */
const DROPPED = /['"\\\n]/g;
const WORD = "commit";

/**
 * True when the command could be a git commit, for the fallback gate. It is a
 * superset of the built gate's isGitCommitCommand (packages/fagan-mcp/src/core/gate.ts):
 * that gate needs a word whose text, after quote removal, is exactly
 * `commit`. Without command substitution, the characters between the letters
 * of such a word can only be quotes, backslashes and escaped newlines, so the
 * command with those removed contains `commit`. The built gate also leaves
 * the output of `$(...)` and backtick substitutions out of a word, so when the
 * command has one, any c, o, m, m, i, t in that order counts (RA-R7.5).
 */
export function couldBeGitCommit(command) {
  if (command.replace(DROPPED, "").includes(WORD)) return true;
  if (!command.includes("$(") && !command.includes("`")) return false;
  let next = 0;
  for (const ch of command) {
    if (ch === WORD[next]) {
      next++;
      if (next === WORD.length) return true;
    }
  }
  return false;
}

function writeLine(stream, text) {
  stream.write(text.endsWith("\n") ? text : `${text}\n`);
}

async function readStdin() {
  if (process.stdin.isTTY === true) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/** `hook gate` without the CLI (RA-R7.2, RA-R7.3). */
async function gateFallback() {
  let text;
  try {
    text = await readStdin();
  } catch (e) {
    writeLine(process.stderr, `fagan commit gate: warning: cannot read the hook payload (${e instanceof Error ? e.message : String(e)}); allowing. ${MISSING}`);
    return 0;
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    writeLine(process.stderr, `fagan commit gate: warning: the hook payload is not JSON; allowing. ${MISSING}`);
    return 0;
  }
  const command = commandFromPayload(payload);
  if (command === null) {
    writeLine(process.stderr, `fagan commit gate: warning: no command string in tool_input (checked ${COMMAND_FIELDS.join(", ")}); allowing. ${MISSING}`);
    return 0;
  }
  if (!couldBeGitCommit(command)) return 0;
  const message = `fagan commit gate: blocked. This command could be a git commit, and open major defects cannot be checked because ${MISSING} Then try the commit again.`;
  writeLine(process.stdout, message);
  writeLine(process.stderr, message);
  return EXIT_BLOCK;
}

/** Runs the launcher for `args` and returns the exit code. */
export async function main(args) {
  if (existsSync(CLI_PATH)) {
    const r = spawnSync(process.execPath, [CLI_PATH, ...args], { stdio: "inherit" });
    if (r.error !== undefined) {
      writeLine(process.stderr, `fagan-hook: cannot run ${CLI_PATH}: ${r.error.message}`);
      return 1;
    }
    return r.status ?? 1;
  }
  const [cmd, sub] = args;
  if (cmd === "hook" && sub === "gate" && args.length === 2) return gateFallback();
  if ((cmd === "hook" && sub === "suggest" && args.length === 2) || cmd === "follow-up") {
    // Exit 0 adds stdout to the agent's context and other output is not shown,
    // so the warning goes to both streams (RA-R7.4).
    const message = `fagan ${args.join(" ")}: skipped. ${MISSING}`;
    writeLine(process.stdout, message);
    writeLine(process.stderr, message);
    return 0;
  }
  writeLine(process.stderr, `fagan-hook: ${MISSING}`);
  return 1;
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
      writeLine(process.stderr, `fagan-hook: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      process.exitCode = 1;
    },
  );
}
