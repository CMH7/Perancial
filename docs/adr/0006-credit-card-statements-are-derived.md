# 6. Credit Card Statements are derived from the card's days, not from a payment plan

Date: 2026-11-15
Status: Accepted

## Context

The Forecast finds a card's payments by looking for a Scheduled Transaction that pays a Liability from an Asset, and bills each charge with the payment due after it: everything since the previous payment date. Two problems follow. The owner must hand-build a "pay the card" Scheduled Transaction with a varying amount for every card, and a charge made after the real statement closes but before the due date lands in the wrong payment unless `billOn` is set by hand on it. Real cards (and pay-later services) close a Statement on a fixed day of the month and ask for payment by a fixed later day.

## Decision

- **A Credit Card is a Liability Leaf Account with a Statement Day and a Due Day.** No new Account Type.
- **Statements are computed, never stored.** From the card's days and its Transactions the domain module derives each Statement: its Statement Date, Due Date, the charges billed in it (dated on or before the Statement Date and after the previous one; `billOn` still overrides), refunds as credits, and its Statement Balance. The only stored per-Statement value is the amount the owner enters from the real Statement, keyed by the card and its Statement Date.
- **Each Statement with a positive Statement Balance is one Outflow** in the Cut-off holding its Due Date. Its Paying sources live with that stored per-Statement value, following ADR 0005.
- **Payments fill the oldest unpaid Statement first.** A payment is a Transaction moving money from an Asset into the card; no paid link is needed. An overpayment carries to the next Statement.
- A Scheduled Transaction that still pays a Credit Card is flagged, and the owner is offered to end it from the next Due Date, so the payment is not planned twice.

## Considered options

- **Keep the Scheduled-plan detection and add a statement day to it**: smaller change, but every card still needs a hand-built payment plan with a varying amount, the thing that made setup hard.
- **Store each Statement as a document when it closes**: easy to read, but it drifts whenever a charge is edited, added late or re-billed, the same reason ADR 0003 keeps paid amounts off the Occurrence.
- **Link each payment to a Statement explicitly**: precise, but adds a step the owner must remember; oldest-first matches how banks apply payments.

## Consequences

- Statement computation (day clamping in short months, Due Day in the following month, oldest-first payment matching) belongs in the domain module, test-first.
- Existing card Forecasts keep working until each card is given its days; converting a card is an edit, not a migration.
- Liabilities without card details (personal loans, money owed to people) keep using the Scheduled-plan detection.
