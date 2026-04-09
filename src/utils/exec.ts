import {execSync} from 'node:child_process';
import createDebug from 'debug';

const debug = createDebug('depvital:exec');

export type ExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

const readErrorField = (error: unknown, field: 'status' | 'stdout' | 'stderr'): unknown => {
	if (typeof error !== 'object' || error === null) {
		return undefined;
	}

	return Reflect.get(error, field);
};

const toOutputString = (value: unknown): string => {
	if (typeof value === 'string') {
		return value;
	}

	if (value instanceof Buffer) {
		return value.toString();
	}

	return '';
};

const logOutput = (label: 'stdout' | 'stderr', content: string): void => {
	if (content.length === 0) {
		return;
	}

	debug('%s: %s', label, content.slice(0, 100) + (content.length > 100 ? '...' : ''));
};

export const runCommand = async (command: string): Promise<ExecResult> => {
	debug('Running command: %s', command);

	try {
		const stdout = await Promise.resolve(
			execSync(command, {
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe'],
			}),
		);

		debug('Command complete: %s', command);
		debug('Exit code: %d', 0);
		logOutput('stdout', stdout);

		return {
			stdout,
			stderr: '',
			exitCode: 0,
		};
	} catch (error: unknown) {
		const status = readErrorField(error, 'status');
		const stdout = toOutputString(readErrorField(error, 'stdout'));
		const stderr = toOutputString(readErrorField(error, 'stderr'));
		const exitCode = typeof status === 'number' ? status : 1;

		debug('Command complete: %s', command);
		debug('Exit code: %d', exitCode);
		logOutput('stdout', stdout);
		logOutput('stderr', stderr);

		return {
			stdout,
			stderr,
			exitCode,
		};
	}
};
