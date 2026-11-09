import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OWNER_UID } from './owner.ts';

describe('OWNER_UID', () => {
	it('matches the UID pinned in firestore.rules', () => {
		const rules = readFileSync('firestore.rules', 'utf8');
		const pinned = /uid == '([^']+)'/.exec(rules)?.[1];
		expect(pinned).toBe(OWNER_UID);
	});
});
