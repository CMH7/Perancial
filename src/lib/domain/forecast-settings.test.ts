import { describe, expect, it } from 'vitest';
import { DEFAULT_FORECAST_SECTIONS } from './forecast.ts';
import {
	forecastSections,
	newSectionId,
	planSaveForecastSections,
	sectionErrors,
	sectionLabel
} from './forecast-settings.ts';
import { now } from './test-fixtures.ts';

const lists = {
	inflowSections: [{ id: 'pay', name: 'Pay' }],
	outflowSections: [
		{ id: 'important', name: 'Important' },
		{ id: 'others', name: 'Others' }
	]
};

describe('Forecast Section lists', () => {
	it('start from the defaults until the owner saves their own', () => {
		expect(forecastSections(null)).toEqual(DEFAULT_FORECAST_SECTIONS);
		expect(forecastSections({ ...lists, updatedAt: now })).toEqual(lists);
	});

	it('give a new Section a readable id that no other Section has', () => {
		expect(newSectionId('Payables to a relative', ['important'])).toBe('payables-to-a-relative');
		expect(newSectionId('Important', ['important'])).toBe('important-2');
		expect(newSectionId('  !!  ', [])).toBe('section');
	});

	it('need a name, unique within its list', () => {
		expect(sectionErrors(lists)).toEqual([]);
		expect(
			sectionErrors({
				...lists,
				outflowSections: [...lists.outflowSections, { id: 'x', name: ' ' }]
			})
		).toEqual([{ at: 'outflowSections.2.name', message: 'Name the Section' }]);
		expect(
			sectionErrors({
				...lists,
				outflowSections: [...lists.outflowSections, { id: 'x', name: 'important ' }]
			})
		).toEqual([{ at: 'outflowSections.2.name', message: 'Another Section has this name' }]);
	});

	it('save as one settings document, names trimmed', () => {
		const edited = {
			...lists,
			outflowSections: [{ id: 'important', name: '  Must pay ' }, ...lists.outflowSections.slice(1)]
		};
		expect(planSaveForecastSections(edited, now)).toEqual([
			{
				op: 'setForecastSettings',
				id: 'forecast',
				data: {
					inflowSections: [{ id: 'pay', name: 'Pay' }],
					outflowSections: [
						{ id: 'important', name: 'Must pay' },
						{ id: 'others', name: 'Others' }
					],
					updatedAt: now
				}
			}
		]);
		expect(() =>
			planSaveForecastSections({ ...lists, inflowSections: [{ id: 'a', name: '' }] }, now)
		).toThrow('Name the Section');
	});

	it("label a plan's Section, or say it is derived", () => {
		const settings = { ...lists, updatedAt: now };
		expect(sectionLabel(settings, 'important')).toBe('Important');
		expect(sectionLabel(settings, null)).toBe('Derived');
		expect(sectionLabel(settings, 'deleted')).toBe('Derived');
	});
});
