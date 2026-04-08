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

export function normalizeRepoUrl(repoUrl: string): string | null {
	if (typeof repoUrl !== 'string') {
		return null;
	}

	// Support various formats:
	// - https://github.com/user/repo
	// - git+https://github.com/user/repo.git
	// - git://github.com/user/repo.git
	// - github:user/repo
	// - user/repo (only if it looks like a user/repo)
	const match = repoUrl.match(/(?:github\.com\/|github:|^)([^/]+\/[^/]+)/);
	if (!match) {
		return null;
	}

	let result = match[1]?.replace(/\.git$/, '');
	// Remove git+https:// or similar if it's still there
	if (result?.includes('://')) {
		result = result.split('://')[1];
	}
	// Final cleanup to ensure it's just user/repo
	if (result?.includes('github.com/')) {
		result = result.split('github.com/')[1];
	}

	return result || null;
}

export async function resolvePackageRepo(packageName: string, cwd: string = process.cwd(), repoInput?: string | {url?: string}): Promise<string | null> {
	debug('Resolving repository for: %s', packageName);

	// 1. Try provided repo input (from registry fallback)
	if (repoInput) {
		const repoUrl = typeof repoInput === 'string' ? repoInput : repoInput.url;
		if (repoUrl) {
			const result = normalizeRepoUrl(repoUrl);
			if (result) {
				debug('Resolved GitHub repo from input for %s: %s', packageName, result);
				return result;
			}
		}
	}

	// 2. Try local node_modules
	const pkgPath = join(cwd, 'node_modules', packageName, 'package.json');
	if (!existsSync(pkgPath)) {
		debug('Package not found in node_modules: %s', packageName);
		return null;
	}

	try {
		const content = await readFile(pkgPath, 'utf-8');
		const json = JSON.parse(content);
		const pkg = PackageJsonSchema.parse(json);
		const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;

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
}

export async function fetchGitHubMetadata(repo: string, token?: string): Promise<GitHubMetadata | null> {
	debug('Fetching GitHub metadata for: %s', repo);
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github.v3+json',
		'User-Agent': 'depvital-cli',
	};

	if (token) {
		headers['Authorization'] = `token ${token}`;
	}

	try {
		const response = await fetch(`https://api.github.com/repos/${repo}`, {
			headers,
		});
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
}

export async function fetchChangelog(repo: string, token?: string): Promise<ChangelogInfo> {
	debug('Attempting to fetch changelog for: %s', repo);
	const files = ['CHANGELOG.md', 'CHANGELOG', 'changelog.md', 'changelog'];
	const branches = ['main', 'master'];
	const headers: Record<string, string> = {
		'User-Agent': 'depvital-cli',
	};

	if (token) {
		headers['Authorization'] = `token ${token}`;
	}

	for (const branch of branches) {
		for (const file of files) {
			try {
				const url = `https://raw.githubusercontent.com/${repo}/${branch}/${file}`;
				debug('Trying changelog file at: %s', url);
				const response = await fetch(url, {headers});
				if (response.ok) {
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
				continue;
			}
		}
	}

	// Fallback to releases API
	try {
		const url = `https://api.github.com/repos/${repo}/releases/latest`;
		debug('Falling back to GitHub releases API: %s', url);
		const response = await fetch(url, {headers});
		if (response.ok) {
			const json = await response.json();
			const release = GitHubReleaseSchema.parse(json);
			debug('Found latest release from API for %s', repo);
			return {
				found: true,
				url: `https://github.com/${repo}/releases/latest`,
				latestEntry: release.body?.substring(0, 500) || null,
			};
		} else {
			debug('GitHub releases API error for %s: %s', repo, response.status);
		}
	} catch (error) {
		debug('Error fetching releases for %s: %O', repo, error);
	}

	debug('No changelog found for: %s', repo);
	return {found: false, url: null, latestEntry: null};
}

function extractLatestEntry(content: string): string | null {
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
			entry += line + '\n';
		}
	}

	return entry.trim() || null;
}
