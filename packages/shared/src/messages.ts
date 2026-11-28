import { z } from "zod";
import { JobRequest } from "./contracts.js";

export const JobId = z.uuid();

export const JobMessage = z.intersection(
  JobRequest,
  z.object({
    version: z.literal(1),
    jobId: JobId,
    attempt: z.number().int().min(1),
  }),
);

export type JobMessage = z.infer<typeof JobMessage>;
