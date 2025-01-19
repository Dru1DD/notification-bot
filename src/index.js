const sqlite3 = require("sqlite3").verbose();
const TelegramBot = require("node-telegram-bot-api");
const { BOT_TOKEN, TARGET_URL } = require("./utils/config");
const puppeteer = require("puppeteer");

// Константы
const TELEGRAM_BOT_TOKEN = BOT_TOKEN;

// Инициализация базы данных
const db = new sqlite3.Database("./prices.db", (err) => {
  if (err) console.error("Ошибка при подключении к базе данных:", err.message);
});
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

db.run(`CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    minPrice REAL DEFAULT 0,
    maxPrice REAL DEFAULT 0,
    currentPrice REAL DEFAULT 0,
    lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  );`);

// Инициализация Telegram-бота
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Регистрация пользователей
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  db.get("SELECT * FROM users WHERE chatId = ?", [chatId], (err, row) => {
    if (err) {
      console.error("Ошибка при поиске пользователя:", err.message);
      return;
    }

    if (row) {
      bot.sendMessage(
        chatId,
        "Вы уже зарегистрированы. Вы будете получать обновления автоматически."
      );
    } else {
      db.run("INSERT INTO users (chatId) VALUES (?)", [chatId], (err) => {
        if (err) {
          console.error("Ошибка при регистрации пользователя:", err.message);
          return;
        }

        bot.sendMessage(
          chatId,
          "Вы успешно зарегистрированы! Обновления начнут поступать автоматически."
        );
      });
    }
  });
});

async function scrapePricesWithRetry(url = TARGET_URL, maxRetries = 5, initialDelay = 1000) {
  const DEFAULT_VALUES = { minPrice: null, maxPrice: null, currentPrice: null };

  let browser;
  let attempt = 0;
  let delay = initialDelay;

  const selectors = {
    minPrice: 'div.position_range_left_cont .position_range_column_wrap h1.position_range_text span',
    currentPrice: 'div.position_range_middle_cont .position_range_column_wrap h1.position_range_text:nth-of-type(2) span',
    maxPrice: 'div.position_range_right_cont .position_range_column_wrap h1.position_range_text span',
  };

  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Заходим на сайт один раз
    await page.goto(url);

    while (attempt < maxRetries) {
      try {
        for (const selector of Object.values(selectors)) {
          await page.waitForSelector(selector, { timeout: 5000 });
        }

        const prices = await page.evaluate((selectors) => {
          const extractText = (selector) => {
            const element = document.querySelector(selector);
            return element ? element.textContent.trim() : null;
          };

          return {
            minPrice: extractText(selectors.minPrice),
            currentPrice: extractText(selectors.currentPrice),
            maxPrice: extractText(selectors.maxPrice),
          };
        }, selectors);

        // Санация данных
        const sanitizedPrices = {
          minPrice: prices.minPrice,
          currentPrice: prices.currentPrice,
          maxPrice: prices.maxPrice,
        };

        if (
          sanitizedPrices.minPrice === "Infinity" ||
          sanitizedPrices.maxPrice === "Infinity" ||
          sanitizedPrices.currentPrice === "NaN"
        ) {
          throw new Error("Not valid data");
        }

        return sanitizedPrices;

      } catch (error) {
        attempt++;
        console.warn(`Попытка ${attempt} не удалась: ${error.message}`);
        if (attempt < maxRetries) {
          console.log(`Повтор через ${delay} мс...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
        } else {
          console.error('Все попытки завершились неудачей.');
        }
      }
    }
  } catch (error) {
    console.error('Ошибка при скраппинге:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // Если все попытки провалились, вернуть последние данные из базы
  return new Promise((resolve) => {
    db.get(
      "SELECT minPrice, maxPrice, currentPrice FROM prices ORDER BY lastUpdated DESC LIMIT 1",
      (err, row) => {
        if (err) {
          console.error("Ошибка при извлечении данных из базы:", err.message);
          resolve(DEFAULT_VALUES);
        } else if (row) {
          resolve(row);
        } else {
          resolve(DEFAULT_VALUES);
        }
      }
    );
  });
}

bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;
  const newPrices = await scrapePricesWithRetry();

  bot.sendMessage(
    chatId,
    `Данные обновились: \nminPrice: ${newPrices.minPrice}, \nmaxPrice: ${newPrices.maxPrice}, \ncurrentPrice: ${newPrices.currentPrice}`
  );
});

// Функция проверки и обновления данных для каждого пользователя
function checkAndUpdatePricesForUser(userId, chatId, newPrices) {
  db.get(
    "SELECT minPrice, maxPrice, currentPrice FROM prices WHERE userId = ? ORDER BY id DESC LIMIT 1",
    [userId],
    (err, row) => {
      if (err) {
        console.error("Ошибка при чтении из базы данных:", err.message);
        return;
      }

      console.log("Row", row, "newPrice", newPrices);

      const dataChanged =
        !row ||
        Number(row.minPrice) !== Number(newPrices.minPrice) ||
        Number(row.maxPrice) !== Number(newPrices.maxPrice);

      if (dataChanged) {
        db.run(
          "INSERT INTO prices (userId, minPrice, maxPrice, currentPrice) VALUES (?, ?, ?, ?)",
          [
            userId,
            newPrices.minPrice,
            newPrices.maxPrice,
            newPrices.currentPrice,
          ],
          (err) => {
            if (err) {
              console.error("Ошибка при вставке в базу данных:", err.message);
            }
          }
        );

        bot.sendMessage(
          chatId,
          `🔄 Данные обновились: 🔄\nminPrice: ${newPrices.minPrice}, \nmaxPrice: ${newPrices.maxPrice}, \n\n currentPrice: ${newPrices.currentPrice}`
        );
      } else {
        console.log("Данные не изменились");
      }
    }
  );
}

// Основная функция обработки всех пользователей
async function processUsers() {
  db.all("SELECT * FROM users", async (err, users) => {
    if (err) {
      console.error("Ошибка при извлечении пользователей:", err.message);
      return;
    }

    for (const user of users) {
      const prices = await scrapePricesWithRetry();
      if (prices) {
        checkAndUpdatePricesForUser(user.id, user.chatId, prices);
      }
    }
  });
}


setInterval(processUsers, 60000);
processUsers();


