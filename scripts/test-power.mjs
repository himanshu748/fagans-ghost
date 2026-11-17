#!/usr/bin/env node
// Disposable integration fixture, never viewer/demo evidence. No Kiro model calls.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseReport } from '../packages/fagan-mcp/dist/core/report.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const setup = join(root, 'power/skills/fagan-setup/scripts/setup.mjs');
const scratch = await mkdtemp(join(tmpdir(), 'fagan-power-test-'));
const observations = [];
const sh = (cwd, command, args) => execFileSync(command, args, { cwd, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
async function repo(name) {
  const dir = join(scratch, name); await mkdir(dir); sh(dir, 'git', ['init', '-b', 'main']);
  return dir;
}
const install = (dir, apply = true, build = JSON.stringify([process.execPath, '--check', 'src/math.mjs'])) => spawnSync(process.execPath, [setup, '--target', dir, '--build', build, '--test', JSON.stringify([process.execPath, '--test', 'math.test.mjs']), ...(apply ? ['--apply'] : [])], { cwd: dir, encoding: 'utf8', timeout: 30_000 });
let client;
try {
  const target = await repo('target');
  await mkdir(join(target, 'src'));
  await mkdir(join(target, '.kiro/settings'), { recursive: true });
  await mkdir(join(target, '.kiro/steering'), { recursive: true });
  await writeFile(join(target, '.kiro/steering/product.md'), 'Existing target product instructions.\n');
  await writeFile(join(target, '.kiro/steering/tech.md'), 'Existing target technical instructions.\n');
  const originalMcp = '{\n "mcpServers": {"existing": {"command": "retained-placeholder"}}, "otherField": 42\n}\n';
  await writeFile(join(target, '.kiro/settings/mcp.json'), originalMcp);
  const preview = install(target, false); assert.equal(preview.status, 0, preview.stderr);
  assert.equal((await readdir(target)).includes('.fagan'), false);
  const applied = install(target); assert.equal(applied.status, 0, applied.stderr);
  const merged = JSON.parse(await readFile(join(target, '.kiro/settings/mcp.json'), 'utf8'));
  assert.deepEqual(merged.mcpServers.existing, { command: 'retained-placeholder' }); assert.equal(merged.otherField, 42);
  assert.equal(await readFile(join(target, '.fagan/mcp.before-setup.json'), 'utf8'), originalMcp);
  assert.equal(await readFile(join(target, '.kiro/steering/product.md'), 'utf8'), 'Existing target product instructions.\n');
  assert.equal(await readFile(join(target, '.kiro/steering/tech.md'), 'utf8'), 'Existing target technical instructions.\n');
  const config = JSON.parse(await readFile(join(target, '.fagan/config.json'), 'utf8'));
  assert.deepEqual(config.build, [process.execPath, '--check', 'src/math.mjs']);
  assert.deepEqual(config.test, [process.execPath, '--test', 'math.test.mjs']);
  const again = install(target); assert.equal(again.status, 1); assert.match(again.stderr, /Conflict/);
  observations.push('Preview wrote nothing; apply installed; existing MCP server and unknown top-level field preserved; exact original backed up; repeat install refused.');
  let validated = 0;
  let validatorAvailable = true;
  for (const name of ['moderator', 'reader', 'inspector-logic', 'inspector-interfaces', 'scribe']) {
    const agentPath = join(target, '.kiro/agents', `${name}.json`);
    const agent = JSON.parse(await readFile(agentPath, 'utf8'));
    for (const resource of agent.resources) {
      assert.ok(resource.startsWith('file://'));
      await access(join(target, resource.slice('file://'.length)));
    }
    if (validatorAvailable) {
      const validation = spawnSync('kiro-cli', ['agent', 'validate', '--path', agentPath], { cwd: target, encoding: 'utf8', timeout: 30_000 });
      if (validation.error?.code === 'ENOENT') validatorAvailable = false;
      else { assert.equal(validation.status, 0, validation.stderr || validation.error?.message); validated++; }
    }
  }
  observations.push(`All installed agent steering resources exist; target product/tech steering preserved; ${validated} role files validated by kiro-cli${validatorAvailable ? '' : ' (validator unavailable)'}.`);
  await writeFile(join(target, 'src/math.mjs'), 'export const identity = x => x;\n');
  await writeFile(join(target, 'math.test.mjs'), "import assert from 'node:assert/strict';\nimport { identity } from './src/math.mjs';\nassert.equal(identity(3), 3);\n");
  sh(target, 'git', ['add', '.']);
  sh(target, 'git', ['-c', 'user.name=Fagan fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Scratch fixture base']);
  await writeFile(join(target, 'src/math.mjs'), 'export const identity = x => x;\nexport const double = x => x * 2;\n');
  await writeFile(join(target, 'math.test.mjs'), "import assert from 'node:assert/strict';\nimport { identity, double } from './src/math.mjs';\nassert.equal(identity(3), 3);\nassert.equal(double(3), 6);\n");
  client = new Client({ name: 'fagan-power-fixture', version: '0.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(target, '.fagan/bin/fagan.mjs'), 'serve'], cwd: target, stderr: 'pipe' });
  let serverErrors = '';
  transport.stderr?.on('data', data => { serverErrors += data.toString(); });
  try { await client.connect(transport); }
  catch (error) { throw new Error(`Installed MCP startup failed: ${serverErrors}`, { cause: error }); }
  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 });
    assert.notEqual(r.isError, true, JSON.stringify(r));
    return JSON.parse(r.content.find(c => c.type === 'text').text);
  };
  assert.equal((await client.listTools()).tools.length, 9);
  const opened = await call('open_inspection', { role: 'moderator', title: 'Scratch packaging fixture, not demo evidence', base: 'HEAD', head: 'WORKTREE', include_untracked: false });
  const id = opened.inspection_id;
  assert.equal(opened.entry.build.passed, true); assert.equal(opened.entry.tests.passed, true);
  const prepared = await call('get_packet', { inspection_id: id, role: 'inspector-logic', phase: 'preparation', limit: 50 });
  await call('get_packet', { inspection_id: id, role: 'inspector-interfaces', phase: 'preparation', limit: 50 });
  const packet = await call('get_packet', { inspection_id: id, role: 'moderator', phase: 'meeting', limit: 50 });
  assert.equal(prepared.next_cursor, null); assert.equal(packet.next_cursor, null);
  for (const unit of packet.units) {
    const paraphrase = unit.file === 'src/math.mjs'
      ? 'The module retains identity and adds double, which multiplies its argument by two.'
      : 'The test imports double alongside identity and asserts that double of three equals six, while retaining the identity assertion.';
    await call('record_reading', { inspection_id: id, role: 'reader', unit_id: unit.unit_id, paraphrase });
  }
  await call('close_meeting', { inspection_id: id, role: 'moderator', notes: 'Automated packaging fixture; no inspector agents ran, and no defects were seeded.' });
  const followup = await call('follow_up', { inspection_id: id, role: 'moderator', run_checks: true }); assert.equal(followup.passed, true);
  await call('export_report', { inspection_id: id, role: 'moderator', formats: ['json', 'txt'] });
  const report = parseReport(await readFile(join(target, '.fagan/inspections', id, 'report.json'), 'utf8'));
  assert.equal(report.inspection.phase, 'Closed'); assert.equal(report.defects.defects.length, 0);
  assert.equal(report.readings.readings.length, report.packet.units.length);
  observations.push(`Relocated bundle listed 9 tools and completed an actual stdio fixture inspection: ${report.packet.units.length} units, ${report.packet.changedLoc} changed lines, ${report.readings.readings.length} recorded fixture paraphrases, 0 defects, Closed, JSON/text export parsed.`);
  await client.close(); client = null;
  assert.equal(sh(target, 'git', ['check-ignore', '--no-index', '.fagan/mcp.before-setup.json']).trim(), '.fagan/mcp.before-setup.json');
  const conflict = await repo('conflict'); await mkdir(join(conflict, '.kiro/agents'), { recursive: true });
  await writeFile(join(conflict, '.kiro/agents/reader.json'), 'KEEP');
  const conflicted = install(conflict); assert.equal(conflicted.status, 1); assert.match(conflicted.stderr, /Conflict/);
  assert.equal(await readFile(join(conflict, '.kiro/agents/reader.json'), 'utf8'), 'KEEP');
  assert.equal((await readdir(conflict)).includes('.fagan'), false);
  const linked = await repo('symlink'); const outside = join(scratch, 'outside'); await mkdir(outside); await symlink(outside, join(linked, '.kiro'));
  const refused = install(linked); assert.equal(refused.status, 1); assert.match(refused.stderr, /symlink/); assert.deepEqual(await readdir(outside), []);
  const linkedBundle = await repo('symlink-bundle'); await mkdir(join(linkedBundle, '.fagan')); await symlink(outside, join(linkedBundle, '.fagan/bin'));
  const bundleRefused = install(linkedBundle); assert.equal(bundleRefused.status, 1); assert.match(bundleRefused.stderr, /symlink/); assert.deepEqual(await readdir(outside), []);
  assert.equal((await readdir(linkedBundle)).includes('.kiro'), false);
  for (const path of ['.fagan-setup.lock', '.kiro/settings/mcp.fagan-setup.tmp', '.kiro/settings/mcp.json']) {
    const conflictedRepo = await repo(`reserved-${path.split('/').at(-1)}`);
    if (path.includes('/')) await mkdir(join(conflictedRepo, '.kiro/settings'), { recursive: true });
    const original = path.endsWith('/mcp.json') ? '{"mcpServers":{"fagan":{"command":"keep"}}}\n' : 'KEEP';
    await writeFile(join(conflictedRepo, path), original);
    const result = install(conflictedRepo); assert.equal(result.status, 1); assert.match(result.stderr, /Conflict/);
    assert.equal(await readFile(join(conflictedRepo, path), 'utf8'), original);
    assert.equal((await readdir(conflictedRepo)).includes('.fagan'), false);
    if (path.startsWith('.kiro/')) assert.deepEqual(await readdir(join(conflictedRepo, '.kiro')), ['settings']);
  }
  const invalidCommands = await repo('invalid-command');
  for (const value of ['[]', '[" "]', '"npm test"', '["npm",0]']) {
    const result = install(invalidCommands, true, value); assert.equal(result.status, 1); assert.match(result.stderr, /--build/);
    assert.deepEqual(await readdir(invalidCommands), ['.git']);
  }
  const clean = await repo('clean'); const cleanResult = install(clean);
  assert.equal(cleanResult.status, 0, cleanResult.stderr);
  assert.equal((await readdir(join(clean, '.fagan'))).includes('mcp.before-setup.json'), false);
  assert.deepEqual(Object.keys(JSON.parse(await readFile(join(clean, '.kiro/settings/mcp.json'), 'utf8')).mcpServers), ['fagan']);
  observations.push('Fresh install works; conflicts in templates, reserved paths and existing fagan server, invalid command arrays, and symlinked .kiro/.fagan/bin rejected before writes; original files and external directory preserved.');
  console.log(JSON.stringify({ status: 'passed', scope: 'Disposable deterministic packaging fixture; no Kiro runtime activation or model calls', observations }, null, 2));
} finally {
  await client?.close();
  // Only this process's newly-created disposable temp tree is removed.
  await rm(scratch, { recursive: true, force: true });
}
