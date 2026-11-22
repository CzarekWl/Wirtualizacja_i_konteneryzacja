# Wirtualizacja_i_konteneryzacja

![CI](https://github.com/CzarekWl/Wirtualizacja_i_konteneryzacja/actions/workflows/ci.yml/badge.svg)

Distributed job processing system (API + queue workers).

## Requirements

- Node.js >= 24.8.0
- pnpm >= 12.21.0

## Setup

```sh
pnpm install
pnpm build
```

## Run

Run the API, the worker, and the shared watcher together:

```sh
pnpm dev
```

Or run one service at a time:

```sh
pnpm dev:api
```

```sh
pnpm dev:worker
```

Each command starts its own shared watcher.

## Scripts

```sh
pnpm lint          # type-aware ESLint
pnpm format        # write formatting changes
pnpm format:check  # check formatting without writing
pnpm typecheck     # build and typecheck tests
pnpm test          # Vitest
pnpm test:coverage # Vitest with coverage
pnpm build         # build every package
pnpm audit         # dependency audit (high severity)
```

## Tooling

ESLint, Prettier, TypeScript, and Vitest are configured at the repository root.

## Coverage

Minimum 80% coverage (lines, statements, functions, branches) is enforced for `packages/*/src`.

## CI

`ci.yml` runs on pull requests and pushes to `main`. It runs lint, format, typecheck, tests, build, audit, and Docker checks (hadolint, build, Trivy; skipped if no Dockerfiles exist). Set `CI` as a required check in branch protection.

- **CodeQL:** `.github/workflows/codeql.yml`
- **Releases:** `.github/workflows/release.yml`

## Releases

Run **Actions -> Release -> Run workflow** and select `patch`, `minor`, or `major`. After verifying `CI` passed on `main`, it tags `vX.Y.Z` and creates a GitHub Release. `package.json` versions stay at `0.1.0`.
