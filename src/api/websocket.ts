/**
 * WebSocket Event Broadcasting
 *
 * Provides real-time updates to dashboard clients.
 * Events: index progress, watcher changes, embedding queue status, health metrics.
 *
 * Security: Localhost-only, no authentication (network isolation).
 * For production multi-user deployments, add authentication.
 */

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

export interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

/**
 * WebSocket event broadcaster
 *
 * Manages connected clients and broadcasts events.
 * Thread-safe: all operations are synchronous on Node.js event loop.
 */
export class WebSocketBroadcaster {
  private clients: Set<WebSocket> = new Set();
  private messageCount = 0;
  private pingIntervals: Map<WebSocket, NodeJS.Timeout> = new Map();
  private readonly PING_INTERVAL_MS = 30000;
  private readonly PONG_TIMEOUT_MS = 5000;

  /**
   * Register a new WebSocket client
   *
   * @param ws - WebSocket connection
   */
  addClient(ws: WebSocket): void {
    if (!ws) {
      console.error('WebSocket is null or undefined');
      return;
    }

    this.clients.add(ws);

    // Check if WebSocket has EventEmitter methods (ws library)
    const hasEventEmitter = typeof (ws as any).on === 'function' && 
                           typeof (ws as any).once === 'function' &&
                           typeof (ws as any).ping === 'function';

    if (hasEventEmitter) {
      // Use EventEmitter interface for ping/pong
      this.startPingInterval(ws);

      (ws as any).on('pong', () => {
        // Client responded to ping, connection is alive
      });

      (ws as any).on('close', () => {
        this.cleanupClient(ws);
      });

      (ws as any).on('error', (err: Error) => {
        console.error('WebSocket error:', err);
        this.cleanupClient(ws);
      });
    } else if (typeof ws.addEventListener === 'function') {
      // Fallback for standard WebSocket API
      ws.addEventListener('close', () => {
        this.cleanupClient(ws);
      });

      ws.addEventListener('error', (event: Event) => {
        console.error('WebSocket error:', event);
        this.cleanupClient(ws);
      });
    } else {
      console.warn('WebSocket does not support event listeners, skipping heartbeat setup');
    }

    // Send initial connection confirmation
    this.sendToClient(ws, {
      type: 'connection:established',
      payload: {
        clientCount: this.clients.size,
        serverTime: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Start ping interval for a client to detect dead connections
   */
  private startPingInterval(ws: WebSocket): void {
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        let pongReceived = false;

        const pongHandler = () => {
          pongReceived = true;
        };

        (ws as any).once('pong', pongHandler);
        
        // Only ping if the method exists
        if (typeof (ws as any).ping === 'function') {
          (ws as any).ping();
        }

        // If no pong within timeout, close the connection
        setTimeout(() => {
          if (!pongReceived && typeof (ws as any).ping === 'function') {
            console.warn('WebSocket client did not respond to ping, closing connection');
            (ws as any).removeListener?.('pong', pongHandler);
            this.cleanupClient(ws);
            if (typeof (ws as any).terminate === 'function') {
              (ws as any).terminate();
            } else {
              ws.close();
            }
          }
        }, this.PONG_TIMEOUT_MS);
      } else {
        this.cleanupClient(ws);
      }
    }, this.PING_INTERVAL_MS);

    this.pingIntervals.set(ws, interval);
  }

  /**
   * Clean up client resources
   */
  private cleanupClient(ws: WebSocket): void {
    this.clients.delete(ws);
    const interval = this.pingIntervals.get(ws);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(ws);
    }
  }

  /**
   * Broadcast event to all connected clients
   *
   * @param type - Event type (e.g., 'index:progress')
   * @param payload - Event data
   */
  broadcast(type: string, payload: unknown): void {
    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.messageCount++;

    // Broadcast to all clients, remove dead connections
    const deadClients: WebSocket[] = [];

    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        this.sendToClient(client, message);
      } else {
        deadClients.push(client);
      }
    }

    // Clean up dead connections
    for (const client of deadClients) {
      this.clients.delete(client);
    }
  }

  /**
   * Send message to a specific client
   *
   * @param ws - WebSocket connection
   * @param message - Message to send
   */
  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('Failed to send WebSocket message:', err);
      this.clients.delete(ws);
    }
  }

  /**
   * Get current client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get total messages sent
   */
  getMessageCount(): number {
    return this.messageCount;
  }

  /**
   * Close all connections (graceful shutdown)
   */
  closeAll(): void {
    for (const client of this.clients) {
      try {
        this.cleanupClient(client);
        client.close(1000, 'Server shutting down');
      } catch (err) {
        console.error('Error closing WebSocket:', err);
      }
    }
    this.clients.clear();
    this.pingIntervals.clear();
  }
}

/**
 * Register WebSocket route with Fastify
 *
 * @param fastify - Fastify instance
 * @param broadcaster - WebSocket broadcaster instance
 */
export async function registerWebSocketRoute(
  fastify: FastifyInstance,
  broadcaster: WebSocketBroadcaster
): Promise<void> {
  fastify.get(
    '/ws',
    { websocket: true },
    (socket /* WebSocket */, _req) => {
      if (!socket) {
        console.error('WebSocket socket is undefined');
        return;
      }
      broadcaster.addClient(socket);
    }
  );
}

/**
 * Event types for type-safe broadcasting
 */
export const WebSocketEvents = {
  // Indexing events
  INDEX_PROGRESS: 'index:progress',
  INDEX_COMPLETE: 'index:complete',
  INDEX_ERROR: 'index:error',

  // Watcher events
  WATCHER_CHANGE: 'watcher:change',
  WATCHER_REINDEX: 'watcher:reindex',

  // Embedding events
  EMBEDDING_PROGRESS: 'embedding:progress',
  EMBEDDING_ERROR: 'embedding:error',

  // Health events
  HEALTH_UPDATE: 'health:update',

  // Config events
  CONFIG_CHANGED: 'config:changed',
  CONFIG_RELOADING: 'config:reloading',
  CONFIG_RELOAD_COMPLETE: 'config:reload_complete',
  CONFIG_RELOAD_ERROR: 'config:reload_error',

  // Connection events
  CONNECTION_ESTABLISHED: 'connection:established',
} as const;

export type WebSocketEventType =
  (typeof WebSocketEvents)[keyof typeof WebSocketEvents];
