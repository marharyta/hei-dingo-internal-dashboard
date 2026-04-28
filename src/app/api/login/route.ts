import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/internal-auth";

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}
function getAllowedEmails() {
  return (process.env.INTERNAL_DASHBOARD_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  const allowedEmails = getAllowedEmails();
  const expectedPassword = process.env.INTERNAL_DASHBOARD_PASSWORD;
  const allowedDomain =
    process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? "hei-dingo.com";

  if (allowedEmails.length === 0 || !expectedPassword) {
    return NextResponse.json(
      { error: "Dashboard credentials are not configured." },
      { status: 500 },
    );
  }

  if (!email.endsWith(`@${allowedDomain}`)) {
    return NextResponse.json(
      { error: `Use a @${allowedDomain} email.` },
      { status: 403 },
    );
  }

  if (!allowedEmails.includes(email) || password !== expectedPassword) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, signSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true });
}
