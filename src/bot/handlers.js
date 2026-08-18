const { getReceiptDetailByResi } = require('../services/receiptService');
const { formatReceiptMessage } = require('./formatter');

function registerHandlers(bot) {
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      'Selamat datang! Kirim nomor resi retur paket Anda langsung di chat ini, dan saya akan menampilkan detailnya.'
    );
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
  });
}

module.exports = { registerHandlers };
