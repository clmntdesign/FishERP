# Fish ERP Implementation Roadmap (Recap-Aligned)

This roadmap follows the priorities defined in `project-recqp.txt` section 10.

## Objective for Phase 1 (MVP)

Replace both Excel workbooks with structured web workflows for:

- shipment intake and cost entry
- live inventory tracking
- sales dispatch and payment status
- supplier accounts payable ledger
- per-shipment profitability visibility

## Scope Guardrails

### Included in MVP

1. User authentication and role-aware access baseline
2. Master data (suppliers, buyers, species)
3. Shipment CRUD with line items, FX, ancillary costs
4. Live inventory integrity (no silent negative stock)
5. Sales recording linked to shipment and buyer
6. AP transactions and payment allocation basics
7. Real-data dashboard replacing stale summary sheets
8. One-time historical migration tooling and reconciliation

### Explicitly deferred (Phase 2+)

- FX API auto-sync
- advanced trend analytics and chart suite
- compliance export/API integration (traceability, customs systems)
- accounting software integration

## Delivery Waves

## Wave 1 - Security and Core Foundation

- Auth flow (sign-in/sign-out) and protected routes
- Role model present in DB and policy-ready
- Environment hardening for Railway + Supabase
- Server-side Supabase access layer in Next.js

Done when:

- Unauthenticated access to operational routes is blocked
- Authenticated session is stable across page reloads and deploys

## Wave 2 - Master Data Operations

- Supplier/Buyer/Species listing and create flows
- Korean-primary field labels with bilingual support labels
- Validation and duplicate-code handling

Done when:

- Operations user can add required reference records without SQL/manual edits

## Wave 3 - Shipment Data Entry Replacement

- Shipment list + detail + create/edit
- Line items + FX + ancillary cost capture
- Status transitions: pending_customs -> in_tank -> partially_sold -> completed
- Shipment-level cost and margin summary model

Done when:

- A full import batch can be entered without spreadsheet fallback

## Wave 4 - Inventory Integrity and Sales Flow

- Dispatch entry linked to shipment/buyer/species
- Mortality record and stock deduction
- Negative stock guard with controlled override reason logging

Done when:

- Stock equals intake - sales - mortality for each shipment
- Impossible stock situations are blocked by default

## Wave 5 - AP Ledger and Dashboard Parity

- AP debit/credit entries tied to suppliers and shipments
- Payment allocation records
- Dashboard powered by live DB views (active batch, stock, AP balances)

Done when:

- AP outstanding totals and dashboard numbers match underlying transactions

## Wave 6 - Historical Migration and Cutover

- Migration scripts for both Excel files
- Data quality flags for known anomalies (missing amount, FX corruption, negative stock)
- Reconciliation reports against source totals
- Cutover checklist to stop new Excel entries

Done when:

- Existing history is loaded with traceable exceptions
- Daily operation can run fully in-app

## Acceptance Metrics (Phase 1)

- 100% of new shipments entered in app only
- 0 silent negative stock records
- AP ledger reconciles to shipment-linked transactions
- Dashboard loads live values from DB views, not hardcoded samples
- Historical records imported with anomaly audit trail
