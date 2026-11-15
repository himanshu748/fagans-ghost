import { describe, expect, it } from "vitest";
import { isGitCommitCommand, shellSegments } from "../src/core/gate.js";

describe("FM-R16.1 FM-R16.2 commit-gate matcher", () => {
  it.each([
    "git commit -m 'x'",
    "git -c user.name=x commit",
    "git -C sub --no-pager commit --amend",
    "npm test && git commit -am wip",
    "npm test; git commit",
    "false || git commit",
    "GIT_AUTHOR_NAME=x git commit",
    "/usr/bin/git commit",
    "env -i git commit",
    "(cd x && git commit)",
    "git --git-dir .git commit",
    "echo hi\ngit commit",
    'echo "$(git commit -m x)"',
    "echo `git commit`",
    "x=$(git -C . commit -q) true",
  ])("matches %j", (cmd) => {
    expect(isGitCommitCommand(cmd)).toBe(true);
  });

  it.each([
    "git status",
    "git log --grep commit",
    'echo "git commit"',
    "echo git commit",
    "git commit-tree HEAD^{tree}",
    "git -c alias.x=commit status",
    "npm run commit",
    "gitx commit",
    "# git commit",
    "git show 'a && git commit'",
    "echo '$(git commit)'",
    'echo "$(git status) commit"',
    "",
  ])("does not match %j", (cmd) => {
    expect(isGitCommitCommand(cmd)).toBe(false);
  });

  it("splits on operators outside quotes only", () => {
    expect(shellSegments(`a "b && c" && d 'e;f' | g`)).toEqual([["a", "b && c"], ["d", "e;f"], ["g"]]);
  });
});
