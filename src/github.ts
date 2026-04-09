import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {PackageJsonSchema, GitHubRepoSchema, GitHubReleaseSchema} from './types.js';
import createDebug from 'debug';

const debug = createDebug('depvital:github');

export type GitHubMetadata = {
	stargazers_count: number;
	open_issues_count: number;
	pushed_at: string;
};

export type ChangelogInfo = {
	found: boolean;
	url: string | null;
	latestEntry: string | null;
};

const extractLatestEntry = (content: string): string | null => {
	const lines = content.split('\n');
	let entry = '';
	let foundFirstHeading = false;

	for (const line of lines) {
		if (line.trim().startsWith('#')) {
			if (foundFirstHeading) {
				break;
			}
			foundFirstHeading = true;
		}

		if (foundFirstHeading) {
			entry += `${line}\n`;
		}
	}

	return entry.trim() || null;
};

export const normalizeRepoUrl = (repoUrl: string): string | null => {
	const match = /(?:github\.com\/|github:|^)([^/]+\/[^/]+)/.exec(repoUrl);
	if (match === null) {
		return null;
	}

	const [, captured] = match;
	if (typeof captured !== 'string') {
		return null;
	}

	let result = captured.replace(/\.git$/, '');

	if (result.includes('://')) {
		const [, repoPart = ''] = result.split('://');
		result = repoPart;
	}

	if (result.includes('github.com/')) {
		const [, repoPart = ''] = result.split('github.com/');
		result = repoPart;
	}

	return result.length > 0 ? result : null;
};

export const resolvePackageRepo = async (packageName: string, cwd: string = process.cwd(), repoInput?: string | {url?: string}): Promise<string | null> => {
	debug('Resolving repository for: %s', packageName);

	if (repoInput !== undefined) {
		const repoUrl = typeof repoInput === 'string' ? repoInput : repoInput.url;
		if (typeof repoUrl === 'string' && repoUrl.length > 0) {
			const result = normalizeRepoUrl(repoUrl);
			if (typeof result === 'string' && result.length > 0) {
				debug('Resolved GitHub repo from input for %s: %s', packageName, result);
				return result;
			}
		}
	}

	const pkgPath = join(cwd, 'node_modules', packageName, 'package.json');
	if (!existsSync(pkgPath)) {
		debug('Package not found in node_modules: %s', packageName);
		return null;
	}

	try {
		const content = await readFile(pkgPath, 'utf8');
		const json: unknown = JSON.parse(content);
		const pkg = PackageJsonSchema.parse(json);

		let repoUrl: string | undefined;
		if (typeof pkg.repository === 'string') {
			repoUrl = pkg.repository;
		} else if (typeof pkg.repository === 'object' && typeof pkg.repository.url === 'string') {
			repoUrl = pkg.repository.url;
		}

		if (typeof repoUrl !== 'string') {
			debug('No repository URL found locally for package: %s', packageName);
			return null;
		}

		const result = normalizeRepoUrl(repoUrl);
		debug('Resolved GitHub repo locally for %s: %s', packageName, result);
		return result;
	} catch (error) {
		debug('Error resolving repository for %s: %O', packageName, error);
		return null;
	}
};

export const fetchGitHubMetadata = async (repo: string, token?: string): Promise<GitHubMetadata | null> => {
	debug('Fetching GitHub metadata for: %s', repo);
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github.v3+json',
		'User-Agent': 'depvital-cli',
	};

	if (typeof token === 'string' && token.length > 0) {
		headers['Authorization'] = `token ${token}`;
	}

	try {
		const response = await fetch(`https://api.github.com/repos/${repo}`, {headers});
		if (!response.ok) {
			debug('GitHub API error for %s: %s %s', repo, response.status, response.statusText);
			return null;
		}

		const json = await response.json();
		const result = GitHubRepoSchema.parse(json);
		debug('Metadata fetched for %s: %O', repo, result);
		return result;
	} catch (error) {
		debug('Error fetching GitHub metadata for %s: %O', repo, error);
		return null;
	}
};

export const fetchChangelog = async (repo: string, token?: string): Promise<ChangelogInfo> => {
	debug('Attempting to fetch changelog for: %s', repo);
	const files = ['CHANGELOG.md', 'CHANGELOG', 'changelog.md', 'changelog'];
	const branches = ['main', 'master'];
	const headers: Record<string, string> = {
		'User-Agent': 'depvital-cli',
	};

	if (typeof token === 'string' && token.length > 0) {
		headers['Authorization'] = `token ${token}`;
	}

	for (const branch of branches) {
		for (const file of files) {
			try {
				const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}`;
				debug('Trying changelog file at: %s', url);
				// eslint-disable-next-line eslint/no-await-in-loop -- intentional ordered probing of branches/files
				const response = await fetch(url, {headers});
				if (response.ok) {
					// eslint-disable-next-line eslint/no-await-in-loop -- intentional ordered probing of branches/files
					const text = await response.text();
					const uiUrl = `https://github.com/${repo}/blob/${branch}/${file}`;
					debug('Found changelog at: %s', url);
					return {
						found: true,
						url: uiUrl,
						latestEntry: extractLatestEntry(text),
					};
				}
			} catch (error) {
				debug('Error trying changelog file %s on branch %s: %O', file, branch, error);
			}
		}
	}

	try {
		const url = `https://api.github.com/repos/${repo}/releases/latest`;
		debug('Falling back to GitHub releases API: %s', url);
		const response = await fetch(url, {headers});
		if (response.ok) {
			const json = await response.json();
			const release = GitHubReleaseSchema.parse(json);
			const latestEntry = typeof release.body === 'string' ? release.body.slice(0, 500) : null;
			debug('Found latest release from API for %s', repo);
			return {
				found: true,
				url: `https://github.com/${repo}/releases/latest`,
				latestEntry,
			};
		}

		debug('GitHub releases API error for %s: %s', repo, response.status);
	} catch (error) {
		debug('Error fetching releases for %s: %O', repo, error);
	}

	debug('No changelog found for: %s', repo);
	return {found: false, url: null, latestEntry: null};
};
