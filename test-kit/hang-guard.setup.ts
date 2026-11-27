// Vitest setup file: the default test timeout becomes a load-calibrated hang guard – the base timeout times the
// machine's measured slowdown – so a test without its own timeout does not fail only because the machine is busy, and a
// real hang still fails. The base is vitest's 5 s, or the config's `test.provide: { testTimeoutBase: ms }` when the tests
// need longer (a config `testTimeout` would be overwritten here). A file's own vi.setConfig or a test's own timeout wins.
// Test infrastructure only: no package code imports it.
import { inject, vi } from 'vitest';

declare module 'vitest' {
  interface ProvidedContext {
    testTimeoutBase?: number;
  }
}

type Usage = { user: number; system: number };
const proc = (globalThis as unknown as { process: { cpuUsage(): Usage; threadCpuUsage?: () => Usage } }).process;
const cpuNow = () => {
  const u = proc.threadCpuUsage ? proc.threadCpuUsage() : proc.cpuUsage();
  return u.user + u.system;
};

/** A fixed amount of string, Map and array work; returns a checksum so the JIT cannot drop it. */
function referenceJob(): number {
  const m = new Map<string, number>();
  let sum = 0;
  for (let i = 0; i < 50_000; i++) {
    const s = `apps/service-${i % 500}/src/gen/module-${i}.ts`;
    const seg = s.slice(s.indexOf('/') + 1, s.lastIndexOf('/'));
    m.set(seg + (i % 7), (m.get(seg + (i % 7)) ?? 0) + s.length);
    if (s.includes('-42')) sum += seg.split('/').length;
  }
  for (const v of m.values()) sum = (sum + v) % 1_000_003;
  return sum;
}

/** Wall time ÷ thread CPU time of the reference job (median of 5 runs), clamped to 1–30: how much slower than its CPU time a thread runs now. */
function slowdown(): number {
  const ratios: number[] = [];
  let sink = 0;
  for (let i = 0; i < 5; i++) {
    const c0 = cpuNow();
    const t0 = performance.now();
    sink += referenceJob();
    const cpu = (cpuNow() - c0) / 1000;
    ratios.push((performance.now() - t0) / Math.max(cpu, 0.001));
  }
  if (sink < 0) throw new Error('unreachable');
  ratios.sort((a, b) => a - b);
  return Math.min(30, Math.max(1, ratios[2]!));
}

const factor = slowdown();
const hangGuard = (ms: number) => Math.round(ms * factor);
const base = inject('testTimeoutBase') ?? 5_000;
vi.setConfig({ testTimeout: hangGuard(base), hookTimeout: hangGuard(Math.max(10_000, base)) });
