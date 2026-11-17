# One small spec versus conversational-code comparison

On 2026-11-17, after the main gate existed, Codex wrote a disposable one-pass
regular-expression detector from the prompt in `sketch.mjs`, without writing a
new spec or tests first. It then ran `compare.mjs` against seven hand-selected
shell examples and the existing specified gate. `results.json` is actual command
output. Reproduce it after building with:

```sh
node docs/experiments/vibe-comparison/compare.mjs
```

The sketch handled ordinary commits and common flags, but missed quoted or
escaped command letters and treated echoed words as a commit. The specified
implementation matched the expected classification in these examples. Those
cases are exactly the kind of command-shape requirement made explicit by the
Fagan MCP spec and its property tests.

This is a narrow illustration, not a controlled benchmark. The same Codex
session already knew the production implementation; the cases were selected
after the sketch. It establishes neither a general quality advantage nor a
speed difference. The sketch is not shipped as a gate, and no shell command in
the corpus is executed. This was conversational coding in Codex, not a claimed
run of Kiro's native Vibe mode. Kiro access remained quota-blocked.
