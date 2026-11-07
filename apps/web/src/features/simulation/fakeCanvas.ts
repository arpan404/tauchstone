// Test helper: a recording 2D context so canvas components run their draw code under jsdom.
import { vi } from 'vitest';

export interface FakeCtx { calls: string[]; ctx: CanvasRenderingContext2D }

export function installFakeCanvas(): FakeCtx {
  const calls: string[] = [];
  const gradient = { addColorStop: () => {} };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
      return (...args: unknown[]) => { calls.push(key); void args; };
    },
    set(t, key: string, value) { t[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320, height: 200, x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 200, toJSON: () => ({}) } as DOMRect);
  return { calls, ctx };
}

/** Manual requestAnimationFrame so tests can advance frames. */
export function installManualRaf() {
  let queue: FrameRequestCallback[] = [];
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.push(cb); return queue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { queue = []; });
  return {
    step(n = 1) {
      for (let k = 0; k < n; k++) { const q = queue; queue = []; now += 16.7; q.forEach((cb) => cb(now)); }
    },
    pending: () => queue.length,
  };
}

export function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({ matches: reduce && query.includes('reduce'), media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
}
