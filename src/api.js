const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const Redis = require('ioredis');
const DB = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// DB helper
const dbPath = path.join(__dirname, '../data.db');
const db = DB(dbPath);

app.get('/api/monitors', (req, res) => {
  try {
    const monitors = db.prepare('SELECT * FROM monitors').all();
    res.json(monitors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:urlId', (req, res) => {
  const urlId = Number(req.params.urlId);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  
  try {
    const row = db.prepare(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN status='UP' THEN 1 ELSE 0 END) as success,
        AVG(latency) as avgLatency
       FROM checks
       WHERE urlId = ? AND checkedAt >= ?`
    ).get(urlId, since);

    const total = row.total || 0;
    const success = row.success || 0;
    const uptime = total === 0 ? null : (success / total) * 100;
    
    res.json({ urlId, total, success, uptime, avgLatency: row.avgLatency });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Setup Redis Subscriber
const redisSubscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisSubscriber.on('connect', () => {
  console.log('API Server connected to Redis');
});

redisSubscriber.subscribe('uptime-updates', (err, count) => {
  if (err) {
    console.error('Failed to subscribe to Redis channel: %s', err.message);
  } else {
    console.log(`Subscribed to ${count} channel(s). Listening for updates...`);
  }
});

redisSubscriber.on('message', (channel, message) => {
  if (channel === 'uptime-updates') {
    try {
      const data = JSON.parse(message);
      io.emit(data.type, data.payload);
    } catch (err) {
      console.error('Failed to parse Redis message', err);
    }
  }
});

io.on('connection', (socket) => {
  console.log('client connected', socket.id);
  socket.on('disconnect', () => console.log('client disconnected', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`API Server running on http://localhost:${PORT}`));
