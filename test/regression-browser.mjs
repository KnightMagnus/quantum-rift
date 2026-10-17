// Compatibility entrypoint; the manifest-driven runner is shared by all CI groups.
process.argv[2] = 'browser';
await import('./regression-runner.mjs');
