#!/usr/bin/env node
// ProjectManager MCP — servidor Model Context Protocol pro Claude Desktop

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFS, dispatch } from './src/tools.js';

const server = new Server(
  { name: 'projectmanager-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await dispatch(name, args || {});
  } catch (e) {
    console.error(`[mcp] erro em ${name}:`, e);
    return {
      content: [{ type: 'text', text: `❌ Erro: ${e.message}\n\nSe for auth, rode \`npm run auth\` no diretório do servidor.` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mcp] ProjectManager MCP rodando via stdio. PID:', process.pid);
