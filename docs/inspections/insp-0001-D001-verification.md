# D001 verification: reported bypass is a false positive

Date: 2026-11-17. Investigator: Codex. Inspection: `insp-0001`, defect `D001`.

The reported literal `git -C/path commit` bypass does not execute a commit with the Git implementation checked here. Git rejects the attached top-level `-C/path` option. No gate repair is retained, and this investigation has not changed the recorded defect, recorded Author rework, waived a defect, run inspection follow-up, or committed files.

## Actual Git behavior

All commands below ran from `/Users/himanshujha/code/fagans-ghost`.

```sh
git --version
```

Exit 0: `git version 2.39.5 (Apple Git-154)`.

```sh
git -C"/Users/himanshujha/code/fagans-ghost" -Cpackages -C .. rev-parse --show-toplevel
```

Exit 129. First diagnostic:

```text
unknown option: -C/Users/himanshujha/code/fagans-ghost
```

The command used the read-only `rev-parse` subcommand to exercise Git's global-option parser. No commit was attempted. The equivalent separated syntax succeeded:

```sh
git -C "/Users/himanshujha/code/fagans-ghost" -C packages -C .. rev-parse --show-toplevel
```

Exit 0: `/Users/himanshujha/code/fagans-ghost`.

The [official Git manual](https://git-scm.com/docs/git) specifies `-C <path>` and sequential resolution of relative directory arguments. The decisive implementation evidence is Git's top-level `handle_options`: it matches `-C` exactly, consumes the following argument, and rejects unknown options. This was verified against the [pinned Git v2.51.0 source](https://github.com/git/git/blob/v2.51.0/git.c#L295-L307) and the [current upstream source](https://github.com/git/git/blob/master/git.c) on the investigation date. The general attached-option guidance in [gitcli](https://git-scm.com/docs/gitcli) is insufficient evidence that this particular top-level option accepts an attached value.

## Why the initial tests were misleading

Before changing the parser, 13 matcher examples and one built-CLI regression were added provisionally. The CLI test created isolated temporary fixture repositories, one with a fixture open major and one clean. It passed command strings to `fagan hook gate`; it did not execute those strings with Git. These are test fixtures, not additional real inspections of this project.

```sh
npm run build --workspace fagan-mcp && npm exec --workspace fagan-mcp -- vitest run test/gate.test.ts test/cli.test.ts -t D001
```

Before the provisional parser change: exit 1, 14 failed and 74 skipped, across two failed test files. The CLI returned 0 where the provisional assertion expected 2 for `git -C<temporary-target-repo> commit -m x`. Matcher cases showed the attached directory being omitted. These failures demonstrated a mismatch with the new assertions, not a successful Git commit bypass.

After the provisional parser change, the same command exited 0 with 14 passed and 74 skipped. The cases covered attached quoted and escaped values, dynamic values, attached substitutions, tilde handling, and chained directories. `npm run typecheck --workspace fagan-mcp` also exited 0. An already-started `npm test --workspace fagan-mcp` completed with 23 files and 241 tests passing. These results apply only to the provisional implementation, which was withdrawn after checking actual Git behavior. They must not be presented as verification that D001 was fixed.

The provisional changes to `src/core/gate.ts`, `test/gate.test.ts`, `test/cli.test.ts`, and the MCP requirements/design were reviewed and restored to their pre-investigation contents. No source, regression test, or spec change for D001 is retained. The built MCP is rebuilt from that restored source before handoff.

Final validation on the restored implementation:

```sh
npm run build --workspace fagan-mcp && npm exec --workspace fagan-mcp -- vitest run test/gate.test.ts test/gate.property.test.ts test/cli.test.ts
```

Exit 0. Build succeeded; 3 test files and 76 tests passed. This includes the existing separated-directory, quoted-value, dynamic-directory fallback, chained-directory, and matcher property coverage.

## Author decision

Recommended disposition: explicitly waive D001 as a false positive, with this reason:

> The reported literal attached top-level `-C/path` syntax is rejected by Git before it dispatches a subcommand. Confirmed with installed Git 2.39.5 and official upstream source, including pinned v2.51.0. The parser-only reproduction did not execute a Git commit. No source repair is needed for the reported invocation.

This is a recommendation, not an Author waiver. Keep the original defect and its history; only the human Author may authorize its disposition. Existing documented limitations for dynamic shell expressions and other commit mechanisms remain outside this finding.

## Later Author disposition

After the investigation above, the human Author explicitly approved the
false-positive waiver. Codex recorded the approved reason through MCP, and
follow-up passed the actual build and tests. The inspection is now Closed with
D001 marked waived. See [provenance and decision receipt](insp-0001.md). The
investigation narrative above preserves its original pre-approval boundary.
