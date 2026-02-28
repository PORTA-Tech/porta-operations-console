import { useEffect, useMemo, useState } from 'react';

export interface WsConnectionStatus {
  connected: boolean;
  statusLabel: 'Connected' | 'Disconnected';
  detail: string;
  lastChangedUtc: string | undefined;
}

function toWsBase(base: string): string {
  const trimmed = base.trim().replace(/\/$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }

  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }

  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }

  return `ws://${trimmed}`;
}

export function useWsConnectionStatus(): WsConnectionStatus {
  const wsBase = import.meta.env.VITE_WS_BASE_URL?.trim();
  const [connected, setConnected] = useState(false);
  const [detail, setDetail] = useState('Waiting for websocket stream...');
  const [lastChangedUtc, setLastChangedUtc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!wsBase) {
      setConnected(false);
      setDetail('VITE_WS_BASE_URL is not configured.');
      setLastChangedUtc(new Date().toISOString());
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      const url = `${toWsBase(wsBase)}/v1/stream/console-state`;
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (disposed) return;
        setConnected(true);
        setDetail('Live stream connected.');
        setLastChangedUtc(new Date().toISOString());
      };

      socket.onerror = () => {
        if (disposed) return;
        setConnected(false);
        setDetail('Websocket stream error.');
        setLastChangedUtc(new Date().toISOString());
      };

      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setDetail('Websocket stream disconnected.');
        setLastChangedUtc(new Date().toISOString());
        reconnectTimer = window.setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [wsBase]);

  return useMemo(
    () => ({
      connected,
      statusLabel: connected ? 'Connected' : 'Disconnected',
      detail,
      lastChangedUtc
    }),
    [connected, detail, lastChangedUtc]
  );
}

