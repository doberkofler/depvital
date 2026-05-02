# depvital

[![NPM Version](https://img.shields.io/npm/v/depvital.svg)](https://www.npmjs.com/package/depvital)
[![NPM Downloads](https://img.shields.io/npm/dm/depvital.svg)](https://www.npmjs.com/package/depvital)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://github.com/doberkofler/depvital/actions/workflows/node.js.yml/badge.svg)](https://github.com/doberkofler/depvital/actions/workflows/node.js.yml)
[![Coverage Status](https://coveralls.io/repos/github/doberkofler/depvital/badge.svg?branch=main)](https://coveralls.io/github/doberkofler/depvital?branch=main)

A production-ready CLI tool for analyzing project dependencies' health, security, and maintenance.

`depvital` provides a comprehensive report on your project's dependencies by consolidating:

1.  **Outdated Status**: Current vs latest versions.
2.  **Security & Deprecations**: Known vulnerabilities and deprecated packages.
3.  **Maintenance Health**: GitHub activity, stars, and issue ratios.
4.  **Changelogs**: Direct extraction of the latest release notes.

## Quick Start

Try it directly without installation:

```bash
npx depvital
```

## Features

- 📦 **Multi-Package Manager Support**: Works with `npm`, `yarn`, and `pnpm`.
- ✅ **Zod-Powered Validation**: Strict validation of all external data boundaries.
- 📊 **Maintenance Scoring**: Computes a health score based on commit recency and community metrics.
- 🔄 **Interactive Updates**: Select and update outdated dependencies directly via the CLI.
- 🛡️ **Fail Thresholds**: Configurable failure based on vulnerability severity.
- ⚡ **Smart Caching**: Local caching to avoid API rate limits.
- 🔍 **Extensive Debugging**: Full instrumentation with the `--debug` flag.

## Installation

```bash
npm install -g depvital
# or
pnpm add -g depvital
```

## Usage

```bash
# Basic analysis
depvital

# Fail on high severity vulnerabilities
depvital --fail-on high

# Interactive update
depvital update-manual

# Automatic update
depvital update-auto

# JSON output
depvital --json > report.json

# Debugging
depvital --debug

# Suppress progress bar
depvital --no-progress
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
