// fast-check generators for shell commands, shared by the commit-gate
// property (gate.property.test.ts, FM-R16.1, FM-R16.2) and the hook launcher
// fallback property (hook-launcher.property.test.ts, RA-R7.5).
import fc from "fast-check";

// Words are rendered so that a POSIX shell would read them back as one word.
export const bareWord = fc.stringMatching(/^[A-Za-z0-9._\/:@%+,-]{1,8}$/).filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
const anyText = fc.string({ maxLength: 20 });
const singleQuoted = anyText.map((s) => `'${s.replace(/'/g, "")}'`);
const doubleQuoted = anyText.map((s) => `"${s.replace(/["\\$`]/g, (c) => `\\${c}`)}"`);
/** Arguments, including ones that mention git and commit inside quotes. */
export const argArb = fc.oneof(
  bareWord,
  singleQuoted,
  doubleQuoted,
  fc.constantFrom("'git commit'", '"a && git commit"', "'x; git commit -m y'", "'$(git commit)'", "commit", "git"),
);
export const assignment = fc.stringMatching(/^[A-Z_][A-Z0-9_]{0,5}$/).chain((k) => bareWord.map((v) => `${k}=${v}`));
export const gitProgram = fc.constantFrom("git", "/usr/bin/git", "'git'", '"git"');
export const globalOpt = fc.constantFrom("-c user.name=x", "-c core.pager=cat", "-C sub", "--no-pager", "-p", "--git-dir=.git", "--work-tree wt", "--bare");
/** Wrapper programs with options and operands (review v1 issue 6). */
export const wrapper = fc.constantFrom(
  "sudo",
  "sudo -u root",
  "sudo --user root -E",
  "sudo -D /tmp",
  "doas -u root",
  "nice",
  "nice -n 5",
  "timeout 60",
  "timeout -s KILL -k 5 1m",
  "xargs",
  "xargs -I {} -n 1",
  "stdbuf -o L",
  "env -i",
  "env -u HOME -C /tmp",
  "command",
  "nohup",
  "time -p",
);

/** A `git ... commit` segment with the subcommand spelled by `commitWord`. */
export function commitSegmentWith(commitWord: fc.Arbitrary<string>, program: fc.Arbitrary<string> = gitProgram): fc.Arbitrary<string> {
  return fc
    .tuple(fc.array(wrapper, { maxLength: 2 }), fc.array(assignment, { maxLength: 2 }), program, fc.array(globalOpt, { maxLength: 3 }), commitWord, fc.array(argArb, { maxLength: 4 }))
    .map(([wrappers, env, git, opts, commit, args]) => [...wrappers, ...env, git, ...opts, commit, ...args].join(" "));
}

export const commitSegment = commitSegmentWith(fc.constant("commit"));

const otherProgram = fc.constantFrom("echo", "ls", "npm", "printf", "grep", "gitx", "git-lfs", "make", "cat");
export const nonGitSegment = fc
  .tuple(fc.array(wrapper, { maxLength: 1 }), fc.array(assignment, { maxLength: 1 }), otherProgram, fc.array(argArb, { maxLength: 5 }))
  .map(([wrappers, env, prog, args]) => [...wrappers, ...env, prog, ...args].join(" "));
const otherSub = fc.constantFrom("status", "log", "show", "add", "diff", "commit-tree", "rev-parse", "push");
export const gitNonCommitSegment = fc
  .tuple(fc.array(wrapper, { maxLength: 1 }), gitProgram, fc.array(globalOpt, { maxLength: 2 }), otherSub, fc.array(argArb, { maxLength: 4 }))
  .map(([wrappers, git, opts, sub, args]) => [...wrappers, git, ...opts, sub, ...args].join(" "));
export const safeSegment = fc.oneof(nonGitSegment, gitNonCommitSegment);

export const separator = fc.constantFrom(" && ", " || ", "; ", " | ", "\n", " ; ", " & ");

export function join(segments: readonly string[], seps: readonly string[]): string {
  return segments.reduce((acc, seg, i) => (i === 0 ? seg : `${acc}${seps[(i - 1) % seps.length] ?? " && "}${seg}`), "");
}

/**
 * Pieces a POSIX shell drops from inside a word: empty quotes, an escaped
 * newline (line continuation) and empty or quiet command substitutions,
 * which the gate's tokeniser leaves out of the word's text.
 */
const vanishing = fc.constantFrom("''", '""', "\\\n", "$()", "``", "$(true)", "`:`", '"$(echo)"', "$((0))");

/** One character of a word, spelled as itself, escaped, or inside single or double quotes. */
function spellChar(ch: string): fc.Arbitrary<string> {
  return fc.constantFrom(ch, `\\${ch}`, `'${ch}'`, `"${ch}"`);
}

/**
 * Spellings of `word` that the shell reads back as `word`: each character
 * plain, escaped or quoted, with vanishing pieces between characters.
 */
export function spelledWord(word: string): fc.Arbitrary<string> {
  const parts = [...word].map((ch) => fc.tuple(fc.array(vanishing, { maxLength: 1 }), spellChar(ch)).map(([gap, c]) => `${gap.join("")}${c}`));
  return fc.tuple(...parts).map((ps) => ps.join(""));
}
