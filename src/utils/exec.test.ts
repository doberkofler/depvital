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

	it('should handle error without code', async () => {
		vi.mocked(exec).mockImplementation(((_cmd: string, callback: any) => {
			const err = new Error('fail');
			callback(err, '', '');
			return {} as any;
		}) as any);

		const result = await runCommand('fail');
		expect(result.exitCode).toBe(1);
	});

	it('should handle empty stdout and stderr', async () => {
		vi.mocked(exec).mockImplementation(((_cmd: string, callback: any) => {
			callback(null, '', '');
			return {} as any;
		}) as any);

		const result = await runCommand('empty');
		expect(result.stdout).toBe('');
		expect(result.stderr).toBe('');
		expect(result.exitCode).toBe(0);
	});

	it('should handle long stdout', async () => {
		vi.mocked(exec).mockImplementation(((_cmd: string, callback: any) => {
			callback(null, 'a'.repeat(200), '');
			return {} as any;
		}) as any);

		const result = await runCommand('long');
		expect(result.stdout).toHaveLength(200);
	});

	it('should handle long stderr', async () => {
		vi.mocked(exec).mockImplementation(((_cmd: string, callback: any) => {
			callback(null, '', 'e'.repeat(200));
			return {} as any;
		}) as any);

		const result = await runCommand('long-err');
		expect(result.stderr).toHaveLength(200);
	});
});
