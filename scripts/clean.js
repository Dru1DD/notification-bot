const fs = require('fs');

// Удаляем файл базы данных, если он существует
if (fs.existsSync('./prices.db')) {
  fs.unlinkSync('./prices.db');
  console.log('Старая база данных удалена.');
}
