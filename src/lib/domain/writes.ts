import type { AccountDoc, InstallmentDoc, ScheduledDoc, TransactionDoc } from './schemas.ts';

/** One document change; a list of these is committed atomically by the repository. */
export type ChartWrite =
	| { op: 'setAccount'; id: string; data: AccountDoc }
	| { op: 'deleteAccount'; id: string }
	| { op: 'setTransaction'; id: string; data: TransactionDoc }
	| { op: 'deleteTransaction'; id: string }
	| { op: 'setScheduled'; id: string; data: ScheduledDoc }
	| { op: 'deleteScheduled'; id: string }
	| { op: 'setInstallment'; id: string; data: InstallmentDoc }
	| { op: 'deleteInstallment'; id: string };

/** ID of an Account's Opening Balance Transaction (at most one per Account). */
export const openingTransactionId = (accountId: string) => `opening_${accountId}`;
