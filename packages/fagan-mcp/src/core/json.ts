// Deterministic JSON serializer (FM-R12.1, FM-R12.3).
//
// - Keys come out in schema order: the value is parsed with its zod schema, and
//   zod builds the output object by walking the schema shape in order.
// - Arrays of records that carry an `id`, `defectId`, `n` or `seq` field are
//   sorted by that field. Other arrays (lines, files, flags) keep their order,
//   which the producers already make deterministic.
// - 2-space indent and a trailing newline.
import type { z } from "zod";

const SORT_KEYS = ["id", "defectId", "n", "seq"] as const;

const ID_PARTS_RE = /^(.*?)([0-9]+)$/;

/** Orders IDs such as `D999` before `D1000`; other strings by code unit. */
export function compareIds(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  const ma = ID_PARTS_RE.exec(sa);
  const mb = ID_PARTS_RE.exec(sb);
  if (ma && mb && ma[1] === mb[1]) {
    const na = BigInt(ma[2] ?? "0");
    const nb = BigInt(mb[2] ?? "0");
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function sortKeyOf(items: readonly unknown[]): (typeof SORT_KEYS)[number] | null {
  if (items.length === 0) return null;
  for (const key of SORT_KEYS) {
    const all = items.every((item) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
      const v = (item as Record<string, unknown>)[key];
      return typeof v === "string" || typeof v === "number";
    });
    if (all) return key;
  }
  return null;
}

/** Returns a copy with record arrays sorted by ID. Object key order is kept. */
export function sortRecordArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(sortRecordArrays);
    const key = sortKeyOf(mapped);
    if (key === null) return mapped;
    return mapped
      .map((item, index) => ({ item, index }))
      .sort((x, y) => {
        const c = compareIds(
          (x.item as Record<string, string | number>)[key] as string | number,
          (y.item as Record<string, string | number>)[key] as string | number,
        );
        return c !== 0 ? c : x.index - y.index;
      })
      .map((entry) => entry.item);
  }
  if (value !== null && typeof value === "object") {
    // defineProperty, not `out[k] =`, so a `__proto__` key stays an own key.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      Object.defineProperty(out, k, { value: sortRecordArrays(v), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return value;
}

/** Validates `value` with `schema` and returns the canonical file text. Throws the zod error if invalid. */
export function toDeterministicJson<S extends z.ZodType>(schema: S, value: z.input<S>): string {
  const parsed = schema.parse(value);
  return `${JSON.stringify(sortRecordArrays(parsed), null, 2)}\n`;
}

/** Same canonical form on one line, for `events.jsonl`. */
export function toDeterministicJsonLine<S extends z.ZodType>(schema: S, value: z.input<S>): string {
  const parsed = schema.parse(value);
  return `${JSON.stringify(sortRecordArrays(parsed))}\n`;
}
