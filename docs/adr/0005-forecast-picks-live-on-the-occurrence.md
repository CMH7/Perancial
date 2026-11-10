# 5. Forecast picks live on the Occurrence or Row, not on a per-Cut-off document

Date: 2026-11-10
Status: Accepted

## Context

A Forecast is the plan for one Cut-off: its Inflows, the Outflows they fund, and which Funding Accounts pay each Outflow (its Paying sources). The owner picks Paying sources per Outflow, and an Outflow is always a Scheduled Transaction Occurrence or an Installment Plan Row. An Outflow does not stay in one Forecast: when it is still unpaid after its window, it is Carried over to the Forecast for today's window, and Early allocation sets its sources from an earlier Cut-off. Everything else a Forecast shows (balances, Unfunded, Short, carry-over, Unplanned, paid status) can be derived from plans and Transactions.

## Decision

- **Paying sources are stored on the item they fund**: an optional `sources: [{ accountId, amount }]` on a Scheduled plan's `occurrences[due]` change, and on each Installment Plan Row. With none set, the plan's default Accounts apply.
- **The per-Cut-off document is minimal**: `users/{uid}/forecasts/{cutoffDate}` holds only `fundingAccounts`. It is written only when the owner changes the list; a Cut-off without one inherits the latest earlier list. Its list order is the lanes' order. It may also hold `outflowOrder`, the owner's order of that Cut-off's Outflow keys (added later for drag-and-drop ordering); it is not inherited, and Outflows missing from it follow by due date.
- **Other Forecast data sits where it belongs**: Section ids on the plans, the Section lists in `users/{uid}/settings/forecast`, the Early allocation link as `allocates: { plan, planId, due }` on the transfer plan (the same shape as the paid link, ADR 0003), and `billOn` on a recorded card charge.
- Nothing derived is stored.

## Considered options

- **One Forecast document per Cut-off holding every pick** (sources keyed by plan + due): everything about a Cut-off in one read, but a Carried-over Outflow would leave its sources behind in the old Cut-off's document, and Early allocation would write into another Cut-off's document. Picks would need copying or a lookup across documents.

## Consequences

- Carry-over and Early allocation need no extra writes to keep an Outflow's sources.
- Reading a Forecast reads the plans it already needs; the Forecast document adds one small read.
- Deleting a plan removes its picks with it; Accounts named in `sources` or `fundingAccounts` can't be deleted.
- A plan document grows a little per Occurrence or Row that has picks.
