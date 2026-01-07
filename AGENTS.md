# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source for the CLI and RPC server.
  - `src/cli.ts` and `src/server.ts` wire up the command-line entry and Fastify server.
  - `src/abi/`, `src/blockchain/`, `src/rpc/`, and `src/state/` hold core modules.
- `test/`: Vitest suites named `*.test.ts` that mirror `src/` modules.
- `abis/`: Sample ABI JSON files used by the CLI during development.
- `dist/`: Build output from `tsup` (generated).

## Build, Test, and Development Commands
- `pnpm dev`: Run the CLI in watch mode via `tsx --watch`.
- `pnpm build`: Compile TypeScript to `dist/` with `tsup`.
- `pnpm start`: Execute the built CLI (`node dist/cli.js`).
- `pnpm test`: Run Vitest test suites.
- `abi-node init`: Generate `abi.config.json` with defaults.

## Coding Style & Naming Conventions
- Use TypeScript with ESM imports and explicit file extensions when needed.
- Follow existing formatting: 2-space indentation, double quotes, and semicolons.
- Prefer descriptive names that match module responsibility (e.g., `registry`, `handler`).
- No repo-wide formatter/linter is configured; keep edits consistent with nearby code.

## Testing Guidelines
- Framework: Vitest (`pnpm test`).
- Place tests in `test/` with the `*.test.ts` suffix.
- Keep tests focused on the corresponding module (e.g., `src/rpc/handler.ts` → `test/handler.test.ts`).
- Add coverage for new RPC methods, ABI defaults, or state transitions.

## Commit & Pull Request Guidelines
- Commit messages in history use short, imperative summaries and often `feat:` prefixes.
- Prefer Conventional Commit style (`feat:`, `fix:`, `chore:`) when adding new work.
- PRs should include a clear summary, testing notes, and linked issues if applicable.
- Update `CHANGELOG.md` for user-facing behavior changes.

## Configuration & Runtime Notes
- `abi.config.json` controls ports, block time, proxy RPC, and ABI mappings.
- Default RPC URL for local use is `http://localhost:8545`.
