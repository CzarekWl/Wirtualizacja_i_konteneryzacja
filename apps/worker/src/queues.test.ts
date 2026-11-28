import { Buffer } from "node:buffer";
import { QUEUES, type JobMessage } from "@jobs/shared";
import { describe, expect, it, vi } from "vitest";
import { declareQueues, publishJob } from "./queues.js";

const job: JobMessage = {
  version: 1,
  jobId: "94c1923a-5361-4230-9904-5949ec415ad4",
  attempt: 1,
  type: "sum",
  payload: { numbers: [1, 2] },
};

describe("RabbitMQ queues", () => {
  it("declares durable queues and routes expired retry messages back to jobs", async () => {
    const assertQueue = vi.fn().mockResolvedValue({});

    await declareQueues({ assertQueue });

    expect(assertQueue.mock.calls).toEqual([
      [QUEUES.JOBS, { durable: true }],
      [
        QUEUES.RETRY,
        {
          durable: true,
          messageTtl: 10_000,
          deadLetterExchange: "",
          deadLetterRoutingKey: QUEUES.JOBS,
        },
      ],
      [QUEUES.DEAD, { durable: true }],
    ]);
  });

  it.each(Object.values(QUEUES))("publishes persistent JSON to %s", async (queue) => {
    const sendToQueue = vi.fn().mockReturnValue(true);
    const waitForConfirms = vi.fn().mockResolvedValue(undefined);

    await publishJob({ sendToQueue, waitForConfirms }, queue, job);

    expect(sendToQueue).toHaveBeenCalledExactlyOnceWith(queue, Buffer.from(JSON.stringify(job)), {
      contentType: "application/json",
      persistent: true,
    });
    expect(waitForConfirms).toHaveBeenCalledExactlyOnceWith();
  });

  it("rejects publication if the broker does not confirm it", async () => {
    const sendToQueue = vi.fn().mockReturnValue(true);
    const error = new Error("Broker rejected the message");
    const waitForConfirms = vi.fn().mockRejectedValue(error);

    await expect(publishJob({ sendToQueue, waitForConfirms }, QUEUES.JOBS, job)).rejects.toBe(
      error,
    );
  });
});
