// Run the same silent TCP fixture through the production password-based friend host.
process.env.RIFT_LIVENESS_MODE = 'friends';
await import('./browser-server-liveness.ts');
