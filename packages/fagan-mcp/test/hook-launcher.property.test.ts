// RA-R7.5: without packages/fagan-mcp/dist/cli.js, the hook launcher's
// fallback gate must block every command the built gate would check as a
// git commit (scripts/fagan-hook.mjs couldBeGitCommit, src/core/gate.ts
// isGitCommitCommand).
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { isGitCommitCommand } from "../src/core/gate.js";
import { commitSegment, commitSegmentWith, gitProgram, join, safeSegment, separator, spelledWord } from "./gate-arbitraries.js";
import { loadLauncher, type Launcher } from "./launcher.js";

let launcher: Launcher;

beforeAll(async () => {
  launcher = await loadLauncher();
});

/** Commit segments whose `git` and `commit` words are spelled with quotes, escapes, line continuations and substitutions. */
const spelledCommitSegment = commitSegmentWith(spelledWord("commit"), fc.oneof(gitProgram, spelledWord("git")));

/** Fragments inserted at random places, to reach command shapes the segment generators do not build. */
const fragment = fc.constantFrom(
  "git", "commit", " ", "c", "o", "m", "i", "t", "g", "-C", "x", "'", '"', "\\", "\n", "$(", ")", "`", ";", "&&", "|", "#", "=", "~", "{", "}", "*", "sudo ", "env ",
);
const insertion = fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fragment);

/** A commit command with random fragments inserted into it; many results are still commits to the built gate. */
const mutatedCommand = fc
  .tuple(fc.oneof(commitSegment, spelledCommitSegment), fc.array(insertion, { minLength: 1, maxLength: 6 }))
  .map(([base, inserts]) =>
    inserts.reduce((cmd, [at, frag]) => {
      const i = Math.floor(at * cmd.length);
      return cmd.slice(0, i) + frag + cmd.slice(i);
    }, base),
  );

describe("hook launcher fallback properties", () => {
  it("RA-R7.5 the fallback blocks every command the built gate checks as a git commit", () => {
    let commits = 0;
    const segmentArb = fc.oneof(
      { weight: 1, arbitrary: commitSegment },
      { weight: 2, arbitrary: spelledCommitSegment },
      { weight: 2, arbitrary: safeSegment },
    );
    fc.assert(
      fc.property(fc.array(segmentArb, { minLength: 1, maxLength: 4 }), fc.array(separator, { minLength: 1, maxLength: 3 }), (segs, seps) => {
        const command = join(segs, seps);
        if (isGitCommitCommand(command)) {
          commits++;
          expect(launcher.couldBeGitCommit(command), command).toBe(true);
        }
      }),
      { numRuns: 3000 },
    );
    // The implication is only meaningful when the built gate often says "commit".
    expect(commits).toBeGreaterThan(1000);
  });

  it("RA-R7.5 the fallback blocks every mutated command the built gate still checks as a git commit", () => {
    let commits = 0;
    fc.assert(
      fc.property(mutatedCommand, (command) => {
        if (isGitCommitCommand(command)) {
          commits++;
          expect(launcher.couldBeGitCommit(command), command).toBe(true);
        }
      }),
      { numRuns: 5000 },
    );
    expect(commits).toBeGreaterThan(1000);
  });

  it("RA-R7.3 the fallback lets through commands with no c-o-m-m-i-t letters in order", () => {
    const noCommit = fc.string({ maxLength: 40 }).filter((s) => !/c[^]*o[^]*m[^]*m[^]*i[^]*t/.test(s));
    fc.assert(
      fc.property(noCommit, (command) => {
        expect(launcher.couldBeGitCommit(command)).toBe(false);
      }),
      { numRuns: 2000 },
    );
  });
});
