// Packet splitter, changed_loc and checklist selection (FM-R4.1 to FM-R4.6).
//
// Glob matching uses picomatch 4 (`picomatch/posix.js`, option `dot: true`).
// Node's `path.matchesGlob` prints an ExperimentalWarning on Node 22.14.0, which
// would leak into hook output, so it is not used (design.md "Toolchain decisions").
import picomatch from "picomatch/posix.js";
import type { DiffFile, DiffHunk, DiffLine } from "./diff.js";
import type { Packet, PacketFile, Unit, UnitLine } from "./schema.js";

export interface ChecklistRule {
  match: readonly string[];
  checklist: string;
}

export interface PacketOptions {
  maxUnitLines: number;
  exclude: readonly string[];
  checklists: readonly ChecklistRule[];
  defaultChecklist: string;
}

export interface BlobPair {
  blobBefore: string | null;
  blobAfter: string | null;
}

const matcherCache = new Map<string, (path: string) => boolean>();

function matcherFor(glob: string): (path: string) => boolean {
  let m = matcherCache.get(glob);
  if (m === undefined) {
    m = picomatch(glob, { dot: true });
    matcherCache.set(glob, m);
  }
  return m;
}

/** True when `path` (repo-relative, `/` separators) matches any glob. */
export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => matcherFor(glob)(path));
}

/** First rule whose globs match the path, else the default (FM-R4.6). */
export function selectChecklist(path: string, rules: readonly ChecklistRule[], defaultChecklist: string): string {
  for (const rule of rules) {
    if (matchesAny(path, rule.match)) return rule.checklist;
  }
  return defaultChecklist;
}

/** Byte-order comparison of two paths (FM-R4.3). */
export function comparePaths(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function isChanged(line: { kind: string }): boolean {
  return line.kind === "add" || line.kind === "del";
}

export function formatUnitId(n: number): string {
  return `U${String(n).padStart(3, "0")}`;
}

function rangePart(start: number, count: number): string {
  return count === 1 ? `${start}` : `${start},${count}`;
}

export interface UnitDraft {
  hunkHeader: string;
  lines: UnitLine[];
  changedLoc: number;
}

/**
 * Splits one hunk into consecutive units of at most `maxUnitLines` changed
 * lines. A new unit starts only at a changed line, so context lines stay in
 * the unit where they fall (FM-R4.2). Hunks with no changed lines give no unit.
 */
export function splitHunk(hunk: DiffHunk, maxUnitLines: number): UnitDraft[] {
  const cap = Math.max(1, Math.floor(maxUnitLines));
  const groups: Array<{ lines: DiffLine[]; changed: number; nextOld: number; nextNew: number }> = [];
  let nextOld = hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart;
  let nextNew = hunk.newCount === 0 ? hunk.newStart + 1 : hunk.newStart;
  let current: (typeof groups)[number] | null = null;
  for (const line of hunk.lines) {
    if (current === null || (isChanged(line) && current.changed >= cap)) {
      current = { lines: [], changed: 0, nextOld, nextNew };
      groups.push(current);
    }
    current.lines.push(line);
    if (isChanged(line)) current.changed++;
    if (line.oldNo !== null) nextOld = line.oldNo + 1;
    if (line.newNo !== null) nextNew = line.newNo + 1;
  }
  const withChanges = groups.filter((g) => g.changed > 0);
  const single = withChanges.length === 1 && groups.length === 1;
  return withChanges.map((g) => {
    let header = hunk.header;
    if (!single) {
      const oldCount = g.lines.filter((l) => l.oldNo !== null).length;
      const newCount = g.lines.filter((l) => l.newNo !== null).length;
      const oldStart = oldCount > 0 ? g.nextOld : g.nextOld - 1;
      const newStart = newCount > 0 ? g.nextNew : g.nextNew - 1;
      header = `@@ -${rangePart(oldStart, oldCount)} +${rangePart(newStart, newCount)} @@${hunk.section}`;
    }
    return {
      hunkHeader: header,
      changedLoc: g.changed,
      lines: g.lines.map((l) => ({ kind: l.kind, oldNo: l.oldNo, newNo: l.newNo, text: l.text, noNewlineAtEof: l.noNewlineAtEof })),
    };
  });
}

/** Builds `packet.json` content from parsed diff files (FM-R4.1 to FM-R4.6, FM-R4.8). */
export function buildPacket(
  files: readonly DiffFile[],
  options: PacketOptions,
  blobs: ReadonlyMap<string, BlobPair> = new Map(),
): Packet {
  const sorted = [...files].sort((a, b) => comparePaths(a.path, b.path));
  const packetFiles: PacketFile[] = [];
  const units: Unit[] = [];
  let changedLoc = 0;
  for (const file of sorted) {
    const skipped = file.binary ? "binary" : matchesAny(file.path, options.exclude) ? "excluded" : null;
    const blob = blobs.get(file.path);
    packetFiles.push({
      path: file.path,
      oldPath: file.oldPath,
      status: file.status,
      blobBefore: blob?.blobBefore ?? null,
      blobAfter: blob?.blobAfter ?? null,
      checklist: selectChecklist(file.path, options.checklists, options.defaultChecklist),
      skipped,
    });
    if (skipped !== null) continue;
    for (const hunk of file.hunks) {
      for (const draft of splitHunk(hunk, options.maxUnitLines)) {
        units.push({
          id: formatUnitId(units.length + 1),
          file: file.path,
          hunkHeader: draft.hunkHeader,
          changedLoc: draft.changedLoc,
          lines: draft.lines,
        });
        changedLoc += draft.changedLoc;
      }
    }
  }
  return { schemaVersion: "fagan-packet/1", changedLoc, files: packetFiles, units };
}

/** Changed LOC of parsed diff files with the same exclusions as the packet (FM-R4.4). */
export function countChangedLoc(files: readonly DiffFile[], exclude: readonly string[]): number {
  let n = 0;
  for (const file of files) {
    if (file.binary || matchesAny(file.path, exclude)) continue;
    for (const hunk of file.hunks) n += hunk.lines.filter(isChanged).length;
  }
  return n;
}

/** Line numbers a unit covers on one side, as an inclusive range, or null if it has none. */
export function unitSideRange(unit: Unit, side: "new" | "old"): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const line of unit.lines) {
    const n = side === "new" ? line.newNo : line.oldNo;
    if (n === null) continue;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return min === Infinity ? null : { min, max };
}
