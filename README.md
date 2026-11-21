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
pnpm audit --audit-level=high --ignore-registry-errors
```

`pnpm audit` is a pnpm command, not a repository script.

## Coverage

Coverage must be at least 80% for lines, statements, functions, and branches in
`packages/*/src`. The `apps/*` packages have no tests yet.

## Releases

Releases are started manually: **Actions → Release → Run workflow**, then
choose `patch`, `minor`, or `major`. The workflow creates an annotated
`vX.Y.Z` tag on `main` and a GitHub Release with generated notes.

The tag is the version. Package versions in `package.json` stay at `0.1.0` because nothing is published to a registry.
