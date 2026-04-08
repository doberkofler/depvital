import {defineConfig} from 'oxlint';
import pluginRegexp from 'eslint-plugin-regexp';

const commonIgnore = ['**/.*', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**', 'temp/**', 'public/**', '**/*.md'];

/** Filter out core ESLint rules bundled into eslint-plugin-regexp recommended config */
const regexpPluginRules = Object.fromEntries(Object.entries(pluginRegexp.configs.recommended.rules ?? {}).filter(([key]) => key.startsWith('regexp/')));

export const linter = defineConfig({
	options: {
		typeAware: true,
		typeCheck: true,
	},
	plugins: ['unicorn', 'typescript', 'oxc', 'import', 'react', 'jsdoc', 'promise', 'vitest'],
	jsPlugins: ['eslint-plugin-regexp'],
	categories: {
		correctness: 'error',
	},
	rules: {
		...regexpPluginRules,
		curly: ['error', 'all'],
		'typescript/no-unused-vars': [
			'error',
			{
				caughtErrors: 'none',
				argsIgnorePattern: '^_',
			},
		],
	},
	settings: {
		'jsx-a11y': {
			polymorphicPropName: undefined,
			components: {},
			attributes: {},
		},
		next: {
			rootDir: [],
		},
		react: {
			formComponents: [],
			linkComponents: [],
			version: undefined,
		},
		jsdoc: {
			ignorePrivate: false,
			ignoreInternal: false,
			ignoreReplacesDocs: true,
			overrideReplacesDocs: true,
			augmentsExtendsReplacesDocs: false,
			implementsReplacesDocs: false,
			exemptDestructuredRootsFromChecks: false,
			tagNamePreference: {},
		},
		vitest: {
			typecheck: false,
		},
	},
	env: {
		builtin: true,
	},
	globals: {},
	ignorePatterns: commonIgnore,
});

export const formatter = {
	printWidth: 160,
	embeddedLanguageFormatting: 'off',
	useTabs: true,
	singleQuote: true,
	bracketSpacing: false,
	ignorePatterns: commonIgnore,
	overrides: [
		{
			files: ['src/**/*.{scss,css}'],
			options: {
				singleQuote: false,
			},
		},
	],
};
