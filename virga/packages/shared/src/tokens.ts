// Subscriber tokens (decision D4).
//
// Confirm tokens are random, stored hashed, single-use. Unsubscribe tokens
// are DERIVED — `base64url(id + "." + HMAC(TOKEN_SECRET, id))` — so nothing
// about unsubscribing is stored and mail-worker can mint one per recipient
// from the same secret when it renders an issue.

import { base64UrlDecode, base64UrlEncode, hmacSha256Hex, sha256Hex, timingSafeEqual } from "./crypto.js";

export async function hashConfirmToken(plaintext: string): Promise<string> {
  return sha256Hex(`confirm:${plaintext}`);
}

export async function mintUnsubscribeToken(secret: string, subscriberId: string): Promise<string> {
  const mac = await hmacSha256Hex(secret, `unsubscribe:${subscriberId}`);
  return base64UrlEncode(`${subscriberId}.${mac}`);
}

/** The subscriber id the token names, or null when it does not verify. */
export async function verifyUnsubscribeToken(secret: string, token: string): Promise<string | null> {
  const decoded = base64UrlDecode(token);
  if (!decoded) return null;
  const dot = decoded.lastIndexOf(".");
  if (dot < 1) return null;
  const id = decoded.slice(0, dot);
  const mac = decoded.slice(dot + 1);
  const expected = await hmacSha256Hex(secret, `unsubscribe:${id}`);
  return timingSafeEqual(mac, expected) ? id : null;
}
