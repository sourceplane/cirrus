// Visitor fingerprint (decision D5): sha256(ip | user-agent | salt | day),
// truncated to 32 hex. Rotates daily with the date and is never reversible
// to a person. When no salt is configured the fingerprint still works — it
// is just stable across salt rotations, which only matters for abuse.

import { sha256Hex } from "@site/shared/crypto";
import type { Env } from "./env.js";

export async function fingerprint(request: Request, env: Env, day: string): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "0.0.0.0";
  const ua = request.headers.get("user-agent") ?? "";
  const salt = env.FINGERPRINT_SALT ?? "";
  return (await sha256Hex(`${ip}|${ua}|${salt}|${day}`)).slice(0, 32);
}
