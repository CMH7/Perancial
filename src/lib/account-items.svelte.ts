// The Account picker's rows for every Account, worked out once per change to the ledger; each
// picker asks for the ids it offers.
import { pickerItems, today, type PickerItem } from '#lib/domain/index.ts';
import { ledger } from '#lib/ledger.svelte.ts';

class AccountItems {
	#byId = $derived(
		new Map(
			pickerItems(
				ledger.chart,
				ledger.chart.all().map((a) => a.id),
				{ today: today() }
			).map((i) => [i.id, i])
		)
	);

	/** Rows for these ids, in the same order; ids not loaded are skipped. */
	for(ids: Iterable<string>): PickerItem[] {
		return [...ids].flatMap((id) => this.#byId.get(id) ?? []);
	}
}

export const accountItems = new AccountItems();
