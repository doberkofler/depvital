import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {existsSync} from 'node:fs';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {ResultSchema} from './types.js';
import createDebug from 'debug';

const debug = createDebug('depvital:cache');
const CACHE_FILE = '.depvital-cache.json';
const CACHE_DIR_NAME = 'depvital';
const CacheDataSchema = z.record(z.string(), ResultSchema);

const isNonEmptyString = (value: string | undefined): value is string => typeof value === 'string' && value.length > 0;

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error && 'code' in error;

const getGlobalCacheDirectory = (): string => {
	if (process.platform === 'win32') {
		const localAppData = process.env['LOCALAPPDATA'];
		if (isNonEmptyString(localAppData)) {
			return path.join(localAppData, CACHE_DIR_NAME);
		}
	}

	const xdgCacheHome = process.env['XDG_CACHE_HOME'];
	if (isNonEmptyString(xdgCacheHome)) {
		return path.join(xdgCacheHome, CACHE_DIR_NAME);
	}

	return path.join(os.homedir(), '.cache', CACHE_DIR_NAME);
};

export class Cache {
	private readonly cachePath: string;
	private readonly lockPath: string;
	private data: z.infer<typeof CacheDataSchema> = {};

	public constructor(cachePath: string = path.join(getGlobalCacheDirectory(), CACHE_FILE)) {
		this.cachePath = cachePath;
		this.lockPath = `${this.cachePath}.lock`;
		debug('Cache path set to: %s', this.cachePath);
	}

	private async acquireLock(timeoutMs = 5000): Promise<void> {
		const start = Date.now();
		// eslint-disable-next-line no-await-in-loop no-unreachable-loop
		while (Date.now() - start < timeoutMs) {
			try {
				// eslint-disable-next-line no-await-in-loop
				await mkdir(this.lockPath);
				debug('Acquired cache lock: %s', this.lockPath);
				return;
			} catch (error) {
				if (!isErrnoException(error) || error.code !== 'EEXIST') {
					throw error;
				}
				// eslint-disable-next-line no-await-in-loop
				await delay(40);
			}
		}

		throw new Error(`Timed out acquiring cache lock: ${this.lockPath}`);
	}

	private async releaseLock(): Promise<void> {
		try {
			await rm(this.lockPath, {recursive: true, force: true});
			debug('Released cache lock: %s', this.lockPath);
		} catch (error) {
			debug('Error releasing cache lock: %O', error);
		}
	}

	private async readCacheFromDisk(): Promise<z.infer<typeof CacheDataSchema>> {
		if (!existsSync(this.cachePath)) {
			debug('Cache file does not exist: %s', this.cachePath);
			return {};
		}

		const content = await readFile(this.cachePath, 'utf8');
		const json: unknown = JSON.parse(content);
		const parsed = CacheDataSchema.safeParse(json);
		if (!parsed.success) {
			debug('Cache data failed validation: %O', parsed.error);
			return {};
		}

		debug('Cache loaded. Entry count: %d', Object.keys(parsed.data).length);
		return parsed.data;
	}

	public async load(): Promise<void> {
		debug('Loading cache file: %s', this.cachePath);
		try {
			this.data = await this.readCacheFromDisk();
		} catch (error) {
			debug('Error loading cache: %O', error);
			this.data = {};
		}
	}

	public async save(): Promise<void> {
		debug('Saving cache file: %s', this.cachePath);
		const cacheDir = path.dirname(this.cachePath);
		try {
			await mkdir(cacheDir, {recursive: true});
			await this.acquireLock();

			let mergedData = this.data;
			try {
				const diskData = await this.readCacheFromDisk();
				mergedData = {...diskData, ...this.data};
			} catch (error) {
				debug('Error reading cache for merge, writing in-memory data: %O', error);
			}

			const tempPath = `${this.cachePath}.${process.pid}.${Date.now()}.tmp`;
			await writeFile(tempPath, JSON.stringify(mergedData, null, 2), 'utf8');
			await rename(tempPath, this.cachePath);
			this.data = mergedData;
			debug('Cache saved. Entry count: %d', Object.keys(this.data).length);
		} catch (error) {
			debug('Error saving cache: %O', error);
		} finally {
			await this.releaseLock();
		}
	}

	public get(key: string): z.infer<typeof ResultSchema> | undefined {
		const result = this.data[key];
		if (result) {
			debug('Cache hit for: %s', key);
		} else {
			debug('Cache miss for: %s', key);
		}
		return result;
	}

	public set(key: string, value: unknown): void {
		const parsed = ResultSchema.safeParse(value);
		if (parsed.success) {
			debug('Setting cache entry for: %s', key);
			this.data[key] = parsed.data;
		} else {
			debug('Attempted to cache invalid data for %s: %O', key, parsed.error);
		}
	}

	public clear(): void {
		debug('Clearing cache');
		this.data = {};
	}

	public async purge(): Promise<void> {
		debug('Purging cache file: %s', this.cachePath);
		this.clear();
		await rm(this.cachePath, {force: true});
		await rm(this.lockPath, {recursive: true, force: true});
	}
}
