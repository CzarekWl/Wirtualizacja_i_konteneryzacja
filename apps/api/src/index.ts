import express, { type Express } from "express";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { SHARED_PACKAGE_NAME } from "@jobs/shared";

export { SHARED_PACKAGE_NAME };
export const SERVICE_NAME = "@jobs/api";

export const app: Express = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

let server: Server | undefined;

if (isMainModule) {
  server = app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}

export { server };
