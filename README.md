# Uptime Monitor (Decoupled & Scalable)

A distributed uptime monitoring system that performs concurrent health checks,
streams real-time status via WebSockets, and triggers alerts on failures.

Designed to handle high-frequency checks using a worker-based architecture
with Redis Pub/Sub for real-time communication.# Uptime Monitor (Decoupled & Scalable)

## Prerequisites

- **Node.js**: v16+ recommended
- **Redis**: Required for communication between the Worker and API (Pub/Sub).

## Quickstart

### 1. Install dependencies

```bash
npm install
```

### 2. Start Redis
Ensure you have a Redis server running (e.g., `redis-server` or via Docker).

### 3. Start the API Server
Handles REST APIs and WebSocket real-time updates.

```bash
npm run start:api
```

### 4. Start the Worker Service (in a separate terminal)
Handles scheduled checks, SQLite writes, and alerting logic.

```bash
npm run start:worker
```

## Architecture

- **`src/api.js`**: Express server + Socket.io. Subscribes to Redis for live updates.
- **`src/worker.js`**: Cron-based worker. Performs HTTP checks with concurrency limits (30) and publishes results to Redis.
- **`src/db.js`**: SQLite helper with WAL mode enabled for concurrent access.
- **`public/`**: Frontend dashboard (Socket.io client).

## Configuration

You can configure the following environment variables:

- `REDIS_URL`: Defaults to `redis://localhost:6379`
- `PORT`: API server port (default: 3000)
- `FAILURE_THRESHOLD`: Consecutive failures before alerting (default: 3)
- `WEBHOOK_URL`: Discord/Slack webhook URL for alerts.

## Notes
- Uses `node-cron` for scheduling.
- Concurrency is managed via a pool to prevent event loop blocking.
- Real-time updates are bridged using Redis Pub/Sub.
