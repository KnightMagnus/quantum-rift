/** Pinned runtime metadata shared by installation and launch tools. */
export interface RuntimeManifest {
  version: string;
  baseUrl: string;
  artifacts: Record<string, { file: string; sha256: string } | undefined>;
}
