// Atomic file writes and the `.fagan/.lock` file (FM-R13.1 to FM-R13.3).
import { open, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
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
/** How long a caller waits for a lock held by another process before `LOCKED` (FM-R13.2). */
export const LOCK_RETRY_MS = 2_000;
/** Pause between attempts to create the lock file while waiting. */
export const LOCK_POLL_MS = 25;

export interface LockOptions {
  staleMs?: number;
  retryMs?: number;
  pollMs?: number;
}

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

/** Creates the lock file, taking over a stale one once. False when a fresh lock is held. */
async function tryAcquire(lockPath: string, staleMs: number): Promise<boolean> {
  if (await tryCreateLock(lockPath)) return true;
  let mtimeMs: number | null = null;
  try {
    mtimeMs = (await stat(lockPath)).mtimeMs;
  } catch (err) {
    if (!isErrno(err, "ENOENT")) throw err;
  }
  if (mtimeMs !== null && Date.now() - mtimeMs <= staleMs) return false;
  if (mtimeMs !== null) await rm(lockPath, { force: true });
  return tryCreateLock(lockPath);
}

/**
 * Callers in this process queue per lock path, so concurrent tool calls in one
 * `fagan serve` never race each other for the lock file (review v1 issue 2).
 */
const queues = new Map<string, Promise<void>>();

async function inProcessTurn(key: string): Promise<() => void> {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => mine);
  queues.set(key, tail);
  await previous;
  return () => {
    release();
    if (queues.get(key) === tail) queues.delete(key);
  };
}

/**
 * Runs `fn` while holding the lock file. Calls from the same process wait their
 * turn in a queue. A lock held by another process is retried every `pollMs`
 * for up to `retryMs`, then gives `LOCKED`; a stale one is taken over. The
 * lock is always removed after. Staleness uses the file system's mtime against
 * wall-clock time, not the injected clock, because both sides must come from
 * the same source.
 */
export async function withLock<T>(lockPath: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const staleMs = options.staleMs ?? LOCK_STALE_MS;
  const retryMs = options.retryMs ?? LOCK_RETRY_MS;
  const pollMs = options.pollMs ?? LOCK_POLL_MS;
  const done = await inProcessTurn(resolve(lockPath));
  try {
    const deadline = Date.now() + retryMs;
    let acquired = await tryAcquire(lockPath, staleMs);
    while (!acquired && Date.now() < deadline) {
      await sleep(pollMs);
      acquired = await tryAcquire(lockPath, staleMs);
    }
    if (!acquired) {
      throw new FaganError("LOCKED", "another fagan process holds .fagan/.lock", { lock: ".fagan/.lock" });
    }
    try {
      return await fn();
    } finally {
      await unlink(lockPath).catch(() => undefined);
    }
  } finally {
    done();
  }
}
