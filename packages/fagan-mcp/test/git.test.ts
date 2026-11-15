import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FaganError } from "../src/core/errors.js";
import { buildPacket } from "../src/core/packet.js";
import { collectDiff, currentBlobs, repoRoot, verifyRevision, untrackedFiles } from "../src/git/git.js";
import { git, tempDir, tempRepo, testConfig, writeFiles } from "./helpers.js";

let repo: { path: string; cleanup: () => void };

beforeEach(() => {
  repo = tempRepo({
    "src/a.ts": "const a = 1;\nconst b = 2;\nexport { a, b };\n",
    "docs/old name.md": "# Doc\n\ntext\n",
    "gone.txt": "bye\n",
    ".gitignore": "ignored.log\n",
  });
});
afterEach(() => repo.cleanup());

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    return err instanceof FaganError ? err.code : `OTHER: ${String(err)}`;
  }
}

describe("FM-R14.7 repo detection", () => {
  it("finds the top level from a subfolder", async () => {
    const sub = join(repo.path, "src");
    const top = await repoRoot(sub);
    expect(readFileSync(join(top, "src/a.ts"), "utf8")).toContain("const a");
  });

  it("returns NOT_A_GIT_REPO outside a repo", async () => {
    const d = tempDir("fagan-norepo-");
    try {
      expect(await codeOf(repoRoot(d.path))).toBe("NOT_A_GIT_REPO");
    } finally {
      d.cleanup();
    }
  });
});

describe("FM-R2.2 FM-R14.3 revision checks", () => {
  it("rejects option-like, empty, long and unknown revisions", async () => {
    for (const rev of ["-p", "--output=/tmp/x", "", "a".repeat(201), "no-such-branch"]) {
      expect(await codeOf(verifyRevision(repo.path, rev)), rev).toBe("INVALID_RANGE");
    }
    expect(await verifyRevision(repo.path, "HEAD")).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("FM-R2.3 FM-R4.8 worktree diff", () => {
  it("includes staged and unstaged edits, renames, deletes and untracked files without touching the index", async () => {
    writeFileSync(join(repo.path, "src/a.ts"), "const a = 1;\nconst b = 3;\nexport { a, b };\n");
    git(repo.path, "mv", "docs/old name.md", "docs/new name.md");
    git(repo.path, "rm", "-q", "gone.txt");
    writeFiles(repo.path, { "src/new.ts": "export const n = 1;\n", "ignored.log": "noise\n" });
    git(repo.path, "add", "src/a.ts");
    writeFileSync(join(repo.path, "src/a.ts"), "const a = 1;\nconst b = 3;\nexport { a, b };\n// more\n");
    const indexBefore = readFileSync(join(repo.path, ".git", "index"));

    const d = await collectDiff(repo.path, { base: "HEAD", head: "WORKTREE", includeUntracked: true });
    expect(readFileSync(join(repo.path, ".git", "index"))).toEqual(indexBefore);
    expect(d.headSha).toBeNull();
    expect(d.files.map((f) => [f.path, f.status]).sort()).toEqual([
      ["docs/new name.md", "renamed"],
      ["gone.txt", "deleted"],
      ["src/a.ts", "modified"],
      ["src/new.ts", "added"],
    ]);
    expect(await untrackedFiles(repo.path)).toEqual(["src/new.ts"]);

    const packet = buildPacket(d.files, testConfig, d.blobs);
    const a = packet.files.find((f) => f.path === "src/a.ts");
    expect(a?.blobBefore).toBe(git(repo.path, "rev-parse", "HEAD:src/a.ts").trim());
    expect(a?.blobAfter).toBe(git(repo.path, "hash-object", "src/a.ts").trim());
    expect(packet.files.find((f) => f.path === "gone.txt")).toMatchObject({ blobAfter: null });
    expect(packet.files.find((f) => f.path === "src/new.ts")).toMatchObject({ blobBefore: null });
    expect(packet.changedLoc).toBe(3 + 1 + 1);

    const without = await collectDiff(repo.path, { base: "HEAD", head: "WORKTREE", includeUntracked: false });
    expect(without.files.some((f) => f.path === "src/new.ts")).toBe(false);
  });

  it("diffs two revisions", async () => {
    const base = git(repo.path, "rev-parse", "HEAD").trim();
    writeFileSync(join(repo.path, "src/a.ts"), "changed\n");
    git(repo.path, "commit", "-qam", "two");
    const d = await collectDiff(repo.path, { base, head: "HEAD", includeUntracked: true });
    expect(d.headSha).toBe(git(repo.path, "rev-parse", "HEAD").trim());
    expect(d.files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(d.blobs.get("src/a.ts")?.blobAfter).toBe(git(repo.path, "rev-parse", "HEAD:src/a.ts").trim());
  });

  it("reports current blobs, null for missing files", async () => {
    rmSync(join(repo.path, "gone.txt"));
    const blobs = await currentBlobs(repo.path, ["src/a.ts", "gone.txt"]);
    expect(blobs.get("src/a.ts")).toBe(git(repo.path, "rev-parse", "HEAD:src/a.ts").trim());
    expect(blobs.get("gone.txt")).toBeNull();
  });
});
