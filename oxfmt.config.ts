import {formatter as defaults} from './oxc.config.ts';

// Add custom oxfmt formatter overrides here.
// This file is preserved on template updates.
const formatter: Partial<typeof defaults> = {
	ignorePatterns: [...defaults.ignorePatterns, 'depvital.html'],
};

const config = {...defaults, ...formatter};

export default config;
