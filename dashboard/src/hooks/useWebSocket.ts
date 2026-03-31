/**
 * WebSocket Hook for Real-Time Dashboard Updates
 *
 * Manages WebSocket connection with:
 * - Automatic reconnection with exponential backoff
 * - Event subscription system
 * - Connection state tracking
 * - Graceful cleanup on unmount
 *
 * Usage:
 * ```tsx
 * const { connected, subscribe } = useWebSocket();
 *
 * useEffect(() => {
 *   const unsubscribe = subscribe('index:progress', (data) => {
 *     console.log('Progress:', data);
 *   });
 *   return unsubscribe;
 * }, [subscribe]);
 * ```
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

export type WebSocketEventHandler = (payload: unknown) => void;

export interface UseWebSocketReturn {
  connected: boolean;
  subscribe: (eventType: string, handler: WebSocketEventHandler) => () => void;
  send: (type: string, payload: unknown) => void;
}

/**
 * WebSocket hook with automatic reconnection
 *
 * @param url - WebSocket URL (default: ws://localhost:3000/ws)
 * @param options - Configuration options
 */
export function useWebSocket(
  url: string = 'ws://localhost:3000/ws',
  options: {
    reconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectInterval?: number;
    reconnectDecay?: number;
  } = {}
): UseWebSocketReturn {
  const {
    reconnect = true,
    reconnectInterval = 1000,
    maxReconnectInterval = 30000,
    reconnectDecay = 1.5,
  } = options;

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const handlersRef = useRef<Map<string, Set<WebSocketEventHandler>>>(new Map());
  const mountedRef = useRef(true);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }

        console.log('[WebSocket] Connected');
        setConnected(true);
        reconnectAttemptsRef.current = 0;
        wsRef.current = ws;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          const handlers = handlersRef.current.get(message.type);

          if (handlers) {
            handlers.forEach((handler) => {
              try {
                handler(message.payload);
              } catch (err) {
                console.error('[WebSocket] Handler error:', err);
              }
            });
          }

          // Also trigger wildcard handlers
          const wildcardHandlers = handlersRef.current.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => {
              try {
                handler(message);
              } catch (err) {
                console.error('[WebSocket] Wildcard handler error:', err);
              }
            });
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;

        console.log('[WebSocket] Disconnected');
        setConnected(false);
        wsRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnect) {
          const interval = Math.min(
            reconnectInterval * Math.pow(reconnectDecay, reconnectAttemptsRef.current),
            maxReconnectInterval
          );

          console.log(
            `[WebSocket] Reconnecting in ${interval}ms (attempt ${
              reconnectAttemptsRef.current + 1
            })`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, interval);
        }
      };
    } catch (err) {
      console.error('[WebSocket] Connection error:', err);
    }
  }, [url, reconnect, reconnectInterval, maxReconnectInterval, reconnectDecay]);

  /**
   * Subscribe to WebSocket events
   *
   * @param eventType - Event type to listen for (or '*' for all events)
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  const subscribe = useCallback(
    (eventType: string, handler: WebSocketEventHandler): (() => void) => {
      if (!handlersRef.current.has(eventType)) {
        handlersRef.current.set(eventType, new Set());
      }

      const handlers = handlersRef.current.get(eventType);
      handlers?.add(handler);

      // Return unsubscribe function
      return () => {
        const handlers = handlersRef.current.get(eventType);
        handlers?.delete(handler);
        if (handlers?.size === 0) {
          handlersRef.current.delete(eventType);
        }
      };
    },
    []
  );

  /**
   * Send message to server
   *
   * Note: Current implementation is broadcast-only (server -> client).
   * This method is provided for future bidirectional communication.
   *
   * @param type - Message type
   * @param payload - Message payload
   */
  const send = useCallback((type: string, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type,
          payload,
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      console.warn('[WebSocket] Cannot send message: not connected');
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true;
    connect();

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      handlersRef.current.clear();
    };
  }, [connect]);

  return {
    connected,
    subscribe,
    send,
  };
}
