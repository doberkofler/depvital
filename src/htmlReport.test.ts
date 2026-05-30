import {describe, expect, it} from 'vitest';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {writeHtmlReport} from './htmlReport.js';
import {type AnalysisResult} from './analyzer.js';

const daysAgo = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe('writeHtmlReport', () => {
	it('writes html report with correct links and stats', async () => {
		const tempDir = await mkdtemp(path.join(tmpdir(), 'depvital-html-'));
		const reportPath = path.join(tempDir, 'depvital.html');

		const results: AnalysisResult['results'] = [
			{
				package: 'with-changelog',
				current: '1.0.0',
				latest: '1.1.0',
				latestAvailable: '1.1.0',
				latestReleaseDate: daysAgo(10),
				daysSinceLatestRelease: 10,
				outdated: true,
				isDev: false,
				vulnerabilities: [],
				deprecated: false,
				maintenance: {lastRelease: daysAgo(10), daysSinceLastRelease: 10, isMaintained: true, healthScore: 0.8},
				githubUrl: 'https://github.com/org/with-changelog',
				changelog: {found: true, url: 'https://github.com/org/with-changelog/blob/main/CHANGELOG.md', latestEntry: 'x'},
			},
			{
				package: 'with-github',
				current: '1.0.0',
				latest: '1.0.0',
				latestAvailable: '1.0.0',
				latestReleaseDate: daysAgo(1),
				daysSinceLatestRelease: 1,
				outdated: false,
				isDev: false,
				vulnerabilities: [],
				deprecated: false,
				maintenance: {lastRelease: daysAgo(1), daysSinceLastRelease: 1, isMaintained: true, healthScore: 0.9},
				githubUrl: 'https://github.com/org/with-github',
				changelog: {found: false, url: null, latestEntry: null},
			},
			{
				package: 'with-npm-fallback',
				current: '1.0.0',
				latest: '1.0.0',
				latestAvailable: '1.0.0',
				latestReleaseDate: null,
				daysSinceLatestRelease: null,
				outdated: false,
				isDev: false,
				vulnerabilities: [],
				deprecated: false,
				maintenance: {lastRelease: null, daysSinceLastRelease: null, isMaintained: null, healthScore: null},
				githubUrl: null,
				changelog: {found: false, url: null, latestEntry: null},
			},
		];

		const stats: AnalysisResult['stats'] = {
			totalPackages: 3,
			outdatedPackages: 1,
			vulnerablePackages: 0,
			unmaintainedPackages: 0,
			deprecatedPackages: 0,
			cacheHits: 2,
			cacheMisses: 1,
			durationMs: 1234,
		};

		const output = await writeHtmlReport(results, stats, 3, reportPath);
		expect(output.filePath).toBe(reportPath);

		const html = await readFile(reportPath, 'utf8');
		expect(html).toContain('https://github.com/org/with-changelog/blob/main/CHANGELOG.md');
		expect(html).toContain('https://github.com/org/with-github');
		expect(html).toContain('https://www.npmjs.com/package/with-npm-fallback');
		expect(html).toContain('<th>GitHub</th>');
		expect(html).toContain('<th>Changelog</th>');
		expect(html).toContain('<div class="v">3</div>');

		await rm(tempDir, {recursive: true, force: true});
	});
});
