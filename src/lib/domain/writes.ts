import type { AccountDoc, TransactionDoc } from './schemas.ts';

/** One document change; a list of these is committed atomically by the repository. */
export type ChartWrite =
	| { op: 'setAccount'; id: string; data: AccountDoc }
	| { op: 'deleteAccount'; id: string }
	| { op: 'setTransaction'; id: string; data: TransactionDoc }
	| { op: 'deleteTransaction'; id: string };

/** ID of an Account's Opening Balance Transaction (at most one per Account). */
export const openingTransactionId = (accountId: string) => `opening_${accountId}`;
