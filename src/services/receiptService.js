const pool = require('../db/pool');

async function getReceiptDetailByResi(resiNumber) {
  const query = `
    SELECT
      rpr.resi_number,
      rpr.condition_note,
      rpr.received_at,
      rpr.product_items,
      rpr.courier_snapshot,
      s.name AS store_name,
      s.phone AS store_phone,
      rpc.name AS courier_name,
      rpc.primary_whatsapp_number AS courier_whatsapp,
      (
        SELECT json_agg(json_build_object(
          'type', rpn.type,
          'status', rpn.status,
          'sent_at', rpn.sent_at
        ) ORDER BY rpn.sent_at DESC)
        FROM return_package_receipt_notifications rpn
        WHERE rpn.receipt_id = rpr.id
      ) AS notifications
    FROM return_package_receipts rpr
    LEFT JOIN stores s ON rpr.store_id = s.id
    LEFT JOIN return_pickup_couriers rpc ON rpr.courier_id = rpc.id
    WHERE UPPER(TRIM(rpr.resi_number)) = UPPER(TRIM($1))
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [resiNumber]);
  return rows.length > 0 ? rows[0] : null;
}

module.exports = { getReceiptDetailByResi };
