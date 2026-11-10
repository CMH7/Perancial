// Recording an Outflow from the Forecast: which Paying sources to pay and the Transaction draft
// for them. The draft goes through the existing Record flow and carries the usual `pays` link, so
// paid status still comes only from Transactions (ADR 0003). Pure TypeScript, no Firebase imports.
import type { ForecastOutflow } from './forecast.ts';
import { parseAmount } from './money.ts';
import type { PayingSource } from './schemas.ts';
import type { TransactionDraft } from './transactions.ts';

/** What is left on the valid sources: all of them, or the one on this Account. */
export function recordPicks(
	outflow: Pick<ForecastOutflow, 'sources'>,
	which: 'all' | string
): PayingSource[] {
	return outflow.sources
		.filter((s) => s.valid && (which === 'all' || s.accountId === which))
		.map((s) => ({ accountId: s.accountId, amount: s.amount - s.paid }))
		.filter((s) => s.amount > 0);
}

/** `account:centavos,…` for the Record link. */
export const formatPicks = (picks: PayingSource[]) =>
	picks.map((p) => `${p.accountId}:${p.amount}`).join(',');

/** The picks from a Record link; malformed parts are dropped. */
export function parsePicks(text: string): PayingSource[] {
	return text.split(',').flatMap((part) => {
		const [accountId, cents] = part.split(':');
		const amount = Number(cents);
		return accountId && Number.isInteger(amount) && amount > 0 ? [{ accountId, amount }] : [];
	});
}

const text = (cents: number) =>
	`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/**
 * The Record draft paid From the picked Accounts. When the picks add up to the draft's own From
 * total, To and Fees stay; otherwise it pays only that part: one To line for the picked amount.
 */
export function forecastRecordDraft(
	base: TransactionDraft,
	picks: PayingSource[]
): TransactionDraft {
	const sum = picks.reduce((s, p) => s + p.amount, 0);
	const from = picks.map((p) => ({ accountId: p.accountId, amount: text(p.amount) }));
	const amounts = base.from.map((l) => (l.amount.trim() ? parseAmount(l.amount) : null));
	const baseTotal = amounts.every((a) => a !== null)
		? (amounts as number[]).reduce((s, a) => s + a, 0)
		: null;
	if (baseTotal === sum) return { ...base, from };
	return {
		...base,
		from,
		to: [{ accountId: base.to[0]?.accountId ?? '', amount: text(sum) }],
		fees: []
	};
}
