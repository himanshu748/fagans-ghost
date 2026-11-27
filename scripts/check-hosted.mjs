import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../packages/inspection-room/dist", import.meta.url));
const base = new URL(process.argv[2] ?? "https://himanshu748.github.io/fagans-ghost/");
if (!base.pathname.endsWith("/")) base.pathname += "/";

let files;
try {
  await readFile(join(dist, "index.html"));
  files = (await readdir(dist, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dist, join(entry.parentPath, entry.name)))
    .sort();
} catch (error) {
  throw new Error("Run npm run build before checking the hosted viewer.", { cause: error });
}

const differences = await Promise.all(files.map(async (file) => {
  const path = file === "index.html" ? "" : file.split(sep).map(encodeURIComponent).join("/");
  const url = new URL(path, base);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return `${file}: HTTP ${response.status}`;
    const local = await readFile(join(dist, file));
    const hosted = Buffer.from(await response.arrayBuffer());
    return local.equals(hosted) ? null : `${file}: content differs`;
  } catch (error) {
    return `${file}: ${error.cause?.message ?? error.message}`;
  }
}));

const failures = differences.filter(Boolean);
if (failures.length) {
  console.error(`Hosted Inspection Room at ${base} differs from this build:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Hosted Inspection Room at ${base} matches all ${files.length} files in this build.`);
}
