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
        target: 'pino/file',
        options: {
          destination: '/tmp/spruthub-mcp.log',
        },
      },
    });

    this.sprutClient = null;
    this.setupToolHandlers();
    this.setupGracefulShutdown();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
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
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'spruthub_execute':
            return await this.handleExecute(args);
          case 'spruthub_version':
            return await this.handleVersion();
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

  async ensureConnected() {
    if (!this.sprutClient) {
      const wsUrl = process.env.SPRUTHUB_WS_URL;
      const sprutEmail = process.env.SPRUTHUB_EMAIL;
      const sprutPassword = process.env.SPRUTHUB_PASSWORD;
      const serial = process.env.SPRUTHUB_SERIAL;

      if (!wsUrl || !sprutEmail || !sprutPassword || !serial) {
        throw new Error('Not connected and missing required connection parameters. Set environment variables: SPRUTHUB_WS_URL, SPRUTHUB_EMAIL, SPRUTHUB_PASSWORD, SPRUTHUB_SERIAL');
      }

      this.logger.info('Auto-connecting to Spruthub server...');
      
      try {
        this.sprutClient = new Sprut({
          wsUrl,
          sprutEmail,
          sprutPassword,
          serial,
          logger: this.logger,
        });

        await this.sprutClient.connected();
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to connect to Spruthub');
        throw new Error(`Failed to connect: ${error.message}`);
      }
    }
  }

  async handleExecute(args) {
    await this.ensureConnected();

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
    await this.ensureConnected();

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

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      if (this.sprutClient) {
        try {
          await this.sprutClient.close();
          this.logger.info('Successfully disconnected from Spruthub server');
        } catch (error) {
          this.logger.error({ error: error.message }, 'Failed to disconnect gracefully');
        }
      }
      
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('exit', () => {
      if (this.sprutClient) {
        this.logger.info('Process exiting, cleaning up connection...');
      }
    });
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
    process.stderr.write(`Server failed to start: ${error}\n`);
    process.exit(1);
  });
}