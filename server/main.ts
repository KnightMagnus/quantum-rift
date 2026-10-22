// The local platform is Solo-only. Online gameplay runs inside the native Nakama service.
if (process.env.SOLO) await import('./local-main.ts');
else await import('./nakama-host.ts');
