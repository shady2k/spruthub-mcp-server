import { jest } from '@jest/globals';
import { SpruthubMCPServer } from '../src/index.js';

describe('Token Protection', () => {
  let server;

  beforeEach(() => {
    // Set test environment variables for token limits
    process.env.SPRUTHUB_MAX_RESPONSE_SIZE = '1000';
    process.env.SPRUTHUB_MAX_DEVICES_PER_PAGE = '5';
    process.env.SPRUTHUB_WARN_THRESHOLD = '500';
    process.env.SPRUTHUB_ENABLE_TRUNCATION = 'true';
    
    server = new SpruthubMCPServer();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.SPRUTHUB_MAX_RESPONSE_SIZE;
    delete process.env.SPRUTHUB_MAX_DEVICES_PER_PAGE;
    delete process.env.SPRUTHUB_WARN_THRESHOLD;
    delete process.env.SPRUTHUB_ENABLE_TRUNCATION;
    
    jest.clearAllMocks();
  });

  describe('Constructor initialization', () => {
    it('should initialize token limits from environment variables', () => {
      expect(server.tokenLimits.maxResponseSize).toBe(1000);
      expect(server.tokenLimits.maxDevicesPerPage).toBe(5);
      expect(server.tokenLimits.warnThreshold).toBe(500);
      expect(server.tokenLimits.enableTruncation).toBe(true);
    });

    it('should use default values when environment variables are not set', () => {
      delete process.env.SPRUTHUB_MAX_RESPONSE_SIZE;
      delete process.env.SPRUTHUB_MAX_DEVICES_PER_PAGE;
      delete process.env.SPRUTHUB_WARN_THRESHOLD;
      delete process.env.SPRUTHUB_ENABLE_TRUNCATION;
      delete process.env.SPRUTHUB_FORCE_SMART_DEFAULTS;
      delete process.env.SPRUTHUB_AUTO_SUMMARY_THRESHOLD;
      
      const defaultServer = new SpruthubMCPServer();
      expect(defaultServer.tokenLimits.maxResponseSize).toBe(25000); // Updated default
      expect(defaultServer.tokenLimits.maxDevicesPerPage).toBe(20); // Updated default  
      expect(defaultServer.tokenLimits.warnThreshold).toBe(15000); // Updated default
      expect(defaultServer.tokenLimits.enableTruncation).toBe(true);
      expect(defaultServer.tokenLimits.forceSmartDefaults).toBe(true);
      expect(defaultServer.tokenLimits.autoSummaryThreshold).toBe(10);
    });
  });

  describe('checkResponseSize', () => {
    it('should calculate response size correctly', () => {
      const content = [
        { type: 'text', text: 'Test message' }
      ];
      
      const result = server.checkResponseSize(content);
      expect(result.size).toBeGreaterThan(0);
      expect(typeof result.size).toBe('number');
    });

    it('should warn when response size exceeds threshold', () => {
      const warnSpy = jest.spyOn(server.logger, 'warn').mockImplementation();
      
      // Create content that exceeds warn threshold
      const largeContent = [
        { type: 'text', text: 'x'.repeat(600) } // Exceeds 500 char threshold
      ];
      
      server.checkResponseSize(largeContent);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          responseSize: expect.any(Number),
          threshold: 500
        }),
        'Large response detected - consider using pagination or summary mode'
      );
    });
  });

  describe('truncateResponse', () => {
    it('should not truncate when response is within limits', () => {
      const content = [
        { type: 'text', text: 'Small response' }
      ];
      
      const result = server.truncateResponse(content, 100);
      expect(result).toEqual(content);
    });

    it('should truncate when response exceeds limits', () => {
      const content = [
        { type: 'text', text: 'x'.repeat(2000) } // Exceeds 1000 char limit
      ];
      
      const result = server.truncateResponse(content, 1500);
      expect(result[0].text).toContain('RESPONSE TRUNCATED');
      expect(result[0].text).toContain('[TRUNCATED - Use pagination or summary mode for full data]');
    });

    it('should not truncate when truncation is disabled', () => {
      server.tokenLimits.enableTruncation = false;
      
      const content = [
        { type: 'text', text: 'x'.repeat(2000) }
      ];
      
      const result = server.truncateResponse(content, 1500);
      expect(result).toEqual(content);
    });

    it('should add truncation warning when truncating', () => {
      const warnSpy = jest.spyOn(server.logger, 'warn').mockImplementation();
      
      const content = [
        { type: 'text', text: 'x'.repeat(2000) }
      ];
      
      server.truncateResponse(content, 1500);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          originalSize: 1500,
          limit: 1000
        }),
        'Response truncated due to size limit'
      );
    });
  });

  describe('processResponse', () => {
    it('should process normal-sized responses without modification', () => {
      const content = [
        { type: 'text', text: 'Normal response' }
      ];
      
      const result = server.processResponse(content);
      expect(result).toEqual(content);
    });

    it('should truncate oversized responses', () => {
      const content = [
        { type: 'text', text: 'x'.repeat(2000) }
      ];
      
      const result = server.processResponse(content);
      expect(result[0].text).toContain('RESPONSE TRUNCATED');
    });
  });

  describe('Smart defaults', () => {
    it('should enable summary mode for large datasets', () => {
      const smartDefaults = server.getSmartDefaults(15, {}); // Above 10 threshold
      expect(smartDefaults.summary).toBe(true);
    });

    it('should enable metaOnly mode for very large datasets', () => {
      const smartDefaults = server.getSmartDefaults(150, {}); // Above 100 threshold
      expect(smartDefaults.metaOnly).toBe(true);
    });

    it('should reduce page size for large datasets', () => {
      const smartDefaults = server.getSmartDefaults(60, {}); // Above 50 threshold
      expect(smartDefaults.limit).toBe(10);
    });

    it('should not override explicitly set parameters', () => {
      const smartDefaults = server.getSmartDefaults(150, { summary: false, metaOnly: false });
      expect(smartDefaults.summary).toBe(false);
      expect(smartDefaults.metaOnly).toBe(false);
    });

    it('should respect smart defaults disable setting', () => {
      server.tokenLimits.forceSmartDefaults = false;
      const smartDefaults = server.getSmartDefaults(150, {});
      expect(smartDefaults.summary).toBeUndefined();
      expect(smartDefaults.metaOnly).toBeUndefined();
    });
  });

  describe('Pagination limits', () => {
    it('should enforce maximum devices per page limit', () => {
      // Test the validation logic that would be used in handleListAccessories
      const requestedLimit = 50; // Requesting more than the 5 device limit in test config
      const actualLimit = Math.min(
        server.tokenLimits.maxDevicesPerPage, 
        Math.max(1, parseInt(requestedLimit))
      );
      
      expect(actualLimit).toBe(5); // Should be limited to configured max
    });
  });
});