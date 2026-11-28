import { Buffer } from "node:buffer";
import { QUEUES, type JobMessage } from "@jobs/shared";
import type { Channel, ConfirmChannel } from "amqplib";

export async function declareQueues(channel: Pick<Channel, "assertQueue">): Promise<void> {
  await channel.assertQueue(QUEUES.JOBS, { durable: true });
  await channel.assertQueue(QUEUES.RETRY, {
    durable: true,
    messageTtl: 10_000,
    deadLetterExchange: "",
    deadLetterRoutingKey: QUEUES.JOBS,
  });
  await channel.assertQueue(QUEUES.DEAD, { durable: true });
}

export async function publishJob(
  channel: Pick<ConfirmChannel, "sendToQueue" | "waitForConfirms">,
  queue: (typeof QUEUES)[keyof typeof QUEUES],
  message: JobMessage,
): Promise<void> {
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
    contentType: "application/json",
    persistent: true,
  });
  await channel.waitForConfirms();
}
