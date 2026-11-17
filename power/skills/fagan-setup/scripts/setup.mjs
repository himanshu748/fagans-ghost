#!/usr/bin/env node
// Target-local setup. No network, model, global Kiro state or shell strings.
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const power = fileURLToPath(new URL('../../../', import.meta.url));
const templates = fileURLToPath(new URL('../references/templates/', import.meta.url));
const json = x => `${JSON.stringify(x, null, 2)}\n`;
const object = x => typeof x === 'object' && x !== null && !Array.isArray(x);
async function stat(path) { try { return await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }

function command(value, name) {
  let v;
  try { v = JSON.parse(value); } catch { throw new Error(`${name} must be a JSON argument array`); }
  if (!Array.isArray(v) || !v.length || v.some(x => typeof x !== 'string' || x.includes('\0')) || !v[0].trim()) throw new Error(`${name} must be a nonempty array of string arguments`);
  return v;
}
async function files(dir, prefix = '') {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name); const s = await lstat(path); const rel = join(prefix, name);
    if (s.isSymbolicLink()) throw new Error(`Package contains a symlink: ${path}`);
    if (s.isDirectory()) out.push(...await files(path, rel));
    else if (s.isFile()) out.push({ source: path, path: rel });
    else throw new Error(`Package contains a non-regular file: ${path}`);
  }
  return out;
}
async function safeDestination(root, rel) {
  const path = resolve(root, rel);
  const back = relative(root, path);
  if (!back || back === '..' || back.startsWith(`..${sep}`) || isAbsolute(back)) throw new Error(`Destination escapes target: ${rel}`);
  let cursor = root;
  for (const part of back.split(sep)) {
    cursor = join(cursor, part); const s = await stat(cursor);
    if (s?.isSymbolicLink()) throw new Error(`Refusing symlink destination: ${cursor}`);
    if (cursor !== path && s && !s.isDirectory()) throw new Error(`Parent is not a directory: ${cursor}`);
  }
  return path;
}

async function main() {
  const { values } = parseArgs({ options: { target: { type: 'string' }, build: { type: 'string' }, test: { type: 'string' }, apply: { type: 'boolean', default: false } }, strict: true });
  if (!values.target || !values.build || !values.test) throw new Error('Usage: setup.mjs --target /repo --build \'["npm","run","build"]\' --test \'["npm","test"]\' [--apply]');
  const root = await realpath(resolve(values.target));
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', timeout: 10_000 }).trim();
  if (await realpath(gitRoot) !== root) throw new Error('--target must be the Git repository root');
  const entries = await files(templates);
  const bundle = join(power, 'dist/fagan.mjs');
  if (!(await stat(bundle))?.isFile()) throw new Error('Power is not built. In its source repo run npm run build and node scripts/build-power.mjs.');
  entries.push({ source: bundle, path: '.fagan/bin/fagan.mjs' });
  for (const file of await files(join(power, 'dist/checklists'))) entries.push({ ...file, path: join('.fagan/bin/checklists', file.path) });
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) entries.push({ source: join(power, name), path: join('.fagan/bin', name) });
  const linkedNotice = `${bundle}.LEGAL.txt`;
  if ((await stat(linkedNotice))?.isFile()) entries.push({ source: linkedNotice, path: '.fagan/bin/fagan.mjs.LEGAL.txt' });
  const config = JSON.parse(await readFile(join(templates, '.fagan/config.json'), 'utf8'));
  config.build = command(values.build, '--build'); config.test = command(values.test, '--test');
  config.exclude = [...new Set([...config.exclude, '.fagan/bin/**'])];
  const configEntry = entries.find(e => e.path === '.fagan/config.json');
  if (!configEntry) throw new Error('Missing packaged config template');
  configEntry.content = json(config);
  const mcpPath = await safeDestination(root, '.kiro/settings/mcp.json');
  const mcpStat = await stat(mcpPath);
  if (mcpStat && !mcpStat.isFile()) throw new Error('Existing mcp.json is not a regular file');
  const oldMcp = mcpStat ? await readFile(mcpPath, 'utf8') : null;
  const mcp = oldMcp === null ? { mcpServers: {} } : JSON.parse(oldMcp);
  if (!object(mcp) || (mcp.mcpServers !== undefined && !object(mcp.mcpServers))) throw new Error('Existing mcp.json has an invalid mcpServers object');
  if (Object.hasOwn(mcp.mcpServers ?? {}, 'fagan')) throw new Error('Conflict: existing MCP server named fagan');
  const merged = { ...mcp, mcpServers: { ...mcp.mcpServers, fagan: { command: 'node', args: ['.fagan/bin/fagan.mjs', 'serve'], env: {}, disabled: false } } };
  if (oldMcp !== null) entries.push({ path: '.fagan/mcp.before-setup.json', content: oldMcp });
  // Preflight all destinations before creating even one directory or file.
  for (const entry of entries) {
    if (entry.source && !(await stat(entry.source))?.isFile()) throw new Error(`Package source is not a regular file: ${entry.source}`);
    entry.destination = await safeDestination(root, entry.path);
    if (await stat(entry.destination)) throw new Error(`Conflict: ${entry.path}; nothing installed`);
  }
  const lock = await safeDestination(root, '.fagan-setup.lock');
  const tempMcp = await safeDestination(root, '.kiro/settings/mcp.fagan-setup.tmp');
  for (const path of [lock, tempMcp]) {
    if (await stat(path)) throw new Error(`Conflict: ${relative(root, path)}; nothing installed`);
  }
  const output = { target: root, mode: values.apply ? 'apply' : 'preview', create: entries.map(e => e.path), mcp: oldMcp === null ? 'create workspace fagan server' : 'merge workspace fagan server and preserve exact original backup', build: config.build, test: config.test };
  if (!values.apply) { console.log(json(output)); return; }
  const lockHandle = await open(lock, 'wx');
  const created = [];
  let madeTemp = false;
  try {
    for (const entry of entries) {
      await safeDestination(root, entry.path);
      await mkdir(dirname(entry.destination), { recursive: true });
      if (entry.content !== undefined) {
        const handle = await open(entry.destination, 'wx', entry.path === '.fagan/mcp.before-setup.json' ? 0o600 : 0o666);
        created.push(entry.destination);
        try { await handle.writeFile(entry.content); } finally { await handle.close(); }
      } else {
        await copyFile(entry.source, entry.destination, constants.COPYFILE_EXCL);
        created.push(entry.destination);
      }
    }
    await safeDestination(root, '.kiro/settings/mcp.json');
    await mkdir(dirname(mcpPath), { recursive: true });
    if (oldMcp === null) {
      const handle = await open(mcpPath, 'wx'); created.push(mcpPath);
      try { await handle.writeFile(json(merged)); } finally { await handle.close(); }
    } else {
      if (await readFile(mcpPath, 'utf8') !== oldMcp) throw new Error('mcp.json changed during installation; retry after reviewing it');
      const handle = await open(tempMcp, 'wx'); madeTemp = true;
      try { await handle.writeFile(json(merged)); } finally { await handle.close(); }
      await safeDestination(root, '.kiro/settings/mcp.json');
      await rename(tempMcp, mcpPath); madeTemp = false;
    }
    console.log(json({ ...output, installed: true }));
  } catch (error) {
    // Only remove files this attempt created; never remove the target directory.
    for (const path of created.reverse()) await unlink(path).catch(() => {});
    throw error;
  } finally {
    if (madeTemp) await unlink(tempMcp).catch(() => {});
    await lockHandle.close(); await unlink(lock);
  }
}
main().catch(error => { console.error(`Fagan setup: ${error.message}`); process.exitCode = 1; });
