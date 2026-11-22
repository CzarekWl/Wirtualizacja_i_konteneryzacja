import express from "express";
import { SHARED_PACKAGE_NAME } from "@jobs/shared";

export { SHARED_PACKAGE_NAME };
export const SERVICE_NAME = "@jobs/api";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
