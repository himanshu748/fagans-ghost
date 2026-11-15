// Follow-up verification and the exit rule (FM-R9.3, FM-R9.4).
import { isValidWaiverReason } from "./rework.js";
import type { Attempt, Defect, DefectStatus, Packet, ReworkItem, Severity } from "./schema.js";

export interface VerificationContext {
  /** Build and tests both passed in this attempt. */
  checksPassed: boolean;
  requireLocationChange: boolean;
  waiverMinChars: number;
  /** True when the defect's file now differs from its `blobAfter` in the packet. */
  fileChanged: (path: string) => boolean;
}

/** Status of one defect in this attempt, from its latest rework item. */
export function evaluateDefect(defect: Defect, item: ReworkItem | undefined, ctx: VerificationContext): DefectStatus {
  if (item === undefined) return "open";
  if (item.resolution === "waived") {
    return isValidWaiverReason(item.reason, ctx.waiverMinChars) ? "waived" : "open";
  }
  const locationOk = !ctx.requireLocationChange || ctx.fileChanged(defect.location.file);
  return ctx.checksPassed && locationOk ? "verified" : "fixed_unverified";
}

/** Passes iff every major is `verified` or `waived`. Minors never block (FM-R9.4). */
export function exitPasses(statuses: ReadonlyArray<{ severity: Severity; status: DefectStatus }>): boolean {
  return statuses.every((s) => s.severity !== "major" || s.status === "verified" || s.status === "waived");
}

/** IDs of majors that block the exit, in defect order. */
export function blockingIds(
  statuses: ReadonlyArray<{ defectId: string; severity: Severity; status: DefectStatus }>,
): string[] {
  return statuses
    .filter((s) => s.severity === "major" && s.status !== "verified" && s.status !== "waived")
    .map((s) => s.defectId);
}

/** Compares a current blob hash with the packet's `blobAfter` for the same path. */
export function fileChangedFn(packet: Packet, currentBlobs: ReadonlyMap<string, string | null>): (path: string) => boolean {
  return (path) => {
    const file = packet.files.find((f) => f.path === path);
    if (file === undefined || !currentBlobs.has(path)) return false;
    return currentBlobs.get(path) !== file.blobAfter;
  };
}

/**
 * Status of a defect now, between follow-up attempts (used by `record_rework`
 * and the commit gate). A defect is verified only if the latest attempt
 * verified it and no rework item for it was recorded after that attempt.
 */
export function currentStatus(
  defect: Defect,
  rework: readonly ReworkItem[],
  attempts: readonly Attempt[],
  waiverMinChars: number,
): DefectStatus {
  const item = rework.find((r) => r.defectId === defect.id);
  if (item === undefined) return "open";
  if (item.resolution === "waived") return isValidWaiverReason(item.reason, waiverMinChars) ? "waived" : "open";
  const last = attempts[attempts.length - 1];
  const lastStatus = last?.defects.find((d) => d.defectId === defect.id)?.status;
  if (last !== undefined && lastStatus === "verified" && item.recordedAt <= last.at) return "verified";
  return "fixed_unverified";
}

/** Majors that are neither verified nor validly waived (the glossary's "open major"). */
export function openMajorIds(
  defects: readonly Defect[],
  rework: readonly ReworkItem[],
  attempts: readonly Attempt[],
  waiverMinChars: number,
): string[] {
  return defects
    .filter((d) => d.severity === "major")
    .filter((d) => {
      const s = currentStatus(d, rework, attempts, waiverMinChars);
      return s !== "verified" && s !== "waived";
    })
    .map((d) => d.id);
}
