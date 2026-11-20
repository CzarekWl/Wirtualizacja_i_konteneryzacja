/**
 * Shared contract package.
 *
 * Zod schemas (`JobRequest`, `JobMessage`), message types, and queue names
 * are added here in SET-2.
 */
export const SHARED_PACKAGE_NAME = "@jobs/shared";
export * from "./contracts.js";
export * from "./messages.js";
export * from "./queues.js";