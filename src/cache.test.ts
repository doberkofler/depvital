import {describe, it, expect, vi, beforeEach} from 'vitest';
import {Cache} from './cache.js';
import {readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {type Result} from './types.js';

vi.mock(import('node:fs'));
vi.mock(import('node:fs/promises'));

const mockResult: Result = {
	package: 'pkg1',
	current: '1.0.0',
	latest: '1.1.0',
	outdated: true,
	isDev: false,
	vulnerabilities: [],
	deprecated: false,
	maintenance: {
		lastRelease: '2024-01-01',
		daysSinceLastRelease: 10,
		isMaintained: true,
		healthScore: 0.8,
	},
	changelog: {found: true, latestEntry: 'v1.1.0'},
};

describe('Cache', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('should set and get data', () => {
		const cache = new Cache();
		cache.set('key', mockResult);
		expect(cache.get('key')).toStrictEqual(mockResult);
	});

	it('should load data from file', async () => {
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFile).mockResolvedValue(JSON.stringify({pkg1: mockResult}));

		const cache = new Cache();
		await cache.load();
		expect(cache.get('pkg1')).toStrictEqual(mockResult);
	});

	it('should save data to file', async () => {
		const cache = new Cache();
		cache.set('pkg1', mockResult);
		await cache.save();

		expect(writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String));
		const [firstCall] = vi.mocked(writeFile).mock.calls;
		if (!firstCall) {
			throw new Error('writeFile should be called');
		}
		const [, content] = firstCall;
		if (typeof content !== 'string') {
			throw new TypeError('writeFile content should be a string');
		}
		expect(JSON.parse(content)).toStrictEqual({pkg1: mockResult});
	});

	it('should clear data', () => {
		const cache = new Cache();
		cache.set('pkg1', mockResult);
		cache.clear();
		expect(cache.get('pkg1')).toBeUndefined();
	});

	it('should handle validation failure when loading from file', async () => {
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFile).mockResolvedValue(JSON.stringify({pkg1: {invalid: 'data'}}));

		const cache = new Cache();
		await cache.load();
		expect(cache.get('pkg1')).toBeUndefined();
	});

	it('should handle error when loading from file', async () => {
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(readFile).mockRejectedValue(new Error('Read error'));

		const cache = new Cache();
		await cache.load();
		expect(cache.get('pkg1')).toBeUndefined();
	});

	it('should handle error when saving to file', async () => {
		vi.mocked(writeFile).mockRejectedValue(new Error('Write error'));

		const cache = new Cache();
		cache.set('pkg1', mockResult);
		await cache.save();
		expect(writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String));
	});

	it('should handle set with invalid data', () => {
		const cache = new Cache();
		cache.set('key', {invalid: 'data'});
		expect(cache.get('key')).toBeUndefined();
	});

	it('should handle missing cache file', async () => {
		vi.mocked(existsSync).mockReturnValue(false);
		const cache = new Cache();
		await cache.load();
		expect(cache.get('pkg1')).toBeUndefined();
	});
});
