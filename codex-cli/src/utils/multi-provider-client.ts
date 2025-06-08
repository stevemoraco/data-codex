import type { AppConfig } from "./config.js";
import { createOpenAIClient } from "./openai-client.js";
import { log } from "./logger/log.js";

export interface ModelConfig {
  name: string;
  provider: 'openai' | 'anthropic' | 'google';
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  contextLength: number;
}

export interface ProviderClient {
  provider: string;
  client: any;
  isConfigured: boolean;
}

export class MultiProviderClient {
  private clients: Map<string, ProviderClient> = new Map();
  private config: AppConfig;

  // Updated model configurations with correct names
  public readonly SUPPORTED_MODELS: ModelConfig[] = [
    {
      name: 'gpt-4.1',
      provider: 'openai',
      contextLength: 128000,
      maxTokens: 4096
    },
    {
      name: 'o3',
      provider: 'openai', 
      contextLength: 200000,
      maxTokens: 8192
    },
    {
      name: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      contextLength: 200000,
      maxTokens: 8192
    },
    {
      name: 'gemini-2.5-pro-preview-06-05',
      provider: 'google',
      contextLength: 2000000, // 2M tokens - longest context
      maxTokens: 8192
    }
  ];

  constructor(config: AppConfig) {
    this.config = config;
    this.initializeClients();
  }

  private async initializeClients(): Promise<void> {
    // Initialize OpenAI client if we have an API key
    if (this.config.openaiApiKey || process.env.OPENAI_API_KEY) {
      try {
        const openaiClient = createOpenAIClient(this.config);
        this.clients.set('openai', {
          provider: 'openai',
          client: openaiClient,
          isConfigured: true
        });
        log("OpenAI client initialized");
      } catch (error) {
        log(`Failed to initialize OpenAI client: ${error}`);
      }
    }

    // Initialize Anthropic client if we have an API key
    const anthropicKey = this.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        // Use fetch-based client for Anthropic
        this.clients.set('anthropic', {
          provider: 'anthropic',
          client: this.createAnthropicClient(anthropicKey),
          isConfigured: true
        });
        log("Anthropic client initialized");
      } catch (error) {
        log(`Failed to initialize Anthropic client: ${error}`);
      }
    }

    // Initialize Google client if we have an API key  
    const googleKey = this.config.googleApiKey || process.env.GOOGLE_API_KEY;
    if (googleKey) {
      try {
        this.clients.set('google', {
          provider: 'google',
          client: this.createGoogleClient(googleKey),
          isConfigured: true
        });
        log("Google client initialized");
      } catch (error) {
        log(`Failed to initialize Google client: ${error}`);
      }
    }
  }

  private createAnthropicClient(apiKey: string) {
    return {
      messages: {
        create: async (params: any) => {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: params.model,
              max_tokens: params.max_tokens || 4096,
              messages: params.messages,
              system: params.system,
              temperature: params.temperature || 0.7
            })
          });

          if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          
          // Convert Anthropic response to OpenAI-compatible format
          return {
            choices: [{
              message: {
                role: 'assistant',
                content: data.content?.[0]?.text || ''
              }
            }],
            usage: data.usage
          };
        }
      }
    };
  }

  private createGoogleClient(apiKey: string) {
    return {
      generateContent: async (params: any) => {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: params.prompt || params.messages?.map((m: any) => `${m.role}: ${m.content}`).join('\n')
              }]
            }],
            generationConfig: {
              temperature: params.temperature || 0.7,
              maxOutputTokens: params.max_tokens || 4096
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Google API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Convert Google response to OpenAI-compatible format
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: data.candidates?.[0]?.content?.parts?.[0]?.text || ''
            }
          }],
          usage: data.usageMetadata
        };
      }
    };
  }

  public getModelConfig(modelName: string): ModelConfig | undefined {
    return this.SUPPORTED_MODELS.find(m => m.name === modelName);
  }

  public async getClientForModel(modelName: string): Promise<any> {
    const modelConfig = this.getModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Unsupported model: ${modelName}. Supported models: ${this.SUPPORTED_MODELS.map(m => m.name).join(', ')}`);
    }

    const client = this.clients.get(modelConfig.provider);
    if (!client?.isConfigured) {
      throw new Error(`Provider ${modelConfig.provider} not configured. Please set the API key for ${modelConfig.provider}.`);
    }

    return client.client;
  }

  public async checkApiKey(provider: string): Promise<boolean> {
    const client = this.clients.get(provider);
    if (client?.isConfigured) {
      return true;
    }

    // If not configured, try to get API key from environment or prompt user
    await this.promptForApiKey(provider);
    const updatedClient = this.clients.get(provider);
    return updatedClient?.isConfigured || false;
  }

  private async promptForApiKey(provider: string): Promise<void> {
    const keyName = `${provider.toUpperCase()}_API_KEY`;
    const envKey = process.env[keyName];
    
    if (envKey) {
      // Try to initialize with environment key
      try {
        if (provider === 'anthropic') {
          this.clients.set('anthropic', {
            provider: 'anthropic',
            client: this.createAnthropicClient(envKey),
            isConfigured: true
          });
        } else if (provider === 'google') {
          this.clients.set('google', {
            provider: 'google', 
            client: this.createGoogleClient(envKey),
            isConfigured: true
          });
        }
        log(`${provider} client initialized from environment`);
      } catch (error) {
        log(`Failed to initialize ${provider} client with env key: ${error}`);
      }
    } else {
      log(`No API key found for ${provider}. Set ${keyName} environment variable.`);
    }
  }

  public async getApiKeyForProvider(provider: string): Promise<string | null> {
    // This should integrate with the existing API key prompt system
    // For now, check environment variables
    switch (provider) {
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY || null;
      case 'google':
        return process.env.GOOGLE_API_KEY || null;
      case 'openai':
        return process.env.OPENAI_API_KEY || null;
      default:
        return null;
    }
  }

  public async makeRequest(modelName: string, messages: any[], options: any = {}): Promise<any> {
    const modelConfig = this.getModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Model ${modelName} not supported`);
    }

    const client = await this.getClientForModel(modelName);

    try {
      switch (modelConfig.provider) {
        case 'openai':
          return await client.chat.completions.create({
            model: modelName,
            messages,
            max_tokens: options.max_tokens || modelConfig.maxTokens,
            temperature: options.temperature || 0.7,
            ...options
          });

        case 'anthropic':
          // Convert OpenAI format to Anthropic format
          const systemMessage = messages.find(m => m.role === 'system');
          const chatMessages = messages.filter(m => m.role !== 'system');
          
          return await client.messages.create({
            model: modelName,
            max_tokens: options.max_tokens || modelConfig.maxTokens,
            messages: chatMessages,
            system: systemMessage?.content,
            temperature: options.temperature || 0.7
          });

        case 'google':
          return await client.generateContent({
            model: modelName,
            messages,
            max_tokens: options.max_tokens || modelConfig.maxTokens,
            temperature: options.temperature || 0.7
          });

        default:
          throw new Error(`Unsupported provider: ${modelConfig.provider}`);
      }
    } catch (error) {
      log(`Request failed for ${modelName}: ${error}`);
      throw error;
    }
  }

  public getSupportedModels(): string[] {
    return this.SUPPORTED_MODELS.map(m => m.name);
  }

  public getSwarmCoordinatorModel(): string {
    // Use Gemini as the swarm coordinator due to its longest context
    return 'gemini-2.5-pro-preview-06-05';
  }

  public getConfiguredProviders(): string[] {
    return Array.from(this.clients.values())
      .filter(client => client.isConfigured)
      .map(client => client.provider);
  }

  public async addApiKey(provider: string, apiKey: string): Promise<void> {
    switch (provider) {
      case 'openai':
        this.config.openaiApiKey = apiKey;
        process.env.OPENAI_API_KEY = apiKey;
        break;
      case 'anthropic':
        (this.config as any).anthropicApiKey = apiKey;
        process.env.ANTHROPIC_API_KEY = apiKey;
        break;
      case 'google':
        (this.config as any).googleApiKey = apiKey;
        process.env.GOOGLE_API_KEY = apiKey;
        break;
    }
    
    // Reinitialize clients
    await this.initializeClients();
  }
}