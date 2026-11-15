import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isGitCommitCommand } from "../src/core/gate.js";

// Words are rendered so that a POSIX shell would read them back as one word.
const bareWord = fc.stringMatching(/^[A-Za-z0-9._\/:@%+,-]{1,8}$/).filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
const anyText = fc.string({ maxLength: 20 });
const singleQuoted = anyText.map((s) => `'${s.replace(/'/g, "")}'`);
const doubleQuoted = anyText.map((s) => `"${s.replace(/["\\$`]/g, (c) => `\\${c}`)}"`);
/** Arguments, including ones that mention git and commit inside quotes. */
const argArb = fc.oneof(
  bareWord,
  singleQuoted,
  doubleQuoted,
  fc.constantFrom("'git commit'", '"a && git commit"', "'x; git commit -m y'", "'$(git commit)'", "commit", "git"),
);
const assignment = fc.stringMatching(/^[A-Z_][A-Z0-9_]{0,5}$/).chain((k) => bareWord.map((v) => `${k}=${v}`));
const gitProgram = fc.constantFrom("git", "/usr/bin/git", "'git'", '"git"');
const globalOpt = fc.constantFrom("-c user.name=x", "-c core.pager=cat", "-C sub", "--no-pager", "-p", "--git-dir=.git", "--work-tree wt", "--bare");
/** Wrapper programs with options and operands (review v1 issue 6). */
const wrapper = fc.constantFrom(
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

const commitSegment = fc
  .tuple(fc.array(wrapper, { maxLength: 2 }), fc.array(assignment, { maxLength: 2 }), gitProgram, fc.array(globalOpt, { maxLength: 3 }), fc.array(argArb, { maxLength: 4 }))
  .map(([wrappers, env, git, opts, args]) => [...wrappers, ...env, git, ...opts, "commit", ...args].join(" "));

const otherProgram = fc.constantFrom("echo", "ls", "npm", "printf", "grep", "gitx", "git-lfs", "make", "cat");
const nonGitSegment = fc
  .tuple(fc.array(wrapper, { maxLength: 1 }), fc.array(assignment, { maxLength: 1 }), otherProgram, fc.array(argArb, { maxLength: 5 }))
  .map(([wrappers, env, prog, args]) => [...wrappers, ...env, prog, ...args].join(" "));
const otherSub = fc.constantFrom("status", "log", "show", "add", "diff", "commit-tree", "rev-parse", "push");
const gitNonCommitSegment = fc
  .tuple(fc.array(wrapper, { maxLength: 1 }), gitProgram, fc.array(globalOpt, { maxLength: 2 }), otherSub, fc.array(argArb, { maxLength: 4 }))
  .map(([wrappers, git, opts, sub, args]) => [...wrappers, git, ...opts, sub, ...args].join(" "));
const safeSegment = fc.oneof(nonGitSegment, gitNonCommitSegment);

const separator = fc.constantFrom(" && ", " || ", "; ", " | ", "\n", " ; ", " & ");

function join(segments: readonly string[], seps: readonly string[]): string {
  return segments.reduce((acc, seg, i) => (i === 0 ? seg : `${acc}${seps[(i - 1) % seps.length] ?? " && "}${seg}`), "");
}

describe("gate properties", () => {
  it("FM-R16.1 FM-R16.2 the gate matches only git commit commands", () => {
    const segmentArb = fc.oneof(
      { weight: 1, arbitrary: commitSegment.map((s) => ({ s, commit: true })) },
      { weight: 3, arbitrary: safeSegment.map((s) => ({ s, commit: false })) },
    );
    fc.assert(
      fc.property(fc.array(segmentArb, { minLength: 1, maxLength: 5 }), fc.array(separator, { minLength: 1, maxLength: 4 }), (segs, seps) => {
        const command = join(
          segs.map((x) => x.s),
          seps,
        );
        expect(isGitCommitCommand(command)).toBe(segs.some((x) => x.commit));
      }),
      { numRuns: 2000 },
    );
  });

  it("FM-R16.1 commands built without a git commit segment never match", () => {
    fc.assert(
      fc.property(fc.array(safeSegment, { minLength: 1, maxLength: 5 }), fc.array(separator, { minLength: 1, maxLength: 4 }), (segs, seps) => {
        expect(isGitCommitCommand(join(segs, seps))).toBe(false);
      }),
      { numRuns: 2000 },
    );
  });
});
