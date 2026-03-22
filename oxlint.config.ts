import {defineConfig} from 'oxlint';
import pluginRegexp from 'eslint-plugin-regexp';

export default defineConfig({
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
		...pluginRegexp.configs.recommended.rules,
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
	ignorePatterns: ['**/.*', 'node_modules/**', 'dist/**', 'coverage/**', 'public/**'],
});
