// Persons: the humans involved in Transactions, linked to the Accounts that track money between
// the owner and them. Purely descriptive: a Person never holds money. Pure TypeScript.
import type { Chart } from './chart.ts';
import { ME, type Person, type Scheduled } from './schemas.ts';
import type { ChartWrite } from './writes.ts';

/** The Account's own Person, else its nearest Group Account's; null when none is linked. */
export function linkedPerson(chart: Chart, accountId: string): string | null {
	for (const a of chart.path(accountId).reverse()) if (a.personId) return a.personId;
	return null;
}

type Sides = { from: string[]; to: string[] };

/**
 * Pre-fills From and To Persons from linked Accounts: each adds its Person to its own side,
 * after the Persons already picked. Nothing else is ever guessed.
 */
export function prefillPersons(
	chart: Chart,
	accounts: Sides,
	picked: Sides = { from: [], to: [] }
): Sides {
	const side = (ids: string[], start: string[]) => {
		const out = [...start];
		for (const id of ids) {
			const person = linkedPerson(chart, id);
			if (person && !out.includes(person)) out.push(person);
		}
		return out;
	};
	return { from: side(accounts.from, picked.from), to: side(accounts.to, picked.to) };
}

/**
 * The form's pre-fill: the picked Persons plus each linked Account's Person on its side, except
 * ones the owner removed. `linked` says which Persons the Accounts' links suggest.
 */
export function withLinkedPersons(
	chart: Chart,
	accounts: Sides,
	picked: Sides,
	dismissed: Sides = { from: [], to: [] }
): Sides & { linked: Sides } {
	const linked = prefillPersons(chart, accounts);
	const side = (key: keyof Sides) => [
		...picked[key],
		...linked[key].filter((p) => !picked[key].includes(p) && !dismissed[key].includes(p))
	];
	return { from: side('from'), to: side('to'), linked };
}

/** How a Person shows: Me, their name, or their name marked archived. */
export function personLabel(persons: Person[], id: string): string {
	if (id === ME) return 'Me';
	const p = persons.find((x) => x.id === id);
	if (!p) return 'Unknown person';
	return p.archived ? `${p.name} (archived)` : p.name;
}

/**
 * Where the owner stands with a Person, from their linked Leaf Accounts: what they owe the owner
 * (Assets), what the owner owes them (Liabilities), and the difference. Derived, never stored.
 */
export function netPosition(
	chart: Chart,
	personId: string
): { owesYou: number; youOwe: number; net: number } {
	let owesYou = 0;
	let youOwe = 0;
	for (const a of chart.all()) {
		if (chart.isGroup(a.id) || linkedPerson(chart, a.id) !== personId) continue;
		if (a.type === 'asset') owesYou += chart.balance(a.id);
		else if (a.type === 'liability') youOwe += chart.balance(a.id);
	}
	return { owesYou, youOwe, net: owesYou - youOwe };
}

function assertNotMe(id: string, action: string) {
	if (id === ME) throw new Error(`Me is built in and cannot be ${action}`);
}

/** Creates a Person or renames one. */
export function planSavePerson(
	persons: Person[],
	{ id, name }: { id: string; name: string },
	{ now }: { now: Date }
): ChartWrite[] {
	assertNotMe(id, 'renamed');
	const prior = persons.find((p) => p.id === id);
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Name the Person');
	return [
		{
			op: 'setPerson',
			id,
			data: {
				name: trimmed,
				archived: prior?.archived ?? false,
				createdAt: prior?.createdAt ?? now,
				updatedAt: now
			}
		}
	];
}

/** Archives (hides from pickers) or unarchives a Person; their history stays. */
export function planArchivePerson(
	persons: Person[],
	id: string,
	archived: boolean,
	{ now }: { now: Date }
): ChartWrite[] {
	assertNotMe(id, 'archived');
	const prior = persons.find((p) => p.id === id);
	if (!prior) throw new Error('This Person no longer exists');
	const { id: _, ...data } = prior;
	return [{ op: 'setPerson', id, data: { ...data, archived, updatedAt: now } }];
}

/** Whether any Account, Transaction or Scheduled Transaction names the Person. */
function isNamed(input: { chart: Chart; scheduled: Scheduled[] }, id: string): boolean {
	const { chart, scheduled } = input;
	return (
		chart.all().some((a) => a.personId === id) ||
		chart.transactions().some((tx) => tx.fromPersons.includes(id) || tx.toPersons.includes(id)) ||
		scheduled.some((p) =>
			p.versions.some((v) => v.fromPersons?.includes(id) || v.toPersons?.includes(id))
		)
	);
}

/** Deletes a Person nothing names yet; once anything does, it can only be archived. */
export function planDeletePerson(
	input: { chart: Chart; scheduled: Scheduled[] },
	id: string
): ChartWrite[] {
	assertNotMe(id, 'deleted');
	if (isNamed(input, id))
		throw new Error('Accounts, Transactions or plans name this Person, so archive it instead');
	return [{ op: 'deletePerson', id }];
}

/**
 * Fill from links: adds the Person to past Transactions on their linked Accounts, on the side
 * each linked Account is on, only where that side lists nobody yet. Oldest first.
 */
export function planFillFromLinks(
	chart: Chart,
	personId: string,
	{ now }: { now: Date }
): ChartWrite[] {
	const linked = (id: string) => linkedPerson(chart, id) === personId;
	return chart
		.transactions()
		.filter((tx) => tx.origin === 'normal' && tx.date !== null)
		.sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id))
		.flatMap((tx): ChartWrite[] => {
			const onFrom = tx.entries.some((e) => e.amount < 0 && linked(e.accountId));
			const onTo = tx.entries.some((e) => e.amount > 0 && linked(e.accountId));
			const fromPersons = onFrom && tx.fromPersons.length === 0 ? [personId] : tx.fromPersons;
			const toPersons = onTo && tx.toPersons.length === 0 ? [personId] : tx.toPersons;
			if (fromPersons === tx.fromPersons && toPersons === tx.toPersons) return [];
			const { id, ...data } = tx;
			return [
				{ op: 'setTransaction', id, data: { ...data, fromPersons, toPersons, updatedAt: now } }
			];
		});
}
