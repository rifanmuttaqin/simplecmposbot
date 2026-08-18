function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatReceiptMessage(data) {
  const lines = [
    `<b>📦 Detail Resi Retur</b>`,
    ``,
    `<b>Nomor Resi:</b> ${escapeHtml(data.resi_number)}`,
    `<b>Tanggal Diterima:</b> ${formatDate(data.received_at)}`,
    `<b>Toko:</b> ${escapeHtml(data.store_name) || '-'}`,
    `<b>Kurir:</b> ${escapeHtml(data.courier_name) || '-'}`,
  ];

  if (data.condition_note) {
    lines.push(`<b>Catatan Kondisi:</b> ${escapeHtml(data.condition_note)}`);
  }

  if (data.product_items && Array.isArray(data.product_items) && data.product_items.length > 0) {
    lines.push('');
    lines.push('<b>Item Paket:</b>');
    data.product_items.forEach((item, i) => {
      const name = item.name || item.product_name || `Item ${i + 1}`;
      const qty = item.quantity || item.qty || '-';
      lines.push(`  ${i + 1}. ${escapeHtml(name)} (qty: ${qty})`);
    });
  }

  if (data.notifications && data.notifications.length > 0) {
    lines.push('');
    lines.push('<b>Riwayat Notifikasi:</b>');
    data.notifications.forEach((n) => {
      lines.push(`  • [${escapeHtml(n.type)}] ${escapeHtml(n.status)} — ${formatDate(n.sent_at)}`);
    });
  }

  return lines.join('\n');
}

module.exports = { formatReceiptMessage };
