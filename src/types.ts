import {z} from 'zod';

export const ResultSchema = z.object({
	package: z.string(),
	current: z.string(),
	latest: z.string().nullable(),
	latestAvailable: z.string().nullable().optional(),
	latestReleaseDate: z.string().nullable().optional(),
	daysSinceLatestRelease: z.number().nullable().optional(),
	outdated: z.boolean(),
	isDev: z.boolean(),
	vulnerabilities: z.array(
		z.object({
			severity: z.enum(['low', 'moderate', 'high', 'critical']),
			title: z.string(),
		}),
	),
	deprecated: z.boolean(),
	maintenance: z.object({
		lastRelease: z.string().nullable(),
		daysSinceLastRelease: z.number().nullable(),
		isMaintained: z.boolean().nullable(),
		healthScore: z.number().nullable(),
	}),
	githubUrl: z.string().nullable().optional(),
	changelog: z.object({
		found: z.boolean(),
		url: z.string().nullable().optional(),
		latestEntry: z.string().nullable(),
	}),
});

export type Result = z.infer<typeof ResultSchema>;

export const ConfigSchema = z.object({
	json: z.boolean().default(false),
	debug: z.boolean().default(false),
	maxAge: z.number().default(180),
	githubToken: z.string().optional(),
	cache: z.boolean().default(true),
	progress: z.boolean().default(true),
	update: z.boolean().default(false),
	minReleaseAge: z.number().default(3),
	packageManager: z.enum(['npm', 'yarn', 'pnpm']).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export const PackageMetadataSchema = z.object({
	name: z.string(),
	current: z.string(),
	wanted: z.string(),
	latest: z.string(),
	isDev: z.boolean(),
});

export type PackageMetadata = z.infer<typeof PackageMetadataSchema>;

export const AuditResultSchema = z.object({
	vulnerabilities: z.array(
		z.object({
			severity: z.enum(['low', 'moderate', 'high', 'critical']),
			title: z.string(),
			package: z.string(),
		}),
	),
	deprecated: z.array(z.string()),
});

export type AuditResult = z.infer<typeof AuditResultSchema>;

// Package.json repository boundary
export const PackageJsonSchema = z.object({
	dependencies: z.record(z.string(), z.string()).optional(),
	devDependencies: z.record(z.string(), z.string()).optional(),
	repository: z
		.union([
			z.string(),
			z.object({
				url: z.string().optional(),
			}),
		])
		.optional(),
});

// GitHub API boundaries
export const GitHubRepoSchema = z.object({
	stargazers_count: z.number(),
	open_issues_count: z.number(),
	pushed_at: z.string(),
});

export const GitHubReleaseSchema = z.object({
	body: z.string().nullable().optional(),
});

// Package Manager Outdated boundaries
export const NpmOutdatedValueSchema = z.object({
	current: z.string().optional(),
	wanted: z.string().optional(),
	latest: z.string().optional(),
	type: z.string().optional(),
});

export const NpmOutdatedSchema = z.record(z.string(), NpmOutdatedValueSchema);

export const YarnOutdatedSchema = z.object({
	type: z.string(),
	data: z.object({
		body: z.array(z.array(z.string())),
	}),
});

// Package Manager List boundaries
export const PackageListSchema = z
	.union([
		z.object({
			dependencies: z.record(z.string(), z.object({version: z.string().optional()})).optional(),
			devDependencies: z.record(z.string(), z.object({version: z.string().optional()})).optional(),
		}),
		z.array(
			z.object({
				dependencies: z.record(z.string(), z.object({version: z.string().optional()})).optional(),
				devDependencies: z.record(z.string(), z.object({version: z.string().optional()})).optional(),
			}),
		),
	])
	.nullable();

// Audit boundaries
export const NpmAuditValueSchema = z.object({
	severity: z.string().optional(),
	module_name: z.string().optional(),
	name: z.string().optional(),
	title: z.string().optional(),
	via: z
		.array(
			z.union([
				z.string(),
				z.object({
					title: z.string().optional(),
				}),
			]),
		)
		.optional(),
});

export const NpmAuditSchema = z.object({
	advisories: z.record(z.string(), NpmAuditValueSchema.nullable()).optional(),
	vulnerabilities: z.record(z.string(), NpmAuditValueSchema.nullable()).optional(),
});

export const YarnAuditSchema = z.object({
	type: z.string(),
	data: z.object({
		advisory: z.object({
			severity: z.string(),
			title: z.string(),
			module_name: z.string(),
		}),
	}),
});
