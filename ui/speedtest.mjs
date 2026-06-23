import { statusFromDelay } from './app.mjs';

export function createSpeedTest(api) {
  const CONCURRENCY = 6;
  const DEFAULT_TIMEOUT = 5000;
  const DEFAULT_URL = 'https://www.gstatic.com/generate_204';

  async function testNodes(nodes, onProgress) {
    const results = new Map();
    if (!nodes || nodes.length === 0) return results;

    let completed = 0;
    const total = nodes.length;
    const queue = [...nodes];

    async function worker() {
      while (queue.length > 0) {
        const nodeName = queue.shift();
        try {
          const result = await api.getDelay(nodeName, DEFAULT_TIMEOUT, DEFAULT_URL);
          if (result && typeof result.delay === 'number' && result.delay > 0) {
            results.set(nodeName, { delayMs: result.delay, status: statusFromDelay(result.delay) });
          } else {
            results.set(nodeName, { status: 'timeout' });
          }
        } catch {
          results.set(nodeName, { status: 'timeout' });
        }
        completed += 1;
        if (onProgress) {
          onProgress({
            completed,
            total,
            nodeName,
            percentage: Math.round((completed / total) * 100),
          });
        }
      }
    }

    const workerCount = Math.min(CONCURRENCY, total);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }

  return { testNodes };
}
