import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "skb_session";

function sign(): string {
  return createHmac("sha256", process.env.SESSION_SECRET!)
    .update("authenticated")
    .digest("hex");
}

export function makeSessionToken(): string {
  return sign();
}

export async function verifySessionCookie(value: string): Promise<boolean> {
  const expected = sign();
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
