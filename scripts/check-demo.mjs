import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseReport } from "../packages/fagan-mcp/dist/core/report.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const demo = join(root, "packages/inspection-room/public/demo");
const report = parseReport(await readFile(join(demo, "report.json"), "utf8"));
const id = report.inspection.id;
if (!(await readdir(join(root, ".fagan/inspections"))).includes(id))
  throw new Error("Demo source inspection missing");
for (const name of ["report.json", "report.txt"]) {
  const path = `.fagan/inspections/${id}/${name}`;
  // Index check permits a pre-commit check after staging; CI verifies committed files.
  execFileSync("git", ["ls-files", "--error-unmatch", path], {
    cwd: root,
    stdio: "pipe",
  });
  const source = await readFile(join(root, path));
  if (hash(source) !== hash(await readFile(join(demo, name))))
    throw new Error(`Demo ${name} differs from real inspection export`);
}
console.log(`Demo matches tracked ${id} JSON and text exports.`);
