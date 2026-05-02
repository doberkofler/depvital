import {describe, it, expect, vi, beforeEach} from 'vitest';
import {fetchGitHubMetadata, fetchChangelog, resolvePackageRepo, normalizeRepoUrl} from './github.js';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';

vi.mock(import('node:fs'));
vi.mock(import('node:fs/promises'));

const jsonResponse = (payload: unknown, status = 200): Response => Response.json(payload, {status});

const textResponse = (payload: string, status = 200): Response => new Response(payload, {status});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

describe('github', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', fetchMock);
	});

	describe('normalizeRepoUrl', () => {
		it('should return null for non-string input', () => {
			expect(normalizeRepoUrl(String(null))).toBeNull();
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

			fetchMock.mockResolvedValue(jsonResponse(mockMetadata));

			const metadata = await fetchGitHubMetadata('user/repo');
			expect(metadata).toEqual(mockMetadata);
			expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/user/repo', expect.any(Object));
		});

		it('should return null on fetch error', async () => {
			fetchMock.mockResolvedValue(new Response('', {status: 500}));
			const metadata = await fetchGitHubMetadata('user/repo');
			expect(metadata).toBeNull();
		});

		it('should use github token if provided in fetchGitHubMetadata', async () => {
			fetchMock.mockResolvedValue(jsonResponse({stargazers_count: 0, open_issues_count: 0, pushed_at: ''}));

			await fetchGitHubMetadata('user/repo', 'my-token');
			expect(fetchMock).toHaveBeenCalled();
			const [firstCall] = fetchMock.mock.calls;
			if (!firstCall) {
				throw new Error('fetch should be called');
			}
			const [, options] = firstCall;
			expect(options).toMatchObject({headers: {Authorization: 'token my-token'}});
		});

		it('should handle fetchGitHubMetadata errors', async () => {
			fetchMock.mockRejectedValue(new Error('Network error'));
			const metadata = await fetchGitHubMetadata('user/repo');
			expect(metadata).toBeNull();
		});
	});

	describe('fetchChangelog', () => {
		it('should find changelog in raw.githubusercontent.com', async () => {
			fetchMock.mockResolvedValueOnce(new Response('', {status: 404})); // CHANGELOG.md
			fetchMock.mockResolvedValueOnce(textResponse('# v1.0.0\nInitial release')); // CHANGELOG

			const changelog = await fetchChangelog('user/repo');
			expect(changelog).toMatchObject({found: true});
			expect(changelog.url).toBe('https://github.com/user/repo/blob/main/CHANGELOG');
			expect(changelog.latestEntry).toContain('v1.0.0');
		});

		it('should use github token if provided in fetchChangelog', async () => {
			fetchMock.mockResolvedValue(new Response('', {status: 404}));

			await fetchChangelog('user/repo', 'my-token');
			expect(fetchMock).toHaveBeenCalled();
			const [firstCall] = fetchMock.mock.calls;
			if (!firstCall) {
				throw new Error('fetch should be called');
			}
			const [, options] = firstCall;
			expect(options).toMatchObject({headers: {Authorization: 'token my-token'}});
		});

		it('should fallback to releases API', async () => {
			// All file fetches fail
			fetchMock.mockResolvedValue(new Response('', {status: 404}));

			// Last fetch is releases API
			fetchMock.mockImplementation(async (url) => {
				let requestUrl: string;
				if (url instanceof URL) {
					requestUrl = url.toString();
				} else if (typeof url === 'string') {
					requestUrl = url;
				} else {
					requestUrl = url.url;
				}
				await Promise.resolve();
				if (requestUrl.includes('releases/latest')) {
					return jsonResponse({body: 'Release notes'});
				}
				return new Response('', {status: 404});
			});

			const changelog = await fetchChangelog('user/repo');
			expect(changelog).toMatchObject({found: true});
			expect(changelog.url).toBe('https://github.com/user/repo/releases/latest');
			expect(changelog.latestEntry).toBe('Release notes');
		});

		it('should handle fetch errors when checking for changelog files', async () => {
			fetchMock.mockRejectedValue(new Error('Network error'));

			const changelog = await fetchChangelog('user/repo');
			expect(changelog).toMatchObject({found: false});
		});

		it('should handle releases API throwing error', async () => {
			// All file checks fail
			fetchMock.mockResolvedValueOnce(new Response('', {status: 404}));
			// Then release API fails
			fetchMock.mockRejectedValue(new Error('API error'));

			const changelog = await fetchChangelog('user/repo');
			expect(changelog).toMatchObject({found: false});
		});

		it('should handle multiple headings in changelog and only return the first section', async () => {
			fetchMock.mockResolvedValueOnce(textResponse('# v1.1.0\nUpdate 1.1\n# v1.0.0\nUpdate 1.0'));

			const changelog = await fetchChangelog('user/repo');
			expect(changelog).toMatchObject({found: true});
			expect(changelog.latestEntry).toBe('# v1.1.0\nUpdate 1.1');
		});

		it('should handle releases API failure', async () => {
			// Mock all file checks and releases API to fail
			fetchMock.mockResolvedValue(new Response('', {status: 404}));

			const changelog = await fetchChangelog('user/repo');
			expect(changelog).toMatchObject({found: false});
			expect(changelog.url).toBeNull();
		});
	});
});
