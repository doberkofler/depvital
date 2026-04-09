import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {formatHumanAge, isMajorUpdate} from './util.js';

describe('util', () => {
	describe('formatHumanAge', () => {
		const fixedNow = new Date('2026-01-01T12:00:00.000Z');

		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(fixedNow);
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('returns N/A for null', () => {
			expect(formatHumanAge(null)).toBe('N/A');
		});

		it('returns just now for releases within the last hour', () => {
			const thirtyMinutesAgo = new Date(fixedNow.getTime() - 30 * 60 * 1000).toISOString();
			expect(formatHumanAge(thirtyMinutesAgo)).toBe('just now');
		});

		it('returns hours for releases within the last day', () => {
			const sixHoursAgo = new Date(fixedNow.getTime() - 6 * 60 * 60 * 1000).toISOString();
			expect(formatHumanAge(sixHoursAgo)).toBe('6h');
		});

		it('returns days for releases within the last month', () => {
			const tenDaysAgo = new Date(fixedNow.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
			expect(formatHumanAge(tenDaysAgo)).toBe('10d');
		});

		it('returns months for releases under a year old', () => {
			const ninetyDaysAgo = new Date(fixedNow.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
			expect(formatHumanAge(ninetyDaysAgo)).toBe('3m');
		});

		it('returns years for releases a year or older', () => {
			const fourHundredDaysAgo = new Date(fixedNow.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString();
			expect(formatHumanAge(fourHundredDaysAgo)).toBe('1y');
		});
	});

	describe('isMajorUpdate', () => {
		it('returns false when latest is null', () => {
			expect(Number(isMajorUpdate('1.2.3', null))).toBe(0);
		});

		it('returns false when versions are equal', () => {
			expect(Number(isMajorUpdate('1.2.3', '1.2.3'))).toBe(0);
		});

		it('returns false when only minor/patch changes', () => {
			expect(Number(isMajorUpdate('1.2.3', '1.3.0'))).toBe(0);
		});

		it('returns true when major versions differ', () => {
			expect(Number(isMajorUpdate('1.2.3', '2.0.0'))).toBe(1);
		});
	});
});
