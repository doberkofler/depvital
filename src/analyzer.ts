import {detectPackageManager, getDependencies, getOutdated, getAudit} from './package-manager.js';
import {resolvePackageRepo, fetchGitHubMetadata, fetchChangelog, type GitHubMetadata} from './github.js';
import {Cache} from './utils/cache.js';
import {ConfigSchema, ResultSchema, type Config, type Result} from './types.js';
import createDebug from 'debug';

const debug = createDebug('depvital:analyzer');

export type ProgressCallback = (current: number, total: number) => void;

export async function analyze(configInput: Config, onProgress?: ProgressCallback): Promise<Result[]> {
	debug('Analyzing with input config: %O', configInput);
	const config = ConfigSchema.parse(configInput);

	const pm = config.packageManager || (await detectPackageManager());
	debug('Using package manager: %s', pm);

	debug('Fetching all dependencies, outdated packages and audit results...');
	const [allDeps, outdated, audit] = await Promise.all([getDependencies(pm, config.includeDev), getOutdated(pm, config.includeDev), getAudit(pm)]);
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

	if (onProgress) {
		onProgress(0, total);
	}

	for (const pkg of combinedDeps) {
		current++;
		if (onProgress) {
			onProgress(current, total);
		}
		debug('Processing package: %s', pkg.name);
		const cached = config.cache ? cache.get<Result>(pkg.name) : undefined;
		if (cached) {
			debug('Using cached result for: %s', pkg.name);
			results.push(cached);
			continue;
		}

		debug('Resolving repository for: %s', pkg.name);
		const repo = await resolvePackageRepo(pkg.name);
		let maintenance: Result['maintenance'] = {
			lastCommit: null,
			daysSinceLastCommit: null,
			isMaintained: null,
			healthScore: null,
		};
		let changelog: Result['changelog'] = {found: false, latestEntry: null};

		if (repo) {
			debug('Resolved repo for %s: %s', pkg.name, repo);
			debug('Fetching GitHub metadata for: %s', repo);
			const metadata = await fetchGitHubMetadata(repo, config.githubToken);
			if (metadata) {
				const lastCommitDate = new Date(metadata.pushed_at);
				const now = new Date();
				const diffTime = Math.abs(now.getTime() - lastCommitDate.getTime());
				const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

				maintenance = {
					lastCommit: metadata.pushed_at,
					daysSinceLastCommit: diffDays,
					isMaintained: diffDays <= config.maxAge,
					healthScore: calculateHealthScore(metadata, diffDays),
				};
				debug('Maintenance health for %s: %O', pkg.name, maintenance);
			} else {
				debug('Could not fetch metadata for: %s', repo);
			}

			debug('Fetching changelog for: %s', repo);
			changelog = await fetchChangelog(repo, config.githubToken);
			debug('Changelog status for %s: %s', pkg.name, changelog.found ? 'Found' : 'Not Found');
		} else {
			debug('Could not resolve repo for: %s', pkg.name);
		}

		const result: Result = ResultSchema.parse({
			package: pkg.name,
			current: pkg.current,
			latest: pkg.latest,
			outdated: pkg.current !== pkg.latest,
			vulnerabilities: audit.vulnerabilities.filter((v) => v.package === pkg.name).map((v) => ({severity: v.severity, title: v.title})),
			deprecated: false, // In practice, deprecated packages are often found in audit or via registry metadata
			maintenance,
			githubUrl: repo ? `https://github.com/${repo}` : null,
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

	return results;
}

function calculateHealthScore(metadata: GitHubMetadata, diffDays: number): number {
	// Simple scoring logic: recency (50%), stars (30%), issues (20%)
	const recencyScore = Math.max(0, (365 - diffDays) / 365) * 0.5;
	const starsScore = Math.min(1, metadata.stargazers_count / 1000) * 0.3;
	const issuesScore = Math.max(0, 1 - metadata.open_issues_count / 100) * 0.2;

	return Math.min(1, Math.max(0, recencyScore + starsScore + issuesScore));
}
