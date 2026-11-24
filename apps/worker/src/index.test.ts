import { describe, expect, it } from "vitest";
import { SERVICE_NAME, SHARED_PACKAGE_NAME } from "./index.js";

describe("worker entry point", () => {
  it("identifies the worker service", () => {
    expect(SERVICE_NAME).toBe("@jobs/worker");
  });

  it("re-exports the shared package name", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@jobs/shared");
  });
});
