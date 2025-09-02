#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Schema } from 'spruthub-client';
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

    
    this.setupToolHandlers();
    this.setupGracefulShutdown();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'spruthub_list_methods',
            description: 'List all available Sprut.hub JSON-RPC API methods with their categories and descriptions',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Filter methods by category (hub, accessory, scenario, room, system)',
                },
              },
            },
          },
          {
            name: 'spruthub_get_method_schema',
            description: 'Get detailed schema for a specific Sprut.hub API method including parameters, return type, examples, and REST mapping',
            inputSchema: {
              type: 'object',
              properties: {
                methodName: {
                  type: 'string',
                  description: 'The method name (e.g., "hub.list", "characteristic.update")',
                },
              },
              required: ['methodName'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'spruthub_list_methods':
            return await this.handleListMethods(args);
          case 'spruthub_get_method_schema':
            return await this.handleGetMethodSchema(args);
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

  async handleListMethods(args = {}) {
    try {
      const { category } = args;
      
      let methods;
      if (category) {
        // Filter by category
        methods = Schema.getMethodsByCategory(category);
        if (Object.keys(methods).length === 0) {
          // Check if category exists
          const availableCategories = Schema.getCategories();
          if (!availableCategories.includes(category)) {
            throw new Error(`Unknown category: ${category}. Available categories: ${availableCategories.join(', ')}`);
          }
        }
      } else {
        // Get all methods
        const allMethodNames = Schema.getAvailableMethods();
        methods = {};
        allMethodNames.forEach(methodName => {
          methods[methodName] = Schema.getMethodSchema(methodName);
        });
      }

      // Format the response with method summaries
      const methodSummaries = Object.keys(methods).map(methodName => {
        const method = methods[methodName];
        return {
          name: methodName,
          category: method.category,
          description: method.description,
          hasRest: !!method.rest,
          restMapping: method.rest ? `${method.rest.method} ${method.rest.path}` : null
        };
      });

      const content = [
        {
          type: 'text',
          text: category ? 
            `Found ${methodSummaries.length} methods in category "${category}":` :
            `Found ${methodSummaries.length} available API methods:`,
        },
        {
          type: 'text',
          text: JSON.stringify(methodSummaries, null, 2),
        },
      ];

      return {
        content: this.processResponse(content),
        _meta: {
          methods: methodSummaries,
          totalCount: methodSummaries.length,
          category: category || 'all',
          availableCategories: Schema.getCategories()
        }
      };
    } catch (error) {
      this.logger.error(`Failed to list methods: ${error.message}`);
      throw new Error(`Failed to list methods: ${error.message}`);
    }
  }

  async handleGetMethodSchema(args) {
    try {
      const { methodName } = args;
      
      if (!methodName) {
        throw new Error('methodName parameter is required');
      }

      const schema = Schema.getMethodSchema(methodName);
      if (!schema) {
        const availableMethods = Schema.getAvailableMethods();
        throw new Error(`Method "${methodName}" not found. Available methods: ${availableMethods.slice(0, 10).join(', ')}${availableMethods.length > 10 ? '...' : ''}`);
      }

      const content = [
        {
          type: 'text',
          text: `Schema for "${methodName}":`,
        },
        {
          type: 'text',
          text: JSON.stringify(schema, null, 2),
        },
      ];

      return {
        content: this.processResponse(content),
        _meta: {
          methodName,
          schema,
          category: schema.category,
          hasRest: !!schema.rest,
          hasExamples: !!(schema.examples && schema.examples.length > 0)
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get method schema: ${error.message}`);
      throw new Error(`Failed to get method schema: ${error.message}`);
    }
  }

  processResponse(content) {
    // Simple pass-through since we don't need token protection for schema tools
    return content;
  }


  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
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