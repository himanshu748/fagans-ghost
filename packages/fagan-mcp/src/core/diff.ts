// Unified diff parser for `git diff` output (FM-R4.7, design.md "Diff and packet").
//
// Handles `diff --git` headers, new and deleted file modes, renames, binary
// files, `@@ -a,b +c,d @@` hunks and `\ No newline at end of file` markers.
import { FaganError } from "./errors.js";
import type { FileStatus, LineKind } from "./schema.js";

export interface DiffLine {
  kind: LineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
  /** True when git printed `\ No newline at end of file` after this line. */
  noNewlineAtEof: boolean;
}

export interface DiffHunk {
  header: string;
  section: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffFile {
  /** Repo-relative path on the new side, or the old side for deleted files. */
  path: string;
  /** Old path for renamed files, otherwise null. */
  oldPath: string | null;
  status: FileStatus;
  binary: boolean;
  hunks: DiffHunk[];
}

const HUNK_RE = /^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@(.*)$/;

const SIMPLE_ESCAPES: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

/** Decodes a git C-style quoted path such as `"a/q\"t.txt"`. Unquoted input is returned as is. */
export function unquoteGitPath(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const body = raw.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (ch !== "\\") {
      for (const b of Buffer.from(ch, "utf8")) bytes.push(b);
      continue;
    }
    const next = body[i + 1] ?? "";
    if (/^[0-7]$/.test(next)) {
      const oct = body.slice(i + 1, i + 4);
      bytes.push(parseInt(oct, 8));
      i += oct.length;
      continue;
    }
    const code = SIMPLE_ESCAPES[next];
    if (code !== undefined) {
      bytes.push(code);
      i += 1;
      continue;
    }
    for (const b of Buffer.from(`\\${next}`, "utf8")) bytes.push(b);
    i += 1;
  }
  return Buffer.from(bytes).toString("utf8");
}

function stripPrefix(path: string, prefix: "a/" | "b/"): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** Path from a `--- ` or `+++ ` line, or null for /dev/null. */
function markerPath(rest: string, prefix: "a/" | "b/"): string | null {
  let value = rest;
  if (!value.startsWith('"') && value.endsWith("\t")) value = value.slice(0, -1);
  if (value === "/dev/null") return null;
  return stripPrefix(unquoteGitPath(value), prefix);
}

/** Reads the first token of `s`: a quoted string or text up to `stop`. */
function readToken(s: string): { token: string; rest: string } {
  if (s.startsWith('"')) {
    let i = 1;
    while (i < s.length) {
      if (s[i] === "\\") i += 2;
      else if (s[i] === '"') break;
      else i += 1;
    }
    return { token: s.slice(0, i + 1), rest: s.slice(i + 1) };
  }
  return { token: s, rest: "" };
}

/** Old and new paths from `diff --git a/X b/Y`. */
export function parseDiffGitHeader(rest: string): { oldPath: string; newPath: string } {
  if (rest.startsWith('"')) {
    const first = readToken(rest);
    const second = first.rest.replace(/^ /, "");
    return {
      oldPath: stripPrefix(unquoteGitPath(first.token), "a/"),
      newPath: stripPrefix(unquoteGitPath(second), "b/"),
    };
  }
  if (rest.endsWith('"')) {
    const idx = rest.indexOf(' "');
    if (idx >= 0) {
      return {
        oldPath: stripPrefix(rest.slice(0, idx), "a/"),
        newPath: stripPrefix(unquoteGitPath(rest.slice(idx + 1)), "b/"),
      };
    }
  }
  // Same path on both sides: "a/P b/P" has length 2 * len(P) + 5.
  if ((rest.length - 1) % 2 === 0) {
    const half = (rest.length - 1) / 2;
    const left = rest.slice(0, half);
    const right = rest.slice(half + 1);
    if (rest[half] === " " && left.startsWith("a/") && right.startsWith("b/") && left.slice(2) === right.slice(2)) {
      return { oldPath: left.slice(2), newPath: right.slice(2) };
    }
  }
  const idx = rest.indexOf(" b/");
  if (idx >= 0) {
    return { oldPath: stripPrefix(rest.slice(0, idx), "a/"), newPath: rest.slice(idx + 3) };
  }
  return { oldPath: stripPrefix(rest, "a/"), newPath: stripPrefix(rest, "a/") };
}

interface FileDraft {
  headerOld: string;
  headerNew: string;
  minusPath: string | null | undefined;
  plusPath: string | null | undefined;
  renameFrom: string | null;
  renameTo: string | null;
  isNew: boolean;
  isDeleted: boolean;
  binary: boolean;
  hunks: DiffHunk[];
}

function finishFile(d: FileDraft): DiffFile {
  const oldSide = d.renameFrom ?? (d.minusPath === undefined ? d.headerOld : d.minusPath);
  const newSide = d.renameTo ?? (d.plusPath === undefined ? d.headerNew : d.plusPath);
  let status: FileStatus = "modified";
  if (d.renameFrom !== null || d.renameTo !== null) status = "renamed";
  else if (d.isNew || d.minusPath === null) status = "added";
  else if (d.isDeleted || d.plusPath === null) status = "deleted";
  const path = status === "deleted" ? (oldSide ?? d.headerOld) : (newSide ?? d.headerNew);
  return {
    path,
    oldPath: status === "renamed" ? (oldSide ?? d.headerOld) : null,
    status,
    binary: d.binary,
    hunks: d.hunks,
  };
}

function malformed(lineNo: number, why: string): FaganError {
  return new FaganError("VALIDATION_ERROR", `malformed diff at line ${lineNo}: ${why}`, { line: lineNo });
}

/** Parses `git diff` output into files, hunks and numbered lines. */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const rawLines = text.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();

  const files: DiffFile[] = [];
  let file: FileDraft | null = null;
  let hunk: DiffHunk | null = null;
  let oldLeft = 0;
  let newLeft = 0;
  let nextOld = 0;
  let nextNew = 0;
  let inBinaryPatch = false;

  const closeFile = (): void => {
    if (file !== null) files.push(finishFile(file));
    file = null;
    hunk = null;
    inBinaryPatch = false;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] as string;
    const lineNo = i + 1;

    if (line.startsWith("diff --git ")) {
      if (hunk !== null && (oldLeft > 0 || newLeft > 0)) throw malformed(lineNo, "hunk ended early");
      closeFile();
      const { oldPath, newPath } = parseDiffGitHeader(line.slice("diff --git ".length));
      file = {
        headerOld: oldPath,
        headerNew: newPath,
        minusPath: undefined,
        plusPath: undefined,
        renameFrom: null,
        renameTo: null,
        isNew: false,
        isDeleted: false,
        binary: false,
        hunks: [],
      };
      continue;
    }
    if (file === null) continue; // text before the first file header
    const f: FileDraft = file;

    if (hunk !== null && (oldLeft > 0 || newLeft > 0 || line.startsWith("\\"))) {
      const h: DiffHunk = hunk;
      if (line.startsWith("\\")) {
        const last = h.lines[h.lines.length - 1];
        if (last === undefined) throw malformed(lineNo, "no-newline marker before any line");
        last.noNewlineAtEof = true;
        continue;
      }
      const tag = line.length === 0 ? " " : line[0];
      const body = line.length === 0 ? "" : line.slice(1);
      if (tag === " ") {
        if (oldLeft <= 0 || newLeft <= 0) throw malformed(lineNo, "context line beyond hunk counts");
        h.lines.push({ kind: "ctx", oldNo: nextOld++, newNo: nextNew++, text: body, noNewlineAtEof: false });
        oldLeft--;
        newLeft--;
      } else if (tag === "-") {
        if (oldLeft <= 0) throw malformed(lineNo, "deleted line beyond hunk counts");
        h.lines.push({ kind: "del", oldNo: nextOld++, newNo: null, text: body, noNewlineAtEof: false });
        oldLeft--;
      } else if (tag === "+") {
        if (newLeft <= 0) throw malformed(lineNo, "added line beyond hunk counts");
        h.lines.push({ kind: "add", oldNo: null, newNo: nextNew++, text: body, noNewlineAtEof: false });
        newLeft--;
      } else {
        throw malformed(lineNo, "unexpected line inside hunk");
      }
      continue;
    }

    const m = HUNK_RE.exec(line);
    if (m !== null) {
      const oldStart = Number(m[1]);
      const oldCount = m[2] === undefined ? 1 : Number(m[2]);
      const newStart = Number(m[3]);
      const newCount = m[4] === undefined ? 1 : Number(m[4]);
      hunk = { header: line, section: m[5] ?? "", oldStart, oldCount, newStart, newCount, lines: [] };
      f.hunks.push(hunk);
      oldLeft = oldCount;
      newLeft = newCount;
      nextOld = oldCount === 0 ? oldStart + 1 : oldStart;
      nextNew = newCount === 0 ? newStart + 1 : newStart;
      continue;
    }
    if (inBinaryPatch) continue;

    if (line.startsWith("new file mode ")) f.isNew = true;
    else if (line.startsWith("deleted file mode ")) f.isDeleted = true;
    else if (line.startsWith("rename from ")) f.renameFrom = unquoteGitPath(line.slice("rename from ".length));
    else if (line.startsWith("rename to ")) f.renameTo = unquoteGitPath(line.slice("rename to ".length));
    else if (line.startsWith("--- ")) f.minusPath = markerPath(line.slice(4), "a/");
    else if (line.startsWith("+++ ")) f.plusPath = markerPath(line.slice(4), "b/");
    else if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
      f.binary = true;
      const body = line.slice("Binary files ".length, -" differ".length);
      if (body.startsWith("/dev/null and ")) f.minusPath = null;
      if (body.endsWith(" and /dev/null")) f.plusPath = null;
    } else if (line === "GIT binary patch") {
      f.binary = true;
      inBinaryPatch = true;
    }
    // Other header lines (index, similarity index, old/new mode) carry nothing we store.
  }
  if (hunk !== null && (oldLeft > 0 || newLeft > 0)) throw malformed(rawLines.length, "hunk ended early");
  closeFile();
  return files;
}
