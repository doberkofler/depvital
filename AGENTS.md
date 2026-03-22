# Agent Guidelines: depvital

Build/Lint/Test:

- `npm run ci`: Runs lint, build, and all tests.
- `npm run dev`: Starts the development server.
- `npm run test`: Runs unit tests using Vitest.
- `npx vitest <file>`: Runs a specific test file.

## Analysis Logic

- The tool analyzes **all** top-level dependencies, not just outdated ones.
- It fetches outdated status, security vulnerabilities (audit), maintenance health (GitHub), and changelogs.
- Caching is used by default to avoid GitHub API rate limits.
- Use `--debug` to see the internal execution steps and Zod validation results.
- Use `--no-progress` to suppress the progress bar.
