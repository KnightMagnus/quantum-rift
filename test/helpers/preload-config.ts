/** Configuration serialized by the owning checked test before starting its isolated server. */
export function preloadConfiguration<Configuration>(): Configuration {
  const serialized = process.env.RIFT_PRELOAD_CONFIGURATION;
  if (!serialized) throw new Error('Missing isolated server preload configuration.');
  return JSON.parse(serialized) as Configuration;
}
