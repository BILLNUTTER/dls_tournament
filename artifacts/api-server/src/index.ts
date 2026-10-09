import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { connectMongo } from "./lib/mongo";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
const io = new SocketServer(server, { path: "/socket.io" });
app.set("io", io);

connectMongo()
  .then(() => {
    logger.info("MongoDB connected");
    server.listen(port, () => logger.info({ port }, "Server listening"));
  })
  .catch((err: unknown) => {
    logger.error({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  });
