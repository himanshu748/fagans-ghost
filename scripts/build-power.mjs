#!/usr/bin/env node
// Build a portable local power, without publishing or changing Kiro settings.
import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const power = join(root, 'power');
const templates = join(power, 'skills/fagan-setup/references/templates');
await mkdir(join(power, 'dist'), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['packages/fagan-mcp/src/cli.ts'],
  outfile: 'power/dist/fagan.mjs', bundle: true, platform: 'node', format: 'esm',
  target: 'node22', legalComments: 'linked', sourcemap: false,
  banner: { js: 'import { createRequire as __faganCreateRequire } from "node:module"; const require = __faganCreateRequire(import.meta.url);' },
  plugins: [{ name: 'portable-checklist-directory', setup(b) {
    b.onLoad({ filter: /[\\/]store[\\/]checklists\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const original = 'new URL("../../checklists/", import.meta.url)';
      if (!source.includes(original)) throw new Error('Checklist loader changed; review bundle relocation before building.');
      return { contents: source.replace(original, 'new URL("./checklists/", import.meta.url)'), loader: 'ts', resolveDir: dirname(path) };
    });
    b.onLoad({ filter: /[\\/]service[\\/]service\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const original = 'readFileSync(new URL("../../package.json", import.meta.url), "utf8")';
      if (!source.includes(original)) throw new Error('Package version loader changed; review bundle relocation before building.');
      const manifest = await readFile(join(root, 'packages/fagan-mcp/package.json'), 'utf8');
      return { contents: source.replace(original, JSON.stringify(manifest)), loader: 'ts', resolveDir: dirname(path) };
    });
  } }],
});
await cp(join(root, 'packages/fagan-mcp/checklists'), join(power, 'dist/checklists'), { recursive: true });
await cp(join(root, 'packages/fagan-mcp/checklists'), join(power, 'skills/fagan-inspection/references/checklists'), { recursive: true });
for (const folder of ['agents', 'agent-prompts', 'hooks']) {
  await cp(join(root, '.kiro', folder), join(templates, '.kiro', folder), { recursive: true });
}
// Do not assume another repository uses this monorepo's product or tech steering.
for (const name of await readdir(join(templates, '.kiro/agents'))) {
  const path = join(templates, '.kiro/agents', name);
  const agent = JSON.parse(await readFile(path, 'utf8'));
  agent.resources = agent.resources.map(resource => resource
    .replace('.kiro/steering/product.md', '.kiro/steering/fagan-product.md')
    .replace('.kiro/steering/tech.md', '.kiro/steering/fagan-tech.md'));
  await writeFile(path, `${JSON.stringify(agent, null, 2)}\n`);
}
await cp(join(power, 'skills/fagan-setup/references/steering'), join(templates, '.kiro/steering'), { recursive: true });
const suggestionPath = join(templates, '.kiro/hooks/suggest-inspection.json');
const suggestion = JSON.parse(await readFile(suggestionPath, 'utf8'));
suggestion.hooks[0].confirm.question = suggestion.hooks[0].confirm.question
  .replace('Run npm run build and node', 'Check the installed .fagan/bin/fagan.mjs bundle, then run node');
await writeFile(suggestionPath, `${JSON.stringify(suggestion, null, 2)}\n`);
let ritual = await readFile(join(root, '.kiro/steering/inspection-ritual.md'), 'utf8');
ritual = ritual.replace('The role agents are specified in `.kiro/specs/role-agents/`.', 'The role prompts are in `.kiro/agent-prompts/` and permissions in `.kiro/agents/`.')
  .replace('Run `npm run build` so `packages/fagan-mcp/dist/cli.js` exists; the `fagan` MCP server and the hooks run from it.', 'Run the fagan-setup installer so `.fagan/bin/fagan.mjs` exists; the MCP server and hooks run from that portable bundle.')
  .replace(' after building.', ' after setup.');
await writeFile(join(templates, '.kiro/steering/inspection-ritual.md'), ritual);
await mkdir(join(templates, 'scripts'), { recursive: true });
let launcher = await readFile(join(root, 'scripts/fagan-hook.mjs'), 'utf8');
launcher = launcher.replaceAll('../packages/fagan-mcp/dist/cli.js', '../.fagan/bin/fagan.mjs')
  .replaceAll('packages/fagan-mcp/dist/cli.js', '.fagan/bin/fagan.mjs')
  .replaceAll('Run "npm run build" in the repo root to enable the Fagan', 'Run the fagan-setup installer to restore the Fagan');
await writeFile(join(templates, 'scripts/fagan-hook.mjs'), launcher);
await mkdir(join(templates, '.fagan'), { recursive: true });
await cp(join(root, '.fagan/config.json'), join(templates, '.fagan/config.json'));
await writeFile(join(templates, '.fagan/.gitignore'), '# The original MCP configuration may contain credentials. Keep its backup local.\n/mcp.before-setup.json\n');
await cp(join(root, 'LICENSE'), join(power, 'LICENSE'));
// License texts of bundled npm packages, read locally from their manifests.
const meta = await build({ absWorkingDir: root, entryPoints: ['packages/fagan-mcp/src/cli.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, metafile: true, logLevel: 'silent' });
const names = new Set(Object.keys(meta.metafile.inputs).flatMap(p => {
  const m = p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//); return m ? [m[1]] : [];
}));
let notices = 'Third-party packages included in the local Fagan bundle.\n\n';
for (const name of [...names].sort()) {
  const dir = join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  const files = (await readdir(dir)).filter(n => /^(license|licence|copying)(\.|$)/i.test(n));
  notices += `=== ${name} ${pkg.version} (${pkg.license ?? 'see license'}) ===\n`;
  for (const file of files) notices += `${await readFile(join(dir, file), 'utf8')}\n`;
  if (!files.length) throw new Error(`Missing license text for bundled dependency ${name}`);
}
await writeFile(join(power, 'THIRD_PARTY_NOTICES.txt'), notices);
console.log('Built power/dist/fagan.mjs, checklist assets, installation templates and notices.');
