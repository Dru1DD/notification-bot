const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./prices.db", (err) => {
  if (err) console.error("Ошибка при подключении к базе данных:", err.message);
});

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    minPrice REAL DEFAULT 0,
    maxPrice REAL DEFAULT 0,
    currentPrice REAL DEFAULT 0,
    lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

module.exports = db;
