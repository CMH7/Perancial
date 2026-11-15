import { takesOpeningBalance } from './account-types.ts';
import { toStorage, type Chart } from './chart.ts';
import { z } from 'zod';
import { formatAmount, parseAmount } from './money.ts';
import type { AccountDoc, AccountType, CardTerms } from './schemas.ts';
import { openingTransactionId, type ChartWrite } from './writes.ts';

export type OpeningField =
	| { kind: 'hidden' }
	| { kind: 'editable' }
	| { kind: 'sum' }
	| { kind: 'inherited'; amount: number };

export type CreateFormRules = {
	opening: OpeningField;
	childRowsAllowed: boolean;
	/** Confirmation to show before saving, or null when none is needed. */
	confirm: string | null;
	/** Whether the new Account can be a Credit Card: a single new Liability Leaf (ADR 0006). */
	card: boolean;
};

/** Every Entry ever recorded, whatever its date: the money that moves on conversion. */
const ALL_TIME = '9999-12-31';

/** Whether adding a child under `parentId` turns a Leaf Account holding money into a Group. */
export const inheritsMoney = (chart: Chart, parentId: string) =>
	!chart.isGroup(parentId) && chart.hasEntries(parentId);

/** What the create-Account form shows for a chosen parent and number of child rows. */
export function createFormRules(
	chart: Chart,
	parentId: string,
	childRows: number
): CreateFormRules {
	const parent = chart.account(parentId);
	const showsOpening = !!parent && takesOpeningBalance(parent.type);

	if (parent && inheritsMoney(chart, parentId)) {
		const amount = chart.balance(parentId, ALL_TIME);
		return {
			opening: showsOpening ? { kind: 'inherited', amount } : { kind: 'hidden' },
			childRowsAllowed: false,
			card: false,
			confirm: `"${parent.name}" has ${formatAmount(amount)} recorded directly. It will move to the new account, and "${parent.name}" becomes a Group Account.`
		};
	}

	return {
		opening: !showsOpening
			? { kind: 'hidden' }
			: childRows > 0
				? { kind: 'sum' }
				: { kind: 'editable' },
		childRowsAllowed: true,
		confirm: null,
		card: parent?.type === 'liability' && childRows === 0
	};
}

export type NewChildAccount = { name: string; description: string; openingBalance: number };

export type CreateAccountInput = NewChildAccount & {
	parentId: string;
	/** Child rows, one level deep. Ignored when the parent inherits money. */
	children: NewChildAccount[];
	/** Credit Card days for a single new Liability Leaf; ignored otherwise. */
	card?: CardTerms | null;
};

type PlanOptions = { newId: () => string; now: Date };

/** The Opening Balance Transaction for a Leaf Account, or nothing when the amount is zero. */
export function openingWrite(
	id: string,
	type: AccountType,
	display: number,
	now: Date,
	createdAt: Date = now
): ChartWrite[] {
	if (display === 0 || !takesOpeningBalance(type)) return [];
	const amount = toStorage(type, display);
	return [
		{
			op: 'setTransaction',
			id: openingTransactionId(id),
			data: {
				date: null,
				origin: 'opening',
				description: 'Opening Balance',
				note: '',
				status: 'cleared',
				tags: [],
				entries: [
					{ accountId: id, amount },
					{ accountId: 'opening-balances', amount: -amount }
				],
				accountIds: [id, 'opening-balances'],
				pays: null,
				billOn: null,
				recordedWith: null,
				createdAt,
				updatedAt: now
			}
		}
	];
}

/** The documents to write, atomically, to create an Account from the form input. */
export function planCreateAccount(
	chart: Chart,
	input: CreateAccountInput,
	{ newId, now }: PlanOptions
): ChartWrite[] {
	const parent = chart.account(input.parentId);
	if (!parent) throw new Error('Parent account not found');
	const type = parent.type;
	const siblings = chart.children(parent.id, { showArchived: true });
	const order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
	const accountDoc = (
		fields: Pick<AccountDoc, 'name' | 'description' | 'parentId' | 'order'>
	): AccountDoc => ({
		...fields,
		type,
		system: null,
		archived: false,
		createdAt: now,
		updatedAt: now
	});

	if (inheritsMoney(chart, parent.id)) {
		// ADR 0002: the existing document becomes the new child (keeping its ID, Entries, and
		// Opening Balance); a new Group takes the old name, description, parent, and position.
		const groupId = newId();
		return [
			{
				op: 'setAccount',
				id: groupId,
				data: accountDoc({
					name: parent.name,
					description: parent.description,
					parentId: parent.parentId,
					order: parent.order
				})
			},
			{
				op: 'setAccount',
				id: parent.id,
				data: {
					name: input.name,
					description: input.description,
					type,
					parentId: groupId,
					system: parent.system,
					archived: parent.archived,
					order: 0,
					...(parent.card ? { card: parent.card } : {}),
					createdAt: parent.createdAt,
					updatedAt: now
				}
			}
		];
	}

	const id = newId();
	const single = input.children.length === 0;
	const writes: ChartWrite[] = [
		{
			op: 'setAccount',
			id,
			data: {
				...accountDoc({
					name: input.name,
					description: input.description,
					parentId: parent.id,
					order
				}),
				...(single && type === 'liability' && input.card ? { card: input.card } : {})
			}
		}
	];
	// A Group is never a Credit Card: a card Leaf that gains a child drops its days.
	if (parent.card) {
		const { id: parentId, ...data } = parent;
		writes.push({ op: 'setAccount', id: parentId, data: { ...data, card: null, updatedAt: now } });
	}
	if (single) {
		writes.push(...openingWrite(id, type, input.openingBalance, now));
		return writes;
	}
	input.children.forEach((child, i) => {
		const childId = newId();
		writes.push({
			op: 'setAccount',
			id: childId,
			data: accountDoc({ name: child.name, description: child.description, parentId: id, order: i })
		});
		writes.push(...openingWrite(childId, type, child.openingBalance, now));
	});
	return writes;
}

/**
 * The Leaf Accounts a `planCreateAccount` result leaves behind, in order: the new Account, or its
 * children when it is a Group. Lets a picker select what was just created.
 */
export function newLeafIds(writes: readonly ChartWrite[]): string[] {
	const accounts = writes.filter(
		(w): w is Extract<ChartWrite, { op: 'setAccount' }> => w.op === 'setAccount'
	);
	const parents = new Set(accounts.map((w) => w.data.parentId));
	return accounts.filter((w) => !parents.has(w.id)).map((w) => w.id);
}

/** A typed amount (e.g. "₱1,234.50") as integer centavos; empty means zero. */
export const AmountText = z.string().transform((text, ctx) => {
	const centavos = parseAmount(text);
	if (centavos === null) {
		ctx.addIssue({ code: 'custom', message: 'Enter an amount like 1,234.56' });
		return z.NEVER;
	}
	return centavos;
});

/** Name, description, and typed Opening Balance: one Account's fields as typed in a form. */
export const AccountFields = z.object({
	name: z.string().trim().min(1, 'Name is required'),
	description: z.string().trim(),
	openingBalance: AmountText
});

const DayText = z.string().transform((text, ctx) => {
	const day = /^\d{1,2}$/.test(text.trim()) ? Number(text.trim()) : 0;
	if (day < 1 || day > 31) {
		ctx.addIssue({ code: 'custom', message: 'Enter a day from 1 to 31' });
		return z.NEVER;
	}
	return day;
});

/** Credit Card days as typed; null when the Account is not a Credit Card. */
export const CardFields = z
	.object({ statementDay: DayText, dueDay: DayText })
	.nullable()
	.optional();

/** The create-Account form as typed; parses into a `CreateAccountInput`. */
export const CreateAccountForm = AccountFields.extend({
	parentId: z.string().min(1),
	children: z.array(AccountFields),
	card: CardFields
});
