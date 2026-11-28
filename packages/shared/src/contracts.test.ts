import { describe, expect, it } from "vitest";
import { CsvPayload, JobRequest, SumPayload } from "./contracts.js";

describe("SumPayload validation", () => {
  it("accepts a non-empty array of finite numbers", () => {
    expect(SumPayload.safeParse({ numbers: [1, -2.5, 3] }).success).toBe(true);
  });

  it("rejects empty arrays and non-finite numbers", () => {
    expect(SumPayload.safeParse({ numbers: [] }).success).toBe(false);
    expect(SumPayload.safeParse({ numbers: [Number.POSITIVE_INFINITY] }).success).toBe(false);
  });
});

describe("CsvPayload validation", () => {
  it("accepts non-empty CSV with well-formed Unicode", () => {
    expect(CsvPayload.safeParse({ csv: "name\n😀" }).success).toBe(true);
  });

  it("rejects CSV containing NUL characters or malformed Unicode", () => {
    expect(CsvPayload.safeParse({ csv: "name\nA\u0000B" }).success).toBe(false);
    expect(CsvPayload.safeParse({ csv: "name\n\uD83D" }).success).toBe(false);
  });
});

describe("JobRequest validation", () => {
  it("accepts each supported job type", () => {
    expect(JobRequest.safeParse({ type: "sum", payload: { numbers: [1] } }).success).toBe(true);
    expect(JobRequest.safeParse({ type: "csv_stats", payload: { csv: "name\nA" } }).success).toBe(
      true,
    );
  });

  it("rejects unsupported job types and invalid payloads", () => {
    expect(JobRequest.safeParse({ type: "unknown", payload: {} }).success).toBe(false);
    expect(JobRequest.safeParse({ type: "csv_stats", payload: { csv: "" } }).success).toBe(false);
  });
});
