import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { QUEUES, type JobMessage } from "@jobs/shared";
import { connect } from "amqplib";
import { expect, it, vi } from "vitest";
import { publishJob } from "./queues.js";

function docker(...args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
}

it.skipIf(process.env.JOB_1_INTEGRATION !== "1")(
  "keeps queues and persistent messages across a restart and routes expired retries",
  async () => {
    const username = randomUUID();
    const password = randomUUID();
    const container = execFileSync(
      "docker",
      [
        "run",
        "--detach",
        "--publish",
        "127.0.0.1::5672",
        "--env",
        "RABBITMQ_DEFAULT_USER",
        "--env",
        "RABBITMQ_DEFAULT_PASS",
        "rabbitmq:3.13-management-alpine",
      ],
      {
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, RABBITMQ_DEFAULT_USER: username, RABBITMQ_DEFAULT_PASS: password },
      },
    ).trim();

    try {
      const brokerUrl = () =>
        `amqp://${username}:${password}@${docker("port", container, "5672/tcp")}`;
      const connectWhenReady = (url: string) =>
        vi.waitFor(() => connect(url, { timeout: 1_000 }), { timeout: 30_000, interval: 250 });
      const job: JobMessage = {
        version: 1,
        jobId: randomUUID(),
        attempt: 1,
        type: "sum",
        payload: { numbers: [1, 2] },
      };

      const url = brokerUrl();
      const beforeRestart = await connectWhenReady(url);
      try {
        execFileSync("pnpm", ["--filter", "@jobs/worker", "queues:declare"], {
          env: { ...process.env, RABBITMQ_URL: url },
          stdio: "ignore",
          timeout: 15_000,
        });
        const channel = await beforeRestart.createConfirmChannel();
        await publishJob(channel, QUEUES.JOBS, job);
      } finally {
        await beforeRestart.close();
      }

      docker("restart", container);

      const afterRestart = await connectWhenReady(brokerUrl());
      try {
        const channel = await afterRestart.createConfirmChannel();
        for (const queue of Object.values(QUEUES)) {
          expect(await channel.checkQueue(queue)).toMatchObject({ queue });
        }

        const saved = await channel.get(QUEUES.JOBS, { noAck: true });
        expect(saved).toMatchObject({
          content: Buffer.from(JSON.stringify(job)),
          properties: { deliveryMode: 2 },
        });

        const retryJob = { ...job, attempt: 2 };
        const started = performance.now();
        await publishJob(channel, QUEUES.RETRY, retryJob);
        expect(await channel.get(QUEUES.JOBS, { noAck: true })).toBe(false);

        await vi.waitFor(
          async () => {
            const { messageCount } = await channel.checkQueue(QUEUES.JOBS);
            expect(messageCount).toBe(1);
          },
          { timeout: 15_000, interval: 100 },
        );
        expect(performance.now() - started).toBeGreaterThanOrEqual(10_000);

        const retried = await channel.get(QUEUES.JOBS, { noAck: true });
        expect(retried).toMatchObject({
          content: Buffer.from(JSON.stringify(retryJob)),
          properties: {
            headers: { "x-first-death-queue": QUEUES.RETRY, "x-first-death-reason": "expired" },
          },
        });
        expect(await channel.checkQueue(QUEUES.RETRY)).toMatchObject({ messageCount: 0 });
      } finally {
        await afterRestart.close();
      }
    } finally {
      docker("rm", "--force", "--volumes", container);
    }
  },
  120_000,
);
