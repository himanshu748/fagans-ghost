import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const work = await mkdtemp(join(tmpdir(), "fagan-package-test-"));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: "utf8" });
const id = "insp-0001";
const recorded = join(".fagan", "inspections", id);
const originalEvents = await readFile(join(root, recorded, "events.jsonl"));

try {
  const [pack] = JSON.parse(run("npm", [
    "pack", "--workspace", "fagan-mcp", "--ignore-scripts", "--json", "--pack-destination", work,
  ], root));
  const paths = new Set(pack.files.map(({ path }) => path));
  for (const path of ["LICENSE", "README.md", "dist/cli.js", "checklists/general.json"]) {
    assert(paths.has(path), `Package is missing ${path}`);
  }

  run("tar", ["-xzf", join(work, pack.filename), "-C", work], root);
  // Use the dependencies already installed for the workspace build.
  await symlink(join(root, "node_modules"), join(work, "node_modules"), "junction");
  const manifest = JSON.parse(await readFile(join(work, "package", "package.json"), "utf8"));
  assert.equal(manifest.bin.fagan, "dist/cli.js");
  const cli = join(work, "package", manifest.bin.fagan);
  assert.match(run(process.execPath, [cli, "--help"], work), /fagan serve/);

  const target = join(work, "target");
  await mkdir(target);
  run("git", ["init", "-q"], target);
  await cp(join(root, recorded), join(target, recorded), { recursive: true });
  await cp(join(root, ".fagan", "config.json"), join(target, ".fagan", "config.json"));
  const output = run(process.execPath, [cli, "export", id, "--format", "html"], target);
  const report = await readFile(join(target, recorded, "report.html"));
  const digest = createHash("sha256").update(report).digest("hex");

  assert.match(report.toString("utf8"), /\bD001\b/);
  assert.match(output, new RegExp(`sha256 ${digest} ${report.byteLength} bytes`));
  assert.deepEqual(await readFile(join(root, recorded, "events.jsonl")), originalEvents);
  console.log("Packed Fagan CLI help and HTML export passed. Report hash and byte count match.");
} finally {
  await rm(work, { recursive: true, force: true });
}
