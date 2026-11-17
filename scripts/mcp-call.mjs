#!/usr/bin/env node
// Local development bridge to the same stdio MCP server used by Kiro.
// This script calls no model. Role permissions are enforced by the server;
// role strings are assertions, not authenticated identities.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [name, argument] = process.argv.slice(2);
if (!name || !argument || process.argv.length !== 4) {
  console.error('Usage: node scripts/mcp-call.mjs <tool> <JSON or @arguments-file>');
  process.exitCode = 1;
} else {
  const client = new Client({ name: 'fagan-local-bridge', version: '0.0.0' });
  try {
    const args = JSON.parse(argument.startsWith('@') ? readFileSync(argument.slice(1), 'utf8') : argument);
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../packages/fagan-mcp/dist/cli.js', import.meta.url)), 'serve'],
      cwd: process.cwd(), stderr: 'inherit',
    }));
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 1_260_000 });
    for (const content of result.content) if (content.type === 'text') console.log(content.text);
    if (result.isError) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally { await client.close(); }
}
