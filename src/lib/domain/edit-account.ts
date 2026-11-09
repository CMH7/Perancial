import { takesOpeningBalance } from './account-types.ts';
import { toStorage, type Chart } from './chart.ts';
import { AccountFields, openingWrite } from './create-account.ts';
import { openingTransactionId, type ChartWrite } from './writes.ts';

export type EditFormRules = {
	/** False for Opening Balances: nothing can be changed. */
	editable: boolean;
	/** False for Root Accounts: only the description can change. */
	nameEditable: boolean;
	opening:
		{ kind: 'hidden' } | { kind: 'editable'; current: number } | { kind: 'sum'; amount: number };
};

/** The Opening Balance of a Leaf Account in display sign (zero when there is none). */
export function currentOpeningBalance(chart: Chart, id: string): number {
	const account = chart.account(id);
	const entry = chart
		.transaction(openingTransactionId(id))
		?.entries.find((e) => e.accountId === id);
	return account && entry ? toStorage(account.type, entry.amount) : 0;
}

/** Which fields the edit-Account form offers for this Account. */
export function editFormRules(chart: Chart, id: string): EditFormRules {
	const account = chart.account(id);
	if (!account || account.system === 'opening-balances')
		return { editable: false, nameEditable: false, opening: { kind: 'hidden' } };
	if (account.system === 'root')
		return { editable: true, nameEditable: false, opening: { kind: 'hidden' } };
	if (!takesOpeningBalance(account.type))
		return { editable: true, nameEditable: true, opening: { kind: 'hidden' } };
	return {
		editable: true,
		nameEditable: true,
		opening: chart.isGroup(id)
			? { kind: 'sum', amount: chart.balance(id, '9999-12-31') }
			: { kind: 'editable', current: currentOpeningBalance(chart, id) }
	};
}

export type EditAccountInput = { name: string; description: string; openingBalance: number };

/** The documents to write, atomically, to save the edit-Account form. */
export function planEditAccount(
	chart: Chart,
	id: string,
	input: EditAccountInput,
	{ now }: { now: Date }
): ChartWrite[] {
	const account = chart.account(id);
	const rules = editFormRules(chart, id);
	if (!account || !rules.editable) throw new Error('This account cannot be edited');

	const { id: accountId, ...data } = account;
	const writes: ChartWrite[] = [
		{
			op: 'setAccount',
			id: accountId,
			data: {
				...data,
				name: rules.nameEditable ? input.name : account.name,
				description: input.description,
				updatedAt: now
			}
		}
	];

	if (rules.opening.kind !== 'editable' || input.openingBalance === rules.opening.current)
		return writes;
	const existing = chart.transaction(openingTransactionId(id));
	if (input.openingBalance === 0) {
		if (existing) writes.push({ op: 'deleteTransaction', id: openingTransactionId(id) });
		return writes;
	}
	writes.push(
		...openingWrite(id, account.type, input.openingBalance, now, existing?.createdAt ?? now)
	);
	return writes;
}

/** The edit-Account form as typed; parses into an `EditAccountInput`. */
export const EditAccountForm = AccountFields;
