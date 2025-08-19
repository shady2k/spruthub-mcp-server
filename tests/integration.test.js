import { jest } from '@jest/globals';

const mockServer = {
  setRequestHandler: jest.fn(),
  connect: jest.fn()
};

const mockTransport = {};

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer)
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => mockTransport)
}));

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  level: 'info'
};

jest.unstable_mockModule('pino', () => ({
  default: jest.fn(() => mockLogger)
}));

jest.unstable_mockModule('spruthub-client', () => ({
  Sprut: jest.fn()
}));

const { SpruthubMCPServer } = await import('../src/index.js');

describe('SpruthubMCPServer Integration', () => {
  let server;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();
    mockLogger.warn.mockClear();
    process.setMaxListeners(20);
    server = new SpruthubMCPServer();
  });

  afterEach(() => {
    if (server && server.sprutClient) {
      server.sprutClient = null;
    }
  });

  describe('Tool Registration', () => {
    test('should register ListTools handler', () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.any(Object), // ListToolsRequestSchema
        expect.any(Function)
      );
    });

    test('should register CallTool handler', () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.any(Object), // CallToolRequestSchema
        expect.any(Function)
      );
    });

    test('should register exactly 2 handlers', () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Server Startup', () => {
    test('should connect to transport and start server', async () => {
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
      
      await server.run();

      expect(StdioServerTransport).toHaveBeenCalled();
      expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);
    });
  });

  describe('Tool Definitions', () => {
    test('should provide correct tool definitions', async () => {
      const listToolsCall = mockServer.setRequestHandler.mock.calls
        .find(call => call.length >= 2);
      expect(listToolsCall).toBeDefined();
      
      const listToolsHandler = listToolsCall[1];
      const result = await listToolsHandler();

      expect(result.tools).toHaveLength(2);
      expect(result.tools.map(tool => tool.name)).toEqual([
        'spruthub_execute',
        'spruthub_version'
      ]);
    });

    test('should have correct schema for spruthub_execute tool', async () => {
      const listToolsCall = mockServer.setRequestHandler.mock.calls
        .find(call => call.length >= 2);
      expect(listToolsCall).toBeDefined();
      
      const listToolsHandler = listToolsCall[1];
      const result = await listToolsHandler();
      const executeTool = result.tools.find(tool => tool.name === 'spruthub_execute');

      expect(executeTool.inputSchema.required).toEqual([
        'command', 'accessoryId', 'serviceId', 'characteristicId', 'value'
      ]);
      expect(executeTool.inputSchema.properties.command.enum).toEqual(['update']);
      expect(executeTool.inputSchema.properties.value.type).toBe('boolean');
    });
  });
});