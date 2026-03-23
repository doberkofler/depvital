import {describe, it, expect, vi, beforeEach} from 'vitest';
import {detectPackageManager, getDependencies, getOutdated, getAudit, getPackageInfo} from './package-manager.js';
import {existsSync, readFileSync} from 'node:fs';
import * as exec from './utils/exec.js';

vi.mock('node:fs');
vi.mock('./utils/exec.js');

describe('package-manager', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe('detectPackageManager', () => {
		it('should detect pnpm', async () => {
			vi.mocked(existsSync).mockImplementation((path: any) => path.endsWith('pnpm-lock.yaml'));
			const pm = await detectPackageManager();
			expect(pm).toBe('pnpm');
		});

		it('should detect yarn', async () => {
			vi.mocked(existsSync).mockImplementation((path: any) => path.endsWith('yarn.lock'));
			const pm = await detectPackageManager();
			expect(pm).toBe('yarn');
		});

		it('should fallback to npm', async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			const pm = await detectPackageManager();
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

			const deps = await getDependencies('npm', false);
			expect(deps).toHaveLength(1);
			expect(deps[0]).toEqual({
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

			const deps = await getDependencies('npm', false);
			expect(deps).toHaveLength(1);
			expect(deps[0]).toMatchObject({name: 'pkg1', current: '1.0.0'});
			expect(deps.find((d) => d.name === 'extraneousPkg')).toBeUndefined();
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

			const deps = await getDependencies('pnpm', false);
			expect(deps).toHaveLength(1);
			expect(deps[0]!.name).toBe('pkg1');
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

			const deps = await getDependencies('npm', true);
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
			const deps = await getDependencies('npm', false);
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

			const outdated = await getOutdated('npm', false);
			expect(outdated).toHaveLength(1);
			expect(outdated[0]).toEqual({
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

			const outdated = await getOutdated('pnpm', false);
			expect(outdated).toHaveLength(1);
			expect(outdated[0]!.name).toBe('pkg1');
		});

		it('should parse yarn outdated json', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: JSON.stringify({type: 'table', data: {body: [['pkg1', '1.0.0', '1.1.0', '2.0.0', 'dependencies']]}}) + '\n' + JSON.stringify({type: 'other'}),
				stderr: '',
				exitCode: 0,
			});

			const outdated = await getOutdated('yarn', false);
			expect(outdated).toHaveLength(1);
			expect(outdated[0]).toEqual({
				name: 'pkg1',
				current: '1.0.0',
				wanted: '1.1.0',
				latest: '2.0.0',
				isDev: false,
			});
		});

		it('should handle empty output', async () => {
			vi.mocked(exec.runCommand).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});
			const outdated = await getOutdated('npm', false);
			expect(outdated).toHaveLength(0);
		});
	});

	describe('getAudit', () => {
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
			expect(audit.vulnerabilities[0]).toEqual({
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
			expect(audit.vulnerabilities[0]!.title).toBe('Via Title');
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
			expect(audit.vulnerabilities[0]!.title).toBe('String Via');
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
			expect(audit.vulnerabilities[0]).toEqual({
				severity: 'moderate',
				package: 'pkg2',
				title: 'Yarn vuln',
			});
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
			expect(info).toEqual({
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
			expect(info).toEqual({
				lastRelease: date,
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
			expect(info).toEqual({
				lastRelease: null,
				deprecated: false,
			});
		});
	});
});
