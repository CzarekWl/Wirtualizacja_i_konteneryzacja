import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE_NAME } from "./index.js";

describe("SHARED_PACKAGE_NAME", () => {
  it("identifies the shared package", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@jobs/shared");
  });
});
