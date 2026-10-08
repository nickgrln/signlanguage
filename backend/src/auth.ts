import { createSecretKey, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";

export type Role = "Admin" | "Signer" | "Listener";
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function jwtKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return createSecretKey(Buffer.from(secret));
}

export async function issueToken(user: AuthUser) {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(jwtKey());
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const bearer = req.get("authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : req.cookies?.session;
    if (!token) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    const { payload } = await jwtVerify(token, jwtKey());
    if (!payload.sub || typeof payload.name !== "string" || typeof payload.email !== "string" ||
        !["Admin", "Signer", "Listener"].includes(String(payload.role))) {
      res.status(401).json({ error: "Your session is invalid. Please sign in again." });
      return;
    }
    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role as Role
    };
    next();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("JWT_SECRET")) {
      next(error);
      return;
    }
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "You do not have permission to perform this action." });
      return;
    }
    next();
  };
}

export function setSessionCookie(res: Response, token: string) {
  const production = process.env.NODE_ENV === "production";
  res.cookie("session", token, {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/"
  });
}
