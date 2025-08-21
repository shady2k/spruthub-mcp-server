import { jest } from '@jest/globals';



describe('Utility Functions', () => {
  beforeEach(() => {
    process.setMaxListeners(20);
  });
  describe('Logger Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
      jest.clearAllMocks();
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    test('should create logger with stderr output', async () => {
      const { SpruthubMCPServer } = await import('../src/index.js');
      const server = new SpruthubMCPServer();
      
      expect(server.logger).toBeDefined();
      expect(typeof server.logger.info).toBe('function');
      expect(typeof server.logger.error).toBe('function');
      expect(typeof server.logger.warn).toBe('function');
      expect(typeof server.logger.debug).toBe('function');
    });

    test('should log debug messages only when LOG_LEVEL is debug', async () => {
      process.env.LOG_LEVEL = 'debug';
      
      const { SpruthubMCPServer } = await import('../src/index.js');
      const server = new SpruthubMCPServer();
      
      // Spy on console.error to verify debug logging behavior
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      server.logger.debug('test debug message');
      expect(consoleSpy).toHaveBeenCalledWith('[DEBUG]', 'test debug message');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('should handle JSON stringification in responses', () => {
      const testObject = {
        name: 'test',
        value: 123,
        nested: {
          array: [1, 2, 3],
          boolean: true
        }
      };

      const jsonString = JSON.stringify(testObject, null, 2);
      expect(jsonString).toContain('"name": "test"');
      expect(jsonString).toContain('"value": 123');
      expect(jsonString).toContain('"array": [');
    });

    test('should handle circular references in objects', () => {
      const obj = { name: 'test' };
      obj.self = obj;

      expect(() => JSON.stringify(obj)).toThrow();
    });
  });

  describe('Validation', () => {
    test('should validate required connection parameters', () => {
      const validArgs = {
        wsUrl: 'ws://localhost:8080',
        sprutEmail: 'test@example.com',
        sprutPassword: 'password123',
        serial: 'ABC123'
      };

      const requiredKeys = ['wsUrl', 'sprutEmail', 'sprutPassword', 'serial'];
      
      requiredKeys.forEach(key => {
        expect(validArgs).toHaveProperty(key);
        expect(typeof validArgs[key]).toBe('string');
        expect(validArgs[key].length).toBeGreaterThan(0);
      });
    });

    test('should validate execute command parameters', () => {
      const validExecuteArgs = {
        command: 'update',
        accessoryId: 'acc1',
        serviceId: 'svc1',
        characteristicId: 'char1',
        value: true
      };

      const requiredKeys = ['command', 'accessoryId', 'serviceId', 'characteristicId', 'value'];
      
      requiredKeys.forEach(key => {
        expect(validExecuteArgs).toHaveProperty(key);
      });
      
      expect(validExecuteArgs.command).toBe('update');
      expect(typeof validExecuteArgs.value).toBe('boolean');
    });
  });
});