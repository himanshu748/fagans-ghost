// Checks the committed Kiro config (.kiro/agents, .kiro/agent-prompts,
// .kiro/hooks) against the role-agents spec
// (.kiro/specs/role-agents/requirements.md, RA-R9) and against fagan-mcp's
// own tool roles. `kiro-cli agent validate` checks JSON
// types and the prompt file only (docs/experiments.md E11), so the scopes,
// rules, resources and hooks are checked here. Formats per
// https://kiro.dev/docs/custom-agents/configuration-reference/ and
// https://kiro.dev/docs/hooks/ (read on 2026-11-16).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import picomatch from "picomatch/posix.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ALLOWED_ROLES, type ToolName } from "../src/core/roles.js";
import { ConfigSchema, ROLES, type Role } from "../src/core/schema.js";
import { TOOL_NAMES } from "../src/server/server.js";
import { REPO_ROOT } from "./launcher.js";

const AGENTS_DIR = join(REPO_ROOT, ".kiro", "agents");
/** Prompts live outside .kiro/agents/, because Kiro reads every .md under it as an agent (RA-R5.4). */
const PROMPTS_DIR = join(REPO_ROOT, ".kiro", "agent-prompts");
const HOOKS_DIR = join(REPO_ROOT, ".kiro", "hooks");
const AGENT_NAMES = ["inspector-interfaces", "inspector-logic", "moderator", "reader", "scribe"] as const;
type AgentName = (typeof AGENT_NAMES)[number];

/** Capabilities and effects from the configuration reference and the permissions page. */
const CAPABILITIES = [
  "fs_read", "fs_write", "shell", "web_fetch", "web_search", "mcp", "subagent", "skill", "power", "context", "diagnostics", "sandbox_network",
  "all", "builtin", "filesystem",
] as const;

const RuleSchema = z.strictObject({
  capability: z.enum(CAPABILITIES),
  match: z.array(z.string().min(1)).min(1).optional(),
  exclude: z.array(z.string().min(1)).min(1).optional(),
  effect: z.enum(["allow", "ask", "deny"]),
});
type Rule = z.infer<typeof RuleSchema>;

/**
 * The fields these agents use. The schema is strict: a typo, `model` (agents
 * use whatever model Kiro runs) or a CLI 2.x field such as `allowedTools` or
 * `toolsSettings` (which make CLI V3 skip a profile without `permissions`)
 * fails here, although the validator accepts unknown fields.
 */
const AgentSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  includeMcpJson: z.literal(true),
  tools: z.array(z.string().min(1)).min(1),
  permissions: z.strictObject({ rules: z.array(RuleSchema).min(1) }),
  resources: z.array(z.string().startsWith("file://")).min(1),
  welcomeMessage: z.string().min(1),
});
type Agent = z.infer<typeof AgentSchema>;

/** PascalCase triggers named on the hooks pages (types, migration and overview). */
const TRIGGERS = [
  "SessionStart", "AgentSpawn", "SessionEnd", "UserPromptSubmit", "Stop", "PreToolUse", "PostToolUse", "PreCompact", "PostCompact", "PostFileSave",
] as const;

const HookSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  trigger: z.enum(TRIGGERS),
  matcher: z.string().min(1).optional(),
  action: z.strictObject({ type: z.literal("command"), command: z.string().min(1) }),
  timeout: z.int().min(1),
  enabled: z.literal(true),
  confirm: z.strictObject({
    question: z.string().min(1),
    confirmCommand: z.string().min(1),
    options: z.array(z.strictObject({ id: z.string(), label: z.string(), run: z.boolean() })).min(1),
  }).optional(),
});
const HookFileSchema = z.strictObject({ version: z.literal("v1"), hooks: z.array(HookSchema).length(1) });
type Hook = z.infer<typeof HookSchema>;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

/** Every file under `dir` at any depth, relative to `dir`, with `/` separators. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

const agents = new Map<AgentName, Agent>(
  jsonFiles(AGENTS_DIR).map((f) => [f.replace(/\.json$/, "") as AgentName, AgentSchema.parse(readJson(join(AGENTS_DIR, f)))]),
);
const hooks = new Map<string, Hook>(
  jsonFiles(HOOKS_DIR).map((f) => [f.replace(/\.json$/, ""), (HookFileSchema.parse(readJson(join(HOOKS_DIR, f))).hooks[0] as Hook)]),
);

function agent(name: AgentName): Agent {
  const a = agents.get(name);
  if (a === undefined) throw new Error(`.kiro/agents/${name}.json is missing`);
  return a;
}

function hook(name: string): Hook {
  const h = hooks.get(name);
  if (h === undefined) throw new Error(`.kiro/hooks/${name}.json is missing`);
  return h;
}

/** The fagan tools an agent lists as `@fagan/<tool>`. */
function faganTools(a: Agent): string[] {
  return a.tools.filter((t) => t.startsWith("@fagan/")).map((t) => t.slice("@fagan/".length));
}

const rules = (a: Agent, capability: Rule["capability"], effect: Rule["effect"]): Rule[] =>
  a.permissions.rules.filter((r) => r.capability === capability && r.effect === effect);

/** True when the agent has a deny rule for the whole capability (no `match`, no `exclude`). */
const deniesAll = (a: Agent, capability: Rule["capability"]): boolean =>
  rules(a, capability, "deny").some((r) => r.match === undefined && r.exclude === undefined);

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

const REGISTERED = new Set<string>(TOOL_NAMES);
const ROLE_AGENTS = AGENT_NAMES.filter((n) => n !== "moderator");

describe("role agents (.kiro/agents)", () => {
  it("RA-R1.1 RA-R1.2 RA-R1.3 there are exactly five role agents, each with the documented fields", () => {
    expect(sorted(agents.keys())).toEqual([...AGENT_NAMES]);
    expect(agents.has("author" as AgentName)).toBe(false);
    for (const [name, a] of agents) {
      expect(a.name).toBe(name);
      expect(a.prompt).toBe(`file://../agent-prompts/${name}.md`);
      expect(a.description).not.toContain("\n");
      expect(a.description.startsWith("Fagan inspection ")).toBe(true);
      expect((ROLES as readonly string[]).includes(name)).toBe(true);
    }
  });

  it("RA-R1.1 RA-R5.4 .kiro/agents/ holds the five agent files and no Markdown file at any depth", () => {
    // Kiro reads every .json and .md file under .kiro/agents/, nested folders
    // included, as an agent (https://kiro.dev/docs/custom-agents/); a .md
    // without front matter is reported as a config_error (docs/experiments.md E11).
    const files = filesUnder(AGENTS_DIR);
    expect(files.filter((f) => /\.md$/i.test(f))).toEqual([]);
    expect(files.filter((f) => /\.json$/i.test(f))).toEqual(AGENT_NAMES.map((n) => `${n}.json`));
  });

  it("RA-R2.1 RA-R2.2 RA-R2.3 RA-R2.4 each agent lists exactly its tools", () => {
    expect(agent("moderator").tools).toEqual([
      "read",
      "@fagan/open_inspection",
      "@fagan/get_packet",
      "@fagan/close_meeting",
      "@fagan/follow_up",
      "@fagan/metrics",
      "@fagan/export_report",
      "subagent/reader",
      "subagent/inspector-logic",
      "subagent/inspector-interfaces",
      "subagent/scribe",
    ]);
    expect(agent("reader").tools).toEqual(["read", "@fagan/get_packet", "@fagan/record_reading"]);
    expect(agent("inspector-logic").tools).toEqual(["read", "@fagan/get_packet"]);
    expect(agent("inspector-interfaces").tools).toEqual(["read", "@fagan/get_packet"]);
    expect(agent("scribe").tools).toEqual(["@fagan/get_packet", "@fagan/log_defect"]);
  });

  it("RA-R2.5 no agent lists a write, shell, web, wildcard or whole-server selector", () => {
    const forbidden = ["write", "shell", "web", "@builtin", "*", "@mcp", "@fagan", "subagent", "invoke_sub_agent", "@fagan/record_rework"];
    for (const [name, a] of agents) {
      for (const t of a.tools) {
        expect(forbidden, `${name}: ${t}`).not.toContain(t);
        expect(t.includes("*") || t.includes("?"), `${name}: ${t}`).toBe(false);
        expect(t === "read" || t.startsWith("@fagan/") || t.startsWith("subagent/"), `${name}: ${t}`).toBe(true);
      }
    }
  });

  it("RA-R2.6 RA-R8.1 only the scribe lists log_defect, only the reader lists record_reading, nobody lists record_rework", () => {
    const listing = (tool: string) => sorted([...agents].filter(([, a]) => faganTools(a).includes(tool)).map(([n]) => n));
    expect(listing("log_defect")).toEqual(["scribe"]);
    expect(listing("record_reading")).toEqual(["reader"]);
    expect(listing("record_rework")).toEqual([]);
  });

  it("RA-R2.7 every fagan tool an agent lists accepts that agent's role in fagan-mcp", () => {
    for (const [name, a] of agents) {
      for (const tool of faganTools(a)) {
        expect(REGISTERED.has(tool), `${name}: ${tool}`).toBe(true);
        expect(ALLOWED_ROLES[tool as ToolName], `${name}: ${tool}`).toContain(name as Role);
      }
    }
  });

  it("RA-R2.8 the moderator's sub-agents are the four other role agents", () => {
    const subs = agent("moderator").tools.filter((t) => t.startsWith("subagent/")).map((t) => t.slice("subagent/".length));
    expect(sorted(subs)).toEqual(sorted(ROLE_AGENTS));
    for (const n of ROLE_AGENTS) expect(agent(n).tools.some((t) => t.startsWith("subagent/")), n).toBe(false);
  });

  it("RA-R3.1 RA-R3.2 RA-R8.1 every role agent denies writes, shell, web and record_rework", () => {
    for (const [name, a] of agents) {
      for (const cap of ["fs_write", "shell", "web_fetch", "web_search"] as const) {
        expect(deniesAll(a, cap), `${name}: ${cap}`).toBe(true);
      }
      expect(
        rules(a, "mcp", "deny").some((r) => r.match?.includes("fagan/record_rework") === true && r.exclude === undefined),
        `${name}: fagan/record_rework`,
      ).toBe(true);
    }
  });

  it("RA-R3.3 every role agent except the moderator denies starting sub-agents", () => {
    for (const n of ROLE_AGENTS) expect(deniesAll(agent(n), "subagent"), n).toBe(true);
    expect(rules(agent("moderator"), "subagent", "deny")).toEqual([]);
  });

  it("RA-R3.4 the reader, inspectors and scribe deny every fagan tool they do not list", () => {
    for (const n of ROLE_AGENTS) {
      const a = agent(n);
      const wildcard = rules(a, "mcp", "deny").filter((r) => r.match?.includes("fagan/*") === true);
      expect(wildcard, n).toHaveLength(1);
      expect(sorted(wildcard[0]?.exclude ?? []), n).toEqual(sorted(faganTools(a).map((t) => `fagan/${t}`)));
    }
  });

  it("RA-R3.5 the moderator allows its four sub-agents and the fagan tools they call, and nothing else", () => {
    const m = agent("moderator");
    const subAllow = rules(m, "subagent", "allow");
    expect(subAllow).toHaveLength(1);
    expect(sorted(subAllow[0]?.match ?? [])).toEqual(sorted(ROLE_AGENTS));
    const calledBySubs = new Set(ROLE_AGENTS.flatMap((n) => faganTools(agent(n))));
    const mcpAllow = rules(m, "mcp", "allow").flatMap((r) => r.match ?? []);
    expect(sorted(mcpAllow)).toEqual(sorted([...calledBySubs].map((t) => `fagan/${t}`)));
    expect(m.permissions.rules.filter((r) => r.effect === "allow").map((r) => r.capability).sort()).toEqual(["mcp", "subagent"]);
  });

  it("RA-R3.6 no rule allows or asks for writes, shell, web, wildcards or record_rework", () => {
    for (const [name, a] of agents) {
      for (const r of a.permissions.rules) {
        if (r.effect === "deny") continue;
        expect(["mcp", "subagent"], `${name}: ${JSON.stringify(r)}`).toContain(r.capability);
        expect(r.match, `${name}: ${JSON.stringify(r)}`).toBeDefined();
        for (const p of r.match ?? []) {
          expect(p.includes("*") || p.includes("?"), `${name}: ${p}`).toBe(false);
          expect(p, name).not.toBe("fagan/record_rework");
        }
      }
    }
  });

  it("RA-R3.7 RA-R9.2 every fagan tool named in rules and hook matchers is a registered tool", () => {
    // TOOL_NAMES are the nine registerTool calls; ALLOWED_ROLES adds the get_packet:meeting role check.
    expect(sorted(TOOL_NAMES)).toEqual(sorted(Object.keys(ALLOWED_ROLES).filter((k) => k !== "get_packet:meeting")));
    const named: string[] = [];
    for (const a of agents.values()) {
      for (const r of a.permissions.rules.filter((x) => x.capability === "mcp")) {
        for (const p of [...(r.match ?? []), ...(r.exclude ?? [])]) {
          expect(p.startsWith("fagan/"), p).toBe(true);
          if (p !== "fagan/*") named.push(p.slice("fagan/".length));
        }
      }
    }
    for (const h of hooks.values()) {
      if (h.matcher?.startsWith("@fagan/") === true) named.push(h.matcher.slice("@fagan/".length));
    }
    expect(named.length).toBeGreaterThan(0);
    for (const t of named) expect(REGISTERED.has(t), t).toBe(true);
    const mcpJson = readJson(join(REPO_ROOT, ".kiro", "settings", "mcp.json")) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(mcpJson.mcpServers)).toContain("fagan");
  });
});

/** Files a `file://` resource names, relative to the workspace root, with `*`, `?`, `[` and `{` globs expanded. */
function expandResource(uri: string): string[] {
  const pattern = uri.slice("file://".length);
  if (!/[*?[{]/.test(pattern)) return [pattern];
  const match = picomatch(pattern, { dot: true });
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "dist", ".agents"].includes(entry.name)) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (match(relative(REPO_ROOT, p).split(sep).join("/"))) out.push(relative(REPO_ROOT, p));
    }
  };
  walk(REPO_ROOT);
  return out.sort();
}

describe("agent prompts and resources", () => {
  it("RA-R5.1 every prompt file exists in .kiro/agent-prompts/, resolved from its agent's folder", () => {
    for (const [name, a] of agents) {
      const path = resolve(AGENTS_DIR, a.prompt.slice("file://".length));
      expect(existsSync(path), `${name}: ${path}`).toBe(true);
      expect(path).toBe(join(PROMPTS_DIR, `${name}.md`));
    }
  });

  it("RA-R5.2 resources stay within 32 files, 100,000 characters in total and 50,000 per file", () => {
    for (const [name, a] of agents) {
      const files = [...new Set(a.resources.flatMap(expandResource))];
      expect(files.length, name).toBeGreaterThan(0);
      expect(files.length, name).toBeLessThanOrEqual(32);
      let total = 0;
      for (const f of files) {
        const path = join(REPO_ROOT, f);
        expect(existsSync(path), `${name}: ${f}`).toBe(true);
        expect(statSync(path).size, `${name}: ${f}`).toBeLessThanOrEqual(1024 * 1024);
        const chars = [...readFileSync(path, "utf8")].length;
        expect(chars, `${name}: ${f}`).toBeLessThanOrEqual(50_000);
        total += chars;
      }
      expect(total, name).toBeLessThanOrEqual(100_000);
    }
  });

  it("RA-R5.3 each agent loads the steering it needs", () => {
    const steering = (...files: string[]) => files.map((f) => `file://.kiro/steering/${f}`);
    for (const [name, a] of agents) {
      expect(a.resources, name).toEqual(expect.arrayContaining(steering("product.md", "inspection-ritual.md")));
    }
    for (const n of ["moderator", "inspector-logic", "inspector-interfaces"] as const) {
      expect(agent(n).resources, n).toEqual(expect.arrayContaining(steering("tech.md")));
    }
  });

  it("RA-R4.5 RA-R4.7 each prompt names its own role value and uses fagan-mcp's types and severities", () => {
    for (const name of AGENT_NAMES) {
      const text = readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf8");
      expect(text, name).toContain(`"role": "${name}"`);
      expect(text, name).not.toContain("\u2014");
    }
    for (const n of ["inspector-logic", "inspector-interfaces", "scribe"] as const) {
      const text = readFileSync(join(PROMPTS_DIR, `${n}.md`), "utf8");
      for (const word of ["logic", "interface", "data", "documentation", "other", "major", "minor", "missing", "wrong", "extra"]) {
        expect(text, `${n}: ${word}`).toContain(`\`${word}\``);
      }
      expect(text, n).toContain("DEFECT | by=");
    }
  });
});

describe("hooks (.kiro/hooks)", () => {
  const config = ConfigSchema.parse(readJson(join(REPO_ROOT, ".fagan", "config.json")));

  it("RA-R6.4 there are exactly the three hooks, each running the launcher with a CLI subcommand", () => {
    expect(sorted(hooks.keys())).toEqual(["after-rework", "commit-gate", "suggest-inspection"]);
    const valid = ["hook suggest", "hook gate", "follow-up --latest"];
    for (const [name, h] of hooks) {
      const m = /^node scripts\/fagan-hook\.mjs (.+)$/.exec(h.action.command);
      expect(m, name).not.toBeNull();
      expect(valid, name).toContain(m?.[1]);
    }
    expect(existsSync(join(REPO_ROOT, "scripts", "fagan-hook.mjs"))).toBe(true);
  });

  it("RA-R6.1 suggest-inspection runs hook suggest when the agent stops", () => {
    expect(hook("suggest-inspection")).toMatchObject({ trigger: "Stop", action: { command: "node scripts/fagan-hook.mjs hook suggest" }, timeout: 30 });
    expect(hook("suggest-inspection").matcher).toBeUndefined();
    expect(hook("suggest-inspection").confirm).toMatchObject({
      confirmCommand: "node scripts/fagan-hook.mjs hook suggest-confirm",
      options: [{ id: "acknowledge", label: "Got it", run: true }],
    });
    expect(hook("commit-gate").confirm).toBeUndefined();
    expect(hook("after-rework").confirm).toBeUndefined();
  });

  it("RA-R6.2 commit-gate runs hook gate before every shell tool call", () => {
    expect(hook("commit-gate")).toMatchObject({ trigger: "PreToolUse", matcher: "shell", action: { command: "node scripts/fagan-hook.mjs hook gate" }, timeout: 30 });
  });

  it("RA-R6.3 RA-R6.5 after-rework runs follow-up after record_rework, with time for the build and the tests", () => {
    const h = hook("after-rework");
    expect(h).toMatchObject({ trigger: "PostToolUse", matcher: "@fagan/record_rework", action: { command: "node scripts/fagan-hook.mjs follow-up --latest" } });
    // Timeouts are in seconds (https://kiro.dev/docs/hooks/). follow-up runs the build and then the tests, each up to commandTimeoutMs.
    expect(h.timeout).toBeGreaterThanOrEqual((2 * config.commandTimeoutMs) / 1000 + 60);
  });
});

/** True when `kiro-cli` runs from PATH (it is absent in CI). */
function hasKiroCli(): boolean {
  const r = spawnSync("kiro-cli", ["--version"], { encoding: "utf8", timeout: 30_000 });
  return r.error === undefined && r.status === 0;
}

describe("kiro-cli agent validate", () => {
  it.skipIf(!hasKiroCli())("RA-R1.4 every agent file passes kiro-cli agent validate", { timeout: 120_000 }, () => {
    for (const name of AGENT_NAMES) {
      const r = spawnSync("kiro-cli", ["agent", "validate", "--path", join(".kiro", "agents", `${name}.json`)], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(r.status, `${name}: ${r.stdout}${r.stderr}`).toBe(0);
    }
  });
});
