# 3. Scheduled Transactions: dated versions in one plan, and a paid link on the Transaction

Date: 2026-11-10
Status: Accepted

## Context

A Scheduled Transaction produces occurrences from a repeat rule. The owner can edit a plan from one occurrence onward ("this and all following"), including changing its rule, while earlier occurrences must keep their identity, values and paid links. An occurrence is paid by real Transactions, possibly several (partly paid), and the next module, Installments, needs the same "paid by a Transaction" behaviour for its payment rows.

## Decision

- **One plan document with dated versions.** A plan holds a list of versions, each starting on a date with its own description, lines and rule. An occurrence uses the version in force on its due date. "This and all following" adds a version; the plan keeps one ID.
- **An occurrence is identified by plan + the date its rule gave it**, which stays fixed even when the occurrence is moved. Per-occurrence changes (skip, move, amounts, "Mark paid") live on the plan, keyed by that date.
- **The paid link lives on the Transaction**: `pays: { plan, planId, due }`, where `plan` is `scheduled` or `installment`. Paid amounts are never stored; an occurrence's status is summed from the Transactions that name it. Installment Plan payment rows are identified the same way (plan + due date) and reuse the link unchanged.

## Considered options

- **Splitting a plan into two linked plans** on "this and all following": simpler documents, but the Plans list shows two rows for one bill, "end after N occurrences" must count across plans, and links to the old plan need care.
- **Storing paid state on the occurrence** (a list of paying Transaction IDs): duplicates what the Transactions already say, and drifts when a Transaction is deleted or edited outside the Record flow.

## Consequences

- Producing occurrences means walking versions in order; that logic belongs in the domain module, test-first.
- Deleting or editing a Transaction updates its occurrence's status with no extra write.
- A plan can't be deleted once any occurrence is recorded (it can only be ended), or links would point at nothing.
