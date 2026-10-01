import { hexToUuid, uuidToHex } from "@saas/db/ids";

export function generateRequestId(): string {
  return `req_${randomHex(12)}`;
}

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let hex = "";
  for (let i = 0; i < buf.length; i++) hex += buf[i]!.toString(16).padStart(2, "0");
  return hex;
}

export function monitorPublicId(uuid: string): string {
  return `mon_${uuidToHex(uuid)}`;
}

export function parseMonitorPublicId(publicId: string): string | null {
  if (!publicId.startsWith("mon_")) return null;
  return hexToUuid(publicId.slice(4));
}

export function incidentPublicId(uuid: string): string {
  return `inc_${uuidToHex(uuid)}`;
}

export function checkPublicId(uuid: string): string {
  return `chk_${uuidToHex(uuid)}`;
}
