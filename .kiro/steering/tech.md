---
inclusion: always
---

# Tech

## Layout

- npm workspaces monorepo. Root `package.json` has `"workspaces": ["packages/*"]`.
- `packages/fagan-mcp`: stdio MCP server plus the `fagan` CLI used by hooks.
- `packages/inspection-room`: Vite plus TypeScript static viewer (step 4).
- `power/`: the Kiro power bundle (step 5).
- `.kiro/` holds specs, steering, agents, hooks and settings. It is committed and must never appear in any `.gitignore`.
- `.agents/` is orchestration scratch state. It is gitignored and never committed.

## Language and tooling

- TypeScript strict everywhere, from `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module` and `moduleResolution` `NodeNext`.
- TypeScript 7 (native `tsc`). It has no programmatic compiler API, so do not add tools that import `typescript` as a library.
- ES modules only (`"type": "module"`); relative imports end in `.js`.
- Vitest for unit tests, fast-check for property tests in `*.property.test.ts`. Every property test name includes its EARS requirement ID, for example `FM-R9.2`.
- Every `package.json` says `"license": "MIT"`.

## Commands

- `npm install` (first time) or `npm ci`.
- `npm run build`: builds every workspace.
- `npm test`: typecheck, then `vitest run` in every workspace.
- Node 22 or newer.

## Determinism

- `fagan-mcp`, the `fagan` CLI and the viewer never call a language model or any network API. The only LLM is whatever Kiro is running, inside the role agents.
- Given the same repo state, config, clock readings and inputs, the server writes byte-identical files. Inject the `Clock`; never call `Date.now()` in core code.
- Spawn processes with argument arrays only (`execFile` or `spawn` without `shell: true`). Never build a shell string.
