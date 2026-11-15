// Commit-gate command matcher (FM-R16.1, FM-R16.2, design.md "CLI").
//
// The command is tokenised like a POSIX shell would split words (single and
// double quotes, backslash escapes), then cut into segments at `&&`, `||`,
// `;`, `|`, `&`, `(`, `)` and newlines outside quotes. A segment is a commit
// when, after leading `NAME=value` words and the wrappers `command`, `env`,
// `exec`, `nohup` and `time`, the program is `git` (or a path ending in
// `/git`) and the first word after git's global options is `commit`. Bodies of
// command substitutions (`$(...)`, backticks) are checked as segments too.
// Known gap: commands inside `sh -c '...'`, `eval`, or git aliases are not seen.

const SEPARATORS = new Set([";", "|", "&", "(", ")", "\n"]);
const WRAPPERS = new Set(["command", "env", "exec", "nohup", "time"]);
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

/** True when one segment's words run `git ... commit`. */
export function isGitCommitSegment(words: readonly string[]): boolean {
  let i = 0;
  for (;;) {
    const w = words[i];
    if (w === undefined) return false;
    if (ASSIGNMENT_RE.test(w)) {
      i++;
      continue;
    }
    if (WRAPPERS.has(w)) {
      i++;
      // Skip the wrapper's own options, such as `env -i` or `time -p`.
      while (words[i]?.startsWith("-")) i++;
      continue;
    }
    break;
  }
  const program = words[i];
  if (program === undefined || !(program === "git" || program.endsWith("/git"))) return false;
  i++;
  while (i < words.length) {
    const w = words[i] as string;
    if (w === "--") return words[i + 1] === "commit";
    if (!w.startsWith("-")) return w === "commit";
    i += OPTIONS_WITH_VALUE.has(w) ? 2 : 1;
  }
  return false;
}

/** True when any segment of the shell command is a git commit (FM-R16.2). */
export function isGitCommitCommand(command: string): boolean {
  return shellSegments(command).some(isGitCommitSegment);
}
