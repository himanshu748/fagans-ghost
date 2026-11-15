// Commit-gate command matcher (FM-R16.1, FM-R16.2, design.md "CLI").
//
// The command is tokenised like a POSIX shell would split words (single and
// double quotes, backslash escapes), then cut into segments at `&&`, `||`,
// `;`, `|`, `&`, `(`, `)` and newlines outside quotes. A segment is a commit
// when, after leading `NAME=value` words and the wrappers in `WRAPPERS` with
// their options, the program is `git` (or a path ending in `/git`) and the
// first word after git's global options is `commit`. Bodies of command
// substitutions (`$(...)`, backticks) are checked as segments too.
// Each commit also reports the directories it runs in: `git -C <path>` and
// the wrapper options `env -C`/`--chdir` and `sudo -D`/`--chdir`, in order,
// so the gate checks the repo the commit really targets (review v1 issue 6).
// Known gaps (design.md "Commit gate scope"): commands inside `sh -c '...'`,
// `eval`, scripts and git aliases; `cd <dir> && git commit` (the gate checks
// the payload cwd); `--git-dir`/`--work-tree`; `env -S`; commits made by
// `git merge`, `cherry-pick`, `revert`, `am` or `rebase`.

const SEPARATORS = new Set([";", "|", "&", "(", ")", "\n"]);

interface WrapperSpec {
  /** Options that take the next word as their value when written without `=`. */
  valueOptions: ReadonlySet<string>;
  /** Options among `valueOptions` whose value is a directory the command runs in. */
  chdirOptions: ReadonlySet<string>;
  /** Operands before the command, such as the duration of `timeout`. */
  operands: number;
}

const spec = (valueOptions: string[], chdirOptions: string[] = [], operands = 0): WrapperSpec => ({
  valueOptions: new Set([...valueOptions, ...chdirOptions]),
  chdirOptions: new Set(chdirOptions),
  operands,
});

/**
 * Programs that run the rest of the words as a command. Options from the GNU
 * coreutils manual (env, nice, nohup, stdbuf, timeout), the findutils xargs
 * man page, the sudo man page and the doas man page.
 */
const WRAPPERS: ReadonlyMap<string, WrapperSpec> = new Map([
  ["command", spec([])],
  ["exec", spec(["-a"])],
  ["time", spec(["-f", "-o", "--format", "--output"])],
  ["nohup", spec([])],
  ["env", spec(["-u", "--unset", "-S", "--split-string", "-a", "--argv0", "-P"], ["-C", "--chdir"])],
  ["nice", spec(["-n", "--adjustment"])],
  ["timeout", spec(["-k", "--kill-after", "-s", "--signal"], [], 1)],
  ["stdbuf", spec(["-i", "-o", "-e", "--input", "--output", "--error"])],
  ["xargs", spec(["-a", "--arg-file", "-d", "--delimiter", "-E", "-I", "-L", "--max-lines", "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars", "--process-slot-var"])],
  [
    "sudo",
    spec(
      ["-a", "--auth-type", "-C", "--close-from", "-c", "--login-class", "-g", "--group", "-h", "--host", "-p", "--prompt", "-R", "--chroot", "-r", "--role", "-t", "--type", "-U", "--other-user", "-T", "--command-timeout", "-u", "--user"],
      ["-D", "--chdir"],
    ),
  ],
  ["doas", spec(["-a", "-u", "-C"])],
]);
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** Git global options that take the next word as their value when written without `=`. */
const OPTIONS_WITH_VALUE = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--list-cmds"]);

/** Index just past the `)` that closes a `$(` whose body starts at `start`, or the end of input. */
function closeParen(command: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < command.length) {
    const ch = command[i];
    if (ch === "\\") i += 2;
    else if (ch === "'") {
      const close = command.indexOf("'", i + 1);
      i = close < 0 ? command.length : close + 1;
    } else {
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) return i + 1;
      }
      i++;
    }
  }
  return command.length;
}

/** Index just past the backtick that closes one opened before `start`, or the end of input. */
function closeBacktick(command: string, start: number): number {
  let i = start;
  while (i < command.length) {
    if (command[i] === "\\") i += 2;
    else if (command[i] === "`") return i + 1;
    else i++;
  }
  return command.length;
}

/**
 * Splits a shell command into segments of words. The bodies of command
 * substitutions (`$(...)` and backticks, also inside double quotes) are split
 * as segments of their own, because the shell runs them.
 */
export function shellSegments(command: string): string[][] {
  const segments: string[][] = [];
  const nested: string[][] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  const endWord = (): void => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endSegment = (): void => {
    endWord();
    if (words.length > 0) segments.push(words);
    words = [];
  };
  /** Handles `$(` or a backtick at `i`; returns the index after it, or -1 if there is none. */
  const substitution = (i: number): number => {
    if (command.startsWith("$(", i)) {
      const end = closeParen(command, i + 2);
      nested.push(...shellSegments(command.slice(i + 2, Math.max(i + 2, end - 1))));
      inWord = true;
      return end;
    }
    if (command[i] === "`") {
      const end = closeBacktick(command, i + 1);
      nested.push(...shellSegments(command.slice(i + 1, Math.max(i + 1, end - 1))));
      inWord = true;
      return end;
    }
    return -1;
  };

  let i = 0;
  while (i < command.length) {
    const ch = command[i] as string;
    const sub = substitution(i);
    if (sub >= 0) {
      i = sub;
      continue;
    }
    if (ch === "'") {
      const close = command.indexOf("'", i + 1);
      const end = close < 0 ? command.length : close;
      word += command.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      inWord = true;
      i++;
      while (i < command.length && command[i] !== '"') {
        const inner = substitution(i);
        if (inner >= 0) {
          i = inner;
        } else if (command[i] === "\\" && i + 1 < command.length && '"\\$`\n'.includes(command[i + 1] as string)) {
          if (command[i + 1] !== "\n") word += command[i + 1];
          i += 2;
        } else {
          word += command[i];
          i++;
        }
      }
      i++;
      continue;
    }
    if (ch === "\\") {
      if (i + 1 < command.length) {
        if (command[i + 1] !== "\n") {
          word += command[i + 1];
          inWord = true;
        }
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (ch === "#" && !inWord) {
      // Comment to end of line.
      const nl = command.indexOf("\n", i);
      i = nl < 0 ? command.length : nl;
      continue;
    }
    if (SEPARATORS.has(ch)) {
      endSegment();
      i++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      endWord();
      i++;
      continue;
    }
    word += ch;
    inWord = true;
    i++;
  }
  endSegment();
  return [...segments, ...nested];
}

/**
 * The directories a `git ... commit` segment runs in, as written, in the
 * order they apply (wrapper chdir options, then `git -C` values); `null` when
 * the segment is not a git commit. An empty list means the shell's cwd.
 */
export function gitCommitDirs(words: readonly string[]): string[] | null {
  const dirs: string[] = [];
  let i = 0;
  for (;;) {
    const w = words[i];
    if (w === undefined) return null;
    if (ASSIGNMENT_RE.test(w)) {
      i++;
      continue;
    }
    const wrapper = WRAPPERS.get(w);
    if (wrapper !== undefined) {
      i++;
      // Skip the wrapper's own options, such as `env -i`, `sudo -u root` or `nice -n 5`.
      while (words[i]?.startsWith("-") === true) {
        const opt = words[i] as string;
        i++;
        if (opt === "--") break;
        const eq = opt.indexOf("=");
        const name = opt.startsWith("--") && eq > 0 ? opt.slice(0, eq) : opt;
        if (eq > 0 && opt.startsWith("--")) {
          if (wrapper.chdirOptions.has(name)) dirs.push(opt.slice(eq + 1));
        } else if (wrapper.valueOptions.has(name)) {
          if (wrapper.chdirOptions.has(name) && words[i] !== undefined) dirs.push(words[i] as string);
          i++;
        }
      }
      i += wrapper.operands;
      continue;
    }
    break;
  }
  const program = words[i];
  if (program === undefined || !(program === "git" || program.endsWith("/git"))) return null;
  i++;
  while (i < words.length) {
    const w = words[i] as string;
    if (w === "--") return words[i + 1] === "commit" ? dirs : null;
    if (!w.startsWith("-")) return w === "commit" ? dirs : null;
    if (w === "-C" && words[i + 1] !== undefined) dirs.push(words[i + 1] as string);
    i += OPTIONS_WITH_VALUE.has(w) ? 2 : 1;
  }
  return null;
}

/** True when one segment's words run `git ... commit`. */
export function isGitCommitSegment(words: readonly string[]): boolean {
  return gitCommitDirs(words) !== null;
}

/** For each git commit segment of the shell command, the directories it runs in (FM-R16.2). */
export function gitCommitTargets(command: string): string[][] {
  return shellSegments(command)
    .map(gitCommitDirs)
    .filter((d): d is string[] => d !== null);
}

/** True when any segment of the shell command is a git commit (FM-R16.2). */
export function isGitCommitCommand(command: string): boolean {
  return gitCommitTargets(command).length > 0;
}
