#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Sprut } from 'spruthub-client';
import pino from 'pino';

export class SpruthubMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'spruthub-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    });

    this.sprutClient = null;
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'spruthub_connect',
            description: 'Connect to Spruthub server. Parameters can be provided via arguments or environment variables (SPRUTHUB_WS_URL, SPRUTHUB_EMAIL, SPRUTHUB_PASSWORD, SPRUTHUB_SERIAL)',
            inputSchema: {
              type: 'object',
              properties: {
                wsUrl: {
                  type: 'string',
                  description: 'WebSocket URL of the Spruthub server (or set SPRUTHUB_WS_URL)',
                },
                sprutEmail: {
                  type: 'string',
                  description: 'Authentication email (or set SPRUTHUB_EMAIL)',
                },
                sprutPassword: {
                  type: 'string',
                  description: 'Authentication password (or set SPRUTHUB_PASSWORD)',
                },
                serial: {
                  type: 'string',
                  description: 'Device serial number (or set SPRUTHUB_SERIAL)',
                },
              },
              required: [],
            },
          },
          {
            name: 'spruthub_execute',
            description: 'Execute a command on a Spruthub device',
            inputSchema: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  enum: ['update'],
                  description: 'Command to execute (currently only "update" is supported)',
                },
                accessoryId: {
                  type: 'string',
                  description: 'ID of the accessory to control',
                },
                serviceId: {
                  type: 'string',
                  description: 'ID of the service within the accessory',
                },
                characteristicId: {
                  type: 'string',
                  description: 'ID of the characteristic to update',
                },
                value: {
                  type: 'boolean',
                  description: 'Boolean value to set for the characteristic',
                },
              },
              required: ['command', 'accessoryId', 'serviceId', 'characteristicId', 'value'],
            },
          },
          {
            name: 'spruthub_version',
            description: 'Get Spruthub server version information',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'spruthub_disconnect',
            description: 'Disconnect from Spruthub server',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'spruthub_connect':
            return await this.handleConnect(args);
          case 'spruthub_execute':
            return await this.handleExecute(args);
          case 'spruthub_version':
            return await this.handleVersion();
          case 'spruthub_disconnect':
            return await this.handleDisconnect();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        this.logger.error({ error: error.message }, 'Tool execution failed');
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async handleConnect(args) {
    const { 
      wsUrl = process.env.SPRUTHUB_WS_URL,
      sprutEmail = process.env.SPRUTHUB_EMAIL, 
      sprutPassword = process.env.SPRUTHUB_PASSWORD, 
      serial = process.env.SPRUTHUB_SERIAL 
    } = args;

    if (!wsUrl || !sprutEmail || !sprutPassword || !serial) {
      throw new Error('Missing required connection parameters. Provide via arguments or environment variables: SPRUTHUB_WS_URL, SPRUTHUB_EMAIL, SPRUTHUB_PASSWORD, SPRUTHUB_SERIAL');
    }

    try {
      this.sprutClient = new Sprut({
        wsUrl,
        sprutEmail,
        sprutPassword,
        serial,
        logger: this.logger,
      });

      await this.sprutClient.connected();
      
      return {
        content: [
          {
            type: 'text',
            text: 'Successfully connected to Spruthub server',
          },
        ],
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to connect to Spruthub');
      throw new Error(`Failed to connect: ${error.message}`);
    }
  }

  async handleExecute(args) {
    if (!this.sprutClient) {
      throw new Error('Not connected to Spruthub. Use spruthub_connect first.');
    }

    const { command, accessoryId, serviceId, characteristicId, value } = args;

    try {
      const result = await this.sprutClient.execute(command, {
        accessoryId,
        serviceId,
        characteristicId,
        control: { value },
      });

      return {
        content: [
          {
            type: 'text',
            text: `Command executed successfully: ${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to execute command');
      throw new Error(`Failed to execute command: ${error.message}`);
    }
  }

  async handleVersion() {
    if (!this.sprutClient) {
      throw new Error('Not connected to Spruthub. Use spruthub_connect first.');
    }

    try {
      const version = await this.sprutClient.version();
      
      return {
        content: [
          {
            type: 'text',
            text: `Server version: ${JSON.stringify(version, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to get version');
      throw new Error(`Failed to get version: ${error.message}`);
    }
  }

  async handleDisconnect() {
    if (!this.sprutClient) {
      return {
        content: [
          {
            type: 'text',
            text: 'Not connected to Spruthub server',
          },
        ],
      };
    }

    try {
      await this.sprutClient.close();
      this.sprutClient = null;
      
      return {
        content: [
          {
            type: 'text',
            text: 'Successfully disconnected from Spruthub server',
          },
        ],
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to disconnect');
      throw new Error(`Failed to disconnect: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('Spruthub MCP server started');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SpruthubMCPServer();
  server.run().catch((error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
  });
}