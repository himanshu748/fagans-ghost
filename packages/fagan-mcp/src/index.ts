// Public exports of fagan-mcp: pure core, store, git adapter, runner, the tool
// services and the MCP server. The `fagan` CLI entry is src/cli.ts.
export const SERVER_NAME = "fagan";

export * from "./clock.js";
export * from "./core/errors.js";
export * from "./core/schema.js";
export * from "./core/json.js";
export * from "./core/diff.js";
export * from "./core/packet.js";
export * from "./core/phase.js";
export * from "./core/roles.js";
export * from "./core/readings.js";
export * from "./core/defects.js";
export * from "./core/rework.js";
export * from "./core/followup.js";
export * from "./core/metrics.js";
export * from "./core/state.js";
export * from "./core/ops.js";
export * from "./core/report.js";
export * from "./core/gate.js";
export * from "./store/fs.js";
export * from "./store/store.js";
export * from "./store/checklists.js";
export * from "./git/git.js";
export * from "./runner/runner.js";
export * from "./service/service.js";
export * from "./server/server.js";
