/** U+2212 minus sign, typographically aligned with digits. */
const MINUS = '−';

/**
 * Parses what the user typed into integer centavos. Ignores `₱`, spaces, and thousands commas;
 * accepts a leading `-` or `−`; at most two decimals. Empty input is zero; anything else is null.
 */
export function parseAmount(input: string): number | null {
	const cleaned = input.replace(/[₱,\s]/g, '').replace(MINUS, '-');
	if (cleaned === '') return 0;
	const match = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
	if (!match || (match[2] === '' && !match[3])) return null;
	const [, sign, whole, frac = ''] = match;
	const centavos = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'));
	return sign && centavos !== 0 ? -centavos : centavos;
}

/** An Abnormal Balance sits on the opposite side of its Account Type's usual one (display sign < 0). */
export function isAbnormal(displayCentavos: number): boolean {
	return displayCentavos < 0;
}

/** Formats integer centavos (display sign) as `₱1,234,567.89`; Abnormal Balances as `−₱1,200.00`. */
export function formatAmount(centavos: number): string {
	const abs = Math.abs(centavos);
	const pesos = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const cents = String(abs % 100).padStart(2, '0');
	return `${centavos < 0 ? MINUS : ''}₱${pesos}.${cents}`;
}
