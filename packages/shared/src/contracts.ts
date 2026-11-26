import { z } from "zod";

// Schemat danych do sumowania liczb
export const SumPayload = z.object({
  numbers: z.array(z.number().finite()).min(1).max(10_000),
});

// Schemat danych CSV
export const CsvPayload = z.object({
  csv: z
    .string()
    .min(1)
    .max(200_000)
    .refine((csv) => !csv.includes("\u0000") && csv.isWellFormed(), {
      message: "CSV must contain valid Unicode without NUL characters",
    }),
});

// Zadanie przychodzące do API
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
