# Glossary

Perancial is a single-user personal finance app for monitoring balances and producing reports.

## Chart of Accounts

**Chart of Accounts (CoA)**
The full tree of accounts the user tracks money in, grouped under the five Account Types.

**Account**
A named bucket in the Chart of Accounts that holds or summarises an amount of money. Has a name, an optional description, and an Account Type.
_Avoid_: category, wallet (as generic terms)

**Account Type**
One of five fixed classifications every Account belongs to: Asset, Liability, Equity, Income, Expense. A child Account always has the same Account Type as its parent.

**Asset**
Something the user owns or is owed: bank balances, cash, e-wallets, money lent to others.

**Liability**
Something the user owes: loans, credit card balances, money borrowed from others.

**Equity**
The difference between Assets and Liabilities; what the user is worth. Also absorbs Opening Balances.

**Income**
Money coming in: salary, interest, gifts received.

**Expense**
Money going out: food, rent, bills.

**Root Account**
One of the five fixed top-level Accounts, one per Account Type. Cannot be renamed into another type or deleted. Always a Group Account, even with no children, so it never holds Entries directly.

**Group Account**
An Account that has child Accounts. Being a Group Account is decided only by having children (Root Accounts excepted); there is no empty Group Account. Its Balance is the sum of its children's Balances and cannot be entered directly.
_Avoid_: header account, parent account (fine informally, but Group Account is canonical)

**Leaf Account**
An Account with no child Accounts. The only kind of Account that holds money directly.
_Avoid_: posting account, detail account

**Child Account**
An Account nested directly under another Account.
_Avoid_: sub account (fine informally)

**Opening Balance**
The amount a Leaf Account held before the first Transaction recorded in it. It has no date of its own and counts toward the Balance as of any date. Only Asset and Liability Leaf Accounts have one.
_Avoid_: starting amount, opening date

**Opening Balances (Account)**
The one system-managed Account, a Leaf under the Equity Root Account. Every Opening Balance is a Transaction between it and the Leaf Account being opened. Cannot be renamed or deleted.

**System Account**
An Account the app creates and manages itself: the Root Accounts and Opening Balances.

**Abnormal Balance**
A Balance on the opposite side of what its Account Type usually holds: an overdrawn bank Account, an overpaid credit card, refunds exceeding spending. Shown with a minus sign; a normal Balance of any Account Type is shown positive.
_Avoid_: negative balance (ambiguous, since Liabilities are stored as negatives)

**Net Worth**
Total Assets minus Total Liabilities: what the user would have left if they paid off everything they owe.

**Archived Account**
An Account the user no longer uses, hidden from the tree and pickers but kept with its history. Only an Account with a zero Balance can be archived; it can be unarchived.
_Avoid_: closed, deactivated

## Money movements

**Transaction**
One money movement on a date, moving money from one or more Accounts to one or more others. Its Entries always add up to zero, so the books always balance.
_Avoid_: journal entry (accounting term for the same thing)

**Entry**
One line of a Transaction: an amount added to or taken from one Leaf Account.
_Avoid_: posting, split, leg

**Fee**
A charge on a Transaction that goes to an Expense Account, such as an ATM or transfer fee. An **additional** fee is paid on top, so more leaves the From Accounts than the To Accounts receive. A **less** fee is taken out along the way, so the To Accounts receive less than was sent. A fee someone else must pay back is not a Fee: it is added to the Asset Account that tracks what they owe.
_Avoid_: charge (as a separate term)

**Double-entry**
The bookkeeping method Perancial uses: every Transaction has at least two Entries that cancel out, so money is never created or lost, only moved between Accounts.

**Internal Transfer**
A Transaction seen from one Group Account whose Entries all sit on Accounts inside that group. The money only moves between the group's own Accounts, so the group's Balance does not change. Whether a Transaction is internal depends on the group you look from: moving money from a bank Account to an e-wallet is internal to Assets, but not to the group that holds only the banks.

**Installment Plan**
A purchase or loan paid back in scheduled payments. When a lender is owed, the principal still owed is a Liability, held in the plan's own Liability Leaf Account; interest and fees charged on it are Expenses, counted as each payment is made. A scheduled payment counts as paid only when a Transaction pays it.
_Avoid_: installment (alone, when the whole plan is meant)

**Row**
One scheduled payment of an Installment Plan: its number, payment date, principal, interest and any additionals (charges such as a processing or late fee). A row is known by the date it was first due, even after its payment date moves. It is unpaid, Partly Paid, Paid or Before tracking, depending on the Transactions that pay it.
_Avoid_: installment, amortization (for one payment)

**Internal Installment Plan**
An Installment Plan that pays back one of the owner's own Asset Accounts, such as savings used to clear a card in one go. Nothing is owed to anyone, so there is no Liability and Net Worth does not change; each payment moves money back into that Asset, interest included.
_Avoid_: self-loan; Internal Transfer (a different idea: how a Transaction looks from a Group Account)

**Before tracking**
An Installment Plan payment made before the owner began tracking the plan in Perancial. Opening Balances already cover it, so it is neither Paid nor unpaid, and never Overdue.

**Balance**
The amount an Account holds as of a date (today by default). For a Leaf Account: its Opening Balance plus its Entries dated on or before that date. For a Group Account: the sum of its children's Balances. Entries dated later do not count yet.

**Pending**
A Transaction the user has recorded but the bank, e-wallet or card has not shown yet, such as a card purchase not yet posted or a transfer still processing. It still counts toward Balances.
_Avoid_: uncleared, unposted

**Cleared**
A Transaction the bank, e-wallet or card has shown. Every Transaction is either Cleared or Pending; an Opening Balance is always Cleared.
_Avoid_: posted, reconciled

**Cleared Balance**
The Balance of an Asset or Liability Account counting only Cleared Transactions. It is what the user compares with the bank app or statement.

**Tag**
A short label on a Transaction that gathers related Transactions across Accounts and kinds, such as a trip, an event or a project. A tag never says where money is or what kind of money it is; that is what Accounts are for.
_Avoid_: category, label (as a stand-in for an Account)

**Scheduled Transaction**
A plan for a Transaction that repeats or happens once later: its Accounts, amounts and description, plus a repeat rule such as every cut-off, monthly on a day, or yearly. It never affects Balances; only the Transactions recorded from it do.
_Avoid_: recurring transaction, template

**Occurrence**
One due date a Scheduled Transaction produces, such as "Rent, 5 Dec". It is known by the date its repeat rule gave it, even after being moved to another day. It is unpaid, Partly Paid or Paid depending on the Transactions that pay it, or it can be skipped.

**Paid**
An Occurrence or Installment Plan payment whose paying Transactions add up to its amount, or that the user settled after at least one payment (a discount, a waived fee). Only Transactions pay; nothing is paid without one.

**Partly Paid**
An Occurrence or Installment Plan payment that has at least one paying Transaction but has not reached its amount yet.

**Overdue**
An Occurrence whose date has passed without being Paid or skipped. It stays overdue until the user records or skips it.

**Cut-off**
One of the two pay dates in a month, the 15th and the 30th (the last day of February). Planning and forecasting are grouped by cut-off.
