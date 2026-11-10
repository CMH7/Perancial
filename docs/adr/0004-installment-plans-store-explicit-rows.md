# 4. Installment Plans store explicit rows, not a rule with dated versions

Date: 2026-11-10
Status: Accepted

## Context

Scheduled Transactions store a repeat rule plus dated versions and produce their occurrences on the fly (ADR 0003). Installment Plans look similar, since they also have due dates paid by linked Transactions, but they differ in shape. A plan is finite (a known number of payments). Its amounts often vary row by row: a diminishing-balance loan has a different principal and interest on every row, typed from the lender's own schedule. The owner edits single rows after creation: a moved date, a changed amount, a row added or removed at the end. Flat plans carry a rounding remainder in the last row, and some plans start with an interest-only or fee-only row 0.

## Decision

An Installment Plan document stores **every row explicitly**: `{ n, due, date, principal, interest, additionals, settled? }`. The repeat rule is kept only to generate dates at creation and to continue them when a row is added at the end. A row is identified by its plan and its `due` date, which never changes after creation; `date` is where the row falls now. The paid link from ADR 0003 (`pays: { plan: 'installment', planId, due }`) is reused unchanged. Plan amount, Grand total and Balance are always derived from the rows and the paying Transactions, never stored.

## Considered options

- **A rule plus dated versions, as for Scheduled Transactions:** one model for both plan kinds, but a varied plan would need one version or one per-occurrence change per row, which makes every row an exception. Row 0, the rounding remainder and row edits would all be special cases.
- **Rows generated from terms and never stored:** smallest document, but varied plans and per-row edits can't be expressed.

## Consequences

- Scheduled Transactions and Installment Plans share the paid-status and linking logic (paid, partly paid, overdue, Mark paid, link, unlink), but not occurrence generation.
- A plan document grows with its rows. Rows are capped at 600 (50 years of monthly payments), far above real use.
- Editing the terms of an existing plan doesn't regenerate its rows; changes are per row. "Change all following rows" is left for later.
