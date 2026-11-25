import { describe, it, expect } from "vitest";
import { JobMessage } from "./messages.js";

describe("JobMessage validation", () => {
  it("accepts a valid job message", () => {
    const message = {
      version: 1,
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      type: "sum",
      payload: {
        numbers: [10, 20, 30],
      },
      attempt: 1,
    };

    const result = JobMessage.safeParse(message);

    expect(result.success).toBe(true);
  });

  it("rejects a message without jobId", () => {
    const message = {
      version: 1,
      type: "sum",
      payload: {
        numbers: [10, 20, 30],
      },
      attempt: 1,
    };

    const result = JobMessage.safeParse(message);

    expect(result.success).toBe(false);
  });
});
