// Error codes and the FaganError type (design.md "Error codes").

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "NOT_A_GIT_REPO",
  "CONFIG_INVALID",
  "INSPECTION_NOT_FOUND",
  "WRONG_PHASE",
  "ROLE_NOT_ALLOWED",
  "STORE_CORRUPT",
  "LOCKED",
  "INVALID_RANGE",
  "EMPTY_DIFF",
  "SIZE_LIMIT_EXCEEDED",
  "ENTRY_CRITERIA_FAILED",
  "COMMAND_TIMEOUT",
  "UNKNOWN_UNIT",
  "INVALID_CURSOR",
  "DUPLICATE_READING",
  "LOCATION_OUTSIDE_PACKET",
  "UNKNOWN_CHECKLIST_ITEM",
  "UNREAD_UNITS",
  "UNKNOWN_DEFECT",
  "WAIVER_REASON_REQUIRED",
  "DUPLICATE_DEFECT_IN_BATCH",
  "ALREADY_CLOSED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorDetails = Record<string, unknown>;

export class FaganError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = "FaganError";
    this.code = code;
    this.details = details;
  }

  toJSON(): { code: ErrorCode; message: string; details: ErrorDetails } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function isFaganError(value: unknown): value is FaganError {
  return value instanceof FaganError;
}

/** Turns zod issues into `details.issues` entries: dotted paths plus messages. */
export function issuesToDetails(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Array<{ path: string; message: string }> {
  return issues.map((issue) => ({
    path: issue.path.map((part) => String(part)).join("."),
    message: issue.message,
  }));
}
