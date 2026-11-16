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
// A directory word is used as written after quote removal; a leading
// unquoted `~` or `~/` with no quoted character before the first `/`
// becomes the home directory. A word holding shell syntax the tokeniser
// does not evaluate (`$`, `$(...)`, backticks, other tilde forms, glob or
// brace characters outside quotes) reports `null`, and the CLI then checks
// the payload cwd instead (review v2 issue 1).
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

/** One shell word after quote removal. */
export interface ShellWord {
  /** The word's text with quotes removed and the output of command substitutions left out. */
  text: string;
  /**
   * False when the shell would expand part of the word in a way the tokeniser
   * does not evaluate: a `$` or backtick outside single quotes (parameters,
   * `$(...)`, `$((...))`, `$'...'`), or `*`, `?`, `[` or `{` outside quotes.
   */
  literal: boolean;
  /** True when the word starts with an unquoted `~` and nothing up to its first unquoted `/` is quoted (tilde expansion). */
  tilde: boolean;
}

/** Characters that start pathname or brace expansion when unquoted. */
const EXPANDING = new Set(["*", "?", "[", "{"]);

/**
 * Splits a shell command into segments of words. The bodies of command
 * substitutions (`$(...)` and backticks, also inside double quotes) are split
 * as segments of their own, because the shell runs them.
 */
export function shellSegments(command: string): string[][] {
  return shellWordSegments(command).map((words) => words.map((w) => w.text));
}

/** `shellSegments` with each word's expansion flags (FM-R16.2). */
export function shellWordSegments(command: string): ShellWord[][] {
  const segments: ShellWord[][] = [];
  const nested: ShellWord[][] = [];
  let words: ShellWord[] = [];
  let word = "";
  let inWord = false;
  let literal = true;
  let tilde = false;
  /** True from a word's leading unquoted `~` up to its first unquoted `/`: the tilde-prefix. */
  let tildePrefix = false;
  const endWord = (): void => {
    if (inWord) words.push({ text: word, literal, tilde });
    word = "";
    inWord = false;
    literal = true;
    tilde = false;
    tildePrefix = false;
  };
  /** A quoted or escaped character inside the tilde-prefix turns tilde expansion off (POSIX 2.6.1). */
  const quotedChar = (): void => {
    if (tildePrefix) tilde = false;
    tildePrefix = false;
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
      nested.push(...shellWordSegments(command.slice(i + 2, Math.max(i + 2, end - 1))));
      inWord = true;
      literal = false;
      return end;
    }
    if (command[i] === "`") {
      const end = closeBacktick(command, i + 1);
      nested.push(...shellWordSegments(command.slice(i + 1, Math.max(i + 1, end - 1))));
      inWord = true;
      literal = false;
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
      quotedChar();
      const close = command.indexOf("'", i + 1);
      const end = close < 0 ? command.length : close;
      word += command.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      quotedChar();
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
          if (command[i] === "$") literal = false;
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
          quotedChar();
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
    if (ch === "$" || EXPANDING.has(ch)) literal = false;
    if (ch === "~" && !inWord) {
      tilde = true;
      tildePrefix = true;
    } else if (ch === "/") {
      tildePrefix = false;
    }
    word += ch;
    inWord = true;
    i++;
  }
  endSegment();
  return [...segments, ...nested];
}

/** A literal word as `shellWordSegments` would report it. */
const literalWord = (text: string): ShellWord => ({ text, literal: true, tilde: false });

/**
 * The directory words of a `git ... commit` segment, in the order they apply
 * (wrapper chdir options, then `git -C` values); `null` when the segment is
 * not a git commit. An empty list means the shell's cwd.
 */
export function gitCommitDirs(words: readonly ShellWord[]): ShellWord[] | null {
  const dirs: ShellWord[] = [];
  let i = 0;
  for (;;) {
    const w = words[i]?.text;
    if (w === undefined) return null;
    if (ASSIGNMENT_RE.test(w)) {
      i++;
      continue;
    }
    const wrapper = WRAPPERS.get(w);
    if (wrapper !== undefined) {
      i++;
      // Skip the wrapper's own options, such as `env -i`, `sudo -u root` or `nice -n 5`.
      while (words[i]?.text.startsWith("-") === true) {
        const optWord = words[i] as ShellWord;
        const opt = optWord.text;
        i++;
        if (opt === "--") break;
        const eq = opt.indexOf("=");
        const name = opt.startsWith("--") && eq > 0 ? opt.slice(0, eq) : opt;
        if (eq > 0 && opt.startsWith("--")) {
          // No tilde expansion after `=` here: the word is not a variable assignment.
          if (wrapper.chdirOptions.has(name)) dirs.push({ text: opt.slice(eq + 1), literal: optWord.literal, tilde: false });
        } else if (wrapper.valueOptions.has(name)) {
          if (wrapper.chdirOptions.has(name) && words[i] !== undefined) dirs.push(words[i] as ShellWord);
          i++;
        }
      }
      i += wrapper.operands;
      continue;
    }
    break;
  }
  const program = words[i]?.text;
  if (program === undefined || !(program === "git" || program.endsWith("/git"))) return null;
  i++;
  while (i < words.length) {
    const w = (words[i] as ShellWord).text;
    if (w === "--") return words[i + 1]?.text === "commit" ? dirs : null;
    if (!w.startsWith("-")) return w === "commit" ? dirs : null;
    if (w === "-C" && words[i + 1] !== undefined) dirs.push(words[i + 1] as ShellWord);
    i += OPTIONS_WITH_VALUE.has(w) ? 2 : 1;
  }
  return null;
}

/** True when one segment's words run `git ... commit`. */
export function isGitCommitSegment(words: readonly string[]): boolean {
  return gitCommitDirs(words.map(literalWord)) !== null;
}

/**
 * The path a directory word names, or null when it holds shell syntax the
 * tokeniser does not evaluate. `~` and `~/...` (unquoted) expand to `home`;
 * other tilde forms (`~user`, `~+`, `~-`) and a null `home` give null.
 */
export function dirWordPath(word: ShellWord, home: string | null): string | null {
  if (!word.literal) return null;
  if (!word.tilde) return word.text;
  if (home === null || !(word.text === "~" || word.text.startsWith("~/"))) return null;
  return home + word.text.slice(1);
}

/**
 * For each git commit segment of the shell command, the directories it runs
 * in, in order; null for a directory word the CLI cannot know (FM-R16.2).
 */
export function gitCommitTargets(command: string, home: string | null = null): Array<Array<string | null>> {
  return shellWordSegments(command)
    .map(gitCommitDirs)
    .filter((d): d is ShellWord[] => d !== null)
    .map((dirs) => dirs.map((w) => dirWordPath(w, home)));
}

/** True when any segment of the shell command is a git commit (FM-R16.2). */
export function isGitCommitCommand(command: string): boolean {
  return gitCommitTargets(command).length > 0;
}
