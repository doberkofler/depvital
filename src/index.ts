#!/usr/bin/env node

import {Command} from 'commander';
import {analyze, type AnalysisResult} from './analyzer.js';
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
	.option('--no-cache', 'Disable caching')
	.option('--no-progress', 'Suppress the progress bar')
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
		if (!config.json && !config.debug && config.progress) {
			bar = new SingleBar({}, Presets.shades_classic);
			bar.start(100, 0);
		}

		try {
			debug('Starting analysis...');
			const {results, githubRateLimitHit, stats} = await analyze(config, (current, total) => {
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
				console.log(JSON.stringify({results, stats}, null, 2));
			} else {
				debug('Printing table results');
				printTable(results, githubRateLimitHit, stats);
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

function formatHumanAge(lastRelease: string | null): string {
	if (!lastRelease) {
		return 'N/A';
	}
	const now = new Date();
	const date = new Date(lastRelease);
	const diffTime = Math.abs(now.getTime() - date.getTime());
	const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
	const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

	if (diffHours < 1) {
		return 'just now';
	}
	if (diffHours < 24) {
		return `${diffHours}h`;
	}
	if (diffDays < 30) {
		return `${diffDays}d`;
	}
	const months = Math.floor(diffDays / 30);
	if (months < 12) {
		return `${months}m`;
	}
	const years = Math.floor(diffDays / 365);
	return `${years}y`;
}

function printTable(results: any[], githubRateLimitHit: boolean, stats: AnalysisResult['stats']) {
	if (results.length === 0) {
		console.log('No outdated dependencies found.');
		return;
	}

	const RED = '\x1b[31m';
	const RESET = '\x1b[0m';
	const YELLOW = '\x1b[33m';
	const GREEN = '\x1b[32m';
	const BOLD = '\x1b[1m';

	const headers = ['Package', 'Current', 'Latest', 'Vulnerable', 'Last release', 'GitHub', 'Changelog'];
	const columnWidths = headers.map((h) => h.length);

	results.forEach((r) => {
		columnWidths[0] = Math.max(columnWidths[0]!, r.package.length);
		columnWidths[1] = Math.max(columnWidths[1]!, r.current.length);
		columnWidths[2] = Math.max(columnWidths[2]!, r.latest?.length || 0);
		const ageStr = formatHumanAge(r.maintenance.lastRelease);
		columnWidths[4] = Math.max(columnWidths[4]!, ageStr.length);
		columnWidths[5] = Math.max(columnWidths[5]!, r.githubUrl?.length || 0);
		columnWidths[6] = Math.max(columnWidths[6]!, r.changelog.url?.length || 0);
	});

	const formatRow = (row: string[]) => row.map((cell, i) => cell.padEnd(columnWidths[i] || 0)).join(' | ');

	console.log('\n' + formatRow(headers));
	console.log('-'.repeat(columnWidths.reduce((a, b) => a + b + 3, 0) - 3));

	results.forEach((r) => {
		const isVulnerable = r.vulnerabilities.length > 0;
		const isMaintained = r.maintenance.isMaintained === true;
		const ageStr = formatHumanAge(r.maintenance.lastRelease);

		const row = [
			r.package,
			r.current,
			r.latest || 'N/A',
			isVulnerable ? `${RED}YES${RESET}` : 'no',
			!isMaintained && r.maintenance.lastRelease !== null ? `${RED}${ageStr}${RESET}` : ageStr,
			r.githubUrl || '',
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

	if (githubRateLimitHit) {
		console.log(`\n${YELLOW}⚠️  GitHub API rate limit exceeded. GitHub metadata (stars/issues) may be missing.${RESET}`);
		console.log(`${YELLOW}   Provide a --github-token to ensure complete data.${RESET}`);
	}

	console.log(`\n${BOLD}Summary:${RESET}`);
	console.log(`- Total packages:    ${stats.totalPackages}`);
	console.log(`- Outdated:          ${stats.outdatedPackages > 0 ? RED : GREEN}${stats.outdatedPackages}${RESET}`);
	console.log(`- Vulnerable:        ${stats.vulnerablePackages > 0 ? RED : GREEN}${stats.vulnerablePackages}${RESET}`);
	console.log(`- Unmaintained:      ${stats.unmaintainedPackages > 0 ? RED : GREEN}${stats.unmaintainedPackages}${RESET}`);

	console.log(`\n${BOLD}Caching:${RESET}`);
	console.log(`- Hits:              ${stats.cacheHits}`);
	console.log(`- Misses:            ${stats.cacheMisses}`);

	console.log(`\n${BOLD}Processing time:${RESET} ${(stats.durationMs / 1000).toFixed(2)}s\n`);
}

program.parse();
