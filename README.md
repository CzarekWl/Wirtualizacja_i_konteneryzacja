# Wirtualizacja_i_konteneryzacja

![CI](https://github.com/CzarekWl/Wirtualizacja_i_konteneryzacja/actions/workflows/ci.yml/badge.svg)

Distributed job processing system (API + queue workers).

## Requirements

- Node.js >= 24.8.0
- pnpm >= 12.21.0

## Setup

From a fresh clone, copy the environment template and fill in its values:

```sh
cp .env.example .env
```

Set `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `RABBITMQ_USER`, and
`RABBITMQ_PASSWORD` in `.env`. `DATABASE_URL` is constructed from the
PostgreSQL user, password, and database values in that file. Use a URL-safe
PostgreSQL password.

Install dependencies and build the project:

```sh
pnpm install
pnpm build
```

## Run

Start PostgreSQL and RabbitMQ:

```sh
docker compose up -d
```

The pnpm start scripts do not load `.env`. Load it into the shell before
running the API so it uses the same credentials as PostgreSQL:

```sh
set -a
. ./.env
set +a
```

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

Minimum 70% coverage (lines, statements, functions, branches) is enforced for source files in `packages` and `apps`.

## CI

`ci.yml` runs on pull requests and pushes to `main`. It runs lint, format, typecheck, tests, build, audit, and Docker checks (hadolint, build, Trivy; skipped if no Dockerfiles exist). Set `CI` as a required check in branch protection.

- **CodeQL:** `.github/workflows/codeql.yml`
- **Releases:** `.github/workflows/release.yml`

## Releases

Run **Actions -> Release -> Run workflow** and select `patch`, `minor`, or `major`. After verifying `CI` passed on `main`, it tags `vX.Y.Z` and creates a GitHub Release. `package.json` versions stay at `0.1.0`.
