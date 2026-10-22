# Original weapon refresh

Fifteen inherited weapon records now have newly authored names, tuning and descriptions. IDs, firing classes, ammunition references and sound references remain stable for existing saves and ship loadouts. No binary assets are changed. This data replacement is not a determination of rights to other project material.

Nominal DPS below is `(armor + shield damage) × 30 / reload`; it is a tuning comparison, not a combat simulation. Range uses the shared runtime conversion.

| ID  | Previous name            | Replacement      | Armor / shield | Reload ticks | Nominal DPS change |
| --- | ------------------------ | ---------------- | -------------- | ------------ | ------------------ |
| 128 | Light Blaster            | Mica Dart        | 1.4 / 4.8      | 12           | +3.3%              |
| 129 | Medium Blaster           | Cinder Driver    | 5.8 / 11.5     | 15           | +0.0%              |
| 130 | Light Blaster Turret     | Mica Sentinel    | 1.5 / 5.1      | 12           | +10.0%             |
| 131 | Medium Blaster Turret    | Cinder Sentinel  | 6.4 / 12.2     | 11           | +1.5%              |
| 132 | Heavy Blaster Turret     | Kiln Bastion     | 15.5 / 39      | 23           | -1.3%              |
| 134 | IR Missile               | Skein Pursuer    | 23 / 13        | 18           | +0.0%              |
| 143 | Fusion Pulse Cannon      | Spall Driver     | 12 / 6.6       | 23           | +7.8%              |
| 146 | Pulse Laser              | Prism Stitch     | 9.4 / 17.8     | 17           | +0.0%              |
| 156 | Fixed Railgun (100mm)    | Kestrel Needle   | 23 / 12        | 29           | +0.6%              |
| 157 | Fixed Railgun (150mm)    | Harrier Needle   | 34 / 12.8      | 29           | +0.9%              |
| 158 | Fixed Railgun (200mm)    | Osprey Needle    | 46 / 12.5      | 51           | +3.2%              |
| 161 | Storm Chaingun           | Chaffguard       | 3.8 / 2.6      | 5            | +2.4%              |
| 162 | Fusion Pulse Battery     | Spall Crown      | 19 / 10.5      | 6            | +2.4%              |
| 181 | Mining Blaster           | Seam Tapper      | 2.4 / 1.7      | 22           | -6.8%              |
| 197 | Turreted Railgun (400mm) | Breakwater Array | 157 / 47       | 112          | +1.2%              |

## Compatibility and balance boundaries

- Turret, forward-tracking, homing, beam, point-defense and mining roles retain their firing classifications. This preserves mount compatibility and existing AI behavior.
- Each replacement changes damage and cadence, plus projectile speed/lifetime/dispersion where relevant. All nominal sustained damage remains within 10% of the former nominal total to avoid silently invalidating ship progression. Armor/shield bias, accuracy and range still differ.
- Prism Stitch now has an explicit 390-unit beam range and a three-point ion effect. Chaffguard keeps its ammunition channel and point-defense behavior. Seam Tapper retains the asteroid mining multiplier through its stable weapon ID.
- Existing ammunition channels are compatibility identifiers, not imported ballistic tuning. Outfit IDs, costs and mount limits are unchanged; storefront names and descriptions now match the replacements.
- Field balance, hostile fleet matchups and human playtesting remain necessary; nominal DPS is not evidence of complete balance parity.

## Verification

Run `node test/original-weapons.ts` for mount/class, loadout/reference, save-ID, tuning progression and branding checks. Existing combat and mining regression suites verify integration.
