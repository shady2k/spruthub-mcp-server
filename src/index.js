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
import { fileURLToPath } from 'url';
import fs from 'fs';

export class SpruthubMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'spruthub-mcp-server',
        version: '1.3.6',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.logger = {
      info: (msg, ...args) => console.error('[INFO]', typeof msg === 'object' ? JSON.stringify(msg) : msg, ...args),
      error: (msg, ...args) => console.error('[ERROR]', typeof msg === 'object' ? JSON.stringify(msg) : msg, ...args),
      warn: (msg, ...args) => console.error('[WARN]', typeof msg === 'object' ? JSON.stringify(msg) : msg, ...args),
      debug: (msg, ...args) => process.env.LOG_LEVEL === 'debug' && console.error('[DEBUG]', typeof msg === 'object' ? JSON.stringify(msg) : msg, ...args)
    };

    this.sprutClient = null;
    
    // Token consumption protection settings - More aggressive defaults for Claude Desktop
    this.tokenLimits = {
      maxResponseSize: parseInt(process.env.SPRUTHUB_MAX_RESPONSE_SIZE) || 50000, // Increased from 25k to 50k
      maxDevicesPerPage: parseInt(process.env.SPRUTHUB_MAX_DEVICES_PER_PAGE) || 20, // Reduced from 100 to 20
      warnThreshold: parseInt(process.env.SPRUTHUB_WARN_THRESHOLD) || 30000, // Increased from 15k to 30k
      enableTruncation: process.env.SPRUTHUB_ENABLE_TRUNCATION !== 'false',
      forceSmartDefaults: process.env.SPRUTHUB_FORCE_SMART_DEFAULTS !== 'false', // New: Force efficient defaults
      autoSummaryThreshold: parseInt(process.env.SPRUTHUB_AUTO_SUMMARY_THRESHOLD) || 10 // Auto-enable summary mode above this count
    };
    
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
            description: 'List smart home accessories/devices with advanced filtering. ⚠️ TRUNCATION WARNING: Responses >25,000 chars are automatically truncated - use pagination (page/limit) and summary=true to avoid data loss. DEFAULTS: summary=true for efficiency, limit=20 max per page. Auto-optimizes: summary mode for >10 devices, smaller pages for >50 devices, metaOnly for >100 devices. LANGUAGE MATCHING: Use nameFilter with terms in the same language you are communicating with the user (e.g., if speaking Russian, search for "датчик воздуха", if English, search for "air sensor"). Use deviceTypeFilter="air_quality" for capability-based search. Always use filters and pagination for large datasets.',
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
                  description: 'Return summarized info (name, manufacturer, model, online status, controllable flag) instead of full device details with all services/characteristics. CRITICAL: Use summary=true (default) for browsing and exploration to avoid truncation. Use summary=false ONLY when you need detailed device services, characteristics, or specific sensor values - but expect truncation for large responses >50k chars. Auto-enabled for >10 devices.',
                  default: true,
                },
                page: {
                  type: 'number',
                  description: 'Page number for pagination (1-based, default: 1)',
                  default: 1,
                },
                limit: {
                  type: 'number',
                  description: 'Maximum devices per page (default: 20, enforced max: 20). TRUNCATION RISK: Large limits with summary=false may exceed 50k char limit and get truncated. Use smaller limits (5-10) when summary=false or for detailed device exploration.',
                  default: 20,
                },
                metaOnly: {
                  type: 'boolean',
                  description: 'Return only count and pagination info, no device details (default: false, auto-enabled for >100 devices). Use for initial system exploration to avoid truncation. Perfect for understanding system size before detailed queries.',
                  default: false,
                },
                nameFilter: {
                  type: 'string',
                  description: 'Filter devices by name (case-insensitive substring match). Use terms in the same language as your conversation with the user - if communicating in Russian, use Russian terms like "датчик", "свет", "температура"; if in English, use English terms like "sensor", "light", "temperature".',
                },
                deviceTypeFilter: {
                  type: 'string',
                  description: 'Filter devices by type/capability (e.g., "air_quality", "temperature", "humidity", "co2", "pm25", "light", "switch"). Searches device services for matching sensor types.',
                },
                manufacturerFilter: {
                  type: 'string',
                  description: 'Filter devices by manufacturer (case-insensitive substring match)',
                },
                modelFilter: {
                  type: 'string',
                  description: 'Filter devices by model (case-insensitive substring match)',
                },
                onlineOnly: {
                  type: 'boolean',
                  description: 'Only return online devices (default: false)',
                  default: false,
                },
                offlineOnly: {
                  type: 'boolean',
                  description: 'Only return offline devices (default: false)',
                  default: false,
                },
              },
            },
          },
          {
            name: 'spruthub_count_accessories',
            description: 'Get count of accessories with optional filtering (minimal token usage)',
            inputSchema: {
              type: 'object',
              properties: {
                roomId: {
                  type: 'number',
                  description: 'Filter devices by room ID (optional)',
                },
                controllableOnly: {
                  type: 'boolean',
                  description: 'Only count devices with controllable characteristics (default: false)',
                  default: false,
                },
                nameFilter: {
                  type: 'string',
                  description: 'Filter devices by name (case-insensitive substring match). Use terms in the same language as your conversation with the user - if communicating in Russian, use Russian terms like "датчик", "свет", "температура"; if in English, use English terms like "sensor", "light", "temperature".',
                },
                deviceTypeFilter: {
                  type: 'string',
                  description: 'Filter devices by type/capability (e.g., "air_quality", "temperature", "humidity", "co2", "pm25", "light", "switch")',
                },
                manufacturerFilter: {
                  type: 'string',
                  description: 'Filter devices by manufacturer (case-insensitive substring match)',
                },
                modelFilter: {
                  type: 'string',
                  description: 'Filter devices by model (case-insensitive substring match)',
                },
                onlineOnly: {
                  type: 'boolean',
                  description: 'Only count online devices (default: false)',
                  default: false,
                },
                offlineOnly: {
                  type: 'boolean',
                  description: 'Only count offline devices (default: false)',
                  default: false,
                },
              },
            },
          },
          {
            name: 'spruthub_get_device_info',
            description: 'Get detailed information for a specific device. Large responses are automatically truncated to protect against excessive token usage.',
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
          {
            name: 'spruthub_usage_guide',
            description: 'Get token-efficient usage recommendations and current system statistics. Always use this first for large systems.',
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
          case 'spruthub_count_accessories':
            return await this.handleCountAccessories(args);
          case 'spruthub_get_device_info':
            return await this.handleGetDeviceInfo(args);
          case 'spruthub_execute':
            return await this.handleExecute(args);
          case 'spruthub_version':
            return await this.handleVersion();
          case 'spruthub_usage_guide':
            return await this.handleUsageGuide();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        this.logger.error(`Tool execution failed: ${error.message}`);
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }


  applyAccessoryFilters(accessories, filters) {
    let filtered = accessories;
    
    const {
      roomId,
      controllableOnly = false,
      nameFilter,
      deviceTypeFilter,
      manufacturerFilter,
      modelFilter,
      onlineOnly = false,
      offlineOnly = false
    } = filters;
    
    // Filter by room if specified
    if (roomId !== undefined) {
      filtered = this.sprutClient.getDevicesByRoom(filtered, roomId);
    }
    
    // Filter to only controllable devices if requested
    if (controllableOnly) {
      const controllable = this.sprutClient.getControllableCharacteristics(filtered);
      const controllableIds = new Set(controllable.map(c => c.accessoryId));
      filtered = filtered.filter(acc => controllableIds.has(acc.id));
    }
    
    // Filter by name (case-insensitive substring match)
    if (nameFilter) {
      const nameSearch = nameFilter.toLowerCase();
      filtered = filtered.filter(acc => {
        if (!acc.name) return false;
        return acc.name.toLowerCase().includes(nameSearch);
      });
    }
    
    // Filter by device type/capability (searches services for matching sensor types)
    if (deviceTypeFilter) {
      const typeSearch = deviceTypeFilter.toLowerCase();
      filtered = filtered.filter(acc => {
        if (!acc.services || !Array.isArray(acc.services)) return false;
        
        // Check service types and characteristics for matching capabilities
        return acc.services.some(service => {
          // Check service type
          if (service.type && service.type.toLowerCase().includes(typeSearch)) {
            return true;
          }
          
          // Check characteristic types for sensor capabilities
          if (service.characteristics && Array.isArray(service.characteristics)) {
            return service.characteristics.some(char => {
              if (!char.type) return false;
              const charType = char.type.toLowerCase();
              
              // Map common type filters to HomeKit characteristic types
              const typeMap = {
                'air_quality': ['airqualitysensor', 'airquality'],
                'temperature': ['temperature', 'currenttemperature'],
                'humidity': ['humidity', 'currentrelativehumidity'],
                'co2': ['carbondioxide', 'co2'],
                'pm25': ['pm2_5density', 'pm25'],
                'pm10': ['pm10density', 'pm10'],
                'voc': ['vocdensity', 'voc'],
                'light': ['brightness', 'hue', 'saturation', 'on'],
                'switch': ['on', 'switch'],
                'motion': ['motiondetected', 'motion'],
                'contact': ['contactsensorstate', 'contact']
              };
              
              // Check if the type filter matches any mapped characteristic
              if (typeMap[typeSearch]) {
                return typeMap[typeSearch].some(mappedType => 
                  charType.includes(mappedType.toLowerCase())
                );
              }
              
              // Direct substring match as fallback
              return charType.includes(typeSearch);
            });
          }
          
          return false;
        });
      });
    }
    
    // Filter by manufacturer (case-insensitive substring match)
    if (manufacturerFilter) {
      const mfgSearch = manufacturerFilter.toLowerCase();
      filtered = filtered.filter(acc => 
        acc.manufacturer && acc.manufacturer.toLowerCase().includes(mfgSearch)
      );
    }
    
    // Filter by model (case-insensitive substring match)
    if (modelFilter) {
      const modelSearch = modelFilter.toLowerCase();
      filtered = filtered.filter(acc => 
        acc.model && acc.model.toLowerCase().includes(modelSearch)
      );
    }
    
    // Filter by online status
    if (onlineOnly) {
      filtered = filtered.filter(acc => acc.online === true);
    } else if (offlineOnly) {
      filtered = filtered.filter(acc => acc.online === false);
    }
    
    return filtered;
  }

  buildFilterDescription(filters) {
    const {
      roomId, controllableOnly, nameFilter, deviceTypeFilter, manufacturerFilter,
      modelFilter, onlineOnly, offlineOnly
    } = filters;
    
    const parts = [];
    
    if (roomId !== undefined) parts.push(`in room ${roomId}`);
    if (controllableOnly) parts.push('controllable only');
    if (nameFilter) parts.push(`name contains "${nameFilter}"`);
    if (deviceTypeFilter) parts.push(`type: "${deviceTypeFilter}"`);
    if (manufacturerFilter) parts.push(`manufacturer contains "${manufacturerFilter}"`);
    if (modelFilter) parts.push(`model contains "${modelFilter}"`);
    if (onlineOnly) parts.push('online only');
    if (offlineOnly) parts.push('offline only');
    
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  }

  // Token consumption protection methods
  getSmartDefaults(totalCount, requestedParams = {}) {
    const defaults = { ...requestedParams };
    
    if (this.tokenLimits.forceSmartDefaults) {
      // Force summary mode for larger datasets
      if (totalCount > this.tokenLimits.autoSummaryThreshold && defaults.summary === undefined) {
        defaults.summary = true;
        this.logger.info(`Auto-enabling summary mode for large dataset (totalCount: ${totalCount}, threshold: ${this.tokenLimits.autoSummaryThreshold})`);
      }
      
      // Force smaller page sizes for large datasets
      if (totalCount > 50 && (!defaults.limit || defaults.limit > 10)) {
        defaults.limit = Math.min(defaults.limit || 10, 10);
        this.logger.info(`Auto-reducing page size for large dataset (totalCount: ${totalCount}, limit: ${defaults.limit})`);
      }
      
      // For very large datasets, suggest metaOnly mode
      if (totalCount > 100 && defaults.metaOnly === undefined) {
        defaults.metaOnly = true;
        this.logger.info(`Auto-enabling metaOnly mode for very large dataset (totalCount: ${totalCount})`);
      }
    }
    
    return defaults;
  }

  checkResponseSize(content) {
    const responseText = JSON.stringify(content);
    const size = responseText.length;
    
    if (size > this.tokenLimits.warnThreshold) {
      this.logger.warn(`Large response detected - consider using pagination or summary mode (responseSize: ${size}, threshold: ${this.tokenLimits.warnThreshold})`);
    }
    
    return { size, responseText };
  }

  truncateResponse(content, originalSize) {
    if (!this.tokenLimits.enableTruncation || originalSize <= this.tokenLimits.maxResponseSize) {
      return content;
    }

    // Create truncated version
    const truncatedContent = [...content];
    
    // Add truncation warning to the first text content
    if (truncatedContent.length > 0 && truncatedContent[0].type === 'text') {
      truncatedContent[0].text = `⚠️  RESPONSE TRUNCATED (${originalSize} chars > ${this.tokenLimits.maxResponseSize} limit)\n${truncatedContent[0].text}`;
    } else {
      truncatedContent.unshift({
        type: 'text',
        text: `⚠️  RESPONSE TRUNCATED (${originalSize} chars > ${this.tokenLimits.maxResponseSize} limit)`
      });
    }
    
    // Truncate the text content to fit within limits
    let totalSize = JSON.stringify(truncatedContent).length;
    if (totalSize > this.tokenLimits.maxResponseSize) {
      for (const item of truncatedContent) {
        if (item.type === 'text') {
          const maxTextLength = Math.floor(this.tokenLimits.maxResponseSize / truncatedContent.length) - 200; // Leave room for other content and truncation message
          if (item.text.length > maxTextLength && maxTextLength > 100) {
            item.text = item.text.substring(0, maxTextLength) + '\n... [TRUNCATED - Use pagination or summary mode for full data]';
          }
        }
      }
    }
    
    this.logger.warn(`Response truncated due to size limit (originalSize: ${originalSize}, limit: ${this.tokenLimits.maxResponseSize})`);
    
    return truncatedContent;
  }

  processResponse(content) {
    const { size } = this.checkResponseSize(content);
    
    if (size > this.tokenLimits.maxResponseSize) {
      return this.truncateResponse(content, size);
    }
    
    return content;
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
        this.logger.error(`Failed to connect to Spruthub: ${error.message}`);
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

      const content = [
        {
          type: 'text',
          text: `Command executed successfully: ${JSON.stringify(result, null, 2)}`,
        },
      ];

      return {
        content: this.processResponse(content),
      };
    } catch (error) {
      this.logger.error(`Failed to execute command: ${error.message}`);
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
      
      const content = [
        {
          type: 'text',
          text: `Found ${rooms.length} rooms in the Spruthub system`,
        },
        {
          type: 'text',
          text: `Rooms: ${JSON.stringify(roomSummary, null, 2)}`,
        },
      ];

      return {
        content: this.processResponse(content),
        _meta: {
          rooms: roomSummary,
          totalCount: rooms.length
        }
      };
    } catch (error) {
      this.logger.error(`Failed to list rooms: ${error.message}`);
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
      
      const content = [
        {
          type: 'text',
          text: `Found ${hubs.length} Spruthub hub${hubs.length !== 1 ? 's' : ''}`,
        },
        {
          type: 'text',
          text: `Hubs: ${JSON.stringify(hubs, null, 2)}`,
        },
      ];

      return {
        content: this.processResponse(content),
        _meta: {
          hubs: hubs,
          totalCount: hubs.length
        }
      };
    } catch (error) {
      this.logger.error(`Failed to list hubs: ${error.message}`);
      throw new Error(`Failed to list hubs: ${error.message}`);
    }
  }

  async handleListAccessories(args = {}) {
    await this.ensureConnected();

    try {
      // Get initial data to determine smart defaults
      const result = await this.sprutClient.listAccessories();
      
      if (!result.isSuccess) {
        throw new Error(`API Error: ${result.message || 'Unknown error'}`);
      }

      let accessories = result.data || [];
      
      // Apply basic filters first to get accurate count for smart defaults
      const preFilterArgs = {
        roomId: args.roomId,
        controllableOnly: args.controllableOnly || false,
        nameFilter: args.nameFilter,
        deviceTypeFilter: args.deviceTypeFilter,
        manufacturerFilter: args.manufacturerFilter,
        modelFilter: args.modelFilter,
        onlineOnly: args.onlineOnly || false,
        offlineOnly: args.offlineOnly || false
      };
      
      // Pre-filter to get accurate count
      const preFiltered = this.applyAccessoryFilters(accessories, preFilterArgs);
      const unfilteredCount = preFiltered.length;
      
      // Get smart defaults based on actual data size
      const smartDefaults = this.getSmartDefaults(unfilteredCount, args);
      
      const { 
        roomId, 
        controllableOnly = false, 
        summary = smartDefaults.summary !== undefined ? smartDefaults.summary : true, 
        page = 1, 
        limit = smartDefaults.limit || 20, // Reduced default from 50 to 20
        metaOnly = smartDefaults.metaOnly || false,
        nameFilter,
        deviceTypeFilter,
        manufacturerFilter,
        modelFilter,
        onlineOnly = false,
        offlineOnly = false
      } = { ...args, ...smartDefaults };
      
      // Validate pagination parameters with token protection
      const pageNum = Math.max(1, parseInt(page));
      const pageSize = Math.min(
        this.tokenLimits.maxDevicesPerPage, 
        Math.max(1, parseInt(limit))
      );
      
      // Use the pre-filtered accessories (already filtered)
      accessories = preFiltered;
      
      const totalCount = accessories.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const startIndex = (pageNum - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedAccessories = accessories.slice(startIndex, endIndex);
      
      // Generate filter description for display
      const filterDesc = this.buildFilterDescription({
        roomId, controllableOnly, nameFilter, deviceTypeFilter, manufacturerFilter, 
        modelFilter, onlineOnly, offlineOnly
      });
      
      // If metaOnly is true, return just counts and summary
      if (metaOnly) {
        const content = [
          {
            type: 'text',
            text: `Found ${totalCount} accessor${totalCount !== 1 ? 'ies' : 'y'}${filterDesc}`,
          },
          {
            type: 'text',
            text: `Total pages: ${totalPages} (page ${pageNum} of ${totalPages}, ${pageSize} items per page)`,
          },
        ];

        return {
          content: this.processResponse(content),
          _meta: {
            totalCount,
            totalPages,
            currentPage: pageNum,
            pageSize,
            hasMore: pageNum < totalPages,
            filters: { roomId, controllableOnly, nameFilter, deviceTypeFilter, manufacturerFilter, modelFilter, onlineOnly, offlineOnly, summary, metaOnly }
          }
        };
      }
      
      let responseData;
      if (summary) {
        // Return minimal summarized data for performance
        responseData = paginatedAccessories.map(acc => ({
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
        responseData = paginatedAccessories;
      }
      
      const content = [
        {
          type: 'text',
          text: `Page ${pageNum}/${totalPages}: Showing ${paginatedAccessories.length} of ${totalCount} accessor${totalCount !== 1 ? 'ies' : 'y'}${filterDesc}`,
        },
        {
          type: 'text', 
          text: `Accessories: ${JSON.stringify(responseData, null, 2)}`,
        },
      ];

      return {
        content: this.processResponse(content),
        _meta: {
          accessories: responseData,
          totalCount,
          totalPages,
          currentPage: pageNum,
          pageSize,
          hasMore: pageNum < totalPages,
          filters: { roomId, controllableOnly, nameFilter, deviceTypeFilter, manufacturerFilter, modelFilter, onlineOnly, offlineOnly, summary }
        }
      };
    } catch (error) {
      this.logger.error(`Failed to list accessories: ${error.message}`);
      throw new Error(`Failed to list accessories: ${error.message}`);
    }
  }

  async handleCountAccessories(args = {}) {
    await this.ensureConnected();

    try {
      const { 
        roomId, 
        controllableOnly = false,
        nameFilter,
        deviceTypeFilter,
        manufacturerFilter,
        modelFilter,
        onlineOnly = false,
        offlineOnly = false
      } = args;
      const result = await this.sprutClient.listAccessories();
      
      if (!result.isSuccess) {
        throw new Error(`API Error: ${result.message || 'Unknown error'}`);
      }

      let accessories = result.data || [];
      
      // Apply all filters using the helper function
      accessories = this.applyAccessoryFilters(accessories, {
        roomId,
        controllableOnly,
        nameFilter,
        deviceTypeFilter,
        manufacturerFilter,
        modelFilter,
        onlineOnly,
        offlineOnly
      });
      
      const filterDesc = this.buildFilterDescription({
        roomId, controllableOnly, nameFilter, deviceTypeFilter, manufacturerFilter,
        modelFilter, onlineOnly, offlineOnly
      });
      
      const content = [
        {
          type: 'text',
          text: `${accessories.length} accessor${accessories.length !== 1 ? 'ies' : 'y'}${filterDesc}`,
        },
      ];

      return {
        content: this.processResponse(content),
        _meta: {
          count: accessories.length,
          filters: { roomId, controllableOnly, nameFilter, deviceTypeFilter, manufacturerFilter, modelFilter, onlineOnly, offlineOnly }
        }
      };
    } catch (error) {
      this.logger.error(`Failed to count accessories: ${error.message}`);
      throw new Error(`Failed to count accessories: ${error.message}`);
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
      
      const content = [
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
      ];

      return {
        content: this.processResponse(content),
        _meta: {
          device: deviceInfo,
          controllableCharacteristics: controllable,
          accessoryId: parseInt(accessoryId),
          isOnline: deviceInfo.online,
          roomId: deviceInfo.roomId
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get device info: ${error.message}`);
      throw new Error(`Failed to get device info: ${error.message}`);
    }
  }

  async handleVersion() {
    await this.ensureConnected();

    try {
      const version = await this.sprutClient.version();
      
      const content = [
        {
          type: 'text',
          text: `Server version: ${JSON.stringify(version, null, 2)}`,
        },
      ];

      return {
        content: this.processResponse(content),
      };
    } catch (error) {
      this.logger.error(`Failed to get version: ${error.message}`);
      throw new Error(`Failed to get version: ${error.message}`);
    }
  }

  async handleUsageGuide() {
    await this.ensureConnected();

    try {
      // Get system statistics
      const roomsResult = await this.sprutClient.listRooms();
      const accessoriesResult = await this.sprutClient.listAccessories();
      const hubsResult = await this.sprutClient.listHubs();
      
      const roomCount = roomsResult.isSuccess ? (roomsResult.data || []).length : 0;
      const deviceCount = accessoriesResult.isSuccess ? (accessoriesResult.data || []).length : 0;
      const hubCount = hubsResult.isSuccess ? (hubsResult.data || []).length : 0;
      
      let recommendations = [];
      let efficiency = "optimal";
      
      // Generate specific recommendations based on system size
      if (deviceCount > 100) {
        efficiency = "requires-filtering";
        recommendations.push("🚨 LARGE SYSTEM (>100 devices): Always use spruthub_count_accessories first");
        recommendations.push("🚨 ALWAYS use metaOnly=true for initial device exploration");
        recommendations.push("🚨 Use specific filters: roomId, nameFilter, controllableOnly");
        recommendations.push("🚨 Page size auto-limited to 10 items for token efficiency");
      } else if (deviceCount > 50) {
        efficiency = "needs-pagination";
        recommendations.push("⚠️  MEDIUM SYSTEM (>50 devices): Use pagination with limit=10");
        recommendations.push("⚠️  Enable summary=true (auto-enabled)");
        recommendations.push("⚠️  Consider using filters to reduce results");
      } else if (deviceCount > 10) {
        efficiency = "use-summary";
        recommendations.push("ℹ️  Summary mode will be auto-enabled for efficiency");
        recommendations.push("ℹ️  Page size limited to 20 items");
      } else {
        recommendations.push("✅ Small system - full details available without restrictions");
      }
      
      const content = [
        {
          type: 'text',
          text: `🏠 SPRUTHUB SYSTEM OVERVIEW
═══════════════════════════
Hubs: ${hubCount}
Rooms: ${roomCount}  
Devices: ${deviceCount}
Efficiency: ${efficiency.toUpperCase()}

📊 TOKEN PROTECTION SETTINGS
═══════════════════════════
Max Response Size: ${this.tokenLimits.maxResponseSize} chars
Max Devices/Page: ${this.tokenLimits.maxDevicesPerPage}
Warning Threshold: ${this.tokenLimits.warnThreshold} chars
Smart Defaults: ${this.tokenLimits.forceSmartDefaults ? 'ENABLED' : 'disabled'}
Auto Summary Threshold: >${this.tokenLimits.autoSummaryThreshold} devices

🎯 EFFICIENCY RECOMMENDATIONS
═══════════════════════════
${recommendations.join('\n')}

📚 RECOMMENDED WORKFLOW
═════════════════════
1. START: Use spruthub_count_accessories with filters
2. EXPLORE: Use spruthub_list_accessories with metaOnly=true  
3. FILTER: Add roomId, nameFilter, controllableOnly as needed
4. DETAILS: Use spruthub_get_device_info for specific devices
5. CONTROL: Use spruthub_execute for device commands

💡 EFFICIENT FILTER EXAMPLES
═══════════════════════════
• Count devices by room: spruthub_count_accessories + roomId=1
• Find lights only: nameFilter="light" + controllableOnly=true  
• Find air quality sensors: deviceTypeFilter="air_quality" + summary=false
• Language-matched search: nameFilter="датчик" when speaking Russian, nameFilter="sensor" when speaking English
• Temperature sensors: deviceTypeFilter="temperature" + summary=false
• Check specific room: roomId=2 + summary=true + limit=10
• Large system overview: metaOnly=true (auto-enabled >100 devices)`
        },
      ];

      return {
        content: this.processResponse(content),
        _meta: {
          systemStats: { rooms: roomCount, devices: deviceCount, hubs: hubCount },
          efficiency,
          tokenLimits: this.tokenLimits,
          recommendations
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get usage guide: ${error.message}`);
      throw new Error(`Failed to get usage guide: ${error.message}`);
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
          this.logger.error(`Failed to disconnect gracefully: ${error.message}`);
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

// This check is crucial for allowing the script to be executed directly via `node`
// and also correctly when installed and run via `npx`.
//
// `import.meta.url` provides the file URL of the current module.
// `process.argv[1]` is the path to the executed script.
// When run with `npx`, process.argv[1] points to a symlink. We need to resolve
// this to its real path to compare it with the module's actual file path.
const isMainModule = () => {
  try {
    // Get the path of the script that was executed.
    const mainPath = fs.realpathSync(process.argv[1]);
    // Get the path of the current module.
    const modulePath = fileURLToPath(import.meta.url);
    // Compare the two. If they are the same, this is the main module.
    return mainPath === modulePath;
  } catch (error) {
    // If realpathSync fails (e.g., file not found), it's not the main module.
    console.error(`[DEBUG] Error in isMainModule check: ${error.message}`);
    return false;
  }
};

if (isMainModule()) {
  const server = new SpruthubMCPServer();
  server.run().catch((error) => {
    // Use console.error for better formatting and stack traces
    console.error('Server failed to start:', error);
    process.exit(1);
  });
}