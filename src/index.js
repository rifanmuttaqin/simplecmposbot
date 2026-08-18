require('./utils/dns-fix');
require('./config/env');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/env');
const pool = require('./db/pool');
const { registerHandlers } = require('./bot/handlers');

async function main() {
  try {
    await pool.query('SELECT 1');
    console.log('Database connected.');
  } catch (err) {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  }

  const bot = new TelegramBot(config.telegramToken, { polling: true });
  registerHandlers(bot);
  console.log('Bot cek resi aktif...');

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });
}

main();
