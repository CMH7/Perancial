import { describe, expect, it } from 'vitest';
import { formatAmount, isAbnormal, parseAmount } from './money.ts';

describe('formatAmount', () => {
	it('formats centavos as pesos with thousands separators and two decimals', () => {
		expect(formatAmount(123456789)).toBe('₱1,234,567.89');
		expect(formatAmount(345000)).toBe('₱3,450.00');
		expect(formatAmount(5)).toBe('₱0.05');
	});

	it('shows zero as ₱0.00 and Abnormal Balances with a minus sign, not brackets', () => {
		expect(formatAmount(0)).toBe('₱0.00');
		expect(formatAmount(-120000)).toBe('−₱1,200.00');
	});
});

describe('parseAmount', () => {
	it('turns typed amounts into centavos', () => {
		expect(parseAmount('1,234.5')).toBe(123450);
		expect(parseAmount('₱50000')).toBe(5000000);
		expect(parseAmount(' 3450 ')).toBe(345000);
		expect(parseAmount('0.1')).toBe(10);
		expect(parseAmount('1234.56')).toBe(123456);
	});

	it('accepts a minus for Abnormal Balances', () => {
		expect(parseAmount('-500')).toBe(-50000);
		expect(parseAmount('−₱1,200.00')).toBe(-120000);
		expect(Object.is(parseAmount('-0'), 0)).toBe(true);
	});

	it('treats an empty field as zero', () => {
		expect(parseAmount('')).toBe(0);
		expect(parseAmount('   ')).toBe(0);
	});

	it('rejects input that is not an amount', () => {
		expect(parseAmount('abc')).toBeNull();
		expect(parseAmount('12.345')).toBeNull();
		expect(parseAmount('1.2.3')).toBeNull();
		expect(parseAmount('-')).toBeNull();
	});
});

describe('isAbnormal', () => {
	it('flags a Balance below zero in display sign', () => {
		expect(isAbnormal(-50000)).toBe(true);
		expect(isAbnormal(0)).toBe(false);
		expect(isAbnormal(345000)).toBe(false);
	});
});
