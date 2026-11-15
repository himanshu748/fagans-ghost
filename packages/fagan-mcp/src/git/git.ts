// Git adapter. Every call is `execFile("git", argv)`: no shell, no string
// commands (FM-R2.2, FM-R2.3, FM-R4.8, FM-R14.3, FM-R14.7).
import { execFile } from "node:child_process";
import { FaganError } from "../core/errors.js";
import { parseUnifiedDiff, type DiffFile } from "../core/diff.js";
import type { BlobPair } from "../core/packet.js";
import { comparePaths } from "../core/packet.js";

export const WORKTREE = "WORKTREE";
const MAX_BUFFER = 256 * 1024 * 1024;

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs git with an argument array. Resolves for any exit code; rejects only if git cannot start. */
export function runGit(cwd: string, args: readonly string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        encoding: "utf8",
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
      },
      (error, stdout, stderr) => {
        if (error !== null && typeof error.code !== "number") {
          reject(error);
          return;
        }
        resolve({ code: error === null ? 0 : (error.code as number), stdout, stderr });
      },
    );
  });
}

async function gitOk(cwd: string, args: readonly string[], okCodes: readonly number[] = [0]): Promise<string> {
  const r = await runGit(cwd, args);
  if (!okCodes.includes(r.code)) {
    throw new Error(`git ${args[0] ?? ""} exited ${r.code}: ${r.stderr.trim()}`);
  }
  return r.stdout;
}

/** `git rev-parse --show-toplevel`, or `NOT_A_GIT_REPO` (FM-R14.7). */
export async function repoRoot(cwd: string): Promise<string> {
  let r: GitResult;
  try {
    r = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  } catch (err) {
    throw new FaganError("NOT_A_GIT_REPO", `cannot run git in ${cwd}: ${(err as Error).message}`, { cwd });
  }
  if (r.code !== 0) throw new FaganError("NOT_A_GIT_REPO", `${cwd} is not inside a git repository`, { cwd });
  return r.stdout.replace(/\r?\n$/, "");
}

/** Shape checks that run before git sees the value (FM-R2.2, FM-R14.3). */
export function assertRevisionShape(rev: string, field: string): void {
  if (rev.length === 0 || rev.length > 200 || rev.startsWith("-") || /[\0\n\r]/.test(rev)) {
    throw new FaganError("INVALID_RANGE", `${field} must be 1 to 200 characters and must not start with '-'`, {
      field,
      value: rev.slice(0, 200),
    });
  }
}

/** Resolves a revision to a commit SHA with `git rev-parse --verify`, or `INVALID_RANGE`. */
export async function verifyRevision(root: string, rev: string, field = "base"): Promise<string> {
  assertRevisionShape(rev, field);
  const r = await runGit(root, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  const sha = r.stdout.trim();
  if (r.code !== 0 || !/^[0-9a-f]{40,64}$/.test(sha)) {
    throw new FaganError("INVALID_RANGE", `${field} ${rev} is not a commit`, { field, value: rev });
  }
  return sha;
}

/** Flags that pin the output format whatever the user's git config says. */
const DIFF_FORMAT = [
  "--no-color",
  "--no-ext-diff",
  "--no-textconv",
  "--src-prefix=a/",
  "--dst-prefix=b/",
  "--unified=3",
] as const;

/**
 * Tracked diff. With `headSha` null this is `git diff <base>`, which compares
 * the working tree (including staged content) with the commit.
 */
export async function trackedDiff(root: string, baseSha: string, headSha: string | null): Promise<string> {
  const range = headSha === null ? [baseSha] : [baseSha, headSha];
  return gitOk(root, ["-c", "core.quotepath=off", "diff", ...DIFF_FORMAT, "--no-relative", "--find-renames", ...range, "--"]);
}

/** Untracked, non-ignored files, repo-relative, sorted by byte order. */
export async function untrackedFiles(root: string): Promise<string[]> {
  const out = await gitOk(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return out
    .split("\0")
    .filter((p) => p.length > 0)
    .sort(comparePaths);
}

/** One untracked file as an added-file diff, via `git diff --no-index` (exit 1 means "differs"). Never touches the index. */
export async function untrackedDiff(root: string, path: string): Promise<string> {
  return gitOk(root, ["-c", "core.quotepath=off", "diff", "--no-index", ...DIFF_FORMAT, "--", "/dev/null", path], [0, 1]);
}

/** Blob hash of `<rev>:<path>`, or null when the path does not exist there. */
export async function blobAt(root: string, rev: string, path: string): Promise<string | null> {
  const r = await runGit(root, ["rev-parse", "--verify", "--quiet", `${rev}:${path}`]);
  const sha = r.stdout.trim();
  return r.code === 0 && sha.length > 0 ? sha : null;
}

/** Blob hash of the working-tree file, as `git add` would store it, or null when it is missing. */
export async function worktreeBlob(root: string, path: string): Promise<string | null> {
  const r = await runGit(root, ["hash-object", "--", path]);
  const sha = r.stdout.trim();
  return r.code === 0 && sha.length > 0 ? sha : null;
}

export interface CollectedDiff {
  baseSha: string;
  headSha: string | null;
  diffText: string;
  files: DiffFile[];
  blobs: Map<string, BlobPair>;
}

export interface CollectDiffOptions {
  base: string;
  head: string;
  includeUntracked: boolean;
}

/** Resolves the range, collects the diff text, parses it and records blob hashes for both sides. */
export async function collectDiff(root: string, opts: CollectDiffOptions): Promise<CollectedDiff> {
  const baseSha = await verifyRevision(root, opts.base, "base");
  const headSha = opts.head === WORKTREE ? null : await verifyRevision(root, opts.head, "head");
  let diffText = await trackedDiff(root, baseSha, headSha);
  if (headSha === null && opts.includeUntracked) {
    for (const path of await untrackedFiles(root)) diffText += await untrackedDiff(root, path);
  }
  const files = parseUnifiedDiff(diffText);
  const blobs = new Map<string, BlobPair>();
  for (const f of files) {
    const beforePath = f.oldPath ?? f.path;
    const blobBefore = f.status === "added" ? null : await blobAt(root, baseSha, beforePath);
    let blobAfter: string | null = null;
    if (f.status !== "deleted") blobAfter = headSha === null ? await worktreeBlob(root, f.path) : await blobAt(root, headSha, f.path);
    blobs.set(f.path, { blobBefore, blobAfter });
  }
  return { baseSha, headSha, diffText, files, blobs };
}

/** Current working-tree blob for each path (for follow-up verification). */
export async function currentBlobs(root: string, paths: readonly string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const p of paths) out.set(p, await worktreeBlob(root, p));
  return out;
}
