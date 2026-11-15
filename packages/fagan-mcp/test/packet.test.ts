import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, type DiffHunk } from "../src/core/diff.js";
import { buildPacket, comparePaths, countChangedLoc, selectChecklist, splitHunk } from "../src/core/packet.js";
import { loadChecklists, assertConfigChecklists } from "../src/store/checklists.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConfigSchema } from "../src/core/schema.js";
import { SAMPLE_DIFF, testConfig } from "./helpers.js";

function hunkOf(kinds: string): DiffHunk {
  // kinds: string of '+', '-', ' ' characters.
  let o = 1;
  let n = 1;
  const lines = [...kinds].map((k, i) => {
    if (k === "+") return { kind: "add" as const, oldNo: null, newNo: n++, text: `l${i}`, noNewlineAtEof: false };
    if (k === "-") return { kind: "del" as const, oldNo: o++, newNo: null, text: `l${i}`, noNewlineAtEof: false };
    return { kind: "ctx" as const, oldNo: o++, newNo: n++, text: `l${i}`, noNewlineAtEof: false };
  });
  return { header: "@@ -1 +1 @@", section: "", oldStart: 1, oldCount: o - 1, newStart: 1, newCount: n - 1, lines };
}

describe("FM-R4.1 FM-R4.2 FM-R4.3 packet splitting", () => {
  it("orders files by byte order and numbers units without gaps", () => {
    const packet = buildPacket(parseUnifiedDiff(SAMPLE_DIFF), testConfig);
    expect(packet.files.map((f) => f.path)).toEqual(["docs/x.md", "src/a.ts"]);
    expect(packet.units.map((u) => [u.id, u.file, u.changedLoc])).toEqual([
      ["U001", "docs/x.md", 2],
      ["U002", "src/a.ts", 3],
    ]);
    expect(packet.changedLoc).toBe(5);
    expect(comparePaths("B", "a")).toBeLessThan(0);
  });

  it("splits a long hunk at changed lines and keeps context where it falls", () => {
    const units = splitHunk(hunkOf(" ++ + -  +"), 2);
    expect(units.map((u) => u.lines.map((l) => l.kind))).toEqual([
      ["ctx", "add", "add", "ctx"],
      ["add", "ctx", "del", "ctx", "ctx"],
      ["add"],
    ]);
    expect(units.map((u) => u.changedLoc)).toEqual([2, 2, 1]);
    expect(units[1]?.hunkHeader).toBe("@@ -3,4 +5,4 @@");
  });

  it("keeps the original header when a hunk is not split", () => {
    const units = splitHunk(hunkOf(" + "), 80);
    expect(units).toHaveLength(1);
    expect(units[0]?.hunkHeader).toBe("@@ -1 +1 @@");
  });

  it("FM-R4.4 FM-R4.5 skips binary and excluded files but lists them", () => {
    const diff = [
      SAMPLE_DIFF.trimEnd(),
      "diff --git a/package-lock.json b/package-lock.json",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1 +1 @@",
      "-{}",
      "+{ }",
      "diff --git a/logo.png b/logo.png",
      "Binary files a/logo.png and b/logo.png differ",
      "",
    ].join("\n");
    const files = parseUnifiedDiff(diff);
    const packet = buildPacket(files, testConfig);
    expect(packet.files.map((f) => [f.path, f.skipped])).toEqual([
      ["docs/x.md", null],
      ["logo.png", "binary"],
      ["package-lock.json", "excluded"],
      ["src/a.ts", null],
    ]);
    expect(packet.units.every((u) => u.file !== "package-lock.json" && u.file !== "logo.png")).toBe(true);
    expect(packet.changedLoc).toBe(5);
    expect(countChangedLoc(files, testConfig.exclude)).toBe(5);
  });

  it("FM-R4.8 stores blob hashes per file", () => {
    const packet = buildPacket(
      parseUnifiedDiff(SAMPLE_DIFF),
      testConfig,
      new Map([["src/a.ts", { blobBefore: "b1", blobAfter: "b2" }]]),
    );
    expect(packet.files.find((f) => f.path === "src/a.ts")).toMatchObject({ blobBefore: "b1", blobAfter: "b2" });
    expect(packet.files.find((f) => f.path === "docs/x.md")).toMatchObject({ blobBefore: null, blobAfter: null });
  });
});

describe("FM-R4.6 checklist selection", () => {
  const repoConfig = ConfigSchema.parse(
    JSON.parse(readFileSync(fileURLToPath(new URL("../../../.fagan/config.json", import.meta.url)), "utf8")),
  );

  it("uses the first matching rule in config order", () => {
    expect(selectChecklist("packages/x/test/a.test.ts", testConfig.checklists, "general")).toBe("tests");
    expect(selectChecklist("src/a.ts", testConfig.checklists, "general")).toBe("typescript");
    expect(selectChecklist("README.md", testConfig.checklists, "general")).toBe("docs");
  });

  it("falls back to the default checklist", () => {
    expect(selectChecklist("LICENSE", testConfig.checklists, "general")).toBe("general");
  });

  it("matches dot folders such as .kiro/ with this repo's config", () => {
    expect(selectChecklist(".kiro/settings/mcp.json", repoConfig.checklists, repoConfig.defaultChecklist)).toBe("json-config");
    expect(selectChecklist(".kiro/steering/tech.md", repoConfig.checklists, repoConfig.defaultChecklist)).toBe("json-config");
    expect(selectChecklist("packages/fagan-mcp/test/x.property.test.ts", repoConfig.checklists, "general")).toBe("tests");
  });

  it("FM-R3.8 bundled checklists load and cover every ID the repo config names", async () => {
    const checklists = await loadChecklists();
    expect([...checklists.keys()]).toEqual(["docs", "general", "json-config", "tests", "typescript"]);
    expect(() => assertConfigChecklists(repoConfig, checklists)).not.toThrow();
    expect(() => assertConfigChecklists({ ...repoConfig, defaultChecklist: "nope" }, checklists)).toThrow(/nope/);
  });
});
