import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {runCommand} from './utils/exec.js';
import {
	NpmOutdatedSchema,
	YarnOutdatedSchema,
	NpmAuditSchema,
	YarnAuditSchema,
	PackageListSchema,
	PackageJsonSchema,
	type PackageMetadata,
	type AuditResult,
} from './types.js';
import createDebug from 'debug';

const debug = createDebug('depvital:pm');

export async function detectPackageManager(cwd: string = process.cwd()): Promise<'npm' | 'yarn' | 'pnpm'> {
	debug('Detecting package manager in: %s', cwd);
	if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
		debug('Detected pnpm-lock.yaml');
		return 'pnpm';
	}
	if (existsSync(join(cwd, 'yarn.lock'))) {
		debug('Detected yarn.lock');
		return 'yarn';
	}
	debug('Defaulting to npm');
	return 'npm';
}

export async function getDependencies(pm: 'npm' | 'yarn' | 'pnpm'): Promise<PackageMetadata[]> {
	const cwd = process.cwd();
	const packageJsonPath = join(cwd, 'package.json');
	const explicitDeps = new Set<string>();

	if (existsSync(packageJsonPath)) {
		try {
			const packageJsonRaw = readFileSync(packageJsonPath, 'utf8');
			const packageJson = PackageJsonSchema.parse(JSON.parse(packageJsonRaw));

			if (packageJson.dependencies) {
				for (const name of Object.keys(packageJson.dependencies)) {
					explicitDeps.add(name);
				}
			}

			if (packageJson.devDependencies) {
				for (const name of Object.keys(packageJson.devDependencies)) {
					explicitDeps.add(name);
				}
			}
			debug('Found %d explicit dependencies in package.json', explicitDeps.size);
		} catch (error) {
			debug('Error reading package.json: %O', error);
		}
	}

	let command = '';
	if (pm === 'npm') {
		command = 'npm list --json --depth=0';
	} else if (pm === 'pnpm') {
		command = 'pnpm list --json --depth 0';
	} else if (pm === 'yarn') {
		command = 'yarn list --json --depth=0';
	}

	debug('Executing list command: %s', command);
	const {stdout} = await runCommand(command);
	if (!stdout.trim()) {
		debug('No list output received');
		return [];
	}

	try {
		const json = JSON.parse(stdout);
		const parsed = PackageListSchema.parse(json);
		const data = Array.isArray(parsed) ? parsed[0] : parsed;

		if (!data) {
			return [];
		}

		const results: PackageMetadata[] = [];
		const deps = data.dependencies || {};
		const devDeps = data.devDependencies || {};

		for (const [name, info] of Object.entries(deps)) {
			if (explicitDeps.size > 0 && !explicitDeps.has(name)) {
				debug('Skipping extraneous dependency: %s', name);
				continue;
			}

			results.push({
				name,
				current: info.version || 'unknown',
				wanted: info.version || 'unknown',
				latest: info.version || 'unknown',
				isDev: false,
			});
		}

		for (const [name, info] of Object.entries(devDeps)) {
			if (explicitDeps.size > 0 && !explicitDeps.has(name)) {
				debug('Skipping extraneous devDependency: %s', name);
				continue;
			}

			results.push({
				name,
				current: info.version || 'unknown',
				wanted: info.version || 'unknown',
				latest: info.version || 'unknown',
				isDev: true,
			});
		}

		debug('Successfully parsed %d dependencies', results.length);
		return results;
	} catch (error) {
		debug('Error parsing list output: %O', error);
		return [];
	}
}

export async function getOutdated(pm: 'npm' | 'yarn' | 'pnpm'): Promise<PackageMetadata[]> {
	let command = '';
	if (pm === 'npm') {
		command = 'npm outdated --json';
	} else if (pm === 'pnpm') {
		command = 'pnpm outdated --format json';
	} else if (pm === 'yarn') {
		command = 'yarn outdated --json';
	}

	debug('Executing outdated command: %s', command);
	const {stdout} = await runCommand(command);
	if (!stdout.trim()) {
		debug('No outdated output received');
		return [];
	}

	try {
		if (pm === 'yarn') {
			debug('Parsing yarn outdated output...');
			const lines = stdout.split('\n');
			for (const line of lines) {
				if (!line.trim()) {
					continue;
				}
				const data = YarnOutdatedSchema.safeParse(JSON.parse(line));
				if (data.success && data.data.type === 'table') {
					debug('Found yarn outdated data table');
					return data.data.data.body.map((row: string[]) => ({
						name: row[0] || 'unknown',
						current: row[1] || 'unknown',
						wanted: row[2] || 'unknown',
						latest: row[3] || 'unknown',
						isDev: false,
					}));
				}
			}
			debug('No yarn outdated data table found in output');
			return [];
		}

		debug('Parsing %s outdated output...', pm);
		const json = JSON.parse(stdout);
		const data = NpmOutdatedSchema.parse(json);
		const results = Object.entries(data).map(([name, info]) => ({
			name,
			current: info.current || 'unknown',
			wanted: info.wanted || 'unknown',
			latest: info.latest || 'unknown',
			isDev: info.type === 'devDependencies',
		}));
		debug('Successfully parsed %d outdated packages', results.length);
		return results;
	} catch (error) {
		debug('Error parsing outdated output: %O', error);
		return [];
	}
}

export async function getAudit(pm: 'npm' | 'yarn' | 'pnpm'): Promise<AuditResult> {
	let command = '';
	if (pm === 'npm') {
		command = 'npm audit --json';
	} else if (pm === 'pnpm') {
		command = 'pnpm audit --json';
	} else if (pm === 'yarn') {
		command = 'yarn audit --json';
	}

	debug('Executing audit command: %s', command);
	const {stdout} = await runCommand(command);
	const result: AuditResult = {vulnerabilities: [], deprecated: []};

	if (!stdout.trim()) {
		debug('No audit output received');
		return result;
	}

	try {
		if (pm === 'npm' || pm === 'pnpm') {
			debug('Parsing %s audit output...', pm);
			const json = JSON.parse(stdout);
			const data = NpmAuditSchema.parse(json);
			const advisories = data.advisories || data.vulnerabilities || {};

			for (const id in advisories) {
				const adv = advisories[id];
				if (!adv) {
					continue;
				}

				const severity = adv.severity as any;
				const pkg = adv.module_name || adv.name;

				let title = adv.title;
				if (!title && adv.via?.[0]) {
					const via = adv.via[0];
					title = typeof via === 'string' ? via : via.title;
				}
				title = title || 'Vulnerability';

				if (severity && pkg) {
					debug('Found vulnerability: %s for package %s', severity, pkg);
					result.vulnerabilities.push({severity, title, package: pkg});
				}
			}
			debug('Finished parsing audit output. Total vulnerabilities: %d', result.vulnerabilities.length);
		} else if (pm === 'yarn') {
			debug('Parsing yarn audit output...');
			const lines = stdout.split('\n');
			for (const line of lines) {
				if (!line.trim()) {
					continue;
				}
				const data = YarnAuditSchema.safeParse(JSON.parse(line));
				if (data.success && data.data.type === 'auditAdvisory') {
					const adv = data.data.data.advisory;
					debug('Found yarn vulnerability: %s for package %s', adv.severity, adv.module_name);
					result.vulnerabilities.push({
						severity: adv.severity as any,
						title: adv.title,
						package: adv.module_name,
					});
				}
			}
			debug('Finished parsing yarn audit output. Total vulnerabilities: %d', result.vulnerabilities.length);
		}
	} catch (error) {
		debug('Error parsing audit output: %O', error);
	}

	return result;
}

export type PackageInfo = {
	lastRelease: string | null;
	deprecated: boolean;
	deprecatedReason?: string;
	repository?: string | {url?: string};
	latestVersion?: string;
	latestReleaseDate?: string;
};

export async function getPackageInfo(pm: 'npm' | 'yarn' | 'pnpm', packageName: string): Promise<PackageInfo> {
	let command = '';
	if (pm === 'npm') {
		command = `npm view ${packageName} time version deprecated repository --json`;
	} else if (pm === 'pnpm') {
		command = `pnpm view ${packageName} time version deprecated repository --json`;
	} else if (pm === 'yarn') {
		command = `yarn info ${packageName} time version deprecated repository --json`;
	}

	debug('Executing package info command: %s', command);
	try {
		const {stdout} = await runCommand(command);
		if (!stdout.trim()) {
			return {lastRelease: null, deprecated: false};
		}
		const info = JSON.parse(stdout);

		if (typeof info === 'string') {
			return {lastRelease: info, deprecated: false};
		}

		const payload = normalizePackageInfoPayload(info);
		const latestVersion = typeof payload['version'] === 'string' ? payload['version'] : undefined;
		const latestReleaseDate = resolveLatestReleaseDate(payload, latestVersion);
		const deprecatedReason = typeof payload['deprecated'] === 'string' ? payload['deprecated'] : undefined;

		const result: PackageInfo = {
			lastRelease: latestReleaseDate,
			deprecated: !!payload['deprecated'],
		};

		if (deprecatedReason) {
			result.deprecatedReason = deprecatedReason;
		}

		if (payload['repository']) {
			result.repository = payload['repository'];
		}

		if (latestVersion) {
			result.latestVersion = latestVersion;
		}

		if (latestReleaseDate) {
			result.latestReleaseDate = latestReleaseDate;
		}

		return result;
	} catch (error) {
		debug('Error fetching package info for %s: %O', packageName, error);
		return {lastRelease: null, deprecated: false};
	}
}

function normalizePackageInfoPayload(info: unknown): Record<string, any> {
	if (info && typeof info === 'object') {
		const candidate = info as Record<string, any>;
		if (candidate['data'] && typeof candidate['data'] === 'object') {
			return candidate['data'] as Record<string, any>;
		}
		return candidate;
	}
	return {};
}

function resolveLatestReleaseDate(info: Record<string, any>, latestVersion?: string): string | null {
	if (latestVersion && info['time'] && typeof info['time'] === 'object') {
		const time = info['time'] as Record<string, unknown>;
		const latestDate = time[latestVersion];
		if (typeof latestDate === 'string') {
			return latestDate;
		}
	}

	if (typeof info['time.modified'] === 'string') {
		return info['time.modified'];
	}

	if (info['time'] && typeof info['time'] === 'object') {
		const modified = (info['time'] as Record<string, unknown>)['modified'];
		if (typeof modified === 'string') {
			return modified;
		}
	}

	return null;
}

export async function updatePackages(pm: 'npm' | 'yarn' | 'pnpm', packages: {name: string; version: string; isDev: boolean}[]) {
	if (packages.length === 0) {
		return;
	}

	const deps = packages.filter((p) => !p.isDev);
	const devDeps = packages.filter((p) => p.isDev);

	const execute = async (pkgs: typeof packages, isDev: boolean) => {
		if (pkgs.length === 0) {
			return;
		}

		let command = '';
		const pkgList = pkgs.map((p) => `${p.name}@${p.version}`).join(' ');

		if (pm === 'npm') {
			command = `npm install ${pkgList} ${isDev ? '--save-dev' : '--save'}`;
		} else if (pm === 'pnpm') {
			command = `pnpm add ${pkgList} ${isDev ? '-D' : ''}`;
		} else if (pm === 'yarn') {
			command = `yarn add ${pkgList} ${isDev ? '--dev' : ''}`;
		}

		debug('Executing update command: %s', command);
		console.log(`\nExecuting: ${command}`);
		await runCommand(command);
	};

	await execute(deps, false);
	await execute(devDeps, true);
}
