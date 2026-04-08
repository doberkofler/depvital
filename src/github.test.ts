import {describe, it, expect, vi, beforeEach} from 'vitest';
import {fetchGitHubMetadata, fetchChangelog, resolvePackageRepo, normalizeRepoUrl} from './github.js';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';

vi.mock('node:fs');
vi.mock('node:fs/promises');

describe('github', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.stubGlobal('fetch', vi.fn());
	});

	describe('normalizeRepoUrl', () => {
		it('should return null for non-string input', () => {
			expect(normalizeRepoUrl(null as any)).toBeNull();
		});

		it('should handle github.com URLs', () => {
			expect(normalizeRepoUrl('https://github.com/user/repo')).toBe('user/repo');
			expect(normalizeRepoUrl('https://github.com/user/repo.git')).toBe('user/repo');
			expect(normalizeRepoUrl('https://github.com/tj/commander.js')).toBe('tj/commander.js');
		});

		it('should handle github: shorthand', () => {
			expect(normalizeRepoUrl('github:user/repo')).toBe('user/repo');
		});

		it('should handle user/repo shorthand', () => {
			expect(normalizeRepoUrl('user/repo')).toBe('user/repo');
		});

		it('should return null for invalid URLs', () => {
			expect(normalizeRepoUrl('not-a-repo')).toBeNull();
		});
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

		it('should resolve repo from repoInput string', async () => {
			const repo = await resolvePackageRepo('some-pkg', process.cwd(), 'user/repo');
			expect(repo).toBe('user/repo');
		});

		it('should resolve repo from repoInput object', async () => {
			const repo = await resolvePackageRepo('some-pkg', process.cwd(), {url: 'https://github.com/user/repo'});
			expect(repo).toBe('user/repo');
		});

		it('should return null if package.json not found', async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			const repo = await resolvePackageRepo('some-pkg');
			expect(repo).toBeNull();
		});

		it('should return null if repository field is missing', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockResolvedValue(JSON.stringify({}));
			const repo = await resolvePackageRepo('some-pkg');
			expect(repo).toBeNull();
		});

		it('should return null if repository object has no url', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockResolvedValue(JSON.stringify({repository: {}}));
			const repo = await resolvePackageRepo('some-pkg');
			expect(repo).toBeNull();
		});

		it('should handle resolvePackageRepo errors', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFile).mockRejectedValue(new Error('Read error'));

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

		it('should use github token if provided in fetchGitHubMetadata', async () => {
			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				json: async () => ({stargazers_count: 0, open_issues_count: 0, pushed_at: ''}),
			} as Response);

			await fetchGitHubMetadata('user/repo', 'my-token');
			expect(fetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'token my-token',
					}),
				}),
			);
		});

		it('should handle fetchGitHubMetadata errors', async () => {
			vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
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

		it('should use github token if provided in fetchChangelog', async () => {
			vi.mocked(fetch).mockResolvedValue({ok: false} as Response);

			await fetchChangelog('user/repo', 'my-token');
			expect(fetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'token my-token',
					}),
				}),
			);
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

		it('should handle fetch errors when checking for changelog files', async () => {
			vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

			const changelog = await fetchChangelog('user/repo');
			expect(changelog.found).toBe(false);
		});

		it('should handle releases API throwing error', async () => {
			// All file checks fail
			vi.mocked(fetch).mockResolvedValueOnce({ok: false} as Response);
			// Then release API fails
			vi.mocked(fetch).mockRejectedValue(new Error('API error'));

			const changelog = await fetchChangelog('user/repo');
			expect(changelog.found).toBe(false);
		});

		it('should handle multiple headings in changelog and only return the first section', async () => {
			vi.mocked(fetch).mockResolvedValueOnce({
				ok: true,
				text: async () => '# v1.1.0\nUpdate 1.1\n# v1.0.0\nUpdate 1.0',
			} as Response);

			const changelog = await fetchChangelog('user/repo');
			expect(changelog.found).toBe(true);
			expect(changelog.latestEntry).toBe('# v1.1.0\nUpdate 1.1');
		});

		it('should handle releases API failure', async () => {
			// Mock all file checks and releases API to fail
			vi.mocked(fetch).mockResolvedValue({ok: false, status: 404} as Response);

			const changelog = await fetchChangelog('user/repo');
			expect(changelog.found).toBe(false);
			expect(changelog.url).toBeNull();
		});
	});
});
