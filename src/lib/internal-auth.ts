import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "hei_dingo_internal_session";

function getSessionSecret() {
  const secret = process.env.INTERNAL_DASHBOARD_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "INTERNAL_DASHBOARD_SESSION_SECRET must be at least 32 characters.",
    );
  }

  return secret;
}

export function signSession(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const expiresAt = Date.now() + 1000 * 60 * 60 * 8;

  const payload = Buffer.from(
    JSON.stringify({ email: normalizedEmail, expiresAt }),
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifySession(value: string | undefined) {
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const decoded = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as {
    email: string;
    expiresAt: number;
  };

  if (decoded.expiresAt < Date.now()) return null;

  return decoded;
}
