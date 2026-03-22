import {describe, it, expect, vi, beforeEach} from 'vitest';
import {analyze} from './analyzer.js';
import * as pm from './package-manager.js';
import * as github from './github.js';
import type {Config} from './types.js';

vi.mock('./package-manager.js');
vi.mock('./github.js');

describe('analyzer', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('should perform a full analysis on all dependencies', async () => {
		vi.mocked(pm.detectPackageManager).mockResolvedValue('npm');
		vi.mocked(pm.getDependencies).mockResolvedValue([
			{
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.0.0',
				latest: '1.0.0',
				isDev: false,
			},
			{
				name: 'pkg2',
				current: '2.0.0',
				wanted: '2.0.0',
				latest: '2.0.0',
				isDev: false,
			},
		]);
		vi.mocked(pm.getOutdated).mockResolvedValue([
			{
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.1.0',
				latest: '2.0.0',
				isDev: false,
			},
		]);
		vi.mocked(pm.getAudit).mockResolvedValue({
			vulnerabilities: [{severity: 'high', title: 'Vuln', package: 'pkg2'}],
			deprecated: [],
		});

		vi.mocked(github.resolvePackageRepo).mockResolvedValue('user/repo');
		vi.mocked(github.fetchGitHubMetadata).mockResolvedValue({
			stargazers_count: 500,
			open_issues_count: 5,
			pushed_at: new Date().toISOString(),
		});
		vi.mocked(github.fetchChangelog).mockResolvedValue({
			found: true,
			url: 'https://github.com/user/repo/blob/main/CHANGELOG.md',
			latestEntry: 'New features',
		});

		const config: Config = {
			json: false,
			debug: false,
			failOn: 'high',
			maxAge: 180,
			includeDev: false,
			cache: false,
		};

		const results = await analyze(config);

		expect(results).toHaveLength(2);

		// pkg1 should be outdated
		const res1 = results.find((r) => r.package === 'pkg1');
		expect(res1?.outdated).toBe(true);
		expect(res1?.latest).toBe('2.0.0');

		// pkg2 should have vulnerability
		const res2 = results.find((r) => r.package === 'pkg2');
		expect(res2?.vulnerabilities).toHaveLength(1);
		expect(res2?.outdated).toBe(false);
	});
});
