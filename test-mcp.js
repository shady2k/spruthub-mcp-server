#!/usr/bin/env node

// Simple test script to verify MCP server functionality
import { spawn } from 'child_process';

console.log('Testing Spruthub MCP Server...');

const server = spawn('node', ['src/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Test list tools request
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list'
};

server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

let output = '';
server.stdout.on('data', (data) => {
  output += data.toString();
  console.log('Server output:', data.toString());
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

setTimeout(() => {
  server.kill();
  console.log('Test completed');
  
  if (output.includes('spruthub_connect')) {
    console.log('✅ MCP server appears to be working correctly');
  } else {
    console.log('❌ MCP server may have issues');
  }
}, 2000);