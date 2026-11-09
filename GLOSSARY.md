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
One of the five fixed top-level Accounts, one per Account Type. Cannot be renamed into another type or deleted.

**Group Account**
An Account that has child Accounts. Its Balance is the sum of its children's Balances and cannot be entered directly.
_Avoid_: header account, parent account (fine informally, but Group Account is canonical)

**Leaf Account**
An Account with no child Accounts. The only kind of Account that holds money directly.
_Avoid_: posting account, detail account

**Child Account**
An Account nested directly under another Account.
_Avoid_: sub account (fine informally)

**Opening Balance**
The amount a Leaf Account held on its Opening Date, entered when the user starts tracking it.
_Avoid_: starting amount

**Opening Date**
The date an Opening Balance is true as of.

**Balance**
The amount an Account holds at a point in time. For a Leaf Account: Opening Balance plus the effect of everything after it. For a Group Account: the sum of its children's Balances.
