#!/usr/bin/env node
// Repository invariants required by the contest and local publication checklist.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(
  process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)),
);
const fail = (message) => {
  throw new Error(message);
};
const tracked = new Set(
  execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean),
);
function requireFile(path) {
  if (!lstatSync(resolve(root, path)).isFile())
    fail(`${path} must be a regular file`);
  if (!tracked.has(path)) fail(`${path} must be tracked in Git`);
}
function walk(path) {
  if (!lstatSync(resolve(root, path)).isDirectory())
    fail(`${path} must be a directory, not a symlink`);
  return readdirSync(resolve(root, path)).flatMap((name) => {
    const child = `${path}/${name}`;
    return lstatSync(resolve(root, child)).isDirectory()
      ? walk(child)
      : [child];
  });
}
const requiredDirs = [
  "agents",
  "agent-prompts",
  "hooks",
  "settings",
  "steering",
  "specs",
];
const files = walk(".kiro");
for (const dir of requiredDirs) {
  if (!files.some((file) => file.startsWith(`.kiro/${dir}/`)))
    fail(`.kiro/${dir} must not be empty`);
}
for (const name of ["fagan-mcp", "role-agents", "inspection-room"]) {
  for (const file of ["requirements.md", "design.md", "tasks.md"])
    requireFile(`.kiro/specs/${name}/${file}`);
}
for (const file of files) requireFile(file);
// --no-index detects ignored tracked files too. Probe each required directory,
// because a negated tracked file must not hide a broader .kiro ignore rule.
const probes = [
  ".kiro",
  ".kiro/__ignore_probe__",
  ...requiredDirs.map((dir) => `.kiro/${dir}/__ignore_probe__`),
  ...files,
];
const result = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
  cwd: root,
  input: probes.join("\n") + "\n",
  encoding: "utf8",
});
if (result.status === 0)
  fail(`.kiro content is ignored:\n${result.stdout.trim()}`);
if (result.status !== 1) fail(`Could not check ignore rules: ${result.stderr}`);
requireFile("LICENSE");
const license = readFileSync(resolve(root, "LICENSE"), "utf8");
for (const phrase of [
  "MIT License",
  "Permission is hereby granted, free of charge",
  'THE SOFTWARE IS PROVIDED "AS IS"',
  "IN NO EVENT SHALL THE",
]) {
  if (!license.includes(phrase))
    fail("Root LICENSE must contain the MIT license");
}
for (const path of [
  "package.json",
  "packages/fagan-mcp/package.json",
  "packages/inspection-room/package.json",
]) {
  if (JSON.parse(readFileSync(resolve(root, path), "utf8")).license !== "MIT")
    fail(`${path} must declare MIT`);
}
console.log(
  `Repository checks passed: ${files.length} tracked, nonignored .kiro files; three specs; MIT license.`,
);
