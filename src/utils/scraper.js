const puppeteer = require("puppeteer");
const db = require("./db");
const { TARGET_URL } = require("./config");

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
}

module.exports = { scrapePricesWithRetry };
