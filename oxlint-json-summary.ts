#!/usr/bin/env node

/**
 * oxlint-summary.ts
 * Reads Oxlint JSON from stdin.
 * Outputs:
 * 1. Rule Summary (Code, Count, URL)
 * 2. File Summary (File, Count)
 * 3. Total Error Count
 */

declare const process: {
	stdin: {
		setEncoding: (encoding: string) => void;
		[Symbol.asyncIterator]: () => AsyncIterator<unknown>;
	};
	exitCode: number;
};

type OxlintDiagnostic = {
	message: string;
	code?: string;
	url?: string;
	filename?: string;
};

type OxlintJson = {
	diagnostics?: OxlintDiagnostic[];
};

type RuleSummaryRow = {
	errorCode: string;
	numberOfErrors: number;
	url: string;
};

type FileSummaryRow = {
	filename: string;
	numberOfErrors: number;
};

export const readStdin = async (): Promise<string> => {
	let data = '';
	process.stdin.setEncoding('utf8');
	for await (const chunk of process.stdin) {
		data += String(chunk);
	}
	return data;
};

export const isOxlintJson = (value: unknown): value is OxlintJson => {
	if (value === null || typeof value !== 'object') {
		return false;
	}
	const {diagnostics} = value as OxlintJson;
	return diagnostics === undefined || Array.isArray(diagnostics);
};

export const summarizeByRule = (diagnostics: OxlintDiagnostic[]): RuleSummaryRow[] => {
	const counts = new Map<string, RuleSummaryRow>();
	for (const d of diagnostics) {
		const codeRaw = typeof d.code === 'string' ? d.code.trim() : '';
		const urlRaw = typeof d.url === 'string' ? d.url.trim() : '';
		const code = codeRaw.length > 0 ? codeRaw : '(no code)';
		const url = urlRaw.length > 0 ? urlRaw : '(no url)';
		const key = `${code}|||${url}`;
		const existing = counts.get(key);
		if (existing) {
			existing.numberOfErrors++;
		} else {
			counts.set(key, {errorCode: code, numberOfErrors: 1, url});
		}
	}
	return [...counts.values()].sort((a, b) => b.numberOfErrors - a.numberOfErrors || a.errorCode.localeCompare(b.errorCode));
};

export const summarizeByFile = (diagnostics: OxlintDiagnostic[]): FileSummaryRow[] => {
	const counts = new Map<string, number>();
	for (const d of diagnostics) {
		const fileRaw = typeof d.filename === 'string' ? d.filename.trim() : '';
		const file = fileRaw.length > 0 ? fileRaw : '(unknown file)';
		counts.set(file, (counts.get(file) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([filename, numberOfErrors]) => ({filename, numberOfErrors}))
		.sort((a, b) => b.numberOfErrors - a.numberOfErrors || a.filename.localeCompare(b.filename));
};

export const printRuleTable = (rows: RuleSummaryRow[]): void => {
	const headers = ['error code', 'count', 'url'];
	const wCode = Math.max(headers[0].length, ...rows.map((r) => r.errorCode.length));
	const wCount = Math.max(headers[1].length, ...rows.map((r) => String(r.numberOfErrors).length));
	const wUrl = Math.max(headers[2].length, ...rows.map((r) => r.url.length));

	console.log(`## Rule Summary\n`);
	console.log(`${headers[0].padEnd(wCode)} | ${headers[1].padStart(wCount)} | ${headers[2]}`);
	console.log(`${'-'.repeat(wCode)}-+-${'-'.repeat(wCount)}-+-${'-'.repeat(wUrl)}`);
	for (const r of rows) {
		console.log(`${r.errorCode.padEnd(wCode)} | ${String(r.numberOfErrors).padStart(wCount)} | ${r.url}`);
	}
};

export const printFileTable = (rows: FileSummaryRow[]): void => {
	const headers = ['filename', 'count'];
	const wFile = Math.max(headers[0].length, ...rows.map((r) => r.filename.length));
	const wCount = Math.max(headers[1].length, ...rows.map((r) => String(r.numberOfErrors).length));

	console.log(`\n## File Summary\n`);
	console.log(`${headers[0].padEnd(wFile)} | ${headers[1].padStart(wCount)}`);
	console.log(`${'-'.repeat(wFile)}-+-${'-'.repeat(wCount)}`);
	for (const r of rows) {
		console.log(`${r.filename.padEnd(wFile)} | ${String(r.numberOfErrors).padStart(wCount)}`);
	}
};

export const main = async (): Promise<void> => {
	const input = await readStdin();
	if (!input.trim()) {
		throw new Error('Empty stdin');
	}

	const parsed = JSON.parse(input) as unknown;
	if (!isOxlintJson(parsed)) {
		throw new Error('Invalid Oxlint JSON');
	}

	const diagnostics = parsed.diagnostics ?? [];
	const ruleRows = summarizeByRule(diagnostics);
	const fileRows = summarizeByFile(diagnostics);
	const total = diagnostics.length;

	printRuleTable(ruleRows);
	printFileTable(fileRows);

	console.log(`\n**Total Errors:** ${total}`);
};

try {
	await main();
} catch (error: unknown) {
	console.error(error instanceof Error ? error.message : 'fatal');
	process.exitCode = 1;
}
