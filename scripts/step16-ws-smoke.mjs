const wsBase = process.env.VITE_WS_BASE_URL ?? 'ws://localhost:3000';
const durationSeconds = Number(process.env.STEP16_DURATION_SECONDS ?? 120);
const endpoint = `${wsBase.replace(/\/$/, '')}/v1/stream/console-state`;

let messages = 0;
let drops = 0;
const latencies = [];
let socket;

const start = Date.now();
const stopAt = start + durationSeconds * 1000;

function connect() {
  socket = new WebSocket(endpoint);
  socket.onmessage = (event) => {
    messages += 1;
    try {
      const payload = JSON.parse(String(event.data));
      if (payload?.timestamp) {
        const latency = Date.now() - Date.parse(payload.timestamp);
        if (Number.isFinite(latency) && latency >= 0) {
          latencies.push(latency);
        }
      }
    } catch {
    }
  };
  socket.onclose = () => {
    drops += 1;
    if (Date.now() < stopAt) {
      setTimeout(connect, 500);
    }
  };
}

connect();

setTimeout(() => {
  socket?.close();
  latencies.sort((a, b) => a - b);
  const p95 = latencies.length === 0 ? 0 : latencies[Math.floor(latencies.length * 0.95)];
  console.log(
    JSON.stringify(
      {
        endpoint,
        durationSeconds,
        messages,
        drops,
        p95LatencyMs: p95 ?? 0
      },
      null,
      2
    )
  );
  process.exit(0);
}, durationSeconds * 1000);
