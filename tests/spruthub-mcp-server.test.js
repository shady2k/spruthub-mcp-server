import { jest } from '@jest/globals';

const mockSprut = {
  connected: jest.fn(),
  execute: jest.fn(),
  version: jest.fn(),
  close: jest.fn()
};

const mockSprutConstructor = jest.fn().mockImplementation(() => mockSprut);

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
  Sprut: mockSprutConstructor
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn()
  }))
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn()
}));

const { SpruthubMCPServer } = await import('../src/index.js');

describe('SpruthubMCPServer', () => {
  let server;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSprutConstructor.mockClear();
    mockSprut.connected.mockClear();
    mockSprut.execute.mockClear();
    mockSprut.version.mockClear();
    mockSprut.close.mockClear();
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();
    mockLogger.warn.mockClear();
    
    process.setMaxListeners(20);
  });

  afterEach(() => {
    if (server && server.sprutClient) {
      server.sprutClient = null;
    }
  });

  describe('Constructor', () => {
    test('should initialize server with correct configuration', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      
      server = new SpruthubMCPServer();

      expect(Server).toHaveBeenCalledWith(
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
    });

    test('should initialize logger with correct configuration', () => {
      server = new SpruthubMCPServer();
      expect(server.logger).toBeDefined();
    });

    test('should initialize sprutClient as null', () => {
      server = new SpruthubMCPServer();
      expect(server.sprutClient).toBeNull();
    });
  });

  describe('handleExecute', () => {
    beforeEach(() => {
      server = new SpruthubMCPServer();
    });

    test('should throw error when not connected', async () => {
      const args = {
        command: 'update',
        accessoryId: 'acc1',
        serviceId: 'svc1',
        characteristicId: 'char1',
        value: true
      };

      await expect(server.handleExecute(args)).rejects.toThrow('Not connected and missing required connection parameters. Set environment variables: SPRUTHUB_WS_URL, SPRUTHUB_EMAIL, SPRUTHUB_PASSWORD, SPRUTHUB_SERIAL');
    });

    test('should successfully execute command when connected', async () => {
      server.sprutClient = mockSprut;
      const args = {
        command: 'update',
        accessoryId: 'acc1',
        serviceId: 'svc1',
        characteristicId: 'char1',
        value: true
      };

      const mockResult = { success: true };
      mockSprut.execute.mockResolvedValue(mockResult);

      const result = await server.handleExecute(args);

      expect(mockSprut.execute).toHaveBeenCalledWith('update', {
        accessoryId: 'acc1',
        serviceId: 'svc1',
        characteristicId: 'char1',
        control: { value: true }
      });
      expect(result.content[0].text).toContain('Command executed successfully');
      expect(result.content[0].text).toContain(JSON.stringify(mockResult, null, 2));
    });

    test('should handle execution errors', async () => {
      server.sprutClient = mockSprut;
      const args = {
        command: 'update',
        accessoryId: 'acc1',
        serviceId: 'svc1',
        characteristicId: 'char1',
        value: true
      };

      mockSprut.execute.mockRejectedValue(new Error('Execution failed'));

      await expect(server.handleExecute(args)).rejects.toThrow('Failed to execute command: Execution failed');
    });
  });

  describe('handleVersion', () => {
    beforeEach(() => {
      server = new SpruthubMCPServer();
    });

    test('should throw error when not connected', async () => {
      await expect(server.handleVersion()).rejects.toThrow('Not connected and missing required connection parameters. Set environment variables: SPRUTHUB_WS_URL, SPRUTHUB_EMAIL, SPRUTHUB_PASSWORD, SPRUTHUB_SERIAL');
    });

    test('should successfully get version when connected', async () => {
      server.sprutClient = mockSprut;
      const mockVersion = { version: '1.2.3', build: '456' };
      mockSprut.version.mockResolvedValue(mockVersion);

      const result = await server.handleVersion();

      expect(mockSprut.version).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Server version');
      expect(result.content[0].text).toContain(JSON.stringify(mockVersion, null, 2));
    });

    test('should handle version errors', async () => {
      server.sprutClient = mockSprut;
      mockSprut.version.mockRejectedValue(new Error('Version failed'));

      await expect(server.handleVersion()).rejects.toThrow('Failed to get version: Version failed');
    });
  });

});