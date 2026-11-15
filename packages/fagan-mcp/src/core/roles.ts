// Allowed roles per tool (FM-R14.4, design.md "Phase rules").
import { FaganError } from "./errors.js";
import { ROLES, type Role } from "./schema.js";

export type ToolName =
  | "open_inspection"
  | "get_packet"
  | "get_packet:meeting"
  | "record_reading"
  | "log_defect"
  | "close_meeting"
  | "record_rework"
  | "follow_up"
  | "metrics"
  | "export_report";

export const ALLOWED_ROLES: Readonly<Record<ToolName, readonly Role[]>> = {
  open_inspection: ["moderator"],
  get_packet: ROLES,
  "get_packet:meeting": ["moderator"],
  record_reading: ["reader"],
  log_defect: ["scribe"],
  close_meeting: ["moderator"],
  record_rework: ["author"],
  follow_up: ["moderator", "author"],
  metrics: ROLES,
  export_report: ["moderator", "author"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Throws `ROLE_NOT_ALLOWED` for unknown roles and roles the tool does not accept. */
export function assertRole(tool: ToolName, role: unknown): asserts role is Role {
  const allowed = ALLOWED_ROLES[tool];
  if (!isRole(role) || !allowed.includes(role)) {
    throw new FaganError("ROLE_NOT_ALLOWED", `role ${String(role)} may not call ${tool}`, {
      role: typeof role === "string" ? role : null,
      allowed: [...allowed],
    });
  }
}
