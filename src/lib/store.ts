import { Redis } from "@upstash/redis";

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  setnx(key: string, value: unknown, ttlSec?: number): Promise<boolean>;
  incr(key: string, ttlSec?: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  lpush(key: string, value: unknown): Promise<void>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
  lrem(key: string, value: string): Promise<void>;
}

type Entry = { value: unknown; expires: number | null };

export class MemoryStore implements Store {
  private data = new Map<string, Entry>();

  constructor(private now: () => number = Date.now) {}

  private live(key: string): Entry | null {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.expires !== null && e.expires <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return e;
  }

  private put(key: string, value: unknown, ttlSec?: number) {
    this.data.set(key, { value: structuredClone(value), expires: ttlSec ? this.now() + ttlSec * 1000 : null });
  }

  async get<T>(key: string) {
    const e = this.live(key);
    return e ? (structuredClone(e.value) as T) : null;
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    this.put(key, value, ttlSec);
  }
  async setnx(key: string, value: unknown, ttlSec?: number) {
    if (this.live(key)) return false;
    this.put(key, value, ttlSec);
    return true;
  }
  async incr(key: string, ttlSec?: number) {
    const e = this.live(key);
    const next = (e ? Number(e.value) : 0) + 1;
    this.data.set(key, { value: next, expires: e?.expires ?? (ttlSec ? this.now() + ttlSec * 1000 : null) });
    return next;
  }
  async sadd(key: string, member: string) {
    const cur = ((this.live(key)?.value as string[]) ?? []).filter((m) => m !== member);
    this.put(key, [...cur, member]);
  }
  async smembers(key: string) {
    return [...((this.live(key)?.value as string[]) ?? [])];
  }
  async lpush(key: string, value: unknown) {
    const cur = (this.live(key)?.value as unknown[]) ?? [];
    this.put(key, [value, ...cur]);
  }
  async lrange<T>(key: string, start: number, stop: number) {
    const cur = (this.live(key)?.value as T[]) ?? [];
    return structuredClone(cur.slice(start, stop === -1 ? undefined : stop + 1));
  }
  async lrem(key: string, value: string) {
    const cur = (this.live(key)?.value as unknown[]) ?? [];
    this.put(key, cur.filter((v) => v !== value));
  }
}

export class RedisStore implements Store {
  constructor(private redis: Redis) {}
  async get<T>(key: string) {
    return (await this.redis.get<T>(key)) ?? null;
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    if (ttlSec) await this.redis.set(key, value, { ex: ttlSec });
    else await this.redis.set(key, value);
  }
  async setnx(key: string, value: unknown, ttlSec?: number) {
    const r = ttlSec ? await this.redis.set(key, value, { nx: true, ex: ttlSec }) : await this.redis.set(key, value, { nx: true });
    return r === "OK";
  }
  async incr(key: string, ttlSec?: number) {
    const n = await this.redis.incr(key);
    if (n === 1 && ttlSec) await this.redis.expire(key, ttlSec);
    return n;
  }
  async sadd(key: string, member: string) {
    await this.redis.sadd(key, member);
  }
  async smembers(key: string) {
    return (await this.redis.smembers(key)) as string[];
  }
  async lpush(key: string, value: unknown) {
    await this.redis.lpush(key, value);
  }
  async lrange<T>(key: string, start: number, stop: number) {
    return (await this.redis.lrange<T>(key, start, stop)) as T[];
  }
  async lrem(key: string, value: string) {
    await this.redis.lrem(key, 0, value);
  }
}

let memory: MemoryStore | null = null;

export function getStore(): Store {
  if (process.env.UPSTASH_REDIS_REST_URL) return new RedisStore(Redis.fromEnv());
  memory ??= new MemoryStore();
  return memory;
}
