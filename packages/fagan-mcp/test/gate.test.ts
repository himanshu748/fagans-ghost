import { describe, expect, it } from "vitest";
import { gitCommitTargets, isGitCommitCommand, shellSegments } from "../src/core/gate.js";

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

  // Review v1 issue 6: wrappers that were not recognised let a commit through.
  it.each([
    "sudo git commit -m x",
    "sudo -u root -E git commit",
    "sudo --user=root git commit",
    "doas -u root git commit",
    "nice git commit",
    "nice -n 5 git commit",
    "nice -10 git commit",
    "timeout 60 git commit -m x",
    "timeout -s KILL -k 5 60s git commit",
    "timeout --signal=TERM 1m git commit",
    "echo x | xargs git commit -m",
    "xargs -I {} -n 1 git commit -m {}",
    "stdbuf -o L git commit",
    "env -u HOME git commit",
    "sudo nice -n 2 timeout 10 git commit",
  ])("matches wrapped commit %j", (cmd) => {
    expect(isGitCommitCommand(cmd)).toBe(true);
  });

  it.each(["sudo ls", "timeout 60 git status", "nice -n 5 make", "xargs -n 1 echo commit", "env -u git commit"])(
    "does not match wrapped non-commit %j",
    (cmd) => {
      expect(isGitCommitCommand(cmd)).toBe(false);
    },
  );

  it("reports the directories a commit runs in, in order", () => {
    expect(gitCommitTargets("git commit")).toEqual([[]]);
    expect(gitCommitTargets("git -C ../other commit")).toEqual([["../other"]]);
    expect(gitCommitTargets("git -C a -C b commit && git status")).toEqual([["a", "b"]]);
    expect(gitCommitTargets("env -C /x git -C y commit; sudo --chdir=/z git commit")).toEqual([["/x", "y"], ["/z"]]);
    expect(gitCommitTargets("sudo -D /w git commit")).toEqual([["/w"]]);
    expect(gitCommitTargets("git -C x status")).toEqual([]);
  });

  // Review v2 issue 1: words the shell expands must not be resolved as written.
  it("FM-R16.2 reports null for directory words the shell would expand", () => {
    const home = "/home/u";
    expect(gitCommitTargets('git -C "$PWD" commit', home)).toEqual([[null]]);
    expect(gitCommitTargets("git -C $HOME/x commit", home)).toEqual([[null]]);
    expect(gitCommitTargets("git -C ${D:-.} commit", home)).toEqual([[null]]);
    expect(gitCommitTargets('git -C "$(git rev-parse --show-toplevel)/src" commit', home)).toEqual([[null]]);
    expect(gitCommitTargets("git -C `pwd` commit", home)).toEqual([[null]]);
    expect(gitCommitTargets("git -C sub* commit", home)).toEqual([[null]]);
    expect(gitCommitTargets("git -C {a,b} commit", home)).toEqual([[null]]);
    expect(gitCommitTargets("env -C $PWD git commit", home)).toEqual([[null]]);
    expect(gitCommitTargets("sudo --chdir=$D git -C sub commit", home)).toEqual([[null, "sub"]]);
    expect(gitCommitTargets("git -C ~bob/x commit", home)).toEqual([[null]]);
    expect(gitCommitTargets("git -C ~+ commit", home)).toEqual([[null]]);
    expect(gitCommitTargets("git -C ~/x commit")).toEqual([[null]]);
  });

  it("FM-R16.2 resolves quoted, escaped and tilde directory words as the shell would", () => {
    const home = "/home/u";
    expect(gitCommitTargets("git -C ~ commit", home)).toEqual([["/home/u"]]);
    expect(gitCommitTargets("git -C ~/code/r commit", home)).toEqual([["/home/u/code/r"]]);
    expect(gitCommitTargets('git -C "~/x" commit', home)).toEqual([["~/x"]]);
    expect(gitCommitTargets("git -C \\~/x commit", home)).toEqual([["~/x"]]);
    expect(gitCommitTargets("git -C '$PWD' commit", home)).toEqual([["$PWD"]]);
    expect(gitCommitTargets('git -C "a\\$b" commit', home)).toEqual([["a$b"]]);
    expect(gitCommitTargets("git -C a\\*b commit", home)).toEqual([["a*b"]]);
    expect(gitCommitTargets("git -C 'sub*' commit", home)).toEqual([["sub*"]]);
    // A quoted character before the first `/` turns tilde expansion off (POSIX 2.6.1).
    expect(gitCommitTargets('git -C ~"/x" commit', home)).toEqual([["~/x"]]);
    expect(gitCommitTargets("git -C ~\\/x commit", home)).toEqual([["~/x"]]);
    expect(gitCommitTargets("git -C ~'' commit", home)).toEqual([["~"]]);
    expect(gitCommitTargets('git -C ~/"a b" commit', home)).toEqual([["/home/u/a b"]]);
    // No tilde expansion after `=` in an option word: it is not a variable assignment.
    expect(gitCommitTargets("env --chdir=~/x git commit", home)).toEqual([["~/x"]]);
  });
});
