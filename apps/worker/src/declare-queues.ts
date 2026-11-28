import process from "node:process";
import { connect } from "amqplib";
import { declareQueues } from "./queues.js";

async function main(): Promise<void> {
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    console.error("RABBITMQ_URL is required");
    process.exitCode = 1;
    return;
  }

  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await declareQueues(channel);
  } finally {
    await connection.close();
  }
}

void main().catch(() => {
  console.error("RabbitMQ queue declaration failed");
  process.exitCode = 1;
});
