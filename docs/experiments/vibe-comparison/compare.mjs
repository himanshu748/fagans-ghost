// A small observed contrast, not an independent quality or performance benchmark.
import { sketch } from './sketch.mjs';
import { isGitCommitCommand } from '../../../packages/fagan-mcp/dist/core/gate.js';
const cases = [
  ['ordinary commit', 'git commit -m x', true],
  ['Git config option', 'git -c core.pager=cat commit -m x', true],
  ['separated directory option', 'git -C "folder with spaces" commit -m x', true],
  ['quoted executable letters', "g'i't commit -m x", true],
  ['escaped subcommand letters', String.raw`git c\ommit -m x`, true],
  ['echoed words', 'echo git commit', false],
  ['status only', 'git status --short', false],
];
const rows = cases.map(([name, command, expected]) => ({name, command, expected, sketch:sketch(command), specified:isGitCommitCommand(command)}));
console.log(JSON.stringify({provider:'Codex',scope:'Disposable post-implementation one-pass sketch versus existing spec implementation; hand-selected cases, no timing claim',rows},null,2));
