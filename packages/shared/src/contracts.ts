import { z } from "zod";

// Number summation data schema
export const SumPayload = z.object({
  numbers: z.array(z.number().finite()).min(1).max(10_000),
});

// CSV data schema
export const CsvPayload = z.object({
  csv: z
    .string()
    .min(1)
    .max(200_000)
    .refine((csv) => !csv.includes("\u0000") && csv.isWellFormed(), {
      message: "CSV must contain valid Unicode without NUL characters",
    }),
});

// Incoming API request
export const JobRequest = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sum"),
    payload: SumPayload,
  }),
  z.object({
    type: z.literal("csv_stats"),
    payload: CsvPayload,
  }),
]);

export type JobRequest = z.infer<typeof JobRequest>;
