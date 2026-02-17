# Inventory System Functional Requirements (v1)

## Core outcomes
- Maintain an accurate, auditable count of inventory by tenant.
- Support day-to-day inventory operations: item setup, receiving, adjustments, and low-stock response.
- Keep data partitioned per tenant/business.

## Inventory domain model
- Item:
  - `sku` (unique per tenant)
  - `name`
  - `description` (optional)
  - `quantity_on_hand` (integer, cannot be negative)
  - `reorder_point` (integer, default 0)
  - timestamps (`created_at`, `updated_at`)
- Stock movement log:
  - `item_id`
  - `change_amount` (positive for add, negative for remove)
  - `reason` (receive, sale, correction, transfer, etc.)
  - `performed_by` (optional user reference)
  - timestamp

## Tenant app shell requirements
- App catalog endpoint returns all available apps.
- Tenant installed apps endpoint returns only enabled apps for that tenant.
- Install app endpoint enables an app for a tenant.
- Installing same app twice is idempotent.

## Inventory workflows (must-have)
- Add item with SKU/name and optional reorder point.
- List items with current stock.
- Adjust stock up/down with reason.
- Prevent stock from going below zero.
- Highlight low-stock items where `quantity_on_hand <= reorder_point`.

## Validation and constraints
- SKU unique per tenant.
- Name required and trimmed.
- Reorder point must be `>= 0`.
- Quantity adjustments cannot produce negative inventory.
- All inventory operations require tenant context.

## API requirements
- Inventory list endpoint supports:
  - `tenant_id`
  - optional `low_stock_only`
- Create item endpoint enforces tenant+SKU uniqueness.
- Adjust stock endpoint records movement log.

## Security and operational requirements
- Tenant isolation: query/update must include tenant filter.
- Authentication should map user to tenant; tenant should not be trusted from client long-term.
- Record stock adjustments for auditability.
- Support future sync/export without changing core item keys.

## Future phases (not in v1)
- Multi-location warehouses/bins
- Purchase orders and suppliers
- Barcode/QR scanning
- Reservations/allocations
- Batch/lot/expiry tracking
- Role-based permissions for stock adjustments
