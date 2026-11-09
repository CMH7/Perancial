import { takesOpeningBalance } from './account-types.ts';
import { toStorage, type Chart } from './chart.ts';
import { z } from 'zod';
import { formatAmount, parseAmount } from './money.ts';
import type { AccountDoc, AccountType } from './schemas.ts';
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
		confirm: null
	};
}

export type NewChildAccount = { name: string; description: string; openingBalance: number };

export type CreateAccountInput = NewChildAccount & {
	parentId: string;
	/** Child rows, one level deep. Ignored when the parent inherits money. */
	children: NewChildAccount[];
};

type PlanOptions = { newId: () => string; now: Date };

/** The Opening Balance Transaction for a Leaf Account, or nothing when the amount is zero. */
function openingWrite(id: string, type: AccountType, display: number, now: Date): ChartWrite[] {
	if (display === 0 || !takesOpeningBalance(type)) return [];
	const amount = toStorage(type, display);
	return [
		{
			op: 'setTransaction',
			id: openingTransactionId(id),
			data: {
				date: null,
				kind: 'opening',
				description: 'Opening Balance',
				entries: [
					{ accountId: id, amount },
					{ accountId: 'opening-balances', amount: -amount }
				],
				accountIds: [id, 'opening-balances'],
				createdAt: now,
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
					createdAt: parent.createdAt,
					updatedAt: now
				}
			}
		];
	}

	const id = newId();
	const writes: ChartWrite[] = [
		{
			op: 'setAccount',
			id,
			data: accountDoc({
				name: input.name,
				description: input.description,
				parentId: parent.id,
				order
			})
		}
	];
	if (input.children.length === 0) {
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

/** A typed amount (e.g. "₱1,234.50") as integer centavos; empty means zero. */
const AmountText = z.string().transform((text, ctx) => {
	const centavos = parseAmount(text);
	if (centavos === null) {
		ctx.addIssue({ code: 'custom', message: 'Enter an amount like 1,234.56' });
		return z.NEVER;
	}
	return centavos;
});

const ChildRow = z.object({
	name: z.string().trim().min(1, 'Name is required'),
	description: z.string().trim(),
	openingBalance: AmountText
});

/** The create-Account form as typed; parses into a `CreateAccountInput`. */
export const CreateAccountForm = ChildRow.extend({
	parentId: z.string().min(1),
	children: z.array(ChildRow)
});
