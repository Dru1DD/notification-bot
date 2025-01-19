const TelegramBot = require("node-telegram-bot-api");
const db = require("./utils/db");
const { BOT_TOKEN } = require("./utils/config");
const { scrapePricesWithRetry } = require("./utils/scraper");

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  db.get("SELECT * FROM users WHERE chatId = ?", [chatId], (err, row) => {
    if (row) {
      bot.sendMessage(chatId, "Вы уже зарегистрированы.");
    } else {
      db.run("INSERT INTO users (chatId) VALUES (?)", [chatId], (err) => {
        bot.sendMessage(chatId, "Вы успешно зарегистрированы!");
      });
    }
  });
});

bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;
  const prices = await scrapePricesWithRetry();
  bot.sendMessage(chatId, `Данные обновлены:\nMin: ${prices.minPrice}, Max: ${prices.maxPrice}, Current: ${prices.currentPrice}`);
});

async function processUsers() {
  db.all("SELECT * FROM users", async (err, users) => {
    for (const user of users) {
      const prices = await scrapePricesWithRetry();
      db.run(
        "INSERT INTO prices (userId, minPrice, maxPrice, currentPrice) VALUES (?, ?, ?, ?)",
        [user.id, prices.minPrice, prices.maxPrice, prices.currentPrice]
      );
      bot.sendMessage(user.chatId,
          `🔄 Данные обновлены! \nМинимальная цена: ${newPrices.minPrice} \nМаксимальная цена: ${newPrices.maxPrice} \n\nТекущая цена: ${newPrices.currentPrice} `
        );
    }
  });
}

setInterval(processUsers, 60000);

module.exports = bot;
