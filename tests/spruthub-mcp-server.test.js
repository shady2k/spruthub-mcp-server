import { jest } from '@jest/globals';

const mockSprut = {
  connected: jest.fn(),
  execute: jest.fn(),
  version: jest.fn(),
  close: jest.fn(),
  listRooms: jest.fn(),
  listHubs: jest.fn(),
  listAccessories: jest.fn(),
  getDevicesByRoom: jest.fn(),
  getDeviceInfo: jest.fn(),
  getControllableCharacteristics: jest.fn()
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
    
    delete process.env.SPRUTHUB_WS_URL;
    delete process.env.SPRUTHUB_EMAIL;
    delete process.env.SPRUTHUB_PASSWORD;
    delete process.env.SPRUTHUB_SERIAL;
    
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
          version: '1.3.0',
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

  describe('handleListRooms', () => {
    beforeEach(() => {
      server = new SpruthubMCPServer();
    });

    test('should throw error when not connected', async () => {
      await expect(server.handleListRooms()).rejects.toThrow('Not connected and missing required connection parameters. Set environment variables: SPRUTHUB_WS_URL, SPRUTHUB_EMAIL, SPRUTHUB_PASSWORD, SPRUTHUB_SERIAL');
    });

    test('should successfully list rooms when connected', async () => {
      server.sprutClient = mockSprut;
      const mockRooms = [{ id: 1, name: 'Living Room', visible: true }];
      mockSprut.listRooms.mockResolvedValue({ isSuccess: true, data: mockRooms });

      const result = await server.handleListRooms();

      expect(mockSprut.listRooms).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Found 1 rooms in the Spruthub system');
    });

    test('should handle list rooms errors', async () => {
      server.sprutClient = mockSprut;
      mockSprut.listRooms.mockRejectedValue(new Error('List failed'));

      await expect(server.handleListRooms()).rejects.toThrow('Failed to list rooms: List failed');
    });
  });

  describe('handleListAccessories', () => {
    beforeEach(() => {
      server = new SpruthubMCPServer();
    });

    test('should successfully list accessories with summary', async () => {
      server.sprutClient = mockSprut;
      const mockAccessories = [
        {
          id: 1,
          name: 'Light',
          manufacturer: 'Philips',
          model: 'Hue',
          online: true,
          roomId: 1,
          services: [{
            characteristics: [{
              control: { write: true }
            }]
          }]
        }
      ];
      mockSprut.listAccessories.mockResolvedValue({ isSuccess: true, data: mockAccessories });

      const result = await server.handleListAccessories({ summary: true });

      expect(mockSprut.listAccessories).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Page 1/1: Showing 1 of 1 accessory');
    });

    test('should filter accessories by room', async () => {
      server.sprutClient = mockSprut;
      const mockAccessories = [{ id: 1, name: 'Light', roomId: 1 }];
      mockSprut.listAccessories.mockResolvedValue({ isSuccess: true, data: mockAccessories });
      mockSprut.getDevicesByRoom.mockReturnValue([{ id: 1, name: 'Light', roomId: 1 }]);

      await server.handleListAccessories({ roomId: 1 });

      expect(mockSprut.getDevicesByRoom).toHaveBeenCalledWith(mockAccessories, 1);
    });

    test('should filter accessories by name', async () => {
      server.sprutClient = mockSprut;
      mockSprut.listAccessories.mockResolvedValue({
        isSuccess: true,
        data: [
          { id: 1, name: 'Living Room Light', manufacturer: 'Philips', model: 'Hue', online: true, roomId: 1 },
          { id: 2, name: 'Kitchen Switch', manufacturer: 'Lutron', model: 'Caseta', online: true, roomId: 2 }
        ]
      });

      const result = await server.handleListAccessories({ nameFilter: 'Light' });

      expect(result._meta.totalCount).toBe(1);
      expect(result._meta.accessories[0].name).toBe('Living Room Light');
    });

    test('should find devices with multilingual name filter (Russian air quality)', async () => {
      server.sprutClient = mockSprut;
      mockSprut.listAccessories.mockResolvedValue({
        isSuccess: true,
        data: [
          { id: 1, name: 'Датчик воздуха', manufacturer: 'Xiaomi', online: true },
          { id: 2, name: 'Air Quality Sensor', manufacturer: 'Philips', online: true },
          { id: 3, name: 'Light Switch', manufacturer: 'Lutron', online: true }
        ]
      });

      // Test Russian search term finding both Russian and English devices
      const result = await server.handleListAccessories({ nameFilter: 'air' });
      
      expect(result._meta.totalCount).toBe(2);
      const deviceNames = result._meta.accessories.map(acc => acc.name);
      expect(deviceNames).toContain('Датчик воздуха');
      expect(deviceNames).toContain('Air Quality Sensor');
      expect(deviceNames).not.toContain('Light Switch');
    });

    test('should find devices with deviceTypeFilter', async () => {
      server.sprutClient = mockSprut;
      mockSprut.listAccessories.mockResolvedValue({
        isSuccess: true,
        data: [
          { 
            id: 1, 
            name: 'Air Quality Sensor', 
            manufacturer: 'Xiaomi',
            services: [{
              type: 'AirQualitySensor',
              characteristics: [{ type: 'AirQuality', value: 1 }]
            }]
          },
          { 
            id: 2, 
            name: 'Temperature Sensor', 
            manufacturer: 'Philips',
            services: [{
              type: 'TemperatureSensor', 
              characteristics: [{ type: 'CurrentTemperature', value: 22 }]
            }]
          },
          { id: 3, name: 'Light Switch', manufacturer: 'Lutron', services: [] }
        ]
      });

      const result = await server.handleListAccessories({ 
        deviceTypeFilter: 'air_quality',
        summary: false 
      });
      
      expect(result._meta.totalCount).toBe(1);
      expect(result._meta.accessories[0].name).toBe('Air Quality Sensor');
    });

    test('should count accessories with filters', async () => {
      server.sprutClient = mockSprut;
      mockSprut.listAccessories.mockResolvedValue({
        isSuccess: true,
        data: [
          { id: 1, name: 'Light', manufacturer: 'Philips', online: true },
          { id: 2, name: 'Switch', manufacturer: 'Lutron', online: false }
        ]
      });

      const result = await server.handleCountAccessories({ onlineOnly: true });

      expect(result._meta.count).toBe(1);
      expect(result.content[0].text).toContain('1 accessory (online only)');
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

  describe('Multilingual search functionality', () => {
    beforeEach(() => {
      server = new SpruthubMCPServer();
    });

    test('should expand search terms correctly', () => {
      // Test expanding "air" to include Russian equivalents
      const airTerms = server.expandSearchTerms('air');
      expect(airTerms).toContain('air');
      expect(airTerms).toContain('воздух');
      
      // Test expanding Russian term to include English
      const russianTerms = server.expandSearchTerms('датчик');
      expect(russianTerms).toContain('датчик');
      expect(russianTerms).toContain('sensor');
      expect(russianTerms).toContain('сенсор');
      
      // Test case insensitivity
      const upperCaseTerms = server.expandSearchTerms('AIR');
      expect(upperCaseTerms).toContain('air');
      expect(upperCaseTerms).toContain('воздух');
    });
  });

});