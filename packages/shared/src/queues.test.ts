import { describe, expect, it } from "vitest";
import { QUEUES } from "./queues.js";

describe("QUEUES", () => {
  it("exposes the three queue names", () => {
    expect(QUEUES.JOBS).toBe("jobs");
    expect(QUEUES.RETRY).toBe("jobs.retry");
    expect(QUEUES.DEAD).toBe("jobs.dead");
  });
});
