import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ pools: [] as any[], connectFailure: false, queryFailure: false, releases: 0 }));
vi.mock('pg', () => ({ Pool: class {
  end = vi.fn(async () => {});
  async connect() {
    if (state.connectFailure) throw new Error('database_unavailable');
    return { query: async () => {
      if (state.queryFailure) throw new Error('database_unavailable');
      return { rows: [{ count: '0' }] };
    }, release: () => { state.releases++; } };
  }
  constructor() { state.pools.push(this); }
} }));
vi.mock('../../src/security/tls/index.js', () => ({ createDatabaseTlsConfig: () => false }));
afterEach(() => { vi.unstubAllEnvs(); state.pools = []; state.connectFailure = false; state.queryFailure = false; state.releases = 0; vi.resetModules(); });

describe('analytics statistics lifecycle', () => {
  it('shares concurrent initialization, releases connections and closes only after the last engine', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/sentinel_test');
    const stats = await import('../src/statistics-integration.js');
    const [first, second] = await Promise.all([stats.acquireStatisticsService(), stats.acquireStatisticsService()]);
    expect(state.pools).toHaveLength(1); expect(state.releases).toBe(1);
    await first(); expect(state.pools[0].end).not.toHaveBeenCalled();
    await second(); expect(state.pools[0].end).toHaveBeenCalledTimes(1);
    expect(stats.getStatisticsService()).toBeNull();
    await second(); expect(state.pools[0].end).toHaveBeenCalledTimes(1);
    const next = await stats.acquireStatisticsService(); expect(state.pools).toHaveLength(2);
    await next(); expect(state.pools[1].end).toHaveBeenCalledTimes(1);
  });
  it.each(['connect', 'query'])('cleans up failed %s initialization and allows the next engine to recover', async failure => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/sentinel_test');
    state.connectFailure = failure === 'connect'; state.queryFailure = failure === 'query';
    const stats = await import('../src/statistics-integration.js');
    await expect(stats.acquireStatisticsService()).rejects.toThrow('database_unavailable');
    expect(state.pools[0].end).toHaveBeenCalledTimes(1);
    expect(state.releases).toBe(failure === 'query' ? 1 : 0);
    state.connectFailure = false;
    state.queryFailure = false;
    const release = await stats.acquireStatisticsService(); expect(state.pools).toHaveLength(2);
    await release(); expect(state.pools[1].end).toHaveBeenCalledTimes(1);
  });
});
