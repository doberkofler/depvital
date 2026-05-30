import {stripVTControlCharacters} from 'node:util';
import {type AnalysisResult} from './analyzer.js';
import {formatHumanAge, isMajorUpdate} from './utils/util.js';

const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';

const formatRow = (row: string[], columnWidths: number[]): string => row.map((cell, index) => cell.padEnd(columnWidths[index] ?? 0)).join(' | ');

const colorLatest = (current: string, latest: string, isOutdated: boolean): string => {
	if (!isOutdated) {
		return latest;
	}

	return isMajorUpdate(current, latest) ? `${RED}${latest}${RESET}` : `${YELLOW}${latest}${RESET}`;
};

const colorUpdate = (isOutdated: boolean, daysSinceLatestRelease: number | null, minReleaseAge: number): string => {
	if (!isOutdated || daysSinceLatestRelease === null) {
		return '';
	}

	return daysSinceLatestRelease >= minReleaseAge ? `${GREEN}update${RESET}` : `${RED}cooldown${RESET}`;
};

const paddedAnsiCell = (cell: string, width: number): string => {
	const plainText = stripVTControlCharacters(cell);
	const padding = ' '.repeat(Math.max(0, width - plainText.length));
	return `${cell}${padding}`;
};

export const printTable = (results: AnalysisResult['results'], githubRateLimitHit: boolean, stats: AnalysisResult['stats'], minReleaseAge: number): void => {
	if (results.length === 0) {
		console.log('No outdated dependencies found.');
		return;
	}

	const headers = ['Package', 'Current', 'Latest', 'Update', 'Age'];
	const columnWidths = headers.map((header) => header.length);
	const updateWidth = (index: number, value: number): void => {
		const currentWidth = columnWidths[index];
		if (currentWidth === undefined) {
			return;
		}

		columnWidths[index] = Math.max(currentWidth, value);
	};

	for (const result of results) {
		updateWidth(0, stripVTControlCharacters(result.package).length);
		updateWidth(1, result.current.length);

		const latestLength = typeof result.latest === 'string' ? result.latest.length : 0;
		updateWidth(2, latestLength);

		const ageDays = typeof result.daysSinceLatestRelease === 'number' ? result.daysSinceLatestRelease : null;
		let updateLen = 0;
		if (result.outdated && ageDays !== null) {
			updateLen = ageDays >= minReleaseAge ? 6 : 8;
		}
		updateWidth(3, updateLen);

		updateWidth(4, 3);
		const ageStr = formatHumanAge(result.maintenance.lastRelease);
		updateWidth(4, ageStr.length);
	}

	console.log(`\n${formatRow(headers, columnWidths)}`);
	console.log('-'.repeat(columnWidths.reduce((total, width) => total + width + 3, 0) - 3));

	for (const result of results) {
		const isMaintained = result.maintenance.isMaintained === true;
		const ageStr = formatHumanAge(result.maintenance.lastRelease);

		const latestBase = typeof result.latest === 'string' ? result.latest : 'N/A';
		const latestStr = colorLatest(result.current, latestBase, result.outdated);

		const daysSinceLatestRelease = typeof result.daysSinceLatestRelease === 'number' ? result.daysSinceLatestRelease : null;
		const updateStr = colorUpdate(result.outdated, daysSinceLatestRelease, minReleaseAge);

		const packageCell = result.package;

		const ageCell = !isMaintained && result.maintenance.lastRelease !== null ? `${RED}${ageStr}${RESET}` : ageStr;

		const row = [packageCell, result.current, latestStr, updateStr, ageCell];

		const paddedRow = row.map((cell, index) => paddedAnsiCell(cell, columnWidths[index] ?? 0)).join(' | ');
		console.log(paddedRow);
	}

	if (githubRateLimitHit) {
		console.log(`\n${YELLOW}GitHub API rate limit exceeded. GitHub metadata (stars/issues) may be missing.${RESET}`);
		console.log(`${YELLOW}Provide a --github-token to ensure complete data.${RESET}`);
	}

	console.log(`\n${BOLD}Summary:${RESET}`);
	console.log(`- Total packages:    ${stats.totalPackages}`);
	console.log(`- Outdated:          ${stats.outdatedPackages > 0 ? RED : GREEN}${stats.outdatedPackages}${RESET}`);
	console.log(`- Vulnerable:        ${stats.vulnerablePackages > 0 ? RED : GREEN}${stats.vulnerablePackages}${RESET}`);
	console.log(`- Deprecated:        ${stats.deprecatedPackages > 0 ? RED : GREEN}${stats.deprecatedPackages}${RESET}`);
	console.log(`- Unmaintained:      ${stats.unmaintainedPackages > 0 ? RED : GREEN}${stats.unmaintainedPackages}${RESET}`);

	console.log(`\n${BOLD}Caching:${RESET}`);
	console.log(`- Hits:              ${stats.cacheHits}`);
	console.log(`- Misses:            ${stats.cacheMisses}`);

	console.log(`\n${BOLD}Processing time:${RESET} ${(stats.durationMs / 1000).toFixed(2)}s\n`);
};
