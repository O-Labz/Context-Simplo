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

  /**
   * Register a new WebSocket client
   *
   * @param ws - WebSocket connection
   */
  addClient(ws: WebSocket): void {
    this.clients.add(ws);

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', (err: Error) => {
      console.error('WebSocket error:', err);
      this.clients.delete(ws);
    });

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
        client.close(1000, 'Server shutting down');
      } catch (err) {
        console.error('Error closing WebSocket:', err);
      }
    }
    this.clients.clear();
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
    (connection /* SocketStream */) => {
      broadcaster.addClient(connection.socket);
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

  // Connection events
  CONNECTION_ESTABLISHED: 'connection:established',
} as const;

export type WebSocketEventType =
  (typeof WebSocketEvents)[keyof typeof WebSocketEvents];
