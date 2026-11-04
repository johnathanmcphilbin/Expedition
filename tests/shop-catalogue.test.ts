import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dropKey, drops, shopItems } from '../src/lib/data';

describe('Expedition T-Shirt', () => {
	const tee = drops.find((d) => d.key === 'expedition-tee');

	it('is shop merch priced at 8 hours, enough to cover the print cost', () => {
		expect(tee).toBeTruthy();
		expect(tee!.name).toBe('Expedition T-Shirt');
		expect(tee!.hours).toBe(8);
		expect(tee!.value).toBe(34.44);
		expect(tee!.hours * 4.5).toBeGreaterThanOrEqual(tee!.value);
		expect(tee!.merch).toBe(true);
		expect(tee!.shopOnly).toBe(true);
		expect(tee!.about).toContain('Callum');
		expect(dropKey(tee!)).toBe('expedition-tee');
		expect(dropKey(tee!).length).toBeLessThanOrEqual(20);
	});

	it('ships with a front and a back photo, and stays off the hours trail', () => {
		expect(tee!.image).toBe('/drop-tee-front.webp');
		expect(tee!.imageBack).toBe('/drop-tee-back.webp');
		expect(existsSync('static/drop-tee-front.webp')).toBe(true);
		expect(existsSync('static/drop-tee-back.webp')).toBe(true);
		const listed = shopItems().filter((d) => d.key === 'expedition-tee');
		expect(listed).toHaveLength(1);
		expect(listed[0].imageBack).toBe('/drop-tee-back.webp');
	});
});
