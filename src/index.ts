#!/usr/bin/env node

import {Command} from 'commander';
import {analyze} from './analyzer.js';
import {ConfigSchema} from './types.js';
import {SingleBar, Presets} from 'cli-progress';
import createDebug from 'debug';
import {checkbox} from '@inquirer/prompts';
import {detectPackageManager, updatePackages} from './package-manager.js';
import {readFileSync} from 'node:fs';
import {printTable} from './printTable.js';

const debug = createDebug('depvital:main');
const program = new Command();

type CliOptions = {
	json: boolean;
	debug: boolean;
	failOn: 'low' | 'moderate' | 'high' | 'critical';
	maxAge: string;
	githubToken?: string;
	cache: boolean;
	progress: boolean;
	update: boolean;
	minReleaseAge: string;
	packageManager?: 'npm' | 'pnpm' | 'yarn';
};

type PackageMetadata = {
	name: string;
	version: string;
};

const isPackageMetadata = (value: unknown): value is PackageMetadata => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	return typeof Reflect.get(value, 'name') === 'string' && typeof Reflect.get(value, 'version') === 'string';
};

const pkgUrl = new URL('../package.json', import.meta.url);
const pkgRaw: unknown = JSON.parse(readFileSync(pkgUrl, 'utf8'));

if (!isPackageMetadata(pkgRaw)) {
	throw new TypeError('Invalid package metadata in package.json');
}

const pkg = pkgRaw;

program
	.name(pkg.name)
	.description('Analyze project dependencies for health, security, and maintenance')
	.version(pkg.version)
	.option('--json', 'Output results in JSON format', false)
	.option('--debug', 'Enable extensive debug instrumentation', false)
	.option('--fail-on <severity>', 'Fail if vulnerability severity is at or above threshold', 'moderate')
	.option('--max-age <days>', 'Maintenance threshold in days', '180')
	.option('--github-token <token>', 'GitHub token for higher rate limits')
	.option('--no-cache', 'Disable caching')
	.option('--no-progress', 'Suppress the progress bar')
	.option('--update', 'Select outdated packages to update', false)
	.option('--min-release-age <days>', 'Minimum number of days since release', '3')
	.option('--package-manager <pm>', 'Force package manager (npm, pnpm, yarn)')
	.action(async (options: CliOptions) => {
		if (options.debug) {
			createDebug.enable('depvital:*');
		}

		console.log(`${pkg.name} v${pkg.version}`);
		console.log(`Arguments: min-release-age: ${options.minReleaseAge} days, max-age: ${options.maxAge} days, update: ${options.update}`);

		debug('Starting CLI with options: %O', options);

		const config = ConfigSchema.parse({
			...options,
			maxAge: Number.parseInt(options.maxAge, 10),
			minReleaseAge: Number.parseInt(options.minReleaseAge, 10),
			githubToken: options.githubToken ?? process.env['GITHUB_TOKEN'],
		});

		debug('Parsed config: %O', config);

		let bar: SingleBar | null = null;
		if (!config.json && !config.debug && config.progress) {
			bar = new SingleBar({clearOnComplete: true}, Presets.shades_classic);
			bar.start(100, 0);
		}

		try {
			debug('Starting analysis...');
			const {results, githubRateLimitHit, stats} = await analyze(config, (current, total) => {
				if (bar && total > 0) {
					bar.setTotal(total);
					bar.update(current);
				}
			});
			debug('Analysis complete. Results count: %d', results.length);

			if (bar) {
				bar.stop();
			}

			if (config.json) {
				debug('Outputting JSON results');
				console.log(JSON.stringify({results, stats}, null, 2));
			} else {
				debug('Printing table results');
				printTable(results, githubRateLimitHit, stats, config.minReleaseAge);
			}

			if (config.update && !config.json) {
				const outdated = results.filter(
					(r) => r.outdated && typeof r.latest === 'string' && typeof r.daysSinceLatestRelease === 'number' && r.daysSinceLatestRelease >= config.minReleaseAge,
				);
				if (outdated.length > 0) {
					const selected = await checkbox({
						message: 'Select packages to update:',
						choices: outdated.map((r) => ({
							name: `${r.package} (${r.current} -> ${r.latest})`,
							value: r,
						})),
					});

					if (selected.length > 0) {
						const pm = config.packageManager ?? detectPackageManager();
						const selectedPackages = selected.flatMap((pkgToUpdate) => {
							if (typeof pkgToUpdate.latest !== 'string' || pkgToUpdate.latest.length === 0) {
								return [];
							}

							return [
								{
									name: pkgToUpdate.package,
									version: pkgToUpdate.latest,
									isDev: pkgToUpdate.isDev,
								},
							];
						});

						await updatePackages(pm, selectedPackages);
						console.log('\n✅ Selected packages updated successfully.');
					} else {
						console.log('\nNo packages selected for update.');
					}
				}
			}
		} catch (error) {
			if (bar) {
				bar.stop();
			}
			debug('Error during analysis: %O', error);
			console.error('Error during analysis:', error);
			process.exit(1);
		}
	});

program.parse();
