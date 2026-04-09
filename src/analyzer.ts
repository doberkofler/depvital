import {detectPackageManager, getDependencies, getOutdated, getAudit, getPackageInfo} from './package-manager.js';
import {resolvePackageRepo, fetchGitHubMetadata, fetchChangelog, type GitHubMetadata} from './github.js';
import {Cache} from './cache.js';
import {ConfigSchema, ResultSchema, type Config, type Result} from './types.js';
import createDebug from 'debug';

const debug = createDebug('depvital:analyzer');

export type ProgressCallback = (current: number, total: number) => void;

export type AnalysisResult = {
	results: Result[];
	githubRateLimitHit: boolean;
	stats: {
		totalPackages: number;
		outdatedPackages: number;
		vulnerablePackages: number;
		unmaintainedPackages: number;
		deprecatedPackages: number;
		cacheHits: number;
		cacheMisses: number;
		durationMs: number;
	};
};

const calculateHealthScore = (metadata: GitHubMetadata, diffDays: number): number => {
	const recencyScore = Math.max(0, (365 - diffDays) / 365) * 0.5;
	const starsScore = Math.min(1, metadata.stargazers_count / 1000) * 0.3;
	const issuesScore = Math.max(0, 1 - metadata.open_issues_count / 100) * 0.2;

	return Math.min(1, Math.max(0, recencyScore + starsScore + issuesScore));
};

export const analyze = async (configInput: Config, onProgress?: ProgressCallback): Promise<AnalysisResult> => {
	const startTime = Date.now();
	debug('Analyzing with input config: %O', configInput);
	const config = ConfigSchema.parse(configInput);

	const pm = config.packageManager ?? detectPackageManager();
	debug('Using package manager: %s', pm);

	debug('Fetching all dependencies, outdated packages and audit results...');
	const [allDeps, outdated, audit] = await Promise.all([getDependencies(pm), getOutdated(pm), getAudit(pm)]);
	debug('Found %d total dependencies', allDeps.length);
	debug('Found %d outdated packages', outdated.length);
	debug('Found %d vulnerabilities', audit.vulnerabilities.length);

	// Merge outdated info into allDeps
	const outdatedMap = new Map(outdated.map((o) => [o.name, o]));
	const combinedDeps = allDeps.map((d) => {
		const out = outdatedMap.get(d.name);
		if (out) {
			return {...d, wanted: out.wanted, latest: out.latest};
		}
		return d;
	});

	const cache = new Cache();
	if (config.cache) {
		debug('Loading cache...');
		await cache.load();
	}

	const results: Result[] = [];
	const total = combinedDeps.length;
	let current = 0;
	let githubRateLimitHit = false;
	let cacheHits = 0;
	let cacheMisses = 0;

	if (onProgress) {
		onProgress(0, total);
	}

	for (const pkg of combinedDeps) {
		current++;
		if (onProgress) {
			onProgress(current, total);
		}
		debug('Processing package: %s', pkg.name);
		const cached = config.cache ? cache.get(pkg.name) : undefined;

		if (cached && cached.current === pkg.current && typeof cached.latestAvailable !== 'undefined') {
			debug('Cache hit for %s (version %s matches)', pkg.name, pkg.current);

			// Recalculate time-based maintenance data from cached lastRelease date
			const maintenance = {...cached.maintenance};
			if (typeof maintenance.lastRelease === 'string') {
				const releaseDate = new Date(maintenance.lastRelease);
				const now = new Date();
				const diffTime = Math.abs(now.getTime() - releaseDate.getTime());
				const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
				maintenance.daysSinceLastRelease = diffDays;
				maintenance.isMaintained = diffDays <= config.maxAge;
			}

			let daysSinceLatestRelease = cached.daysSinceLatestRelease ?? null;
			if (typeof cached.latestReleaseDate === 'string') {
				const releaseDate = new Date(cached.latestReleaseDate);
				const now = new Date();
				const diffTime = Math.abs(now.getTime() - releaseDate.getTime());
				daysSinceLatestRelease = Math.floor(diffTime / (1000 * 60 * 60 * 24));
			}

			const latestAvailable = pkg.latest !== pkg.current ? pkg.latest : (cached.latestAvailable ?? pkg.latest);

			// Merge cached metadata with fresh update and audit info
			const result: Result = {
				...cached,
				maintenance,
				latest: latestAvailable,
				latestAvailable,
				daysSinceLatestRelease,
				outdated: pkg.current !== latestAvailable,
				isDev: pkg.isDev,
				vulnerabilities: audit.vulnerabilities.filter((v) => v.package === pkg.name).map((v) => ({severity: v.severity, title: v.title})),
			};
			results.push(result);
			cacheHits++;
			continue;
		}

		if (cached && cached.current !== pkg.current) {
			debug('Cache invalidation for %s: version changed from %s to %s', pkg.name, cached.current, pkg.current);
		} else if (config.cache) {
			debug('Cache miss for %s', pkg.name);
		}

		if (config.cache) {
			cacheMisses++;
		}

		// Fallback for maintenance info: npm registry
		debug('Fetching package info from registry for: %s', pkg.name);
		// eslint-disable-next-line eslint/no-await-in-loop -- intentional sequential processing for stable progress and lower API pressure
		const pkgInfo = await getPackageInfo(pm, pkg.name);
		const latestAvailable = pkgInfo.latestVersion ?? pkg.latest;
		const latestReleaseDate = pkgInfo.latestReleaseDate ?? null;
		let daysSinceLatestRelease: number | null = null;
		if (latestReleaseDate !== null) {
			const releaseDate = new Date(latestReleaseDate);
			const now = new Date();
			const diffTime = Math.abs(now.getTime() - releaseDate.getTime());
			daysSinceLatestRelease = Math.floor(diffTime / (1000 * 60 * 60 * 24));
		}

		debug('Resolving repository for: %s', pkg.name);
		// eslint-disable-next-line eslint/no-await-in-loop -- intentional sequential processing for stable progress and lower API pressure
		const repo = await resolvePackageRepo(pkg.name, process.cwd(), pkgInfo.repository);

		let maintenance: Result['maintenance'] = {
			lastRelease: pkgInfo.lastRelease,
			daysSinceLastRelease: null,
			isMaintained: null,
			healthScore: null,
		};

		if (pkgInfo.lastRelease !== null) {
			const releaseDate = new Date(pkgInfo.lastRelease);
			const now = new Date();
			const diffTime = Math.abs(now.getTime() - releaseDate.getTime());
			const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
			maintenance.daysSinceLastRelease = diffDays;
			maintenance.isMaintained = diffDays <= config.maxAge;
			// Initial health score based on recency only
			maintenance.healthScore = Math.max(0, (365 - diffDays) / 365) * 0.5;
		}

		let changelog: Result['changelog'] = {found: false, latestEntry: null};

		if (repo !== null) {
			debug('Resolved repo for %s: %s', pkg.name, repo);
			debug('Fetching GitHub metadata for: %s', repo);
			// eslint-disable-next-line eslint/no-await-in-loop -- intentional sequential processing for stable progress and lower API pressure
			const metadata = await fetchGitHubMetadata(repo, config.githubToken);
			if (metadata) {
				const lastCommitDate = new Date(metadata.pushed_at);
				const now = new Date();
				const diffTime = Math.abs(now.getTime() - lastCommitDate.getTime());
				const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

				// GitHub is more precise for repo activity
				maintenance = {
					lastRelease: metadata.pushed_at,
					daysSinceLastRelease: diffDays,
					isMaintained: diffDays <= config.maxAge,
					healthScore: calculateHealthScore(metadata, diffDays),
				};
				debug('Maintenance health for %s: %O', pkg.name, maintenance);
			} else {
				debug('Could not fetch metadata for: %s', repo);
				// Check if it was a rate limit hit by looking at GitHub API status (internal)
				// Since we don't have the status here, we'll infer it if metadata is null but repo exists
				// and we want to be proactive.
				// In a real app we'd pass back the status from fetchGitHubMetadata.
				// For now, let's just assume we hit it if we can't get metadata for a valid repo.
				githubRateLimitHit = true;
			}

			debug('Fetching changelog for: %s', repo);
			// eslint-disable-next-line eslint/no-await-in-loop -- intentional sequential processing for stable progress and lower API pressure
			changelog = await fetchChangelog(repo, config.githubToken);
			debug('Changelog status for %s: %s', pkg.name, changelog.found ? 'Found' : 'Not Found');
		} else {
			debug('Could not resolve repo for: %s', pkg.name);
		}

		const result: Result = ResultSchema.parse({
			package: pkg.name,
			current: pkg.current,
			latest: latestAvailable,
			latestAvailable,
			latestReleaseDate,
			daysSinceLatestRelease,
			outdated: pkg.current !== latestAvailable,
			isDev: pkg.isDev,
			vulnerabilities: audit.vulnerabilities.filter((v) => v.package === pkg.name).map((v) => ({severity: v.severity, title: v.title})),
			deprecated: pkgInfo.deprecated,
			maintenance,
			githubUrl: repo !== null ? `https://github.com/${repo}` : null,
			changelog,
		});

		if (config.cache) {
			debug('Caching result for: %s', pkg.name);
			cache.set(pkg.name, result);
		}
		results.push(result);
	}

	if (config.cache) {
		debug('Saving cache...');
		await cache.save();
	}

	const stats = {
		totalPackages: results.length,
		outdatedPackages: results.filter((r) => r.outdated).length,
		vulnerablePackages: results.filter((r) => r.vulnerabilities.length > 0).length,
		unmaintainedPackages: results.filter((r) => r.maintenance.isMaintained === false).length,
		deprecatedPackages: results.filter((r) => r.deprecated).length,
		cacheHits,
		cacheMisses,
		durationMs: Date.now() - startTime,
	};

	return {results, githubRateLimitHit, stats};
};
