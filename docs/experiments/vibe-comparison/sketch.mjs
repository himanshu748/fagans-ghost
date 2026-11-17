// Disposable conversational first pass, written without a new EARS design.
// Prompt: "Write a compact detector for shell commands that run git commit,
// allowing common Git options before commit." Do not use as the real gate.
export const sketch = command => /\bgit(?:\s+[^\s;&|]+)*\s+commit(?:\s|$)/.test(command);
