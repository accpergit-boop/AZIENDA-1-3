# SUPER IQ-FOAM — Real Customer List & Opening Balances

Loads the business's real customer list (about 290 customers) into the ERP, with each customer's current balance.
After the import, Outstanding, debtor lists and the AI Assistant show what each customer really owes.

## Who it's for
The owner of SUPER IQ-FOAM. He is the only user and manages customers, invoices and payments.

## Core features and experience
- **Full customer list:** every name from the supplied list is added exactly as written, including repeats and near-repeats (e.g. FATIMA ADAM BIZANA twice, FAMILY STORE and FAMILY STORE.). The 10 customers already in the system match names in the list, so they are reused, not added again.
- **Opening balance per customer:** each customer with a balance above R 0.00 gets one "Opening Balance" invoice for that amount in Rand (the "€" sign in the export is ignored). There are 30 such customers, totalling about R 1,033,000. LING UMTHATHA is the largest at R 400,965.00.
- **Works like a normal invoice:** payments can be recorded against an opening balance, partly or in full, and the balance due updates. Each opening balance shows "Opening Balance" as its description.
- **Not counted as new sales:** opening balances are included in Outstanding, Overdue, the customer summaries and the debtor list. They are not included in "Total Invoiced" for this week or month, or in revenue. Payments received on them do count as money received on the date they are paid.
- **Customers at R 0.00:** they are added with no invoice.
- **Fields left for later:** price zone stays at Zone 1 and town stays empty for every customer, to be edited later on the Customers page. Zone and town are not guessed from names.
- **Re-running is safe:** running the import again does not create duplicate customers or a second opening balance for the same customer.

## User flow
1. The owner opens Customers and sees the full list. Each customer card shows Outstanding, Payments Received and Overdue.
2. On the Dashboard, Outstanding Balances now includes the opening balances.
3. When a customer pays, the owner opens the customer's Opening Balance invoice and clicks Pay, records the amount, and the balance goes down.
4. Overdue: opening balances are due 30 days after the import date. After that, any amount still unpaid shows as Overdue.

## UI/UX feel
Same as the current ERP: dark navy sidebar, light grey background, clear tables, and money shown as R 1,234.56. Opening-balance invoices have a small "Opening Balance" badge so they stand out from normal sales invoices in the invoice list and on customer cards.

## Implementation phases
- **Phase 1 (MVP, built now):** import all customers and opening balances, keep opening balances out of sales totals, add the badge, and make sure payments work against opening balances.
- **Phase 2:** the owner supplies price zone and town per customer, and these are bulk-updated. Optional clean-up of the duplicate names once the owner confirms which ones belong together.
- **Phase 3:** customer statements (balance history per customer, printable or shareable on WhatsApp) and payment reminders for overdue opening balances.

## Assumptions
- All amounts are in Rand. "€" was a formatting artefact of the export.
- Balances are dated today and due in 30 days. The owner picked both "due in 30 days" and "due immediately", and 30 days was chosen. If immediate is wanted, every unpaid opening balance would show as Overdue right away.
- Names are imported exactly as listed, keeping spelling, punctuation, phone numbers inside names (e.g. "D SHOP 065 636 6068") and zone tags like "Z2" in the name.
- Payment terms for every customer are "Due on Delivery" (the current default). The 30-day due date applies only to the opening-balance invoice.
- Opening-balance invoices get normal invoice numbers in the existing sequence, so the next real sales invoice continues after them.
- Customers named CASH, CASH SALES and SUPER IQ-FOAM CASH are imported as normal customers, all at R 0.00.
- The 56-item stock list already loaded from the owner's photo stays as it is. Black stops at 1070x150, as in the photo.
