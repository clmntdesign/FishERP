# Fish ERP MVP Spec

## Product Direction

- Korean-primary UI with English support labels
- Web-first, mobile-responsive operations workflow
- Single-role operation now, multi-role schema ready

## MVP Modules

1. Dashboard (`/dashboard`)
2. Shipment Management (`/shipments`)
3. Live Inventory (`/inventory`)
4. Sales (`/sales`)
5. Accounts Payable (`/payables`)
6. Master Data (`/master-data`)

## Core Tables

- `profiles`
- `suppliers`
- `buyers`
- `species`
- `shipments`
- `shipment_line_items`
- `ancillary_costs`
- `sales`
- `mortality_records`
- `ap_transactions`
- `ap_payments`
- `ap_payment_allocations`

## Supporting Views

- `supplier_balances`
- `shipment_inventory_summary`

## Business Rules (Phase 1)

- Shipment FX must be positive when provided
- Stock = intake - sales - mortality
- Negative stock blocked in app logic before write
- AP debits linked to shipment on intake confirmation
- AP credits and write-offs reduce supplier outstanding
