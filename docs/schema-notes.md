# Schema Notes — return_package_receipts

Discovery date: 2026-08-18

## Main Table: `return_package_receipts`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | NO | PK |
| store_id | uuid | NO | FK → stores.id |
| courier_id | uuid | NO | FK → return_pickup_couriers.id |
| courier_snapshot | jsonb | NO | Snapshot of courier data at receipt time |
| resi_number | varchar | NO | **Nomor resi** — kolom pencarian utama |
| product_items | jsonb | YES | Daftar item paket (saat discovery: seluruh baris NULL) |
| condition_note | text | YES | Catatan kondisi paket |
| received_at | timestamp | NO | Waktu paket diterima |
| last_notified_at | timestamp | YES | |
| last_notification_status | varchar | YES | |
| last_notification_error | varchar | YES | |
| last_notification_recipients | jsonb | YES | |
| version | integer | NO | |
| created_by | uuid | YES | FK → users.id |
| updated_by | uuid | YES | FK → users.id |
| created_at | timestamp | YES | |
| updated_at | timestamp | YES | |

## Foreign Keys (outgoing)

| Column | References |
|--------|------------|
| store_id | stores.id |
| courier_id | return_pickup_couriers.id |
| created_by | users.id |
| updated_by | users.id |

## Foreign Keys (incoming — one-to-many)

| Table | Column | References |
|-------|--------|------------|
| return_package_receipt_notifications | receipt_id | return_package_receipts.id |

## Related Tables

### `stores`
Key columns for display: `name`, `phone`, `email`, `address_line1`, `city`, `province`.

### `return_pickup_couriers`
Key columns for display: `name`, `primary_whatsapp_number`, `office_address`.

### `return_package_receipt_notifications`
Key columns for display: `type`, `status`, `sent_at`, `error_message`.

## Query Strategy

Search by `resi_number` (case-insensitive, trimmed) on `return_package_receipts`, then LEFT JOIN:
- `stores` for store info
- `return_pickup_couriers` for courier info
- Subquery with `json_agg` for notifications (one-to-many)

## Sample Data (discovery)

```
resi_number: JX6150665006
store_name: Al Barr Snack
courier_name: Regar
received_at: 2025-10-29 01:04:33
```
