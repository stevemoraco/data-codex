import type { AppConfig } from "../utils/config.js";
import type { SwarmStatus } from "../swarm/swarm-coordinator.js";
import type { ResponseItem } from "openai/resources/responses/responses.mjs";

import { log } from "../utils/logger/log.js";
import crypto from "crypto";

export interface MobileSession {
  sessionId: string;
  qrCode: string;
  deviceId?: string;
  authenticated: boolean;
  expiresAt: Date;
  pushToken?: string;
  preferences: {
    notifyOnCompletion: boolean;
    notifyOnError: boolean;
    notifyOnSwarmStart: boolean;
    voiceFeedback: boolean;
  };
}

export interface MobileNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: 'low' | 'normal' | 'high';
  sound?: string;
  vibrate?: boolean;
}

export class MobileBridge {
  private config: AppConfig;
  private sessions: Map<string, MobileSession> = new Map();
  private activeSession: MobileSession | null = null;
  private notificationQueue: MobileNotification[] = [];

  constructor(config: AppConfig) {
    this.config = config;
  }

  public async initializeQRAuth(): Promise<{ qrCode: string; sessionId: string }> {
    const sessionId = crypto.randomUUID();
    const authSecret = crypto.randomBytes(32).toString('hex');
    
    // Create QR code data - would normally encode server endpoint + session info
    const qrData = {
      sessionId,
      authEndpoint: `https://codex-mobile.api/auth/${sessionId}`,
      secret: authSecret,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    };
    
    const qrCode = Buffer.from(JSON.stringify(qrData)).toString('base64');
    
    const session: MobileSession = {
      sessionId,
      qrCode,
      authenticated: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      preferences: {
        notifyOnCompletion: true,
        notifyOnError: true,
        notifyOnSwarmStart: true,
        voiceFeedback: false
      }
    };

    this.sessions.set(sessionId, session);
    
    log(`Generated QR code for mobile authentication: ${sessionId}`);
    
    return { qrCode, sessionId };
  }

  public async authenticateDevice(sessionId: string, deviceId: string, pushToken?: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (new Date() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return false;
    }

    session.deviceId = deviceId;
    session.pushToken = pushToken;
    session.authenticated = true;
    this.activeSession = session;

    log(`Mobile device authenticated: ${deviceId}`);

    // Send welcome notification
    await this.sendNotification({
      id: `welcome-${Date.now()}`,
      title: "Codex CLI Connected",
      body: "Mobile notifications are now active",
      priority: 'normal',
      sound: 'default'
    });

    return true;
  }

  public async sendNotification(notification: MobileNotification): Promise<boolean> {
    if (!this.activeSession?.authenticated || !this.activeSession.pushToken) {
      this.notificationQueue.push(notification);
      return false;
    }

    try {
      // In a real implementation, this would send via FCM/APNS
      log(`Sending mobile notification: ${notification.title} - ${notification.body}`);
      
      // Simulate voice feedback if enabled
      if (this.activeSession.preferences.voiceFeedback && notification.priority === 'high') {
        await this.triggerVoiceFeedback(notification.body);
      }

      return true;
    } catch (error) {
      log(`Failed to send mobile notification: ${error}`);
      this.notificationQueue.push(notification);
      return false;
    }
  }

  private async triggerVoiceFeedback(message: string): Promise<void> {
    log(`Voice feedback: ${message}`);
    // In a real implementation, this would trigger text-to-speech
  }

  public async notifySwarmEvent(event: 'started' | 'completed' | 'error', details: string, swarmStatus?: SwarmStatus): Promise<void> {
    const prefs = this.activeSession?.preferences;
    if (!prefs) return;

    let shouldNotify = false;
    let priority: MobileNotification['priority'] = 'normal';
    let title = '';
    let body = details;

    switch (event) {
      case 'started':
        shouldNotify = prefs.notifyOnSwarmStart;
        title = '🚀 AI Swarm Activated';
        priority = 'high';
        if (swarmStatus) {
          body = `${swarmStatus.activeAgents} agents ready for parallel execution`;
        }
        break;
      
      case 'completed':
        shouldNotify = prefs.notifyOnCompletion;
        title = '✅ Tasks Completed';
        if (swarmStatus) {
          body = `${swarmStatus.completedTasks} tasks completed. Cost: $${swarmStatus.totalCost.toFixed(2)}`;
        }
        break;
      
      case 'error':
        shouldNotify = prefs.notifyOnError;
        title = '⚠️ Error Occurred';
        priority = 'high';
        break;
    }

    if (shouldNotify) {
      await this.sendNotification({
        id: `swarm-${event}-${Date.now()}`,
        title,
        body,
        priority,
        sound: priority === 'high' ? 'alert' : 'default',
        vibrate: priority === 'high',
        data: {
          event,
          swarmStatus: swarmStatus ? JSON.stringify(swarmStatus) : undefined
        }
      });
    }
  }

  public async notifyCodeChange(file: string, changeType: 'created' | 'modified' | 'deleted'): Promise<void> {
    if (!this.activeSession?.preferences.notifyOnCompletion) return;

    const emoji = changeType === 'created' ? '📄' : changeType === 'modified' ? '✏️' : '🗑️';
    
    await this.sendNotification({
      id: `code-change-${Date.now()}`,
      title: `${emoji} File ${changeType}`,
      body: file,
      priority: 'normal',
      data: { file, changeType }
    });
  }

  public async notifyAgentResponse(agentId: string, response: ResponseItem): Promise<void> {
    if (!this.activeSession?.preferences.notifyOnCompletion) return;

    const content = response.content
      .map(c => c.type === 'output_text' ? c.text : '')
      .join('')
      .slice(0, 100);

    if (content.trim()) {
      await this.sendNotification({
        id: `agent-response-${Date.now()}`,
        title: `🤖 Agent ${agentId}`,
        body: content,
        priority: 'normal',
        data: { agentId, responseType: response.type }
      });
    }
  }

  public updatePreferences(preferences: Partial<MobileSession['preferences']>): boolean {
    if (!this.activeSession) return false;

    this.activeSession.preferences = {
      ...this.activeSession.preferences,
      ...preferences
    };

    log(`Updated mobile preferences: ${JSON.stringify(this.activeSession.preferences)}`);
    return true;
  }

  public getActiveSession(): MobileSession | null {
    return this.activeSession;
  }

  public async flushNotificationQueue(): Promise<void> {
    if (!this.activeSession?.authenticated) return;

    const queuedNotifications = [...this.notificationQueue];
    this.notificationQueue = [];

    for (const notification of queuedNotifications) {
      await this.sendNotification(notification);
    }
  }

  public disconnect(): void {
    if (this.activeSession) {
      log(`Disconnecting mobile session: ${this.activeSession.sessionId}`);
      this.activeSession = null;
    }
  }

  public cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt && !session.authenticated) {
        this.sessions.delete(sessionId);
        log(`Cleaned up expired session: ${sessionId}`);
      }
    }
  }
}