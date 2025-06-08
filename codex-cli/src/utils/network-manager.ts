import { log } from "./logger/log.js";
import { spawn } from "child_process";

export interface NetworkConfig {
  enabled: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  proxyEnabled: boolean;
  proxyUrl?: string;
  timeout: number;
}

export interface NetworkStatus {
  online: boolean;
  connectivity: 'full' | 'limited' | 'offline';
  lastCheck: Date;
  restrictions: {
    domainsBlocked: number;
    requestsBlocked: number;
    timeouts: number;
  };
}

export class NetworkManager {
  private config: NetworkConfig;
  private status: NetworkStatus;
  private originalFetch: typeof fetch;
  private requestCount: number = 0;

  constructor() {
    this.config = {
      enabled: true,
      allowedDomains: [],
      blockedDomains: [],
      proxyEnabled: false,
      timeout: 10000
    };

    this.status = {
      online: true,
      connectivity: 'full',
      lastCheck: new Date(),
      restrictions: {
        domainsBlocked: 0,
        requestsBlocked: 0,
        timeouts: 0
      }
    };

    // Store original fetch for restoration
    this.originalFetch = global.fetch;
    
    // Check initial connectivity
    this.checkConnectivity();
  }

  public toggleNetwork(): boolean {
    this.config.enabled = !this.config.enabled;
    
    if (this.config.enabled) {
      this.enableNetwork();
    } else {
      this.disableNetwork();
    }

    log(`Network ${this.config.enabled ? 'enabled' : 'disabled'}`);
    return this.config.enabled;
  }

  public enableNetwork(): void {
    this.config.enabled = true;
    
    // Restore original fetch if we had intercepted it
    if (this.originalFetch) {
      global.fetch = this.createManagedFetch();
    }
    
    this.status.connectivity = 'full';
    this.status.lastCheck = new Date();
    log("Network access enabled with managed fetch");
  }

  public disableNetwork(): void {
    this.config.enabled = false;
    
    // Replace fetch with a blocking version
    global.fetch = this.createBlockingFetch();
    
    this.status.connectivity = 'offline';
    this.status.lastCheck = new Date();
    log("Network access disabled");
  }

  private createManagedFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      this.requestCount++;
      
      if (!this.config.enabled) {
        throw new Error("Network access is disabled");
      }

      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      
      // Check domain restrictions
      if (!this.isDomainAllowed(url)) {
        this.status.restrictions.domainsBlocked++;
        throw new Error(`Domain blocked by network policy: ${this.extractDomain(url)}`);
      }

      // Add timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        this.status.restrictions.timeouts++;
      }, this.config.timeout);

      try {
        const requestInit = {
          ...init,
          signal: controller.signal
        };

        log(`Network request #${this.requestCount}: ${url.slice(0, 100)}...`);
        const response = await this.originalFetch(input, requestInit);
        clearTimeout(timeoutId);
        
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Network request timed out after ${this.config.timeout}ms`);
        }
        throw error;
      }
    };
  }

  private createBlockingFetch(): typeof fetch {
    return async (): Promise<Response> => {
      this.status.restrictions.requestsBlocked++;
      throw new Error("Network access is disabled. Use 'n' to toggle network access.");
    };
  }

  private isDomainAllowed(url: string): boolean {
    const domain = this.extractDomain(url);
    
    // If there are allowed domains specified, only allow those
    if (this.config.allowedDomains.length > 0) {
      return this.config.allowedDomains.some(allowed => 
        domain.includes(allowed) || allowed.includes(domain)
      );
    }
    
    // Otherwise, block only explicitly blocked domains
    return !this.config.blockedDomains.some(blocked => 
      domain.includes(blocked) || blocked.includes(domain)
    );
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url.split('/')[0] || url;
    }
  }

  public async checkConnectivity(): Promise<void> {
    if (!this.config.enabled) {
      this.status.online = false;
      this.status.connectivity = 'offline';
      return;
    }

    try {
      // Try to reach a reliable endpoint
      const response = await this.originalFetch('https://httpbin.org/status/200', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      this.status.online = response.ok;
      this.status.connectivity = response.ok ? 'full' : 'limited';
    } catch (error) {
      this.status.online = false;
      this.status.connectivity = 'offline';
      log(`Connectivity check failed: ${error}`);
    }
    
    this.status.lastCheck = new Date();
  }

  public setDomainRestrictions(allowed: string[], blocked: string[]): void {
    this.config.allowedDomains = allowed;
    this.config.blockedDomains = blocked;
    log(`Domain restrictions updated: ${allowed.length} allowed, ${blocked.length} blocked`);
  }

  public setProxy(url?: string): void {
    this.config.proxyEnabled = !!url;
    this.config.proxyUrl = url;
    
    if (url) {
      // Set proxy environment variables
      process.env.HTTP_PROXY = url;
      process.env.HTTPS_PROXY = url;
      log(`Proxy enabled: ${url}`);
    } else {
      delete process.env.HTTP_PROXY;
      delete process.env.HTTPS_PROXY;
      log("Proxy disabled");
    }
  }

  public getStatus(): NetworkStatus & { config: NetworkConfig } {
    return {
      ...this.status,
      config: { ...this.config }
    };
  }

  public getNetworkSummary(): string {
    const emoji = this.config.enabled ? 
      (this.status.online ? '🌐' : '📡') : '🚫';
    
    const status = this.config.enabled ? 
      (this.status.online ? 'ONLINE' : 'OFFLINE') : 'DISABLED';
    
    const restrictions = this.status.restrictions.requestsBlocked > 0 ? 
      ` (${this.status.restrictions.requestsBlocked} blocked)` : '';
    
    return `${emoji} ${status}${restrictions}`;
  }

  public async testConnection(url: string = 'https://httpbin.org/ip'): Promise<{ success: boolean; message: string; response?: any }> {
    if (!this.config.enabled) {
      return { success: false, message: "Network is disabled" };
    }

    try {
      const response = await fetch(url, { 
        method: 'GET',
        signal: AbortSignal.timeout(this.config.timeout)
      });
      
      if (!response.ok) {
        return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      const data = await response.json();
      return { 
        success: true, 
        message: `Connected successfully to ${this.extractDomain(url)}`,
        response: data
      };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public presetConfigurations = {
    dev: () => {
      this.config.allowedDomains = [
        'api.openai.com',
        'api.anthropic.com', 
        'generativelanguage.googleapis.com',
        'github.com',
        'githubusercontent.com',
        'npmjs.org',
        'httpbin.org'
      ];
      this.config.blockedDomains = [];
      log("Applied DEV preset: Common AI/dev services allowed");
    },
    
    secure: () => {
      this.config.allowedDomains = [
        'api.openai.com'
      ];
      this.config.blockedDomains = [
        'facebook.com',
        'twitter.com',
        'tiktok.com',
        'doubleclick.net',
        'googletagmanager.com'
      ];
      log("Applied SECURE preset: Only essential AI services allowed");
    },
    
    offline: () => {
      this.disableNetwork();
      log("Applied OFFLINE preset: No network access");
    },
    
    unrestricted: () => {
      this.config.allowedDomains = [];
      this.config.blockedDomains = [];
      this.enableNetwork();
      log("Applied UNRESTRICTED preset: Full network access");
    }
  };
}