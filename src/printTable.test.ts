import {afterEach, beforeEach, describe, expect, it, vi, type MockInstance} from 'vitest';
import {printTable} from './printTable.js';
import {type AnalysisResult} from './analyzer.js';

const daysAgo = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe('printTable', () => {
	let logSpy: MockInstance<Console['log']>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, 'log').mockReturnValue();
	});

	afterEach(() => {
		logSpy.mockRestore();
		vi.useRealTimers();
	});

	it('prints a no-results message when there are no outdated dependencies', () => {
		const stats: AnalysisResult['stats'] = {
			totalPackages: 0,
			outdatedPackages: 0,
			vulnerablePackages: 0,
			unmaintainedPackages: 0,
			deprecatedPackages: 0,
			cacheHits: 0,
			cacheMisses: 0,
			durationMs: 0,
		};

		printTable([], false, stats, 3);

		expect(logSpy).toHaveBeenCalledWith('No outdated dependencies found.');
	});

	it('prints formatted rows, summary, caching and rate-limit warning', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

		const results: AnalysisResult['results'] = [
			{
				package: 'major-update-pkg',
				current: '1.2.3',
				latest: '2.0.0',
				latestAvailable: '2.0.0',
				latestReleaseDate: daysAgo(10),
				daysSinceLatestRelease: 10,
				outdated: true,
				isDev: false,
				vulnerabilities: [{severity: 'high', title: 'Critical issue'}],
				deprecated: false,
				maintenance: {
					lastRelease: daysAgo(10),
					daysSinceLastRelease: 10,
					isMaintained: false,
					healthScore: 0.4,
				},
				githubUrl: 'https://github.com/org/major-update-pkg',
				changelog: {
					found: true,
					url: 'https://github.com/org/major-update-pkg/blob/main/CHANGELOG.md',
					latestEntry: 'Breaking changes',
				},
			},
			{
				package: 'minor-update-pkg',
				current: '1.2.3',
				latest: '1.3.0',
				latestAvailable: '1.3.0',
				latestReleaseDate: daysAgo(1),
				daysSinceLatestRelease: 1,
				outdated: true,
				isDev: false,
				vulnerabilities: [],
				deprecated: false,
				maintenance: {
					lastRelease: daysAgo(1),
					daysSinceLastRelease: 1,
					isMaintained: true,
					healthScore: 0.9,
				},
				githubUrl: 'https://github.com/org/minor-update-pkg',
				changelog: {
					found: false,
					url: null,
					latestEntry: null,
				},
			},
			{
				package: 'up-to-date-pkg',
				current: '1.0.0',
				latest: '1.0.0',
				latestAvailable: '1.0.0',
				latestReleaseDate: daysAgo(2),
				daysSinceLatestRelease: 2,
				outdated: false,
				isDev: true,
				vulnerabilities: [],
				deprecated: false,
				maintenance: {
					lastRelease: daysAgo(2),
					daysSinceLastRelease: 2,
					isMaintained: true,
					healthScore: 0.95,
				},
				githubUrl: null,
				changelog: {
					found: false,
					url: null,
					latestEntry: null,
				},
			},
		];

		const stats: AnalysisResult['stats'] = {
			totalPackages: 3,
			outdatedPackages: 2,
			vulnerablePackages: 1,
			unmaintainedPackages: 1,
			deprecatedPackages: 0,
			cacheHits: 5,
			cacheMisses: 2,
			durationMs: 1234,
		};

		printTable(results, true, stats, 3);

		const output = logSpy.mock.calls.map((call: unknown[]) => call.map(String).join(' ')).join('\n');

		expect(output).toContain('Package');
		expect(output).toContain('Current');
		expect(output).toContain('Latest');
		expect(output).toContain('Update');
		expect(output).toContain('Vulnerable');

		expect(output).toContain('\x1b[31m2.0.0\x1b[0m');
		expect(output).toContain('\x1b[33m1.3.0\x1b[0m');
		expect(output).toContain('\x1b[32mupdate\x1b[0m');
		expect(output).toContain('\x1b[31mcooldown\x1b[0m');
		expect(output).toContain('\x1b[31mYES\x1b[0m');
		expect(output).toContain('\x1b[31m10d\x1b[0m');

		expect(output).toContain('GitHub API rate limit exceeded. GitHub metadata (stars/issues) may be missing.');
		expect(output).toContain('Provide a --github-token to ensure complete data.');

		expect(output).toContain('\x1b[1mSummary:\x1b[0m');
		expect(output).toContain('- Total packages:    3');
		expect(output).toContain('- Outdated:          \x1b[31m2\x1b[0m');
		expect(output).toContain('- Vulnerable:        \x1b[31m1\x1b[0m');
		expect(output).toContain('- Deprecated:        \x1b[32m0\x1b[0m');
		expect(output).toContain('- Unmaintained:      \x1b[31m1\x1b[0m');

		expect(output).toContain('\x1b[1mCaching:\x1b[0m');
		expect(output).toContain('- Hits:              5');
		expect(output).toContain('- Misses:            2');
		expect(output).toContain('\x1b[1mProcessing time:\x1b[0m 1.23s');
	});
});
