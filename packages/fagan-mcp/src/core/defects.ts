// Defect location and checklist checks (FM-R6.3 to FM-R6.5).
import { FaganError } from "./errors.js";
import { unitSideRange } from "./packet.js";
import type { Checklist, Defect, Packet, Unit } from "./schema.js";

export interface DefectLocationInput {
  unitId: string;
  file: string;
  side: "new" | "old";
  lineStart: number;
  lineEnd: number;
}

/** Returns the unit, or throws `VALIDATION_ERROR`, `UNKNOWN_UNIT` or `LOCATION_OUTSIDE_PACKET`. */
export function checkDefectLocation(packet: Packet, input: DefectLocationInput): Unit {
  if (
    !Number.isInteger(input.lineStart) ||
    !Number.isInteger(input.lineEnd) ||
    input.lineStart < 1 ||
    input.lineEnd < 1 ||
    input.lineEnd < input.lineStart
  ) {
    throw new FaganError("VALIDATION_ERROR", "line_start and line_end must be integers >= 1 with line_end >= line_start", {
      issues: [{ path: "line_end", message: "invalid line range" }],
    });
  }
  const unit = packet.units.find((u) => u.id === input.unitId);
  if (unit === undefined) {
    throw new FaganError("UNKNOWN_UNIT", `unit ${input.unitId} is not in the packet`, { unit_id: input.unitId });
  }
  if (unit.file !== input.file) {
    throw new FaganError("LOCATION_OUTSIDE_PACKET", `unit ${unit.id} is in ${unit.file}, not ${input.file}`, {
      unit_id: unit.id,
      unit_file: unit.file,
    });
  }
  const range = unitSideRange(unit, input.side);
  if (range === null || input.lineStart < range.min || input.lineEnd > range.max) {
    throw new FaganError(
      "LOCATION_OUTSIDE_PACKET",
      `lines ${input.lineStart}-${input.lineEnd} (${input.side}) are outside unit ${unit.id}`,
      { unit_id: unit.id, side: input.side, unit_lines: range },
    );
  }
  return unit;
}

/** Throws `UNKNOWN_CHECKLIST_ITEM` if the item is not in the checklist of the unit's file. */
export function checkChecklistItem(
  packet: Packet,
  unit: Unit,
  itemId: string | null,
  checklists: ReadonlyMap<string, Checklist>,
): void {
  if (itemId === null) return;
  const checklistId = packet.files.find((f) => f.path === unit.file)?.checklist;
  const checklist = checklistId === undefined ? undefined : checklists.get(checklistId);
  if (checklist === undefined || !checklist.items.some((item) => item.id === itemId)) {
    throw new FaganError("UNKNOWN_CHECKLIST_ITEM", `checklist item ${itemId} is not in checklist ${String(checklistId)}`, {
      checklist_item_id: itemId,
      checklist: checklistId ?? null,
    });
  }
}

export function severityCounts(defects: readonly Defect[]): { major: number; minor: number } {
  let major = 0;
  let minor = 0;
  for (const d of defects) {
    if (d.severity === "major") major++;
    else minor++;
  }
  return { major, minor };
}
