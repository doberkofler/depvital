import {describe, it, expect, vi, beforeEach} from 'vitest';
import {fetchGitHubMetadata, fetchChangelog, resolvePackageRepo} from './github.js';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';

vi.mock('node:fs');
vi.mock('node:fs/promises');

describe('github', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.stubGlobal('fetch', vi.fn());
	});

	describe('resolvePackageRepo', () => {
		it('should resolve repo from package.json', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					repository: {url: 'git+https://github.com/user/repo.git'},
				}),
			);

			const repo = await resolvePackageRepo('some-pkg');
			expect(repo).toBe('user/repo');
		});

		it('should handle shorthand repo string', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					repository: 'github:user/repo',
				}),
			);

			const repo = await resolvePackageRepo('some-pkg');
			expect(repo).toBe('user/repo');
		});

		it('should return null if repo is not github', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					repository: 'https://gitlab.com/user/repo',
				}),
			);

			const repo = await resolvePackageRepo('some-pkg');
			expect(repo).toBeNull();
		});
	});

	describe('fetchGitHubMetadata', () => {
		it('should fetch metadata from GitHub API', async () => {
			const mockMetadata = {
				stargazers_count: 100,
				open_issues_count: 10,
				pushed_at: '2024-01-01T00:00:00Z',
			};

			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				json: async () => mockMetadata,
			} as Response);

			const metadata = await fetchGitHubMetadata('user/repo');
			expect(metadata).toEqual(mockMetadata);
			expect(fetch).toHaveBeenCalledWith('https://api.github.com/repos/user/repo', expect.any(Object));
		});

		it('should return null on fetch error', async () => {
			vi.mocked(fetch).mockResolvedValue({ok: false} as Response);
			const metadata = await fetchGitHubMetadata('user/repo');
			expect(metadata).toBeNull();
		});
	});

	describe('fetchChangelog', () => {
		it('should find changelog in raw.githubusercontent.com', async () => {
			vi.mocked(fetch).mockResolvedValueOnce({ok: false} as Response); // CHANGELOG.md
			vi.mocked(fetch).mockResolvedValueOnce({
				ok: true,
				text: async () => '# v1.0.0\nInitial release',
			} as Response); // CHANGELOG

			const changelog = await fetchChangelog('user/repo');
			expect(changelog.found).toBe(true);
			expect(changelog.url).toBe('https://github.com/user/repo/blob/main/CHANGELOG');
			expect(changelog.latestEntry).toContain('v1.0.0');
		});

		it('should fallback to releases API', async () => {
			// All file fetches fail
			vi.mocked(fetch).mockResolvedValue({ok: false} as Response);

			// Last fetch is releases API
			vi.mocked(fetch).mockImplementation(async (url) => {
				if ((url as string).includes('releases/latest')) {
					return {
						ok: true,
						json: async () => ({body: 'Release notes'}),
					} as Response;
				}
				return {ok: false} as Response;
			});

			const changelog = await fetchChangelog('user/repo');
			expect(changelog.found).toBe(true);
			expect(changelog.url).toBe('https://github.com/user/repo/releases/latest');
			expect(changelog.latestEntry).toBe('Release notes');
		});
	});
});
