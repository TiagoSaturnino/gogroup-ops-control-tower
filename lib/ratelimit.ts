export interface RateLimitStore {
  consume(key: string, now: number, windowMs: number, limit: number): { allowed: boolean; retryAfterSeconds: number };
}

// Store em memória para execução local; a interface permite substituir por Redis.
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly requests = new Map<string, number[]>();
  consume(key: string, now: number, windowMs: number, limit: number) {
    const active = (this.requests.get(key) ?? []).filter(timestamp => timestamp > now - windowMs);
    if (active.length >= limit) {
      this.requests.set(key, active);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((active[0] + windowMs - now) / 1000)) };
    }
    active.push(now);
    this.requests.set(key, active);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

const store: RateLimitStore = new MemoryRateLimitStore();
export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  return store.consume(key, now, windowMs, limit);
}
export function checkAgentRateLimit(ip: string, now = Date.now()) {
  return checkRateLimit(`agent:${ip}`, BUSINESS.agentRequestsPerWindow, BUSINESS.agentRateLimitWindowMs, now);
}
import { BUSINESS } from './params';

