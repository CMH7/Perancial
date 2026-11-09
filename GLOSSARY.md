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

**Double-entry**
The bookkeeping method Perancial uses: every Transaction has at least two Entries that cancel out, so money is never created or lost, only moved between Accounts.

**Internal Transfer**
A Transaction seen from one Group Account whose Entries all sit on Accounts inside that group. The money only moves between the group's own Accounts, so the group's Balance does not change. Whether a Transaction is internal depends on the group you look from: moving money from a bank Account to an e-wallet is internal to Assets, but not to the group that holds only the banks.

**Installment Plan**
A purchase or loan paid back in scheduled payments. What is still owed is a Liability, held in its own Liability Account; interest and fees charged on it are Expenses. A scheduled payment counts as paid only when a Transaction pays it.
_Avoid_: installment (alone, when the whole plan is meant)

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
