// Judgment-word flagging for Reader paraphrases (FM-R5.4, FM-R5.5).

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Configured judgment words found in `text` as whole words, case-insensitive,
 * unique, in config order. A word boundary is any character that is not a
 * letter, digit or underscore, so "should" does not match inside "shouldn't".
 */
export function judgmentFlags(text: string, words: readonly string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}(?![\\p{L}\\p{N}_])`, "iu");
    if (re.test(text)) {
      found.push(word);
      seen.add(key);
    }
  }
  return found;
}

/** Next ID such as `R001`, `D001`: one more than the highest numeric suffix in use. */
export function nextId(prefix: string, existing: readonly string[]): string {
  let max = 0;
  for (const id of existing) {
    const n = Number(id.slice(prefix.length));
    if (Number.isSafeInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
