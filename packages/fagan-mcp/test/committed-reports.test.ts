import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseReport } from "../src/core/report.js";
const root = fileURLToPath(
  new URL("../../../.fagan/inspections/", import.meta.url),
);
const reports = existsSync(root)
  ? readdirSync(root).filter((id) => existsSync(join(root, id, "report.json")))
  : [];
describe("genuine repository inspection exports", () => {
  it("contains an actual report for the demo", () =>
    expect(reports.length).toBeGreaterThan(0));
  for (const id of reports)
    it(`parses ${id} without changing its data`, () => {
      const text = readFileSync(join(root, id, "report.json"), "utf8");
      const parsed = parseReport(text);
      expect(parsed).toEqual(JSON.parse(text));
      expect(parsed.schemaVersion).toBe("fagan-report/1");
    });
});
