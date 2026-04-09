import {describe, it, expect, vi, beforeEach} from 'vitest';
import {analyze, type ProgressCallback} from './analyzer.js';
import * as pm from './package-manager.js';
import * as github from './github.js';
import {Cache} from './cache.js';
import {type Config} from './types.js';

vi.mock(import('./package-manager.js'));
vi.mock(import('./github.js'));
vi.mock(import('./cache.js'));

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
		vi.mocked(pm.getPackageInfo).mockResolvedValue({
			lastRelease: new Date().toISOString(),
			deprecated: false,
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
			maxAge: 180,
			cache: false,
			progress: true,
			update: false,
			minReleaseAge: 3,
		};

		const {results} = await analyze(config);

		expect(results).toHaveLength(2);

		// pkg1 should be outdated
		const res1 = results.find((r) => r.package === 'pkg1');
		if (!res1) {
			throw new Error('pkg1 result should exist');
		}
		expect(res1).toMatchObject({outdated: true});
		expect(res1.latest).toBe('2.0.0');
		expect(res1.githubUrl).toBe('https://github.com/user/repo');

		// pkg2 should have vulnerability
		const res2 = results.find((r) => r.package === 'pkg2');
		if (!res2) {
			throw new Error('pkg2 result should exist');
		}
		expect(res2.vulnerabilities).toHaveLength(1);
		expect(res2).toMatchObject({outdated: false});
		expect(res2.githubUrl).toBe('https://github.com/user/repo');
	});

	it('should use cache if enabled', async () => {
		vi.mocked(pm.detectPackageManager).mockResolvedValue('npm');
		vi.mocked(pm.getDependencies).mockResolvedValue([
			{
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.0.0',
				latest: '1.0.0',
				isDev: false,
			},
		]);
		vi.mocked(pm.getOutdated).mockResolvedValue([]);
		vi.mocked(pm.getAudit).mockResolvedValue({vulnerabilities: [], deprecated: []});
		vi.mocked(pm.getPackageInfo).mockResolvedValue({lastRelease: null, deprecated: false});

		const loadSpy = vi.spyOn(Cache.prototype, 'load').mockResolvedValue();

		// Create a date 10 days ago
		const tenDaysAgo = new Date();
		tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

		const getSpy = vi.spyOn(Cache.prototype, 'get').mockReturnValue({
			package: 'pkg1',
			current: '1.0.0',
			latest: '1.0.0',
			latestAvailable: '1.0.0',
			latestReleaseDate: tenDaysAgo.toISOString(),
			daysSinceLatestRelease: 5,
			outdated: false,
			isDev: false,
			vulnerabilities: [],
			maintenance: {
				isMaintained: true,
				healthScore: 0.9,
				lastRelease: tenDaysAgo.toISOString(),
				daysSinceLastRelease: 5, // Stale value in cache
			},
			changelog: {found: false, url: null, latestEntry: null},
			deprecated: false,
		});

		const config: Config = {
			json: false,
			debug: false,
			maxAge: 180,
			cache: true,
			progress: true,
			update: false,
			minReleaseAge: 3,
		};

		const {results} = await analyze(config);
		expect(results).toHaveLength(1);
		expect(loadSpy).toHaveBeenCalled();
		expect(getSpy).toHaveBeenCalledWith('pkg1');

		// Verify recalculation of daysSinceLastRelease
		const [firstResult] = results;
		if (!firstResult) {
			throw new Error('result should exist');
		}
		expect(firstResult.maintenance.daysSinceLastRelease).toBeGreaterThanOrEqual(10);
	});

	it('should mark package outdated using absolute latest from registry info', async () => {
		vi.mocked(pm.detectPackageManager).mockResolvedValue('npm');
		vi.mocked(pm.getDependencies).mockResolvedValue([{name: 'pkg1', current: '1.0.0', wanted: '1.0.0', latest: '1.0.0', isDev: false}]);
		vi.mocked(pm.getOutdated).mockResolvedValue([]);
		vi.mocked(pm.getAudit).mockResolvedValue({vulnerabilities: [], deprecated: []});
		vi.mocked(pm.getPackageInfo).mockResolvedValue({
			lastRelease: '2024-01-01T00:00:00.000Z',
			deprecated: false,
			latestVersion: '1.1.0',
			latestReleaseDate: '2024-01-01T00:00:00.000Z',
		});
		vi.mocked(github.resolvePackageRepo).mockResolvedValue(null);

		const config: Config = {
			json: false,
			debug: false,
			maxAge: 180,
			cache: false,
			progress: false,
			update: false,
			minReleaseAge: 3,
		};

		const {results} = await analyze(config);
		expect(results).toHaveLength(1);
		const [firstResult] = results;
		if (!firstResult) {
			throw new Error('result should exist');
		}
		expect(firstResult.latest).toBe('1.1.0');
		expect(firstResult).toMatchObject({outdated: true});
		expect(firstResult.daysSinceLatestRelease).not.toBeNull();
	});

	it('should invalidate cache if version changed', async () => {
		vi.mocked(pm.detectPackageManager).mockResolvedValue('npm');
		vi.mocked(pm.getDependencies).mockResolvedValue([
			{
				name: 'pkg1',
				current: '2.0.0', // New version
				wanted: '2.0.0',
				latest: '2.0.0',
				isDev: false,
			},
		]);
		vi.mocked(pm.getOutdated).mockResolvedValue([]);
		vi.mocked(pm.getAudit).mockResolvedValue({vulnerabilities: [], deprecated: []});
		vi.mocked(pm.getPackageInfo).mockResolvedValue({lastRelease: null, deprecated: false});
		vi.mocked(github.resolvePackageRepo).mockResolvedValue(null);

		vi.spyOn(Cache.prototype, 'load').mockResolvedValue();
		vi.spyOn(Cache.prototype, 'get').mockReturnValue({
			package: 'pkg1',
			current: '1.0.0', // Old version in cache
			latest: '1.0.0',
			outdated: false,
			isDev: false,
			vulnerabilities: [],
			maintenance: {isMaintained: true, healthScore: 0.9, lastRelease: null, daysSinceLastRelease: null},
			changelog: {found: false, url: null, latestEntry: null},
			deprecated: false,
		});

		const config: Config = {
			json: false,
			debug: false,
			maxAge: 180,
			cache: true,
			progress: true,
			update: false,
			minReleaseAge: 3,
		};

		const {results, stats} = await analyze(config);
		expect(results).toHaveLength(1);
		const [firstResult] = results;
		if (!firstResult) {
			throw new Error('result should exist');
		}
		expect(firstResult.current).toBe('2.0.0');
		expect(stats.cacheHits).toBe(0);
		expect(stats.cacheMisses).toBe(1);
	});

	it('should use fresh audit and outdated data even on cache hit', async () => {
		vi.mocked(pm.detectPackageManager).mockResolvedValue('npm');
		vi.mocked(pm.getDependencies).mockResolvedValue([
			{
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.0.0',
				latest: '1.0.0',
				isDev: false,
			},
		]);
		// Freshly outdated
		vi.mocked(pm.getOutdated).mockResolvedValue([{name: 'pkg1', current: '1.0.0', wanted: '1.1.0', latest: '1.1.0', isDev: false}]);
		// Fresh vulnerability
		vi.mocked(pm.getAudit).mockResolvedValue({
			vulnerabilities: [{severity: 'critical', title: 'New Vuln', package: 'pkg1'}],
			deprecated: [],
		});
		vi.mocked(pm.getPackageInfo).mockResolvedValue({lastRelease: null, deprecated: false});

		vi.spyOn(Cache.prototype, 'load').mockResolvedValue();
		vi.spyOn(Cache.prototype, 'get').mockReturnValue({
			package: 'pkg1',
			current: '1.0.0',
			latest: '1.0.0',
			latestAvailable: '1.0.0',
			isDev: false,
			outdated: false, // Stale outdated info in cache
			vulnerabilities: [], // Stale security info in cache
			maintenance: {isMaintained: true, healthScore: 0.9, lastRelease: null, daysSinceLastRelease: null},
			changelog: {found: false, url: null, latestEntry: null},
			deprecated: false,
		});

		const config: Config = {
			json: false,
			debug: false,
			maxAge: 180,
			cache: true,
			progress: true,
			update: false,
			minReleaseAge: 3,
		};

		const {results, stats} = await analyze(config);
		expect(results).toHaveLength(1);
		expect(stats.cacheHits).toBe(1);
		const [firstResult] = results;
		if (!firstResult) {
			throw new Error('result should exist');
		}
		expect(firstResult).toMatchObject({outdated: true});
		expect(firstResult.latest).toBe('1.1.0');
		expect(firstResult.vulnerabilities).toHaveLength(1);
		const [firstVulnerability] = firstResult.vulnerabilities;
		if (!firstVulnerability) {
			throw new Error('vulnerability should exist');
		}
		expect(firstVulnerability.severity).toBe('critical');
	});

	it('should update cache after analysis', async () => {
		vi.mocked(pm.detectPackageManager).mockResolvedValue('npm');
		vi.mocked(pm.getDependencies).mockResolvedValue([
			{
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.0.0',
				latest: '1.0.0',
				isDev: false,
			},
		]);
		vi.mocked(pm.getOutdated).mockResolvedValue([]);
		vi.mocked(pm.getAudit).mockResolvedValue({vulnerabilities: [], deprecated: []});
		vi.mocked(pm.getPackageInfo).mockResolvedValue({lastRelease: null, deprecated: false});

		vi.mocked(github.resolvePackageRepo).mockResolvedValue(null);
		const setSpy = vi.spyOn(Cache.prototype, 'set');
		const saveSpy = vi.spyOn(Cache.prototype, 'save');

		const config: Config = {
			json: false,
			debug: false,
			maxAge: 180,
			cache: true,
			progress: true,
			update: false,
			minReleaseAge: 3,
		};

		await analyze(config);
		expect(setSpy).toHaveBeenCalled();
		expect(saveSpy).toHaveBeenCalled();
	});

	it('should call onProgress callback', async () => {
		vi.mocked(pm.detectPackageManager).mockResolvedValue('npm');
		vi.mocked(pm.getDependencies).mockResolvedValue([
			{name: 'pkg1', current: '1.0.0', wanted: '1.0.0', latest: '1.0.0', isDev: false},
			{name: 'pkg2', current: '2.0.0', wanted: '2.0.0', latest: '2.0.0', isDev: false},
		]);
		vi.mocked(pm.getOutdated).mockResolvedValue([]);
		vi.mocked(pm.getAudit).mockResolvedValue({vulnerabilities: [], deprecated: []});
		vi.mocked(pm.getPackageInfo).mockResolvedValue({lastRelease: null, deprecated: false});
		vi.mocked(github.resolvePackageRepo).mockResolvedValue(null);

		const onProgress = vi.fn<ProgressCallback>();
		const config: Config = {
			json: false,
			debug: false,
			maxAge: 180,
			cache: false,
			progress: true,
			update: false,
			minReleaseAge: 3,
		};

		await analyze(config, onProgress);
		expect(onProgress).toHaveBeenCalledTimes(3);
	});

	it('should set githubRateLimitHit if fetchGitHubMetadata returns null', async () => {
		vi.mocked(pm.detectPackageManager).mockResolvedValue('npm');
		vi.mocked(pm.getDependencies).mockResolvedValue([{name: 'pkg1', current: '1.0.0', wanted: '1.0.0', latest: '1.0.0', isDev: false}]);
		vi.mocked(pm.getOutdated).mockResolvedValue([]);
		vi.mocked(pm.getAudit).mockResolvedValue({vulnerabilities: [], deprecated: []});
		vi.mocked(pm.getPackageInfo).mockResolvedValue({lastRelease: null, deprecated: false});
		vi.mocked(github.resolvePackageRepo).mockResolvedValue('user/repo');
		vi.mocked(github.fetchGitHubMetadata).mockResolvedValue(null);
		vi.mocked(github.fetchChangelog).mockResolvedValue({found: false, url: null, latestEntry: null});

		const config: Config = {json: false, debug: false, maxAge: 180, cache: false, progress: false, update: false, minReleaseAge: 3};
		const {githubRateLimitHit} = await analyze(config);
		expect({githubRateLimitHit}).toMatchObject({githubRateLimitHit: true});
	});
});
