import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import {
  Admin,
} from "../lib/mongo";
import {
  GetAdminSessionResponse,
  GetSetupStatusResponse,
  LoginAdminBody,
  LoginAdminResponse,
  SetupAdminBody,
  SetupAdminResponse,
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

function sessionUser(admin: { _id: unknown; email: string; role: string }) {
  return { id: String(admin._id), email: admin.email, role: admin.role as "admin" };
}

router.get("/setup/status", async (_req, res): Promise<void> => {
  const setupRequired = (await Admin.countDocuments()) === 0;
  res.json(GetSetupStatusResponse.parse({ setupRequired }));
});

router.post("/setup/admin", credentialLimiter, async (req, res): Promise<void> => {
  const parsed = SetupAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const expected = process.env.ADMIN_SETUP_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "Initial administrator setup is not configured." });
    return;
  }
  const supplied = Buffer.from(parsed.data.setupToken);
  const configured = Buffer.from(expected);
  const tokenMatches =
    supplied.length === configured.length &&
    (await import("node:crypto")).timingSafeEqual(supplied, configured);
  if (!tokenMatches) {
    res.status(403).json({ error: "Setup token is invalid." });
    return;
  }
  await Admin.init();
  if ((await Admin.countDocuments()) > 0) {
    res.status(409).json({ error: "Administrator setup has already been completed." });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const admin = await Admin.create({
      email: parsed.data.email.toLowerCase(),
      passwordHash,
      role: "admin",
    });
    req.session.adminId = String(admin._id);
    await new Promise<void>((resolve, reject) =>
      req.session.save((error) => (error ? reject(error) : resolve())),
    );
    res.status(201).json(SetupAdminResponse.parse(sessionUser(admin)));
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ error: "Administrator setup has already been completed." });
      return;
    }
    throw error;
  }
});

router.post("/auth/login", credentialLimiter, async (req, res): Promise<void> => {
  const parsed = LoginAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const admin = await Admin.findOne({ email: parsed.data.email.toLowerCase() });
  const passwordIsValid =
    admin && (await bcrypt.compare(parsed.data.password, admin.passwordHash));
  if (!admin || !passwordIsValid) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  req.session.adminId = String(admin._id);
  await new Promise<void>((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
  res.json(LoginAdminResponse.parse(sessionUser(admin)));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.adminId) {
    res.status(401).json({ error: "Administrator sign-in required." });
    return;
  }
  const admin = await Admin.findById(req.session.adminId);
  if (!admin) {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: "Administrator session is no longer valid." });
    return;
  }
  res.json(GetAdminSessionResponse.parse(sessionUser(admin)));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((error) => (error ? reject(error) : resolve())),
  );
  res.clearCookie("connect.sid", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
  res.sendStatus(204);
});

export default router;
