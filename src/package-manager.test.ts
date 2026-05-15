import {describe, it, expect, vi, beforeEach} from 'vitest';
import {detectPackageManager, getDependencies, getOutdated, getAudit, getPackageInfo, updatePackages} from './package-manager.js';
import {existsSync, readFileSync} from 'node:fs';
import * as exec from './utils/exec.js';

vi.mock(import('node:fs'));
vi.mock(import('./utils/exec.js'));

describe('package-manager', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe('detectPackageManager', () => {
		it('should detect pnpm', () => {
			vi.mocked(existsSync).mockImplementation((path) => String(path).endsWith('pnpm-lock.yaml'));
			const pm = detectPackageManager();
			expect(pm).toBe('pnpm');
		});

		it('should detect yarn', () => {
			vi.mocked(existsSync).mockImplementation((path) => String(path).endsWith('yarn.lock'));
			const pm = detectPackageManager();
			expect(pm).toBe('yarn');
		});

		it('should fallback to npm', () => {
			vi.mocked(existsSync).mockReturnValue(false);
			const pm = detectPackageManager();
			expect(pm).toBe('npm');
		});
	});

	describe('getDependencies', () => {
		it('should parse npm list json', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({dependencies: {pkg1: '1.0.0'}}));
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					dependencies: {
						pkg1: {version: '1.0.0'},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const deps = await getDependencies('npm');
			expect(deps).toHaveLength(1);
			expect(deps[0]).toStrictEqual({
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.0.0',
				latest: '1.0.0',
				isDev: false,
			});
		});

		it('should filter out extraneous dependencies not in package.json', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({dependencies: {pkg1: '1.0.0'}}));
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					dependencies: {
						pkg1: {version: '1.0.0'},
						extraneousPkg: {version: '2.0.0'},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const deps = await getDependencies('npm');
			expect(deps).toHaveLength(1);
			expect(deps[0]).toMatchObject({name: 'pkg1', current: '1.0.0'});
			expect(deps.find((d) => d.name === 'extraneousPkg')).toBeUndefined();
		});

		it('should filter out extraneous devDependencies not in package.json', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({devDependencies: {pkg1: '1.0.0'}}));
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					devDependencies: {
						pkg1: {version: '1.0.0'},
						extraneousPkg: {version: '2.0.0'},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const deps = await getDependencies('npm');
			expect(deps).toHaveLength(1);
			expect(deps[0]).toMatchObject({name: 'pkg1', current: '1.0.0'});
		});

		it('should parse pnpm list json (array format)', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({dependencies: {pkg1: '1.0.0'}}));
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify([
					{
						dependencies: {
							pkg1: {version: '1.0.0'},
						},
					},
				]),
				stderr: '',
				exitCode: 0,
			});

			const deps = await getDependencies('pnpm');
			expect(deps).toHaveLength(1);
			const [firstDep] = deps;
			if (!firstDep) {
				throw new Error('dependency should exist');
			}
			expect(firstDep.name).toBe('pkg1');
		});

		it('should parse npm list with dev dependencies', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(
				JSON.stringify({
					dependencies: {pkg1: '1.0.0'},
					devDependencies: {pkg2: '2.0.0'},
				}),
			);
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					dependencies: {
						pkg1: {version: '1.0.0'},
					},
					devDependencies: {
						pkg2: {version: '2.0.0'},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const deps = await getDependencies('npm');
			expect(deps).toHaveLength(2);
			expect(deps).toContainEqual({
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.0.0',
				latest: '1.0.0',
				isDev: false,
			});
			expect(deps).toContainEqual({
				name: 'pkg2',
				current: '2.0.0',
				wanted: '2.0.0',
				latest: '2.0.0',
				isDev: true,
			});
		});

		it('should handle invalid json in getDependencies', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: 'invalid json',
				stderr: '',
				exitCode: 1,
			});
			const deps = await getDependencies('npm');
			expect(deps).toHaveLength(0);
		});

		it('should parse pnpm list json (object format)', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({dependencies: {pkg1: '1.0.0'}}));
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					dependencies: {
						pkg1: {version: '1.0.0'},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const deps = await getDependencies('pnpm');
			expect(deps).toHaveLength(1);
			const [firstDep] = deps;
			if (!firstDep) {
				throw new Error('dependency should exist');
			}
			expect(firstDep.name).toBe('pkg1');
		});

		it('should parse yarn list json', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue(JSON.stringify({dependencies: {pkg1: '1.0.0'}}));
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					dependencies: {
						pkg1: {version: '1.0.0'},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const deps = await getDependencies('yarn');
			expect(deps).toHaveLength(1);
			const [firstDep] = deps;
			if (!firstDep) {
				throw new Error('dependency should exist');
			}
			expect(firstDep.name).toBe('pkg1');
		});

		it('should handle error reading package.json', async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockImplementation(() => {
				throw new Error('Read error');
			});
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					dependencies: {
						pkg1: {version: '1.0.0'},
					},
				}),
				stderr: '',
				exitCode: 0,
			});
			const deps = await getDependencies('npm');
			expect(deps).toHaveLength(1);
		});

		it('should return empty if data is missing in list output', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify(null),
				stderr: '',
				exitCode: 0,
			});
			const deps = await getDependencies('npm');
			expect(deps).toHaveLength(0);
		});

		it('should handle empty stdout in getDependencies', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});
			const deps = await getDependencies('npm');
			expect(deps).toHaveLength(0);
		});
	});

	describe('getOutdated', () => {
		it('should parse npm outdated json', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					pkg1: {
						current: '1.0.0',
						wanted: '1.1.0',
						latest: '2.0.0',
						type: 'dependencies',
					},
				}),
				stderr: '',
				exitCode: 1, // npm outdated returns 1 if anything is outdated
			});

			const outdated = await getOutdated('npm');
			expect(outdated).toHaveLength(1);
			expect(outdated[0]).toStrictEqual({
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.1.0',
				latest: '2.0.0',
				isDev: false,
			});
		});

		it('should parse pnpm outdated json', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					pkg1: {
						current: '1.0.0',
						wanted: '1.1.0',
						latest: '2.0.0',
						isDev: false,
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const outdated = await getOutdated('pnpm');
			expect(outdated).toHaveLength(1);
			const [firstOutdated] = outdated;
			if (!firstOutdated) {
				throw new Error('outdated package should exist');
			}
			expect(firstOutdated.name).toBe('pkg1');
		});

		it('should parse yarn outdated json', async () => {
			const tableLine = JSON.stringify({type: 'table', data: {body: [['pkg1', '1.0.0', '1.1.0', '2.0.0', 'dependencies']]}});
			const otherLine = JSON.stringify({type: 'other'});
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: `${tableLine}\n${otherLine}`,
				stderr: '',
				exitCode: 0,
			});

			const outdated = await getOutdated('yarn');
			expect(outdated).toHaveLength(1);
			expect(outdated[0]).toStrictEqual({
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.1.0',
				latest: '2.0.0',
				isDev: false,
			});
		});

		it('should handle yarn outdated with empty line', async () => {
			const tableLine = JSON.stringify({type: 'table', data: {body: [['pkg1', '1.0.0', '1.1.0', '2.0.0', 'dependencies']]}});
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: `\n${tableLine}`,
				stderr: '',
				exitCode: 0,
			});
			const outdated = await getOutdated('yarn');
			expect(outdated).toHaveLength(1);
		});

		it('should handle empty output', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});
			const outdated = await getOutdated('npm');
			expect(outdated).toHaveLength(0);
		});

		it('should handle yarn outdated with no table', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({type: 'other'}),
				stderr: '',
				exitCode: 0,
			});
			const outdated = await getOutdated('yarn');
			expect(outdated).toHaveLength(0);
		});

		it('should handle error in getOutdated', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: 'invalid json',
				stderr: '',
				exitCode: 1,
			});
			const outdated = await getOutdated('npm');
			expect(outdated).toHaveLength(0);
		});
	});

	describe('getAudit', () => {
		it('should handle no output', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});
			const audit = await getAudit('npm');
			expect(audit.vulnerabilities).toHaveLength(0);
		});

		it('should skip null advisories in pnpm/npm audit', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					vulnerabilities: {
						pkg1: null,
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const audit = await getAudit('npm');
			expect(audit.vulnerabilities).toHaveLength(0);
		});
		it('should parse npm audit json', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					vulnerabilities: {
						pkg1: {severity: 'high', name: 'pkg1', title: 'Big bad bug'},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const audit = await getAudit('npm');
			expect(audit.vulnerabilities).toHaveLength(1);
			expect(audit.vulnerabilities[0]).toStrictEqual({
				severity: 'high',
				package: 'pkg1',
				title: 'Big bad bug',
			});
		});

		it('should handle missing title in pnpm/npm audit and use via', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					vulnerabilities: {
						pkg1: {severity: 'critical', name: 'pkg1', via: [{title: 'Via Title'}]},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const audit = await getAudit('pnpm');
			expect(audit.vulnerabilities).toHaveLength(1);
			const [firstVulnerability] = audit.vulnerabilities;
			if (!firstVulnerability) {
				throw new Error('vulnerability should exist');
			}
			expect(firstVulnerability.title).toBe('Via Title');
		});

		it('should handle string via in pnpm/npm audit', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					vulnerabilities: {
						pkg1: {severity: 'low', name: 'pkg1', via: ['String Via']},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const audit = await getAudit('pnpm');
			expect(audit.vulnerabilities).toHaveLength(1);
			const [firstVulnerability] = audit.vulnerabilities;
			if (!firstVulnerability) {
				throw new Error('vulnerability should exist');
			}
			expect(firstVulnerability.title).toBe('String Via');
		});

		it('should parse yarn audit json', async () => {
			const yarnAuditOutput = [
				JSON.stringify({type: 'auditAdvisory', data: {advisory: {severity: 'moderate', module_name: 'pkg2', title: 'Yarn vuln'}}}),
				JSON.stringify({type: 'other', data: {}}),
			].join('\n');

			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: yarnAuditOutput,
				stderr: '',
				exitCode: 0,
			});

			const audit = await getAudit('yarn');
			expect(audit.vulnerabilities).toHaveLength(1);
			expect(audit.vulnerabilities[0]).toStrictEqual({
				severity: 'moderate',
				package: 'pkg2',
				title: 'Yarn vuln',
			});
		});

		it('should handle yarn audit with empty line', async () => {
			const advisoryLine = JSON.stringify({type: 'auditAdvisory', data: {advisory: {severity: 'low', module_name: 'pkg1', title: 'Vuln'}}});
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: `\n${advisoryLine}`,
				stderr: '',
				exitCode: 0,
			});
			const audit = await getAudit('yarn');
			expect(audit.vulnerabilities).toHaveLength(1);
		});

		it('should handle audit error', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: 'invalid json',
				stderr: '',
				exitCode: 1,
			});

			const audit = await getAudit('npm');
			expect(audit.vulnerabilities).toHaveLength(0);
		});
	});

	describe('getPackageInfo', () => {
		it('should fetch package info for non-deprecated package', async () => {
			const date = '2023-01-01T00:00:00.000Z';
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify(date),
				stderr: '',
				exitCode: 0,
			});

			const info = await getPackageInfo('npm', 'express');
			expect(info).toStrictEqual({
				lastRelease: date,
				deprecated: false,
			});
		});

		it('should fetch package info for deprecated package', async () => {
			const date = '2023-01-01T00:00:00.000Z';
			const reason = 'this package is old';
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					'time.modified': date,
					deprecated: reason,
				}),
				stderr: '',
				exitCode: 0,
			});

			const info = await getPackageInfo('npm', 'request');
			expect(info).toStrictEqual({
				lastRelease: date,
				latestReleaseDate: date,
				deprecated: true,
				deprecatedReason: reason,
			});
		});

		it('should handle empty output in getPackageInfo', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});

			const info = await getPackageInfo('npm', 'unknown');
			expect(info).toStrictEqual({
				lastRelease: null,
				deprecated: false,
			});
		});

		it('should handle package info for pnpm', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify('2023-01-01T00:00:00.000Z'),
				stderr: '',
				exitCode: 0,
			});
			const info = await getPackageInfo('pnpm', 'pkg');
			expect(info.lastRelease).toBe('2023-01-01T00:00:00.000Z');
		});

		it('should handle package info for yarn', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify('2023-01-01T00:00:00.000Z'),
				stderr: '',
				exitCode: 0,
			});
			const info = await getPackageInfo('yarn', 'pkg');
			expect(info.lastRelease).toBe('2023-01-01T00:00:00.000Z');
		});

		it('should extract absolute latest version and release date', async () => {
			const latestVersion = '2.0.0';
			const latestDate = '2024-02-01T00:00:00.000Z';
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					version: latestVersion,
					time: {
						modified: '2024-02-10T00:00:00.000Z',
						[latestVersion]: latestDate,
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const info = await getPackageInfo('npm', 'pkg');
			expect(info.latestVersion).toBe(latestVersion);
			expect(info.latestReleaseDate).toBe(latestDate);
			expect(info.lastRelease).toBe(latestDate);
		});

		it('should parse yarn inspect payload shape', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({
					type: 'inspect',
					data: {
						version: '1.2.3',
						time: {
							'1.2.3': '2024-03-01T00:00:00.000Z',
						},
					},
				}),
				stderr: '',
				exitCode: 0,
			});

			const info = await getPackageInfo('yarn', 'pkg');
			expect(info.latestVersion).toBe('1.2.3');
			expect(info.latestReleaseDate).toBe('2024-03-01T00:00:00.000Z');
		});

		it('should handle error in getPackageInfo', async () => {
			vi.mocked(exec.runCommand).mockRejectedValue(new Error('Network error'));
			const info = await getPackageInfo('npm', 'pkg');
			expect(info).toStrictEqual({lastRelease: null, deprecated: false});
		});
	});

	describe('updatePackages', () => {
		it('should do nothing if package list is empty', async () => {
			const spy = vi.spyOn(exec, 'runCommand');
			await updatePackages('npm', []);
			expect(spy).not.toHaveBeenCalled();
		});

		it('should update packages with npm', async () => {
			const spy = vi.spyOn(exec, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0});
			await updatePackages('npm', [
				{name: 'pkg1', version: '1.0.0', isDev: false},
				{name: 'pkg2', version: '2.0.0', isDev: true},
			]);
			expect(spy).toHaveBeenCalledWith('npm install pkg1@1.0.0 --save');
			expect(spy).toHaveBeenCalledWith('npm install pkg2@2.0.0 --save-dev');
		});

		it('should update packages with pnpm', async () => {
			const spy = vi.spyOn(exec, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0});
			await updatePackages('pnpm', [
				{name: 'pkg1', version: '1.0.0', isDev: false},
				{name: 'pkg2', version: '2.0.0', isDev: true},
			]);
			expect(spy).toHaveBeenCalledWith('pnpm add pkg1@1.0.0 ');
			expect(spy).toHaveBeenCalledWith('pnpm add pkg2@2.0.0 -D');
		});

		it('should update packages with yarn', async () => {
			const spy = vi.spyOn(exec, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0});
			await updatePackages('yarn', [
				{name: 'pkg1', version: '1.0.0', isDev: false},
				{name: 'pkg2', version: '2.0.0', isDev: true},
			]);
			expect(spy).toHaveBeenCalledWith('yarn add pkg1@1.0.0 ');
			expect(spy).toHaveBeenCalledWith('yarn add pkg2@2.0.0 --dev');
		});

		it('should update only dev packages', async () => {
			const spy = vi.spyOn(exec, 'runCommand').mockResolvedValue({stdout: '', stderr: '', exitCode: 0});
			await updatePackages('npm', [{name: 'pkg1', version: '1.0.0', isDev: true}]);
			expect(spy).toHaveBeenCalledExactlyOnceWith('npm install pkg1@1.0.0 --save-dev');
		});
	});
});
