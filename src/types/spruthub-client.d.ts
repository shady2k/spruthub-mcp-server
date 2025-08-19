declare module 'spruthub-client' {
  export class Sprut {
    constructor(options: {
      wsUrl: string;
      sprutEmail: string;
      sprutPassword: string;
      serial: string;
      logger?: any;
    });
    
    connected(): Promise<void>;
    execute(command: string, params: any): Promise<any>;
    version(): Promise<any>;
    close(): Promise<void>;
  }
}