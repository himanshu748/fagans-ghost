// Loads the bundled checklists from packages/fagan-mcp/checklists/ (PLAN.md section 8).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FaganError, issuesToDetails } from "../core/errors.js";
import { ChecklistSchema, type Checklist, type Config } from "../core/schema.js";

/** `src/store` and `dist/store` both sit two levels below the package root. */
export const BUNDLED_CHECKLISTS_DIR = fileURLToPath(new URL("../../checklists/", import.meta.url));

export async function loadChecklists(dir: string = BUNDLED_CHECKLISTS_DIR): Promise<Map<string, Checklist>> {
  const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  const out = new Map<string, Checklist>();
  for (const name of names) {
    const raw: unknown = JSON.parse(await readFile(join(dir, name), "utf8"));
    const parsed = ChecklistSchema.safeParse(raw);
    if (!parsed.success) {
      throw new FaganError("CONFIG_INVALID", `checklist ${name} is invalid`, {
        file: name,
        issues: issuesToDetails(parsed.error.issues),
      });
    }
    if (`${parsed.data.id}.json` !== name) {
      throw new FaganError("CONFIG_INVALID", `checklist ${name} has id ${parsed.data.id}`, { file: name, issues: [] });
    }
    out.set(parsed.data.id, parsed.data);
  }
  return out;
}

/** `CONFIG_INVALID` if the config names a checklist that does not exist. */
export function assertConfigChecklists(config: Config, checklists: ReadonlyMap<string, Checklist>): void {
  const named = [config.defaultChecklist, ...config.checklists.map((c) => c.checklist)];
  const missing = [...new Set(named.filter((id) => !checklists.has(id)))];
  if (missing.length > 0) {
    throw new FaganError("CONFIG_INVALID", `config names unknown checklists: ${missing.join(", ")}`, {
      issues: missing.map((id) => ({ path: "checklists", message: `unknown checklist ${id}` })),
    });
  }
}
