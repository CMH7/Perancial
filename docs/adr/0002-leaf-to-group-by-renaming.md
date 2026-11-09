# 2. Turning a Leaf Account into a Group Account by renaming, not by moving Entries

Date: 2026-11-09
Status: Accepted

## Context

When a Leaf Account that has Entries gets its first Child Account, the agreed behaviour is that the new child inherits all of the Leaf's Entries (Opening Balance included) and the Leaf becomes a Group Account.

Entries live inside Transaction documents (`users/{uid}/transactions/{txId}.entries[]`) and reference Accounts by `accountId`. Moving Entries literally means rewriting every Transaction that touches the Leaf, which can be hundreds after a year of history, and a Firestore batch is capped at 500 writes, so the change could not always be atomic.

## Decision

The existing Account document **becomes the new child**: it keeps its ID (and therefore all its Entries and its `opening_{accountId}` Transaction), takes the child's name and description, and gets `parentId` set to a **newly created** Group Account document, which takes the original name, description, and parent.

The write is always three documents (update the old Account, create the new Group Account, nothing else touched), so it is atomic and constant-cost.

## Alternatives considered

- **Rewrite every Transaction** to point at a new child ID: correct but unbounded writes, not atomic beyond 500 Transactions.
- **Entries reference a stable "ledger" ID separate from the Account ID**: avoids the rewrite but adds an indirection everywhere for one rare operation.

## Consequences

- An Account's ID is not tied to its name or position; code must never assume a Group Account's ID predates its children.
- `createdAt` on the old document reflects when the money history started, not when that name appeared; the new Group Account's `createdAt` is the conversion time.
- Any future feature that stores an Account ID outside Transactions (bookmarks, budgets, report settings) must expect that ID to now name the child, and may need to follow the conversion.
