# Authored content validation

Run the offline ship check from a source checkout:

```sh
npm run validate:content
```

The command composes `shared/assets.json` with the same `augmentAssets` used by
the game. It checks catalog keys against positive integer hull IDs, finite
nonnegative capacities, combat/movement stats and recharge rates, integer mount
limits, stock weapon references/counts/ammo,
and player stock gun/turret fitting limits. It checks each hull's shipyard image
and the flight/glow files selected by the renderer. Artwork must use local
`ships/*.png` or `ships/*.webp` paths and resolve to files under `client/assets`.
Validation does not start a server, access saves or change the catalog.

It also checks that every `MK2_OF`, `MK3_OF` and `ARMADA_HULLS` entry in
`shared/galaxy.ts` names a hull in the composed catalog, and that every weapon
outfit names a known weapon. The CI quality job runs `npm run validate:content`
directly, so content errors fail the quality gate. Regression shards run in
parallel with that job.

To check a staged asset directory against the source catalog:

```sh
node tools/validate-content.ts --asset-root /path/to/staged/client/assets
```

Each failure names the authoring file (`shared/assets.json`, `shared/ships23.ts`,
`shared/galaxy.ts` and so on), the catalog field and the expected value or
missing file, for example
`shared/ships23.ts ships[820].weapons[0][0]: unknown weapon id 999`. Exit
status is 0 for valid content, 1 for content errors and 2 for invalid arguments.
The registered unit regression runs the shipped catalog check and verifies
positive and negative fixtures, including command-line failure reporting.

## Fitting policy and limits

Mount accounting follows `makeLoadout` and `shipStats`: stock weapons with an
outfit consume its gun or turret mount; built-in weapons without an outfit do
not. NPC-only hulls retain the existing stock-mount exception, but must still
reference known weapons and valid files. Omitted stock ammo remains valid.

The validator accepts the game's typed, composed catalog; it is not an arbitrary
JSON schema or a gameplay balance check. It does not validate mission
prerequisites, dialogue links, other asset families, image decoding or sprite
geometry. Existing artwork/browser regressions cover decoded ship sheets.
