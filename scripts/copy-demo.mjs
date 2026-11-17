import { readFile, mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseReport } from "../packages/fagan-mcp/dist/core/report.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const id = process.argv[2] ?? "insp-0001";
if (!/^insp-\d{4}$/.test(id))
  throw new Error("Expected inspection ID insp-NNNN");
const source = join(root, ".fagan/inspections", id);
parseReport(await readFile(join(source, "report.json"), "utf8"));
const target = join(root, "packages/inspection-room/public/demo");
await mkdir(target, { recursive: true });
for (const name of ["report.json", "report.txt"])
  await copyFile(join(source, name), join(target, name));
console.log(`Copied actual ${id} export without modification.`);
