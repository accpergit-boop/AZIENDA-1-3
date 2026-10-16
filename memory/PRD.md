# SUPER IQ-FOAM ERP — PRD

## Original problem statement
Private ERP for SUPER IQ-FOAM (foam/mattress manufacturer & wholesaler, Kokstad, KZN, South Africa). ZAR (R 1,234.56), English UI, single admin, Africa/Johannesburg timezone. Modules: Dashboard, Customers, Invoices (+payments, PDF, print, copy), Price lists Zone 1/2, Orders, Stock (movement ledger), Production (resting, weather), Cutting & Mattress Processing, Attendance & work allocation, Deliveries, Drivers, Fleet (vehicles, trailers, repairs, maintenance, spare parts), Expenses, Reports, Settings, Global search, Audit history. Full spec = user's "COMPLETE ERP AUDIT" message (25 sections) — phased delivery approved.

## User choices
- Fleet: Mighty Hyundai Truck, Hino 500 (largest), Hino 300, Trailer (1) 9 m, Trailer (2) 5 m, Trailer (3) 4 m
- Weather: manual assessment only (Suitable/Caution/Unsuitable + rain/cold)
- Candy = Ribbon price in both zones; Ribbon/Candy 1370x150 always manual price
- Tax disabled by default; client-side PDF (jsPDF); simple admin JWT login

## Architecture
- Backend: FastAPI monolith `/app/backend/server.py`, seed constants `/app/backend/seed_data.py`, MongoDB (Motor). Decimal money helpers (D/r2/dsum), TZ helpers, `log_audit` -> `audit_log`, `StockLock`, idempotency/dedupe unique indexes.
- Frontend: React 19 + Vite + Tailwind v4, pages in `/app/frontend/src/pages`.
- Tests: `/app/backend/tests/test_phase_a_integrity.py` (44 tests, run with `-n 0`).

## Implemented
- 2026 (earlier): core modules, seeding, Orders/Fleet/Expenses pages.
- Phase A (P0 integrity) DONE & tested (iteration_1 + fixes): Decimal money; JHB timezone; admin not reset on restart; idempotent seeding by key; price lookup with Candy mapping & manual-only Ribbon 1370x150; issue validation blocks missing prices; issued invoices keep prices; void requires reason & no active payments; draft-only delete; payments idempotent + locked + reversible; stock ledger (manual types only, reason required, no negative, reversal of manual movements, opening locked, per-stock lock); atomic dispatch once with stock check; delivery PUT can't set Dispatched/Delivered without dispatch; production weather/override rules, resting enforced, receive-into-stock once; fleet costs counted once (records Done only), spare part purchase -> single linked expense; expenses void instead of delete; estimated-result labels; dashboard extra KPIs; customer summary (overdue/open orders/upcoming deliveries); audit log endpoint; print view hides chrome.

## Backlog
- P1 Phase B: Orders with product lines & ordered/assigned/dispatched/delivered/remaining qty; deliveries linked to multiple orders, partial deliveries, actual delivered qty; vehicle/driver overlap warnings & suggested vehicle; invoice order-matching import + duplicate invoicing guard; cash collected reconciliation.
- P2 Phase C: Cutting & Mattress Processing (stages, bundles 5/10), Reports page, global search (all entities), weekly work assignments, settings UI for bundle sizes/vehicle types/categories, demand-aware production recommendations, login brute-force lockout, void path for mistaken spare-part purchases, shadcn date pickers.
