import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {type AnalysisResult} from './analyzer.js';
import {formatHumanAge, isMajorUpdate} from './utils/util.js';

const escapeHtml = (value: string): string =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const getPackageLinkUrl = (result: AnalysisResult['results'][number]): string => {
	if (typeof result.changelog.url === 'string' && result.changelog.url.length > 0) {
		return result.changelog.url;
	}

	if (typeof result.githubUrl === 'string' && result.githubUrl.length > 0) {
		return result.githubUrl;
	}

	return `https://www.npmjs.com/package/${result.package}`;
};

const updateLabel = (result: AnalysisResult['results'][number], minReleaseAge: number): string => {
	if (!result.outdated || typeof result.daysSinceLatestRelease !== 'number') {
		return '';
	}

	return result.daysSinceLatestRelease >= minReleaseAge ? 'update' : 'cooldown';
};

const linkCell = (label: string, url: string | null | undefined): string =>
	typeof url === 'string' && url.length > 0
		? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
		: '<span class="muted">-</span>';

export const writeHtmlReport = async (
	results: AnalysisResult['results'],
	stats: AnalysisResult['stats'],
	minReleaseAge: number,
	fileName = 'depvital.html',
): Promise<{filePath: string; fileUrl: string}> => {
	const rows = results
		.map((result) => {
			const latest = typeof result.latest === 'string' ? result.latest : 'N/A';
			const latestClass = !result.outdated ? '' : isMajorUpdate(result.current, latest) ? 'major' : 'minor';
			const vuln = result.vulnerabilities.length > 0 ? 'YES' : 'no';
			const age = formatHumanAge(result.maintenance.lastRelease);
			const ageClass = result.maintenance.isMaintained === false && result.maintenance.lastRelease !== null ? 'stale' : '';
			const update = updateLabel(result, minReleaseAge);
			const packageUrl = getPackageLinkUrl(result);

			return `<tr>
	<td>${linkCell(result.package, packageUrl)}</td>
	<td>${escapeHtml(result.current)}</td>
	<td class="${latestClass}">${escapeHtml(latest)}</td>
	<td class="${update === 'update' ? 'ok' : update === 'cooldown' ? 'warn' : ''}">${escapeHtml(update)}</td>
	<td class="${vuln === 'YES' ? 'bad' : ''}">${vuln}</td>
	<td class="${ageClass}">${escapeHtml(age)}</td>
	<td>${linkCell('GitHub', result.githubUrl)}</td>
	<td>${linkCell('Changelog', typeof result.changelog.url === 'string' ? result.changelog.url : null)}</td>
</tr>`;
		})
		.join('\n');

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>depvital report</title>
<style>
:root { --bg:#f8fafc; --panel:#ffffff; --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --ok:#166534; --warn:#b45309; --bad:#b91c1c; }
body { margin:0; font-family: ui-sans-serif, -apple-system, Segoe UI, Helvetica, Arial, sans-serif; background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%); color: var(--ink); }
.wrap { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 30px rgba(15,23,42,.06); overflow: hidden; }
h1 { margin: 0; padding: 20px 24px 8px; font-size: 24px; }
.meta { color: var(--muted); padding: 0 24px 20px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); vertical-align: top; }
th { background: #f8fafc; font-weight: 600; position: sticky; top: 0; }
tr:hover td { background: #f8fafc; }
a { color: #1d4ed8; text-decoration: none; }
a:hover { text-decoration: underline; }
.muted { color: var(--muted); }
.major, .bad, .stale { color: var(--bad); font-weight: 600; }
.minor, .warn { color: var(--warn); font-weight: 600; }
.ok { color: var(--ok); font-weight: 600; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; padding: 16px 24px 22px; border-top: 1px solid var(--line); background: #f8fafc; }
.stat { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.k { color: var(--muted); font-size: 12px; }
.v { font-size: 18px; font-weight: 700; margin-top: 2px; }
</style>
</head>
<body>
<div class="wrap">
<div class="card">
<h1>depvital report</h1>
<div class="meta">Generated ${escapeHtml(new Date().toISOString())} - ${results.length} packages analyzed</div>
<table>
<thead><tr><th>Package</th><th>Current</th><th>Latest</th><th>Update</th><th>Vulnerable</th><th>Age</th><th>GitHub</th><th>Changelog</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<div class="stats">
<div class="stat"><div class="k">Total packages</div><div class="v">${stats.totalPackages}</div></div>
<div class="stat"><div class="k">Outdated</div><div class="v">${stats.outdatedPackages}</div></div>
<div class="stat"><div class="k">Vulnerable</div><div class="v">${stats.vulnerablePackages}</div></div>
<div class="stat"><div class="k">Deprecated</div><div class="v">${stats.deprecatedPackages}</div></div>
<div class="stat"><div class="k">Unmaintained</div><div class="v">${stats.unmaintainedPackages}</div></div>
<div class="stat"><div class="k">Cache hits</div><div class="v">${stats.cacheHits}</div></div>
<div class="stat"><div class="k">Cache misses</div><div class="v">${stats.cacheMisses}</div></div>
<div class="stat"><div class="k">Duration</div><div class="v">${(stats.durationMs / 1000).toFixed(2)}s</div></div>
</div>
</div>
</div>
</body>
</html>`;

	const filePath = path.resolve(process.cwd(), fileName);
	await writeFile(filePath, html, 'utf8');

	return {filePath, fileUrl: pathToFileURL(filePath).toString()};
};
