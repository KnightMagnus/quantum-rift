# Authored content validation

Run the offline content check from a source checkout:

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
The registered unit regression runs the shipped catalogs and verifies positive
and negative fixtures, including command-line failure reporting.

## Missions, prerequisites and dialogue

The check uses the composed main story, side stories and contact-chain templates
used by the authoritative services. It rejects duplicate or empty IDs, missing
main/side prerequisite references and cyclic side-story prerequisites. Shared
prerequisites are valid. Main-story progression follows array order, so it has
no authored prerequisite graph to traverse.

Main-story offers, destinations, return ports, systems, hulls, allied hulls and
factions must resolve. Side-story starting ports and step systems, destinations,
commodities, hulls and factions must resolve too. An explicit step destination
must belong to its stated system. Contact templates use the supported relative
locators `W`, `A` and `B`; `any` remains a valid contact kind. The validator
checks supported mission types, nonempty required dialogue, objectives and
choice labels, positive optional objective quantities and finite nonnegative
rewards. Material rewards require known materials and valid grade indices;
radio and officer rewards must name known entries.

Decisions require a flag and choices, with unique values. A side-story choice
prerequisite must reference an authored decision and one of its legal values.
Decision completion text can be empty when the server supplies it. Dialogue is
inline text, not a node/link graph: there are no general dialogue `goto` edges
to validate. Narrative locations and choice references are checked, but free-text
placeholders, localization, dynamic server-generated dialogue and the playability
of every combination of saved choices are not.

The helper in `tools/narrative-content-validation.ts` reports source files and
catalog indices without logging dialogue or rewards. Fixture diagnostics use
synthetic content. Keep actual content errors in contributor logs; a source key
can itself reveal a story detail and does not belong in public release notes.

## Fitting policy and limits

Mount accounting follows `makeLoadout` and `shipStats`: stock weapons with an
outfit consume its gun or turret mount; built-in weapons without an outfit do
not. NPC-only hulls retain the existing stock-mount exception, but must still
reference known weapons and valid files. Omitted stock ammo remains valid.

The validator accepts the game's typed, composed catalogs; it is not an arbitrary
JSON schema or a gameplay balance check. It does not validate generated mission
offers or player saves. Ship artwork is checked for safe local paths and file
existence, not image decoding or sprite geometry. Existing artwork/browser
regressions cover decoded ship sheets.

Other asset families have explicit limits: planet, station, decor, effect,
portrait, interface and audio/radio file references are not inventoried by this
command. Radio reward IDs are checked, but their track URLs and audio decoding
are not. Those families include renderer-selected and generated paths; a passing
content check is not proof that every visible or audible asset loads. The
rendering and audio regressions remain separate checks.
