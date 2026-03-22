## Commit Message Guidelines

We follow the **Conventional Commits** specification. This is **enforced** by `commitlint` and is required for automated changelog generation.

**Format:** `type(scope): subject`

**Common Types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries such as documentation generation

**Examples:**

- `feat(cli): add support for jsonc files`
- `fix(parser): handle empty input gracefully`
- `docs: update contributing guidelines`

## Release Process

1. **Verify**: `npm run ci`
2. **Bump Version**: `npm version <patch|minor|major> --no-git-tag-version`
3. **Update Changelog**: `npm run create-changelog`
4. **Commit**: `git add . && git commit -m "chore(release): $(node -p 'require("./package.json").version')"`
5. **Tag & Push**: `git tag v$(node -p 'require("./package.json").version') && git push && git push --tags`
6. **Create GitHub Release**: `gh release create v$(node -p 'require("./package.json").version') --generate-notes`
7. **Publish**: `npm publish`

## Dependencies

- **zod**: TypeScript-first schema validation with static type inference.
- **eslint-plugin-regexp**: ESLint plugin for finding regexp mistakes and style guide violations.
- **debug**: A tiny JavaScript debugging utility modelled after Node.js core debugging technique.
- **@commitlint/cli**: Lint commit messages to ensure they follow conventional commits.
- **@commitlint/config-conventional**: Shareable commitlint config enforcing conventional commits.
- **@types/debug**: TypeScript definitions for debug.
- **@types/node**: TypeScript definitions for Node.js.
- **@vitest/coverage-v8**: V8 coverage provider for Vitest.
- **conventional-changelog**: Generate a changelog from git metadata.
- **husky**: Modern native git hooks made easy.
- **oxlint**: A JavaScript linter written in Rust.
- **oxlint-tsgolint**: TypeScript-specific rules for oxlint.
- **tinyexec**: A minimal library for executing processes in Node.
- **prettier**: An opinionated code formatter.
- **typescript**: A superset of JavaScript that compiles to clean JavaScript output.
- **vitest**: A Vite-native unit test framework.
- **commander**: The complete solution for node.js command-line interfaces.
- **cli-progress**: Easy to use progress-bar for command-line/terminal applications.
- **@types/cli-progress**: TypeScript definitions for cli-progress.
- **tsdown**: A zero-config bundler for TypeScript.
