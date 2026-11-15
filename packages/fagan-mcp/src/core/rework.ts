// Rework batch rules (FM-R8.3 to FM-R8.5).
import { FaganError } from "./errors.js";
import type { Defect, ReworkItem } from "./schema.js";

export interface ReworkInput {
  defectId: string;
  resolution: "fixed" | "waived";
  note: string | null;
  reason: string | null;
}

/** A waiver reason is valid when its trimmed length, in code points, is at least `minChars`. */
export function isValidWaiverReason(reason: string | null, minChars: number): boolean {
  if (reason === null) return false;
  return [...reason.trim()].length >= minChars;
}

/** Throws on the first rule a batch breaks; returns nothing when the whole batch is valid. */
export function validateReworkBatch(items: readonly ReworkInput[], defects: readonly Defect[], waiverMinChars: number): void {
  if (items.length === 0) {
    throw new FaganError("VALIDATION_ERROR", "items must have at least one entry", {
      issues: [{ path: "items", message: "empty" }],
    });
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.defectId)) {
      throw new FaganError("DUPLICATE_DEFECT_IN_BATCH", `defect ${item.defectId} appears twice in one batch`, {
        defect_id: item.defectId,
      });
    }
    seen.add(item.defectId);
  }
  for (const item of items) {
    if (!defects.some((d) => d.id === item.defectId)) {
      throw new FaganError("UNKNOWN_DEFECT", `defect ${item.defectId} does not exist`, { defect_id: item.defectId });
    }
  }
  for (const item of items) {
    if (item.resolution === "waived" && !isValidWaiverReason(item.reason, waiverMinChars)) {
      throw new FaganError(
        "WAIVER_REASON_REQUIRED",
        `waiving ${item.defectId} needs a reason of at least ${waiverMinChars} characters`,
        { defect_id: item.defectId, min_chars: waiverMinChars },
      );
    }
    if (item.resolution === "fixed" && (item.note === null || item.note.trim().length === 0)) {
      throw new FaganError("VALIDATION_ERROR", `fixed item ${item.defectId} needs a note`, {
        issues: [{ path: "note", message: "required for fixed" }],
      });
    }
  }
}

/** Later items replace earlier ones for the same defect (FM-R8.5). */
export function mergeReworkItems(existing: readonly ReworkItem[], added: readonly ReworkItem[]): ReworkItem[] {
  const byId = new Map<string, ReworkItem>();
  for (const item of existing) byId.set(item.defectId, item);
  for (const item of added) byId.set(item.defectId, item);
  return [...byId.values()];
}
