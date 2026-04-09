import {defineConfig} from 'oxlint';
import {configs as regexpConfigs} from 'eslint-plugin-regexp';

const commonIgnore = ['**/.*', 'node_modules/**', 'dist/**', 'coverage/**', 'temp/**', '**/*.md'];

/** Filter out core ESLint rules bundled into eslint-plugin-regexp recommended config */
const regexpPluginRules = Object.fromEntries(Object.entries(regexpConfigs.recommended.rules).filter(([key]) => key.startsWith('regexp/')));

export const linter = defineConfig({
	options: {
		typeAware: true,
		typeCheck: true,
	},
	plugins: ['unicorn', 'typescript', 'oxc', 'import', 'react', 'jsdoc', 'promise', 'vitest'],
	jsPlugins: ['eslint-plugin-regexp'],
	categories: {
		correctness: 'error',
		nursery: 'error',
		pedantic: 'error',
		perf: 'error',
		restriction: 'error',
		style: 'error',
		suspicious: 'error',
	},
	rules: {
		...regexpPluginRules,
		'eslint/complexity': 'off', // TODO: consider enabling
		'eslint/id-length': 'off',
		'eslint/init-declarations': 'off', // TODO: consider enabling
		'eslint/max-lines': 'off', // TODO: consider enabling
		'eslint/max-lines-per-function': 'off', // TODO: consider enabling
		'eslint/max-params': 'off', // TODO: consider enabling
		'eslint/max-statements': 'off', // TODO: consider enabling
		'eslint/capitalized-comments': 'off', // TODO: consider enabling
		'eslint/no-console': 'off',
		'eslint/no-continue': 'off',
		'eslint/no-inline-comments': 'off',
		'eslint/no-magic-numbers': 'off',
		'eslint/no-negated-condition': 'off', // TODO: consider enabling
		'eslint/no-warning-comments': 'off',
		'eslint/no-undefined': 'off', // TODO: consider enabling
		'eslint/no-plusplus': 'off',
		'eslint/sort-imports': 'off',
		'eslint/sort-keys': 'off',
		'eslint/no-ternary': 'off',
		'typescript/no-unused-vars': [
			'error',
			{
				caughtErrors: 'none',
				argsIgnorePattern: '^_',
			},
		],
		'typescript/consistent-type-definitions': ['error', 'type'],
		'typescript/no-import-type-side-effects': 'off',
		'typescript/prefer-readonly-parameter-types': 'off',
		'import/consistent-type-specifier-style': ['error', 'prefer-inline'],
		'import/exports-last': 'off',
		'import/group-exports': 'off',
		'import/no-named-export': 'off',
		'import/no-namespace': 'off', // TODO: consider enabling
		'import/no-nodejs-modules': 'off',
		'import/prefer-default-export': 'off',
		'import/no-default-export': 'off',
		'jest/max-expects': 'off', // FIXME: remove all jest rules
		'jest/no-conditional-in-test': 'off', // FIXME: remove all jest rules
		'jest/no-hooks': 'off', // FIXME: remove all jest rules
		'jest/padding-around-test-blocks': 'off', // FIXME: remove all jest rules
		'jest/prefer-called-with': 'off', // FIXME: remove all jest rules
		'jest/prefer-lowercase-title': 'off', // FIXME: remove all jest rules
		'jest/prefer-strict-equal': 'off', // FIXME: remove all jest rules
		'jest/prefer-to-be': 'off', // FIXME: remove all jest rules
		'jest/require-hook': 'off', // FIXME: remove all jest rules
		'oxc/no-async-await': 'off',
		'oxc/no-map-spread': 'off', // TODO: consider enabling
		'oxc/no-rest-spread-properties': 'off',
		'unicorn/escape-case': 'off',
		'unicorn/no-hex-escape': 'off',
		'unicorn/no-null': 'off', // TODO: consider enabling
		'unicorn/filename-case': 'off', // TODO: consider enabling
		'unicorn/no-array-sort': 'off', // TODO: consider enabling
		'unicorn/no-typeof-undefined': 'off', // TODO: consider enabling
		'unicorn/prefer-module': 'off', // TODO: consider enabling
		'vitest/no-importing-vitest-globals': 'off',
		'vitest/prefer-describe-function-title': 'off',
		'vitest/require-test-timeout': 'off',
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
		node: true,
	},
	globals: {
		node: 'readonly',
	},
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
