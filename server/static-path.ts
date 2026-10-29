import path from 'node:path';

/** Parsed HTTP target; decoding is bounded to one pass before routing. */
export interface StaticRequestTarget {
  /** URL retaining undecoded query parameters for API routes. */
  url: URL;
  /** Decoded pathname, never an operating-system path. */
  pathname: string;
}

/** A public file and the only directory from which it may be served. */
export interface StaticFileLocation {
  /** Absolute source asset or emitted JavaScript file. */
  file: string;
  /** Independent shared/client source or emitted directory boundary. */
  directory: string;
}

/** Invalid escapes must produce a response, not a rejected async request handler. */
export function parseStaticRequest(target: string, origin: string): StaticRequestTarget | null {
  try {
    const url = new URL(target, origin);
    return { url, pathname: decodeURIComponent(url.pathname) };
  } catch {
    return null;
  }
}

/** Check path components, not a string prefix (which also accepts sibling names). */
export function insideStaticDirectory(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

/** Shared imports do not grant HTTP access to the repository or its save directories. */
export function staticFileLocation(root: string, pathname: string): StaticFileLocation | null {
  if (pathname.includes('\\') || pathname.includes('\0')) return null;
  const shared = pathname.startsWith('/shared/');
  const component = shared ? 'shared' : 'client';
  const relative = shared ? pathname.slice('/shared/'.length) : pathname.slice(1);
  const sourceDirectory = path.join(root, component);
  const sourceFile = path.resolve(sourceDirectory, relative);
  if (!insideStaticDirectory(sourceDirectory, sourceFile)) return null;
  const directory =
    path.extname(sourceFile) === '.js' ? path.join(root, 'dist', component) : sourceDirectory;
  const file = path.resolve(directory, path.relative(sourceDirectory, sourceFile));
  return insideStaticDirectory(directory, file) ? { file, directory } : null;
}
