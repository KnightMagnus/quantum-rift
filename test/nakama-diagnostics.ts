import assert from 'node:assert/strict';
import path from 'node:path';
import { sanitizedDiagnostic, repository } from './helpers/nakama-service.ts';
// Synthetic token shapes, not actual credentials; cover URL punctuation and base64url tails.
for (const tail of ['a', '_', '-']) {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJzeW50aGV0aWMifQ.c3ludGhldGljc2lnbmF0dXJl' + tail;
  for (const input of [
    'Bearer ' + token,
    'wss://fixture/ws?token=' + token + '&status=failed',
    JSON.stringify({ error: token }),
  ]) {
    const redacted = sanitizedDiagnostic(input);
    assert(!redacted.includes(token), 'diagnostic must not retain a bearer token');
    assert(redacted.includes('[redacted JWT]'));
  }
}
assert.equal(sanitizedDiagnostic(repository + '/source.ts'), '[checkout]/source.ts');
assert.equal(
  sanitizedDiagnostic(path.resolve(repository, '..') + '/temp/fixture'),
  '[fixture]/temp/fixture',
);
assert.equal(sanitizedDiagnostic('HTTP 403: identity denied'), 'HTTP 403: identity denied');
console.log(
  'Native diagnostic JWTs, URL/JSON delimiters and private roots redacted; ordinary errors retained.',
);
