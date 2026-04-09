import {describe, it, expect, vi, beforeEach} from 'vitest';
import {runCommand} from './exec.js';
import {execSync} from 'node:child_process';

vi.mock(import('node:child_process'));

const mockExecError = (status: number, stdout: string, stderr: string): Error & {status: number; stdout: string; stderr: string} => {
	const error = Object.assign(new Error('command failed'), {status, stdout, stderr});
	return error;
};

describe('exec', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('should return stdout on success', async () => {
		vi.mocked(execSync).mockReturnValue('hello');

		const result = await runCommand('ls');
		expect(result.stdout).toBe('hello');
		expect(result.exitCode).toBe(0);
	});

	it('should return exit code and error on failure', async () => {
		vi.mocked(execSync).mockImplementation(() => {
			throw mockExecError(127, 'partially done', 'not found');
		});

		const result = await runCommand('nonexistent');
		expect(result.exitCode).toBe(127);
		expect(result.stdout).toBe('partially done');
		expect(result.stderr).toBe('not found');
	});

	it('should handle error without code', async () => {
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error('fail');
		});

		const result = await runCommand('fail');
		expect(result.exitCode).toBe(1);
	});

	it('should handle empty stdout and stderr', async () => {
		vi.mocked(execSync).mockReturnValue('');

		const result = await runCommand('empty');
		expect(result.stdout).toBe('');
		expect(result.stderr).toBe('');
		expect(result.exitCode).toBe(0);
	});

	it('should handle long stdout', async () => {
		vi.mocked(execSync).mockReturnValue('a'.repeat(200));

		const result = await runCommand('long');
		expect(result.stdout).toHaveLength(200);
	});

	it('should handle long stderr', async () => {
		vi.mocked(execSync).mockImplementation(() => {
			throw mockExecError(1, '', 'e'.repeat(200));
		});

		const result = await runCommand('long-err');
		expect(result.stderr).toHaveLength(200);
	});
});
