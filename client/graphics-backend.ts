/** Detect unaccelerated drivers before the Engine claims the real canvas. */
export function softwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(name);
}
export function canvasBackend(override: string | null): boolean {
  if (override === 'canvas') return true;
  if (override === 'webgl') return false;
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) return true;
  const info = probe.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? String(probe.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  const software = softwareRenderer(renderer);
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  return software;
}
