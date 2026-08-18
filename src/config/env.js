require('dotenv').config();

const requiredVars = [
  'TELEGRAM_BOT_TOKEN',
  'DB_HOST',
  'DB_PORT',
  'DB_DATABASE',
  'DB_USERNAME',
  'DB_PASSWORD',
  'OPEN_AI_APIKEY',
  'OPEN_AI_BASE_URL',
  'OPEN_AI_MODEL',
];

const missing = requiredVars.filter((v) => !process.env[v]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  openai: {
    apiKey: process.env.OPEN_AI_APIKEY,
    baseURL: process.env.OPEN_AI_BASE_URL,
    model: process.env.OPEN_AI_MODEL,
  },
};
