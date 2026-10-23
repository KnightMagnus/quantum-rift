// Dedicated online play remains native Nakama; friend hosting is an explicit Node authority.
if (process.env.HOST_FRIENDS && process.env.HOST_FRIENDS !== '1')
  throw new Error('HOST_FRIENDS must be 1, or unset for dedicated/Solo play.');
if (process.env.HOST_FRIENDS === '1' || process.env.SOLO) await import('./local-main.ts');
else await import('./nakama-host.ts');
