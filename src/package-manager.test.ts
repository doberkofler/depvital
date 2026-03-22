import {describe, it, expect, vi, beforeEach} from 'vitest';
import {detectPackageManager, getDependencies, getOutdated, getAudit} from './package-manager.js';
import {existsSync} from 'node:fs';
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

		it('should parse pnpm list json (array format)', async () => {
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
	});
});
