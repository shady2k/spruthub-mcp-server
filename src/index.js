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
            name: 'spruthub_list_rooms',
            description: 'List all rooms in the Spruthub system',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'spruthub_list_hubs',
            description: 'List all Spruthub hubs with their status and version info',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'spruthub_list_accessories',
            description: 'List smart home accessories/devices with optional filtering',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'number',
                  description: 'Filter devices by room ID (optional)',
                },
                controllableOnly: {
                  type: 'boolean',
                  description: 'Only return devices with controllable characteristics (default: false)',
                  default: false,
                },
                summary: {
                  type: 'boolean',
                  description: 'Return summarized info instead of full details (default: true for performance)',
                  default: true,
                },
              },
            },
          },
          {
            name: 'spruthub_get_device_info',
            description: 'Get detailed information for a specific device',
            inputSchema: {
              type: 'object',
              properties: {
                accessoryId: {
                  type: 'number',
                  description: 'ID of the accessory to get info for',
                },
              },
              required: ['accessoryId'],
            },
          },
          {
            name: 'spruthub_execute',
            description: 'Execute a command on a Spruthub device (turn lights on/off, control switches, etc.)',
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
                  description: 'Boolean value to set for the characteristic (true = on/open, false = off/closed)',
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
          case 'spruthub_list_rooms':
            return await this.handleListRooms();
          case 'spruthub_list_hubs':
            return await this.handleListHubs();
          case 'spruthub_list_accessories':
            return await this.handleListAccessories(args);
          case 'spruthub_get_device_info':
            return await this.handleGetDeviceInfo(args);
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

  async handleListRooms() {
    await this.ensureConnected();

    try {
      const result = await this.sprutClient.listRooms();
      
      if (!result.isSuccess) {
        throw new Error(`API Error: ${result.message || 'Unknown error'}`);
      }

      const rooms = result.data || [];
      const roomSummary = rooms.map(room => ({
        id: room.id,
        name: room.name,
        visible: room.visible
      }));
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${rooms.length} rooms in the Spruthub system`,
          },
          {
            type: 'text',
            text: `Rooms: ${JSON.stringify(roomSummary, null, 2)}`,
          },
        ],
        _meta: {
          rooms: roomSummary,
          totalCount: rooms.length
        }
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to list rooms');
      throw new Error(`Failed to list rooms: ${error.message}`);
    }
  }

  async handleListHubs() {
    await this.ensureConnected();

    try {
      const result = await this.sprutClient.listHubs();
      
      if (!result.isSuccess) {
        throw new Error(`API Error: ${result.message || 'Unknown error'}`);
      }

      const hubs = result.data || [];
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${hubs.length} Spruthub hub${hubs.length !== 1 ? 's' : ''}`,
          },
          {
            type: 'text',
            text: `Hubs: ${JSON.stringify(hubs, null, 2)}`,
          },
        ],
        _meta: {
          hubs: hubs,
          totalCount: hubs.length
        }
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to list hubs');
      throw new Error(`Failed to list hubs: ${error.message}`);
    }
  }

  async handleListAccessories(args = {}) {
    await this.ensureConnected();

    try {
      const { roomId, controllableOnly = false, summary = true } = args;
      const result = await this.sprutClient.listAccessories();
      
      if (!result.isSuccess) {
        throw new Error(`API Error: ${result.message || 'Unknown error'}`);
      }

      let accessories = result.data || [];
      
      // Filter by room if specified
      if (roomId !== undefined) {
        accessories = this.sprutClient.getDevicesByRoom(accessories, roomId);
      }
      
      // Filter to only controllable devices if requested
      if (controllableOnly) {
        const controllable = this.sprutClient.getControllableCharacteristics(accessories);
        const controllableIds = new Set(controllable.map(c => c.accessoryId));
        accessories = accessories.filter(acc => controllableIds.has(acc.id));
      }
      
      let responseData;
      if (summary) {
        // Return summarized data for performance
        responseData = accessories.map(acc => ({
          id: acc.id,
          name: acc.name,
          manufacturer: acc.manufacturer,
          model: acc.model,
          online: acc.online,
          roomId: acc.roomId,
          servicesCount: acc.services ? acc.services.length : 0,
          controllable: acc.services ? 
            acc.services.some(s => s.characteristics && 
              s.characteristics.some(c => c.control && c.control.write)) : false
        }));
      } else {
        responseData = accessories;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${accessories.length} accessor${accessories.length !== 1 ? 'ies' : 'y'}${roomId ? ` in room ${roomId}` : ''}${controllableOnly ? ' (controllable only)' : ''}`,
          },
          {
            type: 'text', 
            text: `Accessories: ${JSON.stringify(responseData, null, 2)}`,
          },
        ],
        _meta: {
          accessories: responseData,
          totalCount: accessories.length,
          filters: {
            roomId: roomId,
            controllableOnly: controllableOnly,
            summary: summary
          }
        }
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to list accessories');
      throw new Error(`Failed to list accessories: ${error.message}`);
    }
  }

  async handleGetDeviceInfo(args) {
    await this.ensureConnected();

    try {
      const { accessoryId } = args;
      const result = await this.sprutClient.listAccessories();
      
      if (!result.isSuccess) {
        throw new Error(`API Error: ${result.message || 'Unknown error'}`);
      }

      const deviceInfo = this.sprutClient.getDeviceInfo(result.data, parseInt(accessoryId));
      
      if (!deviceInfo) {
        throw new Error(`Device with ID ${accessoryId} not found`);
      }
      
      // Also get controllable characteristics for this device
      const controllable = this.sprutClient.getControllableCharacteristics([deviceInfo]);
      
      const deviceData = {
        device: deviceInfo,
        controllableCharacteristics: controllable
      };
      
      return {
        content: [
          {
            type: 'text',
            text: `Device "${deviceInfo.name}" (ID: ${accessoryId}) - ${deviceInfo.manufacturer} ${deviceInfo.model}`,
          },
          {
            type: 'text',
            text: `Status: ${deviceInfo.online ? 'Online' : 'Offline'} | Room ID: ${deviceInfo.roomId} | Controllable characteristics: ${controllable.length}`,
          },
          {
            type: 'text',
            text: `Full device data: ${JSON.stringify(deviceData, null, 2)}`,
          },
        ],
        _meta: {
          device: deviceInfo,
          controllableCharacteristics: controllable,
          accessoryId: parseInt(accessoryId),
          isOnline: deviceInfo.online,
          roomId: deviceInfo.roomId
        }
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to get device info');
      throw new Error(`Failed to get device info: ${error.message}`);
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