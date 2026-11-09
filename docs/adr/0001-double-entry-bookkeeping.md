# 1. Double-entry bookkeeping under a simple From/To interface

Date: 2026-11-09
Status: Accepted

## Context

Perancial is a single-user personal finance app built by a non-accountant. Most personal finance apps use single-entry records (one signed amount per account, with categories as tags). The Chart of Accounts already has five Account Types, including Income and Expense, and the Transactions module comes next.

## Decision

Every money movement is a **Transaction** made of two or more **Entries**, each an amount on one Leaf Account, and a Transaction's Entries always sum to zero.

- Entries store signed integer centavos, following the standard debit/credit rule: increases to Asset and Expense are positive; increases to Liability, Income, and Equity are negative. The user never sees debit/credit; the UI asks for From, To, and Amount, and display signs are friendly per Account Type.
- A Transaction may have any number of Entries (splits such as loan principal plus interest); the common two-Entry case is just a simple form.
- An Opening Balance is a Transaction between the Leaf Account and the system Account **Equity › Opening Balances**. It has no user-facing date: it means "the amount before the first recorded Transaction" and counts toward the Balance as of any date, so Transactions can be backdated freely (the owner re-enters a year of history from a spreadsheet by hand). Only Asset and Liability Leaf Accounts take an Opening Balance.
- Balances are never stored. A Leaf Account's Balance as of a date is its Opening Balance plus its Entries dated on or before it; a Group Account's is the sum of its children.

## Alternatives considered

- **Single-entry with category tags.** Simpler to store, but transfers become two records that can drift apart, Income/Expense become loose tags rather than Accounts, and nothing checks that the books add up.

## Consequences

- Transfers, loan payments, and splits are each one atomic Transaction.
- Income and Expense Balances are the per-category totals reports need, with no extra modelling.
- The accounting equation (Assets − Liabilities = Equity + Income − Expenses) is a built-in consistency check.
- Every write that creates a Transaction must write all its Entries atomically (one Firestore batch/transaction).
- Display code must flip signs per Account Type; the sign-convention decision owns how.
