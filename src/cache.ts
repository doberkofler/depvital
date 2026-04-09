import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {z} from 'zod';
import {ResultSchema} from './types.js';
import createDebug from 'debug';

const debug = createDebug('depvital:cache');
const CACHE_FILE = '.depvital-cache.json';
const CacheDataSchema = z.record(z.string(), ResultSchema);

export class Cache {
	private readonly cachePath: string;
	private data: z.infer<typeof CacheDataSchema> = {};

	constructor(cwd: string = process.cwd()) {
		this.cachePath = join(cwd, CACHE_FILE);
		debug('Cache path set to: %s', this.cachePath);
	}

	async load(): Promise<void> {
		if (existsSync(this.cachePath)) {
			debug('Loading cache file: %s', this.cachePath);
			try {
				const content = await readFile(this.cachePath, 'utf8');
				const json: unknown = JSON.parse(content);
				const parsed = CacheDataSchema.safeParse(json);
				if (parsed.success) {
					this.data = parsed.data;
					debug('Cache loaded. Entry count: %d', Object.keys(this.data).length);
				} else {
					debug('Cache data failed validation: %O', parsed.error);
					this.data = {};
				}
			} catch (error) {
				debug('Error loading cache: %O', error);
				this.data = {};
			}
		} else {
			debug('Cache file does not exist: %s', this.cachePath);
		}
	}

	async save(): Promise<void> {
		debug('Saving cache file: %s', this.cachePath);
		try {
			await writeFile(this.cachePath, JSON.stringify(this.data, null, 2), 'utf8');
			debug('Cache saved. Entry count: %d', Object.keys(this.data).length);
		} catch (error) {
			debug('Error saving cache: %O', error);
		}
	}

	get(key: string): z.infer<typeof ResultSchema> | undefined {
		const result = this.data[key];
		if (result) {
			debug('Cache hit for: %s', key);
		} else {
			debug('Cache miss for: %s', key);
		}
		return result;
	}

	set(key: string, value: unknown): void {
		const parsed = ResultSchema.safeParse(value);
		if (parsed.success) {
			debug('Setting cache entry for: %s', key);
			this.data[key] = parsed.data;
		} else {
			debug('Attempted to cache invalid data for %s: %O', key, parsed.error);
		}
	}

	clear(): void {
		debug('Clearing cache');
		this.data = {};
	}
}
