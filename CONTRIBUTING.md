# Contributing

Thanks for helping improve `abi-node`! This guide covers the expected workflow and conventions.

## Setup
```bash
pnpm install
```

## Development Commands
- `pnpm dev`: Run the CLI with hot reload.
- `pnpm build`: Compile to `dist/` via `tsup`.
- `pnpm start`: Run the built CLI.
- `pnpm test`: Execute Vitest suites in `test/`.

## Project Conventions
- Language: TypeScript (ESM modules).
- Formatting: 2-space indentation, double quotes, semicolons.
- Tests live in `test/` and use the `*.test.ts` suffix.
- Documentation for users lives in `docs/`.

## Pull Requests
- Keep changes focused and include a concise summary.
- Note test results in the PR description.
- Update `CHANGELOG.md` for user-facing behavior changes.

## Commit Messages
Recent history uses Conventional Commit-style prefixes. Prefer:
`feat:`, `fix:`, `chore:`, `docs:`.

