import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import MongoStore from "connect-mongo";
import router from "./routes";
import { logger } from "./lib/logger";
import { connectMongo } from "./lib/mongo";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const webOrigin = process.env.WEB_ORIGIN;
if (webOrigin) {
  app.use(cors({ origin: webOrigin, credentials: true }));
}
app.use(async (_req, _res, next) => {
  try {
    await connectMongo();
    next();
  } catch (error) {
    next(error);
  }
});
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));
const mongoUri = process.env.MONGODB_URI;
const sessionSecret = process.env.SESSION_SECRET;
if (!mongoUri) throw new Error("MONGODB_URI must be configured.");
if (!sessionSecret) throw new Error("SESSION_SECRET must be configured.");
app.use(
  session({
    name: "connect.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: "sessions",
      ttl: 60 * 60 * 24,
    }),
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

app.use("/api", router);

export default app;
