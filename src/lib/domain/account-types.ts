import type { AccountType } from './schemas.ts';

/** Root Accounts in display order, with the plain-English guide seeded as their Description. */
export const ACCOUNT_TYPE_GUIDE: ReadonlyArray<{
	type: AccountType;
	label: string;
	what: string;
	examples: string;
}> = [
	{
		type: 'asset',
		label: 'Assets',
		what: 'Money you have, or money others owe you.',
		examples: 'Bank accounts, e-wallets, cash, savings goals, money you lent to someone'
	},
	{
		type: 'liability',
		label: 'Liabilities',
		what: 'Money you owe.',
		examples: 'Credit cards, loans, money you borrowed from someone, unpaid bills'
	},
	{
		type: 'equity',
		label: 'Equity',
		what: 'Your starting point. Managed for you; you rarely add anything here.',
		examples: 'Opening Balances (automatic: balances the starting amounts you enter)'
	},
	{
		type: 'income',
		label: 'Income',
		what: 'Where money comes from.',
		examples: 'Salary, freelance, interest, gifts received, refunds'
	},
	{
		type: 'expense',
		label: 'Expenses',
		what: 'What money is spent on.',
		examples: 'Food, rent, utilities, transport, subscriptions'
	}
];

/** Only Asset and Liability Leaf Accounts take an Opening Balance. */
export const takesOpeningBalance = (type: AccountType) => type === 'asset' || type === 'liability';
