# What a code inspection can record

I built Fagan's Ghost as part of the Kiroween Hackathon 2026. It adapts Michael Fagan's [1976 IBM software inspection process](https://doi.org/10.1147/sj.153.0182) to AI-written changes. A Reader explains each unit of the diff, two Inspectors challenge it, and a Scribe records findings with their locations. The human Author decides which findings to fix or waive. Follow-up reruns the configured checks and records the outcome.

The [bundled inspection](https://himanshu748.github.io/fagans-ghost/?demo=decision) shows why keeping that record matters. The Reader covered 40 units. An Inspector flagged a Git argument that appeared to bypass the commit gate. A read-only reproduction showed that Git rejected the syntax before invoking its subcommand. The Author approved a waiver with a written reason, then follow-up passed the build and tests. The report keeps both the finding and the decision.

A separate Kiro CLI experiment tested the gate in a scratch repository. With an unresolved major finding, Kiro's pre-tool hook blocked a commit and the commit count stayed unchanged. The ACP trace exposed the tool name and command field, which informed how the hook reads Kiro's payload. The saved inspection itself used Codex role agents after Kiro reached its usage limit.

The [Kiro usage notes](https://github.com/himanshu748/fagans-ghost/blob/main/KIRO_USAGE.md) link to the experiment and explain which IDE checks remain open. The [public viewer](https://himanshu748.github.io/fagans-ghost/) lets anyone read the inspection, review the finding, and see the Author's decision.
