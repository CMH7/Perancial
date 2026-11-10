// The owner's Forecast Section lists (Settings → Forecast): ids, checks and the save. Pure
// TypeScript, no Firebase imports. A plan names a Section by id, so renaming keeps its plans and
// deleting sends them back to their derived default without touching any plan.
import { DEFAULT_FORECAST_SECTIONS } from './forecast.ts';
import type { ForecastSection, ForecastSettingsDoc } from './schemas.ts';
import type { DraftError } from './transactions.ts';
import type { ChartWrite } from './writes.ts';

export type SectionLists = Pick<ForecastSettingsDoc, 'inflowSections' | 'outflowSections'>;

/** The owner's lists, or the starting ones until they save their own. */
export function forecastSections(settings: ForecastSettingsDoc | null): SectionLists {
	const lists = settings ?? DEFAULT_FORECAST_SECTIONS;
	return { inflowSections: lists.inflowSections, outflowSections: lists.outflowSections };
}

/** A readable id from the name, unique among `taken`. */
export function newSectionId(name: string, taken: string[]): string {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'section';
	if (!taken.includes(base)) return base;
	for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/** Form checks: every Section has a name of at most 60 characters, unique within its list. */
export function sectionErrors(lists: SectionLists): DraftError[] {
	const errors: DraftError[] = [];
	for (const key of ['inflowSections', 'outflowSections'] as const) {
		const seen = new Set<string>();
		lists[key].forEach((s, i) => {
			const name = s.name.trim();
			const at = `${key}.${i}.name`;
			if (!name) errors.push({ at, message: 'Name the Section' });
			else if (name.length > 60) errors.push({ at, message: 'At most 60 characters' });
			else if (seen.has(name.toLowerCase()))
				errors.push({ at, message: 'Another Section has this name' });
			seen.add(name.toLowerCase());
		});
		if (lists[key].length > 50) errors.push({ at: key, message: 'At most 50 Sections' });
	}
	return errors;
}

const trimmed = (list: ForecastSection[]) => list.map((s) => ({ id: s.id, name: s.name.trim() }));

/** Saves both lists as the one settings document. Throws on the first error. */
export function planSaveForecastSections(lists: SectionLists, now: Date): ChartWrite[] {
	const errors = sectionErrors(lists);
	if (errors.length) throw new Error(errors[0].message);
	return [
		{
			op: 'setForecastSettings',
			id: 'forecast',
			data: {
				inflowSections: trimmed(lists.inflowSections),
				outflowSections: trimmed(lists.outflowSections),
				updatedAt: now
			}
		}
	];
}

/** A plan's Section as shown on its forms: the owner's name, or "Derived" when none applies. */
export function sectionLabel(settings: ForecastSettingsDoc | null, id: string | null | undefined) {
	const { inflowSections, outflowSections } = forecastSections(settings);
	return [...outflowSections, ...inflowSections].find((s) => s.id === id)?.name ?? 'Derived';
}
