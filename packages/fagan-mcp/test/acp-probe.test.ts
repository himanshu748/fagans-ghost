// Tests for scripts/acp-probe.mjs, the ACP client the step 3 Kiro experiments
// use (RA-R10). Only its pure parts run here; the live runs are recorded in
// docs/experiments.md. The path is computed, so tsc does not resolve the .mjs
// file (no allowJs); the module is typed by the interface below.
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const PROBE = fileURLToPath(new URL("../../../scripts/acp-probe.mjs", import.meta.url));

interface Decision {
  keys: string[];
  allowed: boolean;
  kind: string | null;
  outcome: { outcome: string; optionId?: string };
}

interface Probe {
  ARGV: readonly string[];
  redact(value: unknown): unknown;
  decide(params: unknown, allow: readonly string[]): Decision;
}

const load = async (): Promise<Probe> => (await import(pathToFileURL(PROBE).href)) as Probe;

interface Option {
  optionId: string;
  name: string;
  kind: string;
}

/** The four option kinds, in the order of the example on https://kiro.dev/docs/cli/v3/acp-migration.md. */
const OPTIONS: Option[] = [
  { optionId: "accept", name: "Allow", kind: "allow_once" },
  { optionId: "always-accept", name: "Always allow", kind: "allow_always" },
  { optionId: "reject", name: "Deny", kind: "reject_once" },
  { optionId: "always-reject", name: "Always deny", kind: "reject_always" },
];

const request = (meta: Record<string, unknown>, options: Option[] = OPTIONS): Record<string, unknown> => ({
  sessionId: "session-1",
  toolCall: { toolCallId: "call-1", title: "Run tests", status: "pending" },
  options,
  _meta: { kiro: meta },
});
const shell = (resource: string, options?: Option[]): Record<string, unknown> =>
  request({ consent: { capability: "shell", resource, triggeringResource: resource, persistableConsent: true } }, options);
const mcp = (serverName: string, toolName: string, options?: Option[]): Record<string, unknown> =>
  request({ mcpTool: { version: 1, identity: { serverName, toolName } } }, options);

describe("scripts/acp-probe.mjs", () => {
  it("RA-R10.1 starts kiro-cli acp with T3 Code's arguments", async () => {
    expect((await load()).ARGV).toEqual(["acp", "--agent-engine=v3", "--auth-method=cli"]);
  });

  it("RA-R10.1 redacts string values under secret-looking keys only", async () => {
    const { redact } = await load();
    const msg = { accessToken: "abc", params: [{ Authorization: "Bearer x", tokens: 5, text: "a token in text stays" }], cookie: { a: 1 } };
    expect(redact(msg)).toEqual({ accessToken: "[redacted]", params: [{ Authorization: "[redacted]", tokens: 5, text: "a token in text stays" }], cookie: { a: 1 } });
  });

  it("RA-R10.2 picks allow_once for a matching request and reject_once otherwise", async () => {
    const { decide } = await load();
    expect(decide(shell("git status"), ["shell:git status"])).toEqual({
      keys: ["shell:git status"],
      allowed: true,
      kind: "allow_once",
      outcome: { outcome: "selected", optionId: "accept" },
    });
    expect(decide(shell("git push"), ["shell:git status"])).toMatchObject({ allowed: false, kind: "reject_once", outcome: { optionId: "reject" } });
    expect(decide(mcp("fagan", "record_rework"), ["@fagan/record_rework"])).toMatchObject({ keys: ["@fagan/record_rework"], kind: "allow_once" });
    expect(decide(mcp("fagan", "log_defect"), ["@fagan/record_rework"]).kind).toBe("reject_once");
    // * is the only wildcard, and the whole key must match.
    expect(decide(shell('git commit --allow-empty -m "gate probe"'), ["shell:git commit*"]).allowed).toBe(true);
    expect(decide(shell("git status && rm -rf x"), ["shell:git status"]).allowed).toBe(false);
    expect(decide(shell("git status"), ["shell:git.status"]).allowed).toBe(false);
    expect(decide(shell("git status"), ["git status"]).allowed).toBe(false);
    // A request with neither consent nor MCP identity has no key, so it is rejected.
    expect(decide(request({}), ["*"])).toMatchObject({ keys: [], allowed: false, kind: "reject_once" });
  });

  it("RA-R10.2 never selects allow_always or reject_always", async () => {
    const { decide } = await load();
    const persistent = OPTIONS.filter((o) => o.kind.endsWith("_always"));
    expect(decide(shell("git status", persistent), ["*"]).outcome).toEqual({ outcome: "cancelled" });
    expect(decide(shell("git status", persistent), []).outcome).toEqual({ outcome: "cancelled" });
    // Every subset of the four options, in both orders, with and without a match.
    for (let mask = 0; mask < 16; mask++) {
      const subset = OPTIONS.filter((_, i) => (mask & (1 << i)) !== 0);
      for (const options of [subset, [...subset].reverse()]) {
        for (const allow of [[], ["*"]]) {
          const d = decide(shell("git status", options), allow);
          const chosen = options.find((o) => o.optionId === d.outcome.optionId);
          if (d.outcome.outcome === "selected") expect(chosen?.kind).toBe(allow.length > 0 ? "allow_once" : "reject_once");
          else expect(d.outcome).toEqual({ outcome: "cancelled" });
        }
      }
    }
    for (const params of [null, {}, { options: OPTIONS }, "x"]) {
      expect(["reject", undefined]).toContain(decide(params, ["*"]).outcome.optionId);
    }
  });
});
