import { Router, type IRouter } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import {
  GetAdminSessionResponse,
  LoginAdminBody,
  LoginAdminResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

declare module "express-session" {
  interface SessionData {
    adminId?: string;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function envAdminId(username: string, password: string): string {
  return `env-admin:${createHash("sha256").update(`${username}\0${password}`).digest("hex")}`;
}

router.post("/auth/login", credentialLimiter, async (req, res): Promise<void> => {
  const parsed = LoginAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const configuredUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredUsername || !configuredPassword) {
    res.status(503).json({ error: "Administrator credentials are not configured on the server." });
    return;
  }
  const username = parsed.data.username.trim().toLowerCase();
  const usernameIsValid = safeEqual(username, configuredUsername);
  const passwordIsValid = safeEqual(parsed.data.password, configuredPassword);
  if (!usernameIsValid || !passwordIsValid) {
    res.status(401).json({ error: "Username or password is incorrect." });
    return;
  }
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  req.session.adminId = envAdminId(configuredUsername, configuredPassword);
  await new Promise<void>((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
  res.json(LoginAdminResponse.parse({
    id: "environment-admin",
    username: configuredUsername,
    role: "admin",
  }));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const configuredUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const expectedAdminId = configuredUsername && configuredPassword
    ? envAdminId(configuredUsername, configuredPassword)
    : null;
  if (!expectedAdminId || req.session.adminId !== expectedAdminId) {
    if (req.session.adminId) req.session.destroy(() => undefined);
    res.status(401).json({ error: "Administrator sign-in required." });
    return;
  }
  res.json(GetAdminSessionResponse.parse({
    id: "environment-admin",
    username: configuredUsername,
    role: "admin",
  }));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((error) => (error ? reject(error) : resolve())),
  );
  res.clearCookie("connect.sid", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
  res.sendStatus(204);
});

export default router;
