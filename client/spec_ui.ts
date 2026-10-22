import { legacyHtml } from './eta-runtime.ts';
import {
  renderSpecUiViewFragment001,
  renderSpecUiViewFragment002,
  renderSpecUiSpecialistsHtmlFragment003,
  renderSpecUiSpecialistsHtmlFragment004,
  renderSpecUiSpecialistsHtmlFragment005,
  renderSpecUiSpecialistsHtmlFragment006,
  renderSpecUiSpecialistsHtmlFragment007,
  renderSpecUiSpecialistsHtmlFragment008,
  renderSpecUiSpecialistsHtmlFragment009,
  renderSpecUiSpecialistsHtmlFragment010,
  renderSpecUiSpecialistsHtmlFragment011,
  renderSpecUiSpecialistsHtmlFragment012,
  renderSpecUiSpecialistsHtmlFragment013,
  renderSpecUiSpecialistsHtmlFragment014,
  renderSpecUiSpecialistsHtmlFragment015,
  renderSpecUiSpecialistsHtmlFragment016,
  renderSpecUiSpecialistsHtmlFragment017,
  renderSpecUiSpecialistsHtmlFragment018,
  renderSpecUiSpecialistsHtmlFragment019,
  renderSpecUiSpecialistsHtmlFragment020,
  renderSpecUiSpecialistsHtmlFragment021,
  renderSpecUiSpecialistsHtmlFragment022,
  renderSpecUiSpecialistsHtmlFragment023,
  renderSpecUiSpecialistsHtmlFragment024,
  renderSpecUiSpecialistsHtmlFragment025,
} from './eta-templates.ts';
import type { ClientGameState } from './main.ts';
export type SpecialistComponent = {
  /** Display name of component */
  name: string;
  /** Stat bonuses */
  bonus: Record<string, number>;
};
export type SpecialistDef = {
  /** Unique hull identifier */
  id: string;

  /** Ship name */
  name: string;

  /** Ship subtitle / designation */
  sub: string;

  /** Ship role identifier */
  role: string;

  /** Unique specialist resource key */
  res: string;

  /** Description of special ability */
  ability: string;

  /** Primary gameplay loop description */
  loop: string;

  /** Credit cost to build */
  cost: number;
};
export type SpecialistProgress = {
  /** Current specialist tier (1..5) */
  tier: number;
  /** Current component upgrade levels */
  comp: Record<string, number>;
  /** Timestamp when tier-up in drydock completes */
  upT?: number;
};

import { artworkUrl } from './artwork.ts';
// Quantum Rift: interface: the Specialists section of the station (blueprints, building, parts, components, tier-ups).
import { GRADES } from '../shared/galaxy.ts';
import {
  SPECIALISTS,
  SPEC,
  SPEC_RES,
  BP_NEED,
  BUILD,
  PART_RATE,
  COMPONENTS,
  TIER_MAX,
  COMP_COST,
  TIER_UP_MIN,
  specPower,
  specialistResource,
  DREDGE_COMPONENT_NAMES,
} from '../shared/specialty.ts';
import { ROLES_INFO } from '../shared/roles.ts';
import { credits } from '../shared/rules.ts';

/**
 * Formats duration in milliseconds to a human-readable minutes and hours string.
 * @param milliseconds Duration in milliseconds
 * @returns Formatted duration (e.g. '15m' or '2h 10m')
 */
const minutes = (milliseconds: number): string => {
  const message = Math.max(0, Math.ceil(milliseconds / 60000));
  return message >= 60 ? `${Math.floor(message / 60)}h ${message % 60}m` : `${message}m`;
};

/**
 * Formats a specialist resource icon, amount, and name with faction color.
 * @param entryKey Resource identifier
 * @param count Resource quantity
 * @returns HTML markup
 */
const response = (entryKey: string, count: number): string =>
  renderSpecUiViewFragment001({
    SPEC_RES: legacyHtml(SPEC_RES[entryKey].color),
    entryKey: legacyHtml(
      entryKey === 'plasma' ? renderSpecUiViewFragment002() : SPEC_RES[entryKey].icon,
    ),
    count: legacyHtml(count),
    SPEC_RES2: SPEC_RES[entryKey].name,
  });

/**
 * Renders the full Specialists screen at the Personal Station or docked view.
 * @param clientGameState Game state object
 * @param interactive Whether interactive buttons are enabled
 * @returns HTML markup
 */
export function specialistsHtml(clientGameState: ClientGameState, interactive?: boolean): string {
  const playerPayload = clientGameState.you!,
    blueprint = playerPayload.bp || {},
    _unusedSpecialist = playerPayload.spec || {},
    parts = playerPayload.parts || {},
    sessionState = playerPayload.specState || {},
    specialistShip = SPEC[playerPayload.ship.hull];
  let height = renderSpecUiSpecialistsHtmlFragment003({
    SPECIALISTSLength: legacyHtml(SPECIALISTS.length),
    PART_RATE: legacyHtml(PART_RATE),
    TIER_MAX: legacyHtml(TIER_MAX),
  });
  if (specialistShip) {
    // the specialist you are flying
    const savedSpecialist = sessionState[specialistShip.id] || { tier: 1, comp: {} },
      specPower2 = specPower(savedSpecialist),
      cost = COMP_COST(savedSpecialist.tier),
      full = Object.keys(COMPONENTS).every(
        (component) => (savedSpecialist.comp[component] || 0) >= savedSpecialist.tier,
      );
    height += renderSpecUiSpecialistsHtmlFragment004({
      artworkUrl: legacyHtml(artworkUrl(clientGameState.A!.ships[specialistShip.id].img!)),
      specialistShipName: specialistShip.name,
      specialistShipSub: specialistShip.sub,
      ROLES_INFO: legacyHtml(ROLES_INFO[specialistShip.role].color),
      ROLES_INFO2: legacyHtml(ROLES_INFO[specialistShip.role].icon),
      ROLES_INFO3: legacyHtml(ROLES_INFO[specialistShip.role].name),
      repeat: legacyHtml('★'.repeat(savedSpecialist.tier)),
      repeat2: legacyHtml('☆'.repeat(TIER_MAX - savedSpecialist.tier)),
      savedSpecialistTier: legacyHtml(savedSpecialist.tier),
      MathRound: legacyHtml(Math.round(specPower2 * 100)),
      specialistShipAbility: specialistShip.ability,
      response: legacyHtml(
        response(specialistShip.res, specialistResource(playerPayload, specialistShip)),
      ),
      specialistShipKey: legacyHtml(
        specialistShip.key === 'star_dredge' ? renderSpecUiSpecialistsHtmlFragment005() : '',
      ),
      parts: legacyHtml(parts[specialistShip.id] || 0),
      interactive: legacyHtml(
        interactive && specialistResource(playerPayload, specialistShip) >= PART_RATE
          ? renderSpecUiSpecialistsHtmlFragment006({
              specialistShipId: legacyHtml(specialistShip.id),
              MathFloor: legacyHtml(
                Math.floor(specialistResource(playerPayload, specialistShip) / PART_RATE),
              ),
            })
          : '',
      ),
    });
    if (savedSpecialist.upT && savedSpecialist.upT > Date.now())
      height += renderSpecUiSpecialistsHtmlFragment007({
        savedSpecialistTier: legacyHtml(savedSpecialist.tier + 1),
        minutes: legacyHtml(minutes(savedSpecialist.upT - Date.now())),
      });
    else {
      height +=
        renderSpecUiSpecialistsHtmlFragment008() +
        Object.entries(COMPONENTS)
          .map(([component, specialistComponent]) => {
            const level = savedSpecialist.comp[component] || 0,
              allowed = level < savedSpecialist.tier;
            return renderSpecUiSpecialistsHtmlFragment009({
              specialistShipKey: legacyHtml(
                specialistShip.key === 'star_dredge'
                  ? DREDGE_COMPONENT_NAMES[component]
                  : specialistComponent.name,
              ),
              level: legacyHtml(level),
              savedSpecialistTier: legacyHtml(savedSpecialist.tier),
              ObjectEntries: legacyHtml(
                Object.entries(specialistComponent.bonus)
                  .map(([entryKey, value]) =>
                    entryKey === 'ability'
                      ? specialistShip.key === 'star_dredge'
                        ? '−1% active heat demand (cap20%; no output/rate gain)'
                        : `+${value}% specialty`
                      : `+${value}% ${entryKey.replace('Pct', '')}`,
                  )
                  .join(', '),
              ),
              allowed: legacyHtml(
                allowed
                  ? interactive
                    ? renderSpecUiSpecialistsHtmlFragment010({
                        component: legacyHtml(component),
                        costParts: legacyHtml(cost.parts),
                        credits: legacyHtml(credits(cost.credits)),
                      })
                    : renderSpecUiSpecialistsHtmlFragment011({ costParts: legacyHtml(cost.parts) })
                  : renderSpecUiSpecialistsHtmlFragment012(),
              ),
            });
          })
          .join('') +
        renderSpecUiSpecialistsHtmlFragment013();
      if (savedSpecialist.tier < TIER_MAX)
        height += full
          ? interactive
            ? renderSpecUiSpecialistsHtmlFragment014({
                savedSpecialistTier: legacyHtml(savedSpecialist.tier + 1),
                TIER_UP_MIN: legacyHtml(TIER_UP_MIN[savedSpecialist.tier]),
              })
            : renderSpecUiSpecialistsHtmlFragment015({
                savedSpecialistTier: legacyHtml(savedSpecialist.tier + 1),
              })
          : renderSpecUiSpecialistsHtmlFragment016({
              savedSpecialistTier: legacyHtml(savedSpecialist.tier + 1),
            });
    }
    height += renderSpecUiSpecialistsHtmlFragment017();
  }
  height +=
    renderSpecUiSpecialistsHtmlFragment018() +
    SPECIALISTS.map((specialistShip) => {
      const count = blueprint[specialistShip.id] || 0,
        roleInfo = ROLES_INFO[specialistShip.role],
        savedSpecialist = sessionState[specialistShip.id];
      const button = interactive
        ? playerPayload.station.ops < BUILD.ops
          ? renderSpecUiSpecialistsHtmlFragment019({ BUILDOps: legacyHtml(BUILD.ops) })
          : count >= BP_NEED
            ? renderSpecUiSpecialistsHtmlFragment020({
                specialistShipId: legacyHtml(specialistShip.id),
                credits: legacyHtml(credits(specialistShip.cost)),
              })
            : ''
        : '';
      return renderSpecUiSpecialistsHtmlFragment021({
        artworkUrl: legacyHtml(artworkUrl(clientGameState.A!.ships[specialistShip.id].img!)),
        specialistShipName: specialistShip.name,
        roleInfoColor: legacyHtml(roleInfo.color),
        roleInfoIcon: legacyHtml(roleInfo.icon),
        roleInfoName: legacyHtml(roleInfo.name),
        savedSpecialist: legacyHtml(
          savedSpecialist
            ? renderSpecUiSpecialistsHtmlFragment022({
                savedSpecialistTier: legacyHtml(savedSpecialist.tier),
              })
            : '',
        ),
        specialistShipSub: specialistShip.sub,
        specialistShipAbility: specialistShip.ability,
        specialistShipLoop: specialistShip.loop,
        specialistShipKey: legacyHtml(
          specialistShip.key === 'star_dredge' ? renderSpecUiSpecialistsHtmlFragment023() : '',
        ),
        MathMin: legacyHtml(Math.min(count, BP_NEED)),
        BP_NEED: legacyHtml(BP_NEED),
        response: legacyHtml(
          response(specialistShip.res, specialistResource(playerPayload, specialistShip)),
        ),
        parts: legacyHtml(parts[specialistShip.id] || 0),
        MathMin2: legacyHtml(Math.min(100, (100 * count) / BP_NEED)),
        button: legacyHtml(button),
      });
    }).join('') +
    renderSpecUiSpecialistsHtmlFragment024();
  if (interactive)
    height += renderSpecUiSpecialistsHtmlFragment025({
      BUILDMatsMap: legacyHtml(
        BUILD.mats
          .map(([message, game, count]) => `${count} ${message} ${GRADES[game]}`)
          .join(', '),
      ),
    });
  return height;
}
