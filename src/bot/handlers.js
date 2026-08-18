const { getReceiptDetailByResi } = require('../services/receiptService');
const { formatReceiptMessage } = require('./formatter');

const GREETING_MESSAGE = 'Selamat datang di SimpleCMPOS, Bos Rifan, ada yang bisa aku bantu hari ini ?';

const MAIN_MENU_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🔌 Cek Koneksi BOT', callback_data: 'cek_koneksi' }],
      [{ text: '📦 Cek Retur Paket', callback_data: 'cek_retur' }],
    ],
  },
};

const greetingSentDate = new Map();

function getTodayWIB() {
  return new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function sendMainMenu(bot, chatId) {
  const today = getTodayWIB();
  const lastDate = greetingSentDate.get(chatId);

  if (lastDate === today) {
    bot.sendMessage(chatId, 'Pilih menu di bawah ini:', MAIN_MENU_KEYBOARD);
  } else {
    greetingSentDate.set(chatId, today);
    bot.sendMessage(chatId, GREETING_MESSAGE, MAIN_MENU_KEYBOARD);
  }
}

function registerHandlers(bot) {
  bot.onText(/\/start/, (msg) => {
    sendMainMenu(bot, msg.chat.id);
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    if (data === 'cek_koneksi') {
      try {
        const pool = require('../db/pool');
        await pool.query('SELECT 1');
        await bot.sendMessage(chatId, '✅ Koneksi BOT dan database aktif, Bos!');
      } catch (err) {
        console.error('[CONNECTION CHECK ERROR]', err);
        await bot.sendMessage(chatId, '❌ Koneksi database bermasalah, Bos.');
      }
    }

    if (data === 'cek_retur') {
      await bot.sendMessage(chatId, 'Silakan kirim nomor resi retur paket Anda:');
    }
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    if (!text || text.startsWith('/')) return;

    try {
      console.log(`[QUERY] resi: "${text}" from chat ${chatId}`);
      const data = await getReceiptDetailByResi(text);

      if (data) {
        console.log(`[FOUND] resi: "${text}"`);
        await bot.sendMessage(chatId, formatReceiptMessage(data), { parse_mode: 'HTML' });
      } else {
        console.log(`[NOT FOUND] resi: "${text}"`);
        await bot.sendMessage(chatId, 'Maaf Bos resi yang anda cari tidak ketemu');
      }
    } catch (err) {
      console.error(`[ERROR] resi: "${text}"`, err);
      await bot.sendMessage(chatId, 'Terjadi kendala, silakan coba lagi nanti.');
    }

    sendMainMenu(bot, chatId);
  });
}

module.exports = { registerHandlers };
