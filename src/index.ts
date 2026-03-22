#!/usr/bin/env node

import {Command} from 'commander';
import {analyze} from './analyzer.js';
import {ConfigSchema} from './types.js';
import {SingleBar, Presets} from 'cli-progress';
import createDebug from 'debug';

const debug = createDebug('depvital:main');
const program = new Command();

program
	.name('depvital')
	.description('Analyze project dependencies for health, security, and maintenance')
	.version('0.1.0')
	.option('--json', 'Output results in JSON format', false)
	.option('--debug', 'Enable extensive debug instrumentation', false)
	.option('--fail-on <severity>', 'Fail if vulnerability severity is at or above threshold', 'moderate')
	.option('--max-age <days>', 'Maintenance threshold in days', '180')
	.option('--include-dev', 'Include devDependencies', false)
	.option('--github-token <token>', 'GitHub token for higher rate limits')
	.option('--no-cache', 'Disable caching', false)
	.option('--package-manager <pm>', 'Force package manager (npm, pnpm, yarn)')
	.action(async (options) => {
		if (options.debug) {
			createDebug.enable('depvital:*');
		}

		debug('Starting CLI with options: %O', options);

		const config = ConfigSchema.parse({
			...options,
			maxAge: parseInt(options.maxAge, 10),
			githubToken: options.githubToken || process.env['GITHUB_TOKEN'],
		});

		debug('Parsed config: %O', config);

		let bar: SingleBar | null = null;
		if (!config.json && !config.debug) {
			bar = new SingleBar({}, Presets.shades_classic);
			bar.start(100, 0);
		}

		try {
			debug('Starting analysis...');
			const results = await analyze(config, (current, total) => {
				if (bar) {
					if (total > 0) {
						bar.setTotal(total);
						bar.update(current);
					}
				}
			});
			debug('Analysis complete. Results count: %d', results.length);

			if (bar) {
				bar.stop();
			}

			if (config.json) {
				debug('Outputting JSON results');
				console.log(JSON.stringify(results, null, 2));
			} else {
				debug('Printing table results');
				printTable(results);
			}

			// Check for fail-on threshold
			if (config.failOn) {
				const severities = ['low', 'moderate', 'high', 'critical'] as const;
				const thresholdIndex = severities.indexOf(config.failOn as any);

				const hasBreach = results.some((r) => r.vulnerabilities.some((v) => severities.indexOf(v.severity) >= thresholdIndex));

				if (hasBreach) {
					debug('Fail threshold breached: %s', config.failOn);
					console.error(`\nFound vulnerabilities meeting or exceeding "${config.failOn}" threshold.`);
					process.exit(1);
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

function printTable(results: any[]) {
	if (results.length === 0) {
		console.log('No outdated dependencies found.');
		return;
	}

	const RED = '\x1b[31m';
	const RESET = '\x1b[0m';

	const headers = ['Package', 'Current → Latest', 'Vulnerable', 'Maintained', 'Age (days)', 'Changelog', 'Changelog Link'];
	const columnWidths = headers.map((h) => h.length);

	results.forEach((r) => {
		columnWidths[0] = Math.max(columnWidths[0]!, r.package.length);
		columnWidths[1] = Math.max(columnWidths[1]!, `${r.current} → ${r.latest}`.length);
		columnWidths[4] = Math.max(columnWidths[4]!, r.maintenance.daysSinceLastCommit?.toString().length || 0);
		columnWidths[6] = Math.max(columnWidths[6]!, r.changelog.url?.length || 0);
	});

	const formatRow = (row: string[]) => row.map((cell, i) => cell.padEnd(columnWidths[i] || 0)).join(' | ');

	console.log('\n' + formatRow(headers));
	console.log('-'.repeat(columnWidths.reduce((a, b) => a + b + 3, 0) - 3));

	results.forEach((r) => {
		const isVulnerable = r.vulnerabilities.length > 0;
		const isMaintained = r.maintenance.isMaintained === true;

		const row = [
			r.package,
			`${r.current} → ${r.latest}`,
			isVulnerable ? `${RED}YES${RESET}` : 'no',
			isMaintained ? 'yes' : `${RED}NO${RESET}`,
			r.maintenance.daysSinceLastCommit?.toString() || 'N/A',
			r.changelog.found ? 'yes' : 'no',
			r.changelog.url || '',
		];

		// We need a special formatter that ignores ANSI codes for padding
		const paddedRow = row
			.map((cell, i) => {
				// eslint-disable-next-line no-control-regex
				const ansiRegex = /\u001b\[[0-9;]*m/g;
				const plainText = cell.replace(ansiRegex, '');
				const padding = ' '.repeat(Math.max(0, (columnWidths[i] || 0) - plainText.length));
				return cell + padding;
			})
			.join(' | ');

		console.log(paddedRow);
	});
}

program.parse();
