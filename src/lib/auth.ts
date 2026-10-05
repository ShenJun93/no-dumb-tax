import { timingSafeEqual } from "node:crypto";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isMerchant(req: Request, token: string): boolean {
  return Boolean(token) && same(req.headers.get("x-merchant-token") ?? "", token);
}

export function portalTokenOk(stored: string | undefined, given: string | null): boolean {
  return Boolean(stored) && Boolean(given) && same(stored!, given!);
}

export function isCron(req: Request, secret: string): boolean {
  return Boolean(secret) && same(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
