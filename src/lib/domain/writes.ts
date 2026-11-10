import type {
	AccountDoc,
	ForecastDoc,
	ForecastSettingsDoc,
	InstallmentDoc,
	ScheduledDoc,
	TransactionDoc
} from './schemas.ts';

/** One document change; a list of these is committed atomically by the repository. */
export type ChartWrite =
	| { op: 'setAccount'; id: string; data: AccountDoc }
	| { op: 'deleteAccount'; id: string }
	| { op: 'setTransaction'; id: string; data: TransactionDoc }
	| { op: 'deleteTransaction'; id: string }
	| { op: 'setScheduled'; id: string; data: ScheduledDoc }
	| { op: 'deleteScheduled'; id: string }
	| { op: 'setInstallment'; id: string; data: InstallmentDoc }
	| { op: 'deleteInstallment'; id: string }
	/** `id` is the Cut-off date. */
	| { op: 'setForecast'; id: string; data: ForecastDoc }
	/** The one settings document, `settings/forecast`. */
	| { op: 'setForecastSettings'; id: 'forecast'; data: ForecastSettingsDoc };

/** ID of an Account's Opening Balance Transaction (at most one per Account). */
export const openingTransactionId = (accountId: string) => `opening_${accountId}`;

/** A Firestore batch holds at most 500 writes; a bulk change commits as one batch. */
export const MAX_BULK = 500;
