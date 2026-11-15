import { describe, expect, it } from "vitest";
import { parseDiffGitHeader, parseUnifiedDiff, unquoteGitPath } from "../src/core/diff.js";
import { FaganError } from "../src/core/errors.js";
import { SAMPLE_DIFF } from "./helpers.js";

describe("FM-R4.7 unified diff parser", () => {
  it("parses a modified file with line numbers per kind", () => {
    const [file] = parseUnifiedDiff(SAMPLE_DIFF);
    expect(file?.path).toBe("src/a.ts");
    expect(file?.status).toBe("modified");
    expect(file?.oldPath).toBeNull();
    const lines = file?.hunks[0]?.lines ?? [];
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ["ctx", 1, 1],
      ["del", 2, null],
      ["add", null, 2],
      ["add", null, 3],
      ["ctx", 3, 4],
      ["ctx", 4, 5],
    ]);
    expect(lines[2]?.text).toBe("const b = 3;");
  });

  it("parses an added file from /dev/null", () => {
    const files = parseUnifiedDiff(SAMPLE_DIFF);
    const md = files[1];
    expect(md?.status).toBe("added");
    expect(md?.path).toBe("docs/x.md");
    expect(md?.hunks[0]?.lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ["add", null, 1],
      ["add", null, 2],
    ]);
  });

  it("parses a deleted file using the old path", () => {
    const diff = [
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "index 1234567..0000000",
      "--- a/old.txt",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-one",
      "-two",
      "",
    ].join("\n");
    const [f] = parseUnifiedDiff(diff);
    expect(f?.status).toBe("deleted");
    expect(f?.path).toBe("old.txt");
    expect(f?.hunks[0]?.lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ["del", 1, null],
      ["del", 2, null],
    ]);
  });

  it("parses a pure rename and a rename with edits", () => {
    const diff = [
      "diff --git a/sp ace.txt b/new name.txt",
      "similarity index 100%",
      "rename from sp ace.txt",
      "rename to new name.txt",
      "diff --git a/lib/x.ts b/lib/y.ts",
      "similarity index 80%",
      "rename from lib/x.ts",
      "rename to lib/y.ts",
      "index 1111111..2222222 100644",
      "--- a/lib/x.ts",
      "+++ b/lib/y.ts",
      "@@ -10 +10 @@ function f() {",
      "-  return 1;",
      "+  return 2;",
      "",
    ].join("\n");
    const [pure, edited] = parseUnifiedDiff(diff);
    expect(pure).toMatchObject({ path: "new name.txt", oldPath: "sp ace.txt", status: "renamed", hunks: [] });
    expect(edited).toMatchObject({ path: "lib/y.ts", oldPath: "lib/x.ts", status: "renamed" });
    expect(edited?.hunks[0]?.section).toBe(" function f() {");
    expect(edited?.hunks[0]?.lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ["del", 10, null],
      ["add", null, 10],
    ]);
  });

  it("marks binary files and gives them no hunks", () => {
    const diff = [
      "diff --git a/img.png b/img.png",
      "new file mode 100644",
      "index 0000000..bdc955b",
      "Binary files /dev/null and b/img.png differ",
      "",
    ].join("\n");
    const [f] = parseUnifiedDiff(diff);
    expect(f).toMatchObject({ path: "img.png", status: "added", binary: true, hunks: [] });
  });

  it("records no-newline-at-end-of-file on the right line", () => {
    const diff = [
      "diff --git a/n.txt b/n.txt",
      "--- a/n.txt",
      "+++ b/n.txt",
      "@@ -1,2 +1,2 @@",
      " a",
      "-b",
      "\\ No newline at end of file",
      "+b",
      "",
    ].join("\n");
    const lines = parseUnifiedDiff(diff)[0]?.hunks[0]?.lines ?? [];
    expect(lines.map((l) => [l.kind, l.text, l.noNewlineAtEof])).toEqual([
      ["ctx", "a", false],
      ["del", "b", true],
      ["add", "b", false],
    ]);
  });

  it("strips git's trailing tab and unquotes C-style paths", () => {
    const diff = [
      'diff --git "a/q\\"t.txt" "b/q\\"t.txt"',
      "new file mode 100644",
      "--- /dev/null",
      '+++ "b/q\\"t.txt"',
      "@@ -0,0 +1 @@",
      "+x",
      "diff --git a/sp ace.txt b/sp ace.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/sp ace.txt\t",
      "@@ -0,0 +1 @@",
      "+y",
      "",
    ].join("\n");
    expect(parseUnifiedDiff(diff).map((f) => f.path)).toEqual(['q"t.txt', "sp ace.txt"]);
    expect(unquoteGitPath('"caf\\303\\251.txt"')).toBe("café.txt");
    expect(parseDiffGitHeader("a/x b/y b/x b/y")).toEqual({ oldPath: "x b/y", newPath: "x b/y" });
  });

  it("rejects a hunk whose lines do not match its counts", () => {
    const diff = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -1,2 +1,2 @@", " a", ""].join("\n");
    expect(() => parseUnifiedDiff(diff)).toThrow(FaganError);
  });

  it("returns no files for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});
