const Database = require('better-sqlite3');

module.exports = function dbFactory(dbPath) {
  const db = new Database(dbPath);
  // initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY,
      name TEXT,
      url TEXT
    );
    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      urlId INTEGER,
      status TEXT,
      latency INTEGER,
      checkedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_checks_url_checkedAt ON checks(urlId, checkedAt);
  `);
  // convenience helpers
  db.prepare('PRAGMA journal_mode = WAL').run();
  return db;
};
