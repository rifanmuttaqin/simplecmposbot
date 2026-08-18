const pool = require('../db/pool');
const { chat } = require('./aiService');
const { getReceiptDetailByResi } = require('./receiptService');
const { createLogger } = require('../utils/logger');

const log = createLogger('CHAT');

const MAX_HISTORY = 10;
const MAX_TOOL_ROUNDS = 3;
const INACTIVITY_TTL_MS = 30 * 60 * 1000;

const conversations = new Map();
const chatModeMap = new Map();

// ─── Tools Definition (OpenAI Function Calling) ─────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_latest_data',
      description:
        'Mengambil data terakhir dari database. Gunakan ketika user meminta data terbaru/terakhir.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Jumlah data yang ingin diambil (contoh: 10)',
          },
        },
        required: ['limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_receipt_by_resi',
      description: 'Mengecek detail resi retur paket berdasarkan nomor resi.',
      parameters: {
        type: 'object',
        properties: {
          resi_number: {
            type: 'string',
            description: 'Nomor resi retur paket',
          },
        },
        required: ['resi_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_return_receipts',
      description:
        'Mengambil daftar retur paket (return_package_receipts). Bisa filter berdasarkan nomor resi.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'Kata kunci nomor resi (kosongkan untuk semua)',
          },
          limit: {
            type: 'integer',
            description: 'Jumlah maksimum hasil (default: 10)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_products',
      description:
        'Mencari produk berdasarkan nama atau SKU. Gunakan ketika user menanyakan data produk.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'Kata kunci pencarian nama atau SKU produk (kosongkan untuk semua)',
          },
          limit: {
            type: 'integer',
            description: 'Jumlah maksimum hasil (default: 5)',
          },
        },
        required: ['search_term'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_transactions',
      description:
        'Mencari transaksi POS berdasarkan kata kunci dan/atau status.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'Kata kunci nomor transaksi atau nama pelanggan',
          },
          status: {
            type: 'string',
            description: 'Status transaksi (contoh: completed, pending, cancelled)',
          },
          limit: {
            type: 'integer',
            description: 'Jumlah maksimum hasil (default: 5)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_stock',
      description: 'Mengecek stok produk berdasarkan nama produk.',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'Nama produk yang ingin dicek stoknya',
          },
        },
        required: ['product_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_cashflow',
      description:
        'Mengambil data transaksi kas (cashflow_transactions). Bisa filter berdasarkan arah (cash_in/cash_out), status, dan kata kunci.',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            description: 'Arah kas: cash_in (pemasukan) atau cash_out (pengeluaran). Kosongkan untuk semua.',
          },
          status: {
            type: 'string',
            description: 'Status transaksi: issued, draft, void. Kosongkan untuk semua.',
          },
          search_term: {
            type: 'string',
            description: 'Kata kunci pencarian di nomor transaksi, counterparty, atau catatan',
          },
          limit: {
            type: 'integer',
            description: 'Jumlah maksimum hasil (default: 10)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_cashflow_summary',
      description:
        'Mendapatkan ringkasan total pemasukan (cash_in) dan pengeluaran (cash_out) serta saldo bersih.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Tanggal awal format YYYY-MM-DD (opsional)',
          },
          end_date: {
            type: 'string',
            description: 'Tanggal akhir format YYYY-MM-DD (opsional)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_contents',
      description:
        'Mencari data konten (contents) berdasarkan kata kunci, status, atau tanggal. Gunakan ketika user menanyakan data konten, jadwal konten, atau rencana produksi konten.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'Kata kunci pencarian di title, script, atau product_name (kosongkan untuk semua)',
          },
          status: {
            type: 'string',
            description: 'Filter status konten: draft, dibuat, terbit, dibatalkan. Kosongkan untuk semua.',
          },
          content_date: {
            type: 'string',
            description: 'Filter tanggal konten format YYYY-MM-DD (opsional)',
          },
          limit: {
            type: 'integer',
            description: 'Jumlah maksimum hasil (default: 10)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_content_detail',
      description:
        'Mengambil detail satu konten berdasarkan ID, termasuk label dan riwayat perubahan status.',
      parameters: {
        type: 'object',
        properties: {
          content_id: {
            type: 'string',
            description: 'ID konten (uuid)',
          },
        },
        required: ['content_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_content_labels',
      description:
        'Mengambil daftar label konten (content_labels) yang tersedia. Bisa filter berdasarkan kata kunci.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'Kata kunci nama label (kosongkan untuk semua)',
          },
          limit: {
            type: 'integer',
            description: 'Jumlah maksimum hasil (default: 20)',
          },
        },
        required: [],
      },
    },
  },
];

// ─── Database Query: Latest Transactions ─────────────────────────────────────

async function fetchDataFromDB(limit) {
  const { rows } = await pool.query(
    `SELECT id, number, status, customer_name, grand_total_amount, payment_method, issued_at
     FROM pos_transactions
     ORDER BY issued_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// ─── Real Database Query Functions ───────────────────────────────────────────

async function queryReceiptByResi(resiNumber) {
  const data = await getReceiptDetailByResi(resiNumber);
  if (!data) return JSON.stringify({ result: 'not_found', resi_number: resiNumber });
  return JSON.stringify({
    resi_number: data.resi_number,
    condition_note: data.condition_note,
    received_at: data.received_at,
    store_name: data.store_name,
    courier_name: data.courier_name,
  });
}

async function queryReturnReceipts(searchTerm, limit = 10) {
  let sql = `SELECT rpr.id, rpr.resi_number, rpr.condition_note, rpr.received_at, rpr.product_items,
                    s.name AS store_name,
                    rpc.name AS courier_name
             FROM return_package_receipts rpr
             LEFT JOIN stores s ON rpr.store_id = s.id
             LEFT JOIN return_pickup_couriers rpc ON rpr.courier_id = rpc.id`;
  const params = [];
  let idx = 1;

  if (searchTerm) {
    sql += ` WHERE UPPER(TRIM(rpr.resi_number)) ILIKE '%' || $${idx} || '%'`;
    params.push(searchTerm);
    idx++;
  }

  sql += ` ORDER BY rpr.received_at DESC LIMIT $${idx}`;
  params.push(limit);

  const { rows } = await pool.query(sql, params);
  return JSON.stringify({ count: rows.length, return_receipts: rows });
}

async function queryCashflow(direction, status, searchTerm, limit = 10) {
  let sql = `SELECT ct.number, ct.direction, ct.status, ct.amount, ct.transacted_at,
                    ct.counterparty_name, ct.notes, ct.reference_number,
                    cc.name AS category_name, cc.code AS category_code
             FROM cashflow_transactions ct
             LEFT JOIN cashflow_categories cc ON ct.cashflow_category_id = cc.id
             WHERE ct.is_active = 'active'`;
  const params = [];
  let idx = 1;

  if (direction) {
    sql += ` AND ct.direction = $${idx}`;
    params.push(direction);
    idx++;
  }
  if (status) {
    sql += ` AND ct.status = $${idx}`;
    params.push(status);
    idx++;
  }
  if (searchTerm) {
    sql += ` AND (ct.number ILIKE '%' || $${idx} || '%'
                 OR ct.counterparty_name ILIKE '%' || $${idx} || '%'
                 OR ct.notes ILIKE '%' || $${idx} || '%')`;
    params.push(searchTerm);
    idx++;
  }

  sql += ` ORDER BY ct.transacted_at DESC LIMIT $${idx}`;
  params.push(limit);

  const { rows } = await pool.query(sql, params);
  return JSON.stringify({ count: rows.length, cashflow_transactions: rows });
}

async function queryCashflowSummary(startDate, endDate) {
  let sql = `SELECT
               direction,
               COUNT(*) AS total_transactions,
               COALESCE(SUM(amount), 0) AS total_amount
             FROM cashflow_transactions
             WHERE is_active = 'active' AND status = 'issued'`;
  const params = [];
  let idx = 1;

  if (startDate) {
    sql += ` AND transacted_at >= $${idx}`;
    params.push(startDate);
    idx++;
  }
  if (endDate) {
    sql += ` AND transacted_at <= $${idx}::timestamp + INTERVAL '1 day'`;
    params.push(endDate);
    idx++;
  }

  sql += ` GROUP BY direction`;

  const { rows } = await pool.query(sql, params);

  let totalIn = 0;
  let totalOut = 0;
  let countIn = 0;
  let countOut = 0;

  for (const row of rows) {
    if (row.direction === 'cash_in') {
      totalIn = parseFloat(row.total_amount);
      countIn = parseInt(row.total_transactions, 10);
    } else if (row.direction === 'cash_out') {
      totalOut = parseFloat(row.total_amount);
      countOut = parseInt(row.total_transactions, 10);
    }
  }

  return JSON.stringify({
    period: { start_date: startDate || 'all', end_date: endDate || 'all' },
    cash_in: { total_transactions: countIn, total_amount: totalIn },
    cash_out: { total_transactions: countOut, total_amount: totalOut },
    balance: totalIn - totalOut,
  });
}

async function queryProducts(searchTerm, limit = 5) {
  const { rows } = await pool.query(
    `SELECT name, sku, default_retail_price
     FROM products
     WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR sku ILIKE '%' || $1 || '%')
     LIMIT $2`,
    [searchTerm || '', limit]
  );
  return JSON.stringify({ count: rows.length, products: rows });
}

async function queryTransactions(searchTerm, status, limit = 5) {
  let sql = `SELECT number, status, customer_name, grand_total_amount, payment_method, issued_at
             FROM pos_transactions WHERE 1=1`;
  const params = [];
  let idx = 1;

  if (searchTerm) {
    sql += ` AND (number ILIKE '%' || $${idx} || '%' OR customer_name ILIKE '%' || $${idx} || '%')`;
    params.push(searchTerm);
    idx++;
  }
  if (status) {
    sql += ` AND status = $${idx}`;
    params.push(status);
    idx++;
  }
  sql += ` ORDER BY issued_at DESC LIMIT $${idx}`;
  params.push(limit);

  const { rows } = await pool.query(sql, params);
  return JSON.stringify({ count: rows.length, transactions: rows });
}

async function queryStock(productName) {
  const { rows } = await pool.query(
    `SELECT p.name, p.sku, s.quantity, s.reserved_quantity, s.min_stock_threshold
     FROM stocks s
     JOIN products p ON s.product_id = p.id
     WHERE p.name ILIKE '%' || $1 || '%'
     LIMIT 5`,
    [productName]
  );
  return JSON.stringify({ count: rows.length, stocks: rows });
}

// ─── Content Query Functions ─────────────────────────────────────────────────

async function queryContents(searchTerm, status, contentDate, limit = 10) {
  let sql = `SELECT c.id, c.title, c.session, c.status, c.content_date,
                    c.product_name, c.script_format, c.caption,
                    e.full_name AS employee_name,
                    (SELECT string_agg(cl.name, ', ')
                     FROM content_content_labels ccl
                     JOIN content_labels cl ON ccl.content_label_id = cl.id
                     WHERE ccl.content_id = c.id) AS labels
             FROM contents c
             LEFT JOIN employees e ON c.employee_id = e.id
             WHERE c.is_active = 'active'`;
  const params = [];
  let idx = 1;

  if (searchTerm) {
    sql += ` AND (c.title ILIKE '%' || $${idx} || '%'
                 OR c.script ILIKE '%' || $${idx} || '%'
                 OR c.product_name ILIKE '%' || $${idx} || '%')`;
    params.push(searchTerm);
    idx++;
  }
  if (status) {
    sql += ` AND c.status = $${idx}`;
    params.push(status);
    idx++;
  }
  if (contentDate) {
    sql += ` AND c.content_date = $${idx}`;
    params.push(contentDate);
    idx++;
  }

  sql += ` ORDER BY c.content_date DESC, c.created_at DESC LIMIT $${idx}`;
  params.push(limit);

  const { rows } = await pool.query(sql, params);
  return JSON.stringify({ count: rows.length, contents: rows });
}

async function queryContentDetail(contentId) {
  const contentSql = `SELECT c.*, e.full_name AS employee_name,
                              s.name AS store_name
                       FROM contents c
                       LEFT JOIN employees e ON c.employee_id = e.id
                       LEFT JOIN stores s ON c.store_id = s.id
                       WHERE c.id = $1`;
  const { rows: contentRows } = await pool.query(contentSql, [contentId]);
  if (contentRows.length === 0) {
    return JSON.stringify({ result: 'not_found', content_id: contentId });
  }

  const content = contentRows[0];

  const labelsSql = `SELECT cl.id, cl.name, cl.color
                     FROM content_content_labels ccl
                     JOIN content_labels cl ON ccl.content_label_id = cl.id
                     WHERE ccl.content_id = $1
                     ORDER BY cl.name`;
  const { rows: labels } = await pool.query(labelsSql, [contentId]);

  const historySql = `SELECT from_status, to_status, note, changed_by, created_at
                      FROM content_status_histories
                      WHERE content_id = $1
                      ORDER BY created_at DESC`;
  const { rows: history } = await pool.query(historySql, [contentId]);

  return JSON.stringify({ content, labels, status_history: history });
}

async function queryContentLabels(searchTerm, limit = 20) {
  let sql = `SELECT id, name, color, usage_count
             FROM content_labels
             WHERE is_active = 'active'`;
  const params = [];
  let idx = 1;

  if (searchTerm) {
    sql += ` AND name ILIKE '%' || $${idx} || '%'`;
    params.push(searchTerm);
    idx++;
  }

  sql += ` ORDER BY usage_count DESC, name ASC LIMIT $${idx}`;
  params.push(limit);

  const { rows } = await pool.query(sql, params);
  return JSON.stringify({ count: rows.length, labels: rows });
}

// ─── Tool Execution Router ───────────────────────────────────────────────────

async function executeFunction(name, args) {
  log.info(`Executing tool: ${name}`, JSON.stringify(args));
  switch (name) {
    case 'get_latest_data':
      return JSON.stringify({
        count: args.limit,
        data: await fetchDataFromDB(args.limit),
      });
    case 'query_receipt_by_resi':
      return queryReceiptByResi(args.resi_number);
    case 'query_return_receipts':
      return queryReturnReceipts(args.search_term, args.limit || 10);
    case 'query_products':
      return queryProducts(args.search_term, args.limit || 5);
    case 'query_transactions':
      return queryTransactions(args.search_term, args.status, args.limit || 5);
    case 'query_stock':
      return queryStock(args.product_name);
    case 'query_cashflow':
      return queryCashflow(args.direction, args.status, args.search_term, args.limit || 10);
    case 'query_cashflow_summary':
      return queryCashflowSummary(args.start_date, args.end_date);
    case 'query_contents':
      return queryContents(args.search_term, args.status, args.content_date, args.limit || 10);
    case 'query_content_detail':
      return queryContentDetail(args.content_id);
    case 'query_content_labels':
      return queryContentLabels(args.search_term, args.limit || 20);
    default:
      return JSON.stringify({ error: `Unknown function: ${name}` });
  }
}

// ─── Chat Mode Management ────────────────────────────────────────────────────

function isInChatMode(chatId) {
  return chatModeMap.has(chatId);
}

function enterChatMode(chatId) {
  chatModeMap.set(chatId, true);
  conversations.set(chatId, { messages: [], lastActivity: Date.now() });
  log.info(`Chat mode entered for ${chatId}`);
}

function exitChatMode(chatId) {
  chatModeMap.delete(chatId);
  conversations.delete(chatId);
  log.info(`Chat mode exited for ${chatId}`);
}

function getConversation(chatId) {
  const conv = conversations.get(chatId);
  if (!conv) return null;
  if (Date.now() - conv.lastActivity > INACTIVITY_TTL_MS) {
    log.info(`Conversation expired for ${chatId}`);
    exitChatMode(chatId);
    return null;
  }
  conv.lastActivity = Date.now();
  return conv;
}

function trimHistory(messages) {
  if (messages.length > MAX_HISTORY) {
    return messages.slice(messages.length - MAX_HISTORY);
  }
  return messages;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Main Message Handler (Function Calling Flow) ────────────────────────────

async function handleMessage(chatId, text) {
  const conv = getConversation(chatId);
  if (!conv) {
    return 'Sesi chat telah berakhir. Silakan klik "💬 Chat Agent" lagi untuk memulai ulang.';
  }

  conv.messages.push({ role: 'user', content: text });

  try {
    // ── Langkah 1: Kirim pesan user + tools ke LLM ──
    let response = await chat(trimHistory(conv.messages), tools);
    let rounds = 0;

    // ── Langkah 2-6: Loop eksekusi tool calls ──
    while (response.tool_calls && rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      log.info(`Function calling round ${rounds}: ${response.tool_calls.length} tool(s) detected`);

      // Simpan pesan assistant (yang berisi tool_calls) ke riwayat
      conv.messages.push(response);

      // Eksekusi setiap tool call yang diminta LLM
      for (const toolCall of response.tool_calls) {
        const functionName = toolCall.function.name;
        let functionArgs = {};

        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (parseErr) {
          log.error(`Failed to parse tool arguments for ${functionName}:`, parseErr.message);
          functionArgs = {};
        }

        log.info(`Tool call: ${functionName}(${JSON.stringify(functionArgs)})`);

        // Eksekusi fungsi dan dapatkan hasilnya
        const functionResult = await executeFunction(functionName, functionArgs);

        // ── Langkah 6: Masukkan hasil ke messages dengan role "tool" ──
        conv.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: functionResult,
        });
      }

      // ── Langkah 7: Request KEDUA ke LLM dengan riwayat lengkap ──
      response = await chat(trimHistory(conv.messages), tools);
    }

    // ── Langkah 8: Ambil jawaban final (kalimat natural) ──
    let content = response.content || '';

    if (!content || content.trim() === '') {
      content = 'Maaf, saya tidak bisa memproses pertanyaan Anda saat ini.';
    }

    conv.messages.push({ role: 'assistant', content });

    return escapeHtml(content);
  } catch (err) {
    log.error('Chat error:', err.message, err.code || '');
    return 'Terjadi kendala pada AI service. Silakan coba lagi nanti.';
  }
}

// ─── Cleanup Expired Conversations ───────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [chatId, conv] of conversations.entries()) {
    if (now - conv.lastActivity > INACTIVITY_TTL_MS) {
      log.info(`Cleaning up expired conversation for ${chatId}`);
      exitChatMode(chatId);
    }
  }
}, 5 * 60 * 1000);

module.exports = { isInChatMode, enterChatMode, exitChatMode, handleMessage };
