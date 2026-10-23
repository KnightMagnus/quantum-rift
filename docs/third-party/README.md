# Native online third-party notices

## Nakama runtime declarations

`server/nakama-runtime.d.ts` is an unchanged copy of Heroic Labs'
[nakama-common v1.48.0 runtime declarations](https://github.com/heroiclabs/nakama-common/blob/v1.48.0/index.d.ts).
Its copyright header is retained. The SHA-256 of the vendored file is
`aa3d4530d5bab768cad720aa1907a10571fc4ef4e587fce463d3e74305edb0cf`.
The Apache-2.0 license is reproduced in [nakama-runtime-LICENSE](nakama-runtime-LICENSE).
Formatting excludes this upstream file to preserve its bytes; application files
remain subject to the normal gates. The declaration version does not change the
supported Nakama server boundary of 3.41.0.

## Nakama JavaScript SDK

`@heroiclabs/nakama-js` 2.8.0 is distributed under Apache-2.0. The browser
transport bundle includes this SDK locally. Its npm metadata identifies upstream
commit `625e5b99b097a31806829ac595b9101273f4d384`; the exact upstream license
is copied to [nakama-js-LICENSE](nakama-js-LICENSE).

## Noble hashes

`@noble/hashes` 2.4.0 supplies SHA-256 and the independent legacy scrypt verifier.
Its MIT license and copyright notice are copied unchanged from the installed
package to [noble-hashes-LICENSE](noble-hashes-LICENSE).

Retain these notices when redistributing the corresponding source or bundled
runtime. Dependency packages retain their own licenses and notices; this page
covers the native-online additions, not a replacement for their metadata.
