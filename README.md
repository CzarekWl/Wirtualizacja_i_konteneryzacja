# Wirtualizacja_i_konteneryzacja

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

The focused commands each start their own shared watcher.
