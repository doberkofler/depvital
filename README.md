# depvital

A production-ready CLI tool for analyzing project dependencies' health, security, and maintenance.

`depvital` provides a comprehensive report on your project's dependencies by consolidating:

1. **Outdated Status**: Current vs latest versions.
2. **Security & Deprecations**: Known vulnerabilities and deprecated packages.
3. **Maintenance Health**: GitHub activity, stars, and issue ratios.
4. **Changelogs**: Direct extraction of the latest release notes.

## Features

- **Multi-Package Manager Support**: Works with `npm`, `yarn`, and `pnpm`.
- **Zod-Powered Validation**: Strict validation of all external data boundaries.
- **Maintenance Scoring**: Computes a health score based on commit recency and community metrics.
- **Fail Thresholds**: Configurable failure based on vulnerability severity.
- **Smart Caching**: Local caching to avoid API rate limits.
- **Extensive Debugging**: Full instrumentation with the `--debug` flag.

## Installation

```bash
pnpm install
```

## Usage

```bash
# Basic analysis
node dist/index.mjs

# Fail on high severity vulnerabilities
node dist/index.mjs --fail-on high

# JSON output
node dist/index.mjs --json

# Debugging
node dist/index.mjs --debug
```

## Development Workflow

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the project for production.
- `npm run lint`: Lints and formats the codebase.
- `npm run test`: Runs the test suite.
- `npm run ci`: Full CI pipeline.

## Tooling

- **TypeScript (ES2024)**: Strict type safety.
- **Commander**: CLI framework.
- **Zod**: Data validation.
- **Vitest**: Testing framework.
- **oxlint**: High-performance linter.
- **Prettier**: Code formatting.
