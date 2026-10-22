// Isolated production-runtime instrumentation used only by its owning regression test.
import fileSystem from 'node:fs';
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
const sync = fileSystem.fsyncSync;
fileSystem.fsyncSync = (fileDescriptor) => {
  if (fileSystem.fstatSync(fileDescriptor).isDirectory())
    throw Object.assign(new Error('Windows directory fsync'), { code: 'EPERM' });
  return sync(fileDescriptor);
};
