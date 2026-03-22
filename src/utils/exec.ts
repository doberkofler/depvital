import {exec} from 'node:child_process';
import createDebug from 'debug';

const debug = createDebug('depvital:exec');

export type ExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

export async function runCommand(command: string): Promise<ExecResult> {
	debug('Running command: %s', command);
	return new Promise((resolve) => {
		exec(command, (error, stdout, stderr) => {
			const stdoutStr = stdout.toString();
			const stderrStr = stderr.toString();
			const exitCode = (error as any)?.code || (error ? 1 : 0);

			debug('Command complete: %s', command);
			debug('Exit code: %d', exitCode);
			if (stdoutStr) {
				debug('stdout: %s', stdoutStr.substring(0, 100) + (stdoutStr.length > 100 ? '...' : ''));
			}
			if (stderrStr) {
				debug('stderr: %s', stderrStr.substring(0, 100) + (stderrStr.length > 100 ? '...' : ''));
			}

			resolve({
				stdout: stdoutStr,
				stderr: stderrStr,
				exitCode,
			});
		});
	});
}
