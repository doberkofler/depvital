import {describe, it, expect, vi, beforeEach} from 'vitest';
import {runCommand} from './exec.js';
import {exec} from 'node:child_process';

vi.mock('node:child_process');

describe('exec', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('should return stdout on success', async () => {
		vi.mocked(exec).mockImplementation(((_cmd: string, callback: any) => {
			callback(null, 'hello', '');
			return {} as any;
		}) as any);

		const result = await runCommand('ls');
		expect(result.stdout).toBe('hello');
		expect(result.exitCode).toBe(0);
	});

	it('should return exit code and error on failure', async () => {
		vi.mocked(exec).mockImplementation(((_cmd: string, callback: any) => {
			const err = new Error('fail') as any;
			err.code = 127;
			callback(err, 'partially done', 'not found');
			return {} as any;
		}) as any);

		const result = await runCommand('nonexistent');
		expect(result.exitCode).toBe(127);
		expect(result.stdout).toBe('partially done');
		expect(result.stderr).toBe('not found');
	});
});
