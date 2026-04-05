const axios = require('axios');
const cron = require('node-cron');
const path = require('path');
const Redis = require('ioredis');
const DB = require('./db');

const dbPath = path.join(__dirname, '../data.db');
const db = DB(dbPath);

const redisPublisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisPublisher.on('connect', () => {
  console.log('Worker Service connected to Redis');
});

// Configure alert thresholds
const FAILURE_THRESHOLD = process.env.FAILURE_THRESHOLD ? parseInt(process.env.FAILURE_THRESHOLD, 10) : 3;
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const failureCounts = new Map(); // id -> consecutive failure count

// Concurrency control: limits simultaneous ongoing async tasks
async function asyncMapWithLimit(array, limit, asyncFn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < array.length) {
      const currentIndex = index++;
      results[currentIndex] = await asyncFn(array[currentIndex]);
    }
  }
  const workers = Array(Math.min(limit, array.length)).fill(null).map(worker);
  await Promise.all(workers);
  return results;
}

// Initial target list seed for demo purposes
const staticMonitors = [
  { id: 1, url: 'https://google.com', name: 'Google' },
  { id: 2, url: 'https://invalid-url.thisisinvalid.com', name: 'Bad API' }, 
  { id: 3, url: 'https://example.com', name: 'Example' },
  { id: 4, url: 'https://jsonplaceholder.typicode.com/', name: 'JSONPlaceholder' },
  { id: 5, url: 'https://reqres.in/', name: 'ReqRes' },
  { id: 6, url: 'https://dummyjson.com/', name: 'DummyJSON' },
  { id: 7, url: 'https://httpbin.org/', name: 'HttpBin' },
  { id: 8, url: 'https://httpstat.us/', name: 'HttpStat' },
  { id: 9, url: 'https://the-internet.herokuapp.com/', name: 'The Internet' },
  { id: 10, url: 'http://quotes.toscrape.com/', name: 'Quotes' },
  { id: 11, url: 'https://www.saucedemo.com/', name: 'SauceDemo' },
  { id: 12, url: 'https://blazedemo.com/', name: 'BlazeDemo' }
];

function ensureMonitors() {
  const insert = db.prepare('INSERT OR IGNORE INTO monitors(id, name, url) VALUES(?,?,?)');
  for (const m of staticMonitors) insert.run(m.id, m.name, m.url);
}
ensureMonitors();

function getMonitors() {
  return db.prepare('SELECT * FROM monitors').all();
}

async function triggerAlert(mon, message) {
  console.log(`[ALERT] Monitor ${mon.name} (${mon.url}) triggered an alert: ${message}`);
  if (WEBHOOK_URL) {
    try {
      await axios.post(WEBHOOK_URL, {
        content: `🚨 **ALERT:** Monitor ${mon.name} (${mon.url}) has failed ${FAILURE_THRESHOLD} consecutive times.\nReason: ${message}`
      });
    } catch (err) {
      console.error(`Failed to send webhook for ${mon.id}:`, err.message);
    }
  }
}

async function triggerRecovery(mon) {
  console.log(`[RECOVERY] Monitor ${mon.name} (${mon.url}) has recovered.`);
  if (WEBHOOK_URL) {
    try {
      await axios.post(WEBHOOK_URL, {
        content: `✅ **RECOVERY:** Monitor ${mon.name} (${mon.url}) is back UP.`
      });
    } catch (err) {
      console.error(`Failed to send recovery webhook for ${mon.id}:`, err.message);
    }
  }
}

function processAlertLogic(mon, status, errorMsg = null) {
  const currentFailures = failureCounts.get(mon.id) || 0;
  
  if (status === 'DOWN') {
    const newCount = currentFailures + 1;
    failureCounts.set(mon.id, newCount);
    
    if (newCount === FAILURE_THRESHOLD) {
      triggerAlert(mon, errorMsg || 'Unknown error').catch(console.error);
    }
  } else {
    // Up status
    if (currentFailures >= FAILURE_THRESHOLD) {
      triggerRecovery(mon).catch(console.error);
    }
    failureCounts.set(mon.id, 0);
  }
}

async function checkUrl(mon) {
  const start = Date.now();
  const timeout = 5000;
  let status, duration, errorMsg = null;
  
  try {
    const resp = await axios.get(mon.url, { timeout });
    duration = Date.now() - start;
    status = resp.status === 200 ? 'UP' : 'DOWN';
    if (resp.status !== 200) {
      errorMsg = `HTTP ${resp.status}`;
    }
  } catch (err) {
    duration = Date.now() - start;
    status = 'DOWN';
    errorMsg = err.message;
  }

  const result = { 
    id: mon.id, 
    status, 
    latency: status === 'UP' ? duration : null, 
    timestamp: new Date().toISOString(),
    error: errorMsg
  };

  // Persist to SQLite
  db.prepare('INSERT INTO checks(urlId, status, latency, checkedAt) VALUES(?,?,?,?)')
    .run(mon.id, status, result.latency, result.timestamp);

  // Update alerting state
  processAlertLogic(mon, status, errorMsg);

  return result;
}

async function runChecks() {
  const monitors = getMonitors();
  console.log(`Starting checks for ${monitors.length} monitors...`);
  
  // Process with concurrency limit (e.g. 30 requests at a time) to prevent event loop blocking and socket exhaustion
  const CONCURRENCY_LIMIT = 30;
  
  const results = await asyncMapWithLimit(monitors, CONCURRENCY_LIMIT, async (mon) => {
    const r = await checkUrl(mon);
    // Publish individual updates to redis if it's a small list (like originally designed)
    // Or just publish all events and let the API server decide
    redisPublisher.publish('uptime-updates', JSON.stringify({
      type: 'url-update',
      payload: r
    }));
    return r;
  });

  // Emitting summary when all checks in batch are done
  redisPublisher.publish('uptime-updates', JSON.stringify({
    type: 'summary-update',
    payload: results
  }));
  
  console.log('Check batch completed.');
}

// Schedule every 60 seconds (using node-cron)
cron.schedule('*/1 * * * *', () => {
  runChecks().catch(console.error);
});

// Run immediately on boot
runChecks().catch(console.error);
