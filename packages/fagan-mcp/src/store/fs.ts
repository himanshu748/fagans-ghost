// Atomic file writes and the `.fagan/.lock` file (FM-R13.1 to FM-R13.3).
import { open, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { FaganError } from "../core/errors.js";

let tmpCounter = 0;

/** Writes to `<target>.<pid>.<n>.tmp` in the same folder, then renames it over the target. */
export async function writeFileAtomic(target: string, content: string): Promise<void> {
  tmpCounter++;
  const tmp = `${target}.${process.pid}.${tmpCounter}.tmp`;
  try {
    await writeFile(tmp, content, { encoding: "utf8", flag: "wx" });
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Lock files whose mtime is older than this are stale (design.md "Store"). */
export const LOCK_STALE_MS = 60_000;

function isErrno(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === code;
}

async function tryCreateLock(lockPath: string): Promise<boolean> {
  try {
    const handle = await open(lockPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`, "utf8");
    } finally {
      await handle.close();
    }
    return true;
  } catch (err) {
    if (isErrno(err, "EEXIST")) return false;
    throw err;
  }
}

/**
 * Runs `fn` while holding the lock file. A held, fresh lock gives `LOCKED`; a
 * stale one is removed once before retrying. The lock is always removed after.
 * Staleness uses the file system's mtime against wall-clock time, not the
 * injected clock, because both sides must come from the same source.
 */
export async function withLock<T>(lockPath: string, fn: () => Promise<T>, staleMs = LOCK_STALE_MS): Promise<T> {
  let acquired = await tryCreateLock(lockPath);
  if (!acquired) {
    let mtimeMs: number | null = null;
    try {
      mtimeMs = (await stat(lockPath)).mtimeMs;
    } catch (err) {
      if (!isErrno(err, "ENOENT")) throw err;
    }
    if (mtimeMs === null || Date.now() - mtimeMs > staleMs) {
      if (mtimeMs !== null) await rm(lockPath, { force: true });
      acquired = await tryCreateLock(lockPath);
    }
  }
  if (!acquired) {
    throw new FaganError("LOCKED", "another fagan process holds .fagan/.lock", { lock: ".fagan/.lock" });
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => undefined);
  }
}
