import { useEffect, useMemo, useState } from 'react';

export interface WsConnectionStatus {
  connected: boolean;
  statusLabel: 'Connected' | 'Disabled' | 'Misconfigured' | 'Disconnected';
  tone: 'ok' | 'muted' | 'warn' | 'critical';
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
  const [statusLabel, setStatusLabel] = useState<WsConnectionStatus['statusLabel']>('Disconnected');
  const [tone, setTone] = useState<WsConnectionStatus['tone']>('critical');
  const [detail, setDetail] = useState('Realtime websocket stream disconnected.');
  const [lastChangedUtc, setLastChangedUtc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!wsBase) {
      setConnected(false);
      setStatusLabel('Disabled');
      setTone('muted');
      setDetail('Realtime websocket stream not configured. Falling back to periodic refresh.');
      setLastChangedUtc(new Date().toISOString());
      return;
    }

    let streamUrl: string;
    try {
      streamUrl = `${toWsBase(wsBase)}/v1/stream/console-state`;
      // Validate shape early so we can classify malformed config as warning.
      new URL(streamUrl);
    } catch {
      setConnected(false);
      setStatusLabel('Misconfigured');
      setTone('warn');
      setDetail('Realtime websocket URL is invalid. Check VITE_WS_BASE_URL and retry.');
      setLastChangedUtc(new Date().toISOString());
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;
    let hadSuccessfulConnection = false;

    const connect = () => {
      socket = new WebSocket(streamUrl);

      socket.onopen = () => {
        if (disposed) return;
        hadSuccessfulConnection = true;
        setConnected(true);
        setStatusLabel('Connected');
        setTone('ok');
        setDetail('Live stream connected.');
        setLastChangedUtc(new Date().toISOString());
      };

      socket.onerror = () => {
        if (disposed) return;
        setConnected(false);
        if (hadSuccessfulConnection) {
          setStatusLabel('Disconnected');
          setTone('critical');
          setDetail('Realtime websocket stream dropped unexpectedly. Falling back to periodic refresh.');
        } else {
          setStatusLabel('Misconfigured');
          setTone('warn');
          setDetail('Realtime websocket stream could not connect. Check endpoint and auth settings.');
        }
        setLastChangedUtc(new Date().toISOString());
      };

      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        if (hadSuccessfulConnection) {
          setStatusLabel('Disconnected');
          setTone('critical');
          setDetail('Realtime websocket stream disconnected. Falling back to periodic refresh.');
        } else {
          setStatusLabel('Misconfigured');
          setTone('warn');
          setDetail('Realtime websocket stream is not reachable. Check endpoint and network policy.');
        }
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
      statusLabel,
      tone,
      detail,
      lastChangedUtc
    }),
    [connected, detail, lastChangedUtc, statusLabel, tone]
  );
}
