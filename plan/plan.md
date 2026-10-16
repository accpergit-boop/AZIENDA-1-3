# SUPER IQ-FOAM — Clean Start & Edit Any Invoice

Removes all test data left by automated testing, so the ERP starts clean with only real business records.
Adds a clear "Edit" button so any invoice can be corrected at any time, with every change recorded.

## Who it's for
The owner of SUPER IQ-FOAM, the only user. He wants the system to contain only real data and to be able to fix any invoice mistake himself.

## Core features and experience

### 1. Clean start: remove test data
**Removed (all of it is test data):**
- Every test invoice and its payments. This is everything except the 26 Opening Balance invoices.
- All orders and all deliveries.
- All expenses, including spare-part purchase expenses.
- All production blocks.
- All vehicle expense, repair and maintenance records, and all spare parts.
- All attendance entries.
- All stock movements (none are real, because stock was reloaded from the photo today).
- All AI Assistant conversations.
- Every customer, vehicle and employee whose name starts with "TEST_", such as TEST_UI_Van and TEST_Van2.

**Kept:**
- The 266 customers from the owner's list, with their 26 Opening Balance invoices (R 905,471.00).
- The 56 real stock items with the quantities from the photo.
- The fleet: Mighty Hyundai Truck, Hino 500, Hino 300, Trailer (1) 9 m, Trailer (2) 5 m, Trailer (3) 4 m.
- Real employees and drivers (Abdul, Tkoso, Ayanda and any other non-test names).
- Price lists Zone 1 and Zone 2.
- Settings, including the Google access list.
- The admin login.

**Invoice numbering restarts:** the 26 Opening Balance invoices are renumbered IQF-2026-0001 to IQF-2026-0026, in alphabetical order of customer. The next real invoice will be IQF-2026-0027.

**Change history:** one history entry records what the clean-up removed. The rest of the history from testing is cleared, because it refers only to test records.

After the clean-up the Dashboard shows these figures:
- Outstanding: R 905,471.00 (Opening Balances only)
- Total Invoiced: R 0.00
- Payments Received: R 0.00
- Expenses: R 0.00
- Orders: 0
- Deliveries: 0

### 2. "Edit" button on every invoice
- An **Edit** button appears on each row of the Invoices list and at the top of every open invoice. It covers drafts, issued, partly paid, paid and overdue invoices, and Opening Balances.
- An invoice opens read-only first. Pressing **Edit** unlocks everything that can be changed:
  - customer, invoice date, due date, price zone, payment terms, reference and delivery destination
  - lines: add, remove, change quantity, category, size, description or unit price
  - discount, extra charges and notes
  - the amount of an Opening Balance
- **Save changes** asks for an optional short reason, such as "wrong price" or "wrong customer". **Cancel** discards the edits.
- Each save is recorded in the invoice's **Change History** panel: date, what changed (old → new), and the reason.
- Totals, balance due and paid/overdue status are recalculated straight away. The PDF, print view and Copy for WhatsApp always use the corrected values.
- **Safety limit:** an invoice cannot be edited to a total lower than the payments already received on it. In that case the owner is told to reverse the payment first, then edit.

## User flow
1. Open **Invoices**. Only the 26 Opening Balance invoices are listed.
2. Click **Edit** on any invoice, change what is wrong, and click **Save changes**. Optionally type a reason.
3. The invoice shows the new totals, and the change appears in Change History.
4. Create new real invoices as normal. They are numbered from IQF-2026-0027.

## UI/UX feel
The ERP keeps its current look: navy sidebar, light grey pages, money shown as R 1,234.56.
- The Edit button is blue and outlined, with a pencil icon.
- While editing, a thin amber bar across the top of the invoice reads "Editing — unsaved changes", with Save and Cancel buttons.
- Change History is a compact timeline under Payment History.

## Implementation phases
- **Phase 1 (MVP, built now):** the full test-data clean-up, renumbering the Opening Balances 0001–0026, the Edit button with save, cancel and optional reason, and per-invoice Change History.
- **Phase 2:** Orders with product lines and quantity tracking, deliveries linked to orders (including partial deliveries), and warnings when a truck or driver is double-booked. This was already agreed as Phase B.
- **Phase 3:** customer statements and overdue reminders, the Cutting & Mattress Processing module, a Reports page, and global search.

## Assumptions
- Everything except the Opening Balances is test data, as the owner confirmed. No real invoices, orders, deliveries or expenses exist yet.
- Attendance entries, production blocks, spare parts and vehicle repair records are all test data and are removed. Employee and driver names are kept.
- Invoice numbers themselves cannot be edited, so the sequence never has gaps or duplicates. Every other field can be edited.
- Voided invoices cannot be edited. A wrong void is fixed by creating a new invoice. After the clean-up there are no voided invoices.
- Editing an invoice never changes stock. Stock only moves through Deliveries (dispatch) and Production, as today.
- The reason when saving an edit is optional.
- The Opening Balance total is R 905,471.00 for 26 customers, as parsed from the pasted list. The earlier "30 customers, about R 1,033,000" was an estimate.
