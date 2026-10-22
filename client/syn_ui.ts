import { legacyHtml } from './eta-runtime.ts';
import {
  renderSynUiSynBadgeFragment001,
  renderSynUiBlackMarketHtmlFragment002,
  renderSynUiBlackMarketHtmlFragment003,
  renderSynUiBlackMarketHtmlFragment004,
  renderSynUiBlackMarketHtmlFragment005,
  renderSynUiBankHtmlFragment006,
  renderSynUiBankHtmlFragment007,
  renderSynUiBankHtmlFragment008,
  renderSynUiBankHtmlFragment009,
  renderSynUiRankLineFragment010,
  renderSynUiRankLineFragment011,
  renderSynUiRankLineFragment012,
  renderSynUiLowerDeckHtmlFragment013,
  renderSynUiLowerDeckHtmlFragment014,
  renderSynUiLowerDeckHtmlFragment015,
  renderSynUiLowerDeckHtmlFragment016,
  renderSynUiLowerDeckHtmlFragment017,
  renderSynUiLowerDeckHtmlFragment018,
  renderSynUiLowerDeckHtmlFragment019,
  renderSynUiLowerDeckHtmlFragment020,
  renderSynUiArcCardsHtmlFragment021,
  renderSynUiArcCardsHtmlFragment022,
  renderSynUiArcCardsHtmlFragment023,
} from './eta-templates.ts';
import type { PlayerPayload as PlayerData } from './main.ts';
import type { ClientGameState } from './main.ts';
export type SyndicateStanding = {
  /** Tier name */
  name: string;
  /** Current reputation points */
  pts: number;
  /** Tier index */
  i: number;
  /** Points required for next tier */
  next?: number;
};
export type BlackMarketItem = {
  /** Unique item key */
  id: string;

  /** Display item name */
  name: string;

  /** Description */
  desc: string;

  /** Price in credits */
  price: number;

  /** Requirement text if locked */
  locked?: string;
};
export type BankState = {
  /** Current player credit score */
  credit?: number;
  /** Interest rate per cycle */
  rate: number;
  /** Billing interval in minutes */
  period: number;
  /** Maximum loan capacity */
  max: number;
  /** Estimated periodic payment */
  pay: number;
};
export type Officer = {
  /** Officer unique ID */
  id: number | string;

  /** Officer name */
  name: string;

  /** Promotion rank index */
  rank?: number;

  /** Current level */
  lv: number;

  /** Acquired trait keys */
  traits?: string[];
};
export type ArcCard = {
  /** Faction identifier */
  fac: string;
  /** Arc name */
  arc: string;
  /** Arc headline */
  title: string;
  /** Narrative summary */
  brief: string;
  /** Lock condition text */
  locked?: string;
};
export type PassengerMissionOffer = {
  /** Mission type */
  type?: string;
  /** Number of passengers to carry */
  pax?: number;
};

// Screens: black market, bank, officer ranks and traits, lower decks, and faction-arc cards.
import { occupiedPassengerSeats } from '../shared/passengers.ts';
import { FACTIONS } from '../shared/galaxy.ts';
import { RANKS_OFF, PROMOTE, TRAITS, LOWER_DECK, LOWER_SLOTS, bunks } from '../shared/syndicate.ts';

/**
 * Formats a number to rounded, localized string.
 * @param count Input number
 */
const credits2 = (count: number): string => Math.round(count).toLocaleString();

/**
 * Renders the Syndicate standing badge showing current rank and points progress.
 * @param positionY Player state object
 * @returns HTML markup
 */
export function synBadge(playerPayload: PlayerData): string {
  const syndicateTierInfo = playerPayload.syn || { name: 'Unknown', pts: 0, i: 0 };
  return renderSynUiSynBadgeFragment001({
    syndicateTierInfoName: syndicateTierInfo.name,
    credits2: legacyHtml(credits2(syndicateTierInfo.pts)),
    syndicateTierInfoNext: legacyHtml(
      syndicateTierInfo.next ? ` / ${credits2(syndicateTierInfo.next)}` : '',
    ),
  });
}

/**
 * Renders the Black Market screen at a Syndicate-affiliated spaceport.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function blackMarketHtml(clientGameState: ClientGameState): string {
  const blackmarket2 = clientGameState.landed!.blackmarket,
    playerPayload = clientGameState.you!;
  if (!blackmarket2) return '';
  return renderSynUiBlackMarketHtmlFragment002({
    synBadge: legacyHtml(synBadge(playerPayload)),
    playerPayloadShards: legacyHtml(playerPayload.shards || 0),
    blackmarket2Items: legacyHtml(
      blackmarket2.items
        .map((positionX) =>
          renderSynUiBlackMarketHtmlFragment003({
            positionXLocked: legacyHtml(positionX.locked ? 'locked' : ''),
            positionXName: positionX.name,
            positionXDesc: positionX.desc,
            credits2: legacyHtml(credits2(positionX.price)),
            positionXLocked2: legacyHtml(
              positionX.locked
                ? renderSynUiBlackMarketHtmlFragment004({ positionXLocked: positionX.locked })
                : renderSynUiBlackMarketHtmlFragment005({
                    positionXId: legacyHtml(positionX.id),
                    playerPayloadCredits: legacyHtml(
                      playerPayload.credits < positionX.price
                        ? ' disabled title="Not enough credits"'
                        : '',
                    ),
                  }),
            ),
          }),
        )
        .join(''),
    ),
  });
}

/**
 * Renders the Bank of the Rift loan and repayment screen.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function bankHtml(clientGameState: ClientGameState): string {
  const bank2 = clientGameState.landed!.bank,
    playerPayload = clientGameState.you!;
  if (!bank2) return '';
  const balance = playerPayload.loan ? playerPayload.loan.bal : 0,
    minutes = playerPayload.loan
      ? Math.max(0, Math.ceil((playerPayload.loan.next - Date.now()) / 60000))
      : 0,
    room = Math.max(0, bank2.max - balance);
  return renderSynUiBankHtmlFragment006({
    playerPayloadCredit: legacyHtml(playerPayload.credit || bank2.credit),
    bank2Rate: legacyHtml((bank2.rate * 100).toFixed(2)),
    bank2Period: legacyHtml(bank2.period),
    credits2: legacyHtml(credits2(bank2.max)),
    bank2Period2: legacyHtml(bank2.period),
    balance: legacyHtml(
      balance
        ? renderSynUiBankHtmlFragment007({
            credits2: legacyHtml(credits2(balance)),
            credits22: legacyHtml(credits2(bank2.pay)),
            minutes: legacyHtml(minutes),
          })
        : renderSynUiBankHtmlFragment008(),
    ),
    MathMin: legacyHtml(Math.min(room, 50000)),
    room: legacyHtml(room < 1000 ? ' disabled' : ''),
    balance2: legacyHtml(balance ? renderSynUiBankHtmlFragment009() : ''),
  });
}

// officer rank, traits and the promote button (added to each officer card in the CREW tab)

/**
 * Renders the rank, traits badges, and promotion button for an officer card.
 * @param clientGameState Game state object
 * @param officer Officer instance
 * @param interactive Whether promotion button is active
 * @returns HTML markup
 */
export function rankLine(
  clientGameState: ClientGameState,
  officer: Officer,
  interactive?: boolean,
): string {
  const radius = officer.rank || 0,
    officerPromotionCost = PROMOTE[radius + 1],
    playerPayload = clientGameState.you!;
  const traits = (officer.traits || [])
    .map((time) =>
      TRAITS[time]
        ? renderSynUiRankLineFragment010({
            ObjectEntries: Object.entries(TRAITS[time].bonus)
              .map(([entryKey, value]) => `${entryKey} +${value}`)
              .join(', '),
            TRAITS: TRAITS[time].name,
          })
        : '',
    )
    .join('');
  const button =
    interactive &&
    officerPromotionCost &&
    typeof officer.id !== 'undefined' &&
    playerPayload.officers.some((officerRecord) => officerRecord.id === officer.id)
      ? renderSynUiRankLineFragment011({
          officerId: officer.id,
          officerLv: legacyHtml(
            officer.lv < officerPromotionCost.lv ||
              (playerPayload.shards || 0) < officerPromotionCost.shards ||
              playerPayload.credits < officerPromotionCost.credits
              ? ` disabled title="Needs level ${officerPromotionCost.lv}, ${officerPromotionCost.shards} commendations and ${credits2(officerPromotionCost.credits)} credits"`
              : '',
          ),
        })
      : '';
  return renderSynUiRankLineFragment012({
    RANKS_OFF: legacyHtml(RANKS_OFF[radius]),
    traits: legacyHtml(traits),
    button: legacyHtml(button),
  });
}

/**
 * Renders the Lower Deck berths section with passive crew assignment and hiring.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function lowerDeckHtml(clientGameState: ClientGameState): string {
  const playerPayload = clientGameState.you!,
    length = playerPayload.lower || [],
    docked = !!clientGameState.landed;
  let height = renderSynUiLowerDeckHtmlFragment013();
  for (let index = 0; index < LOWER_SLOTS; index++) {
    const length22 = length[index],
      component = length22 && LOWER_DECK[length22];
    height += renderSynUiLowerDeckHtmlFragment014({
      component: legacyHtml(
        component
          ? renderSynUiLowerDeckHtmlFragment015({
              componentName: component.name,
              componentDesc: component.desc,
              index: legacyHtml(index),
            })
          : renderSynUiLowerDeckHtmlFragment016({
              docked: legacyHtml(
                docked
                  ? renderSynUiLowerDeckHtmlFragment017({
                      index: legacyHtml(index),
                      ObjectEntries: legacyHtml(
                        Object.entries(LOWER_DECK)
                          .filter(([entryKey]) => !length.includes(entryKey))
                          .map(([entryKey, lowerDeckRole]) =>
                            renderSynUiLowerDeckHtmlFragment018({
                              entryKey: legacyHtml(entryKey),
                              lowerDeckRoleName: lowerDeckRole.name,
                              lowerDeckRoleDesc: lowerDeckRole.desc,
                              credits2: legacyHtml(credits2(lowerDeckRole.cost)),
                            }),
                          )
                          .join(''),
                      ),
                      index2: legacyHtml(index),
                    })
                  : renderSynUiLowerDeckHtmlFragment019(),
              ),
            }),
      ),
    });
  }
  return (
    height +
    renderSynUiLowerDeckHtmlFragment020({
      playerPayloadShards: legacyHtml(playerPayload.shards || 0),
    })
  );
}

/**
 * Renders faction arc cards available at the current landing location.
 * @param clientGameState Game state object
 * @returns HTML markup
 */
export function arcCardsHtml(clientGameState: ClientGameState): string {
  const length2 = clientGameState.landed!;
  if (!length2 || !length2.arcs || !length2.arcs.length) return '';
  return length2.arcs
    .map((options) =>
      renderSynUiArcCardsHtmlFragment021({
        FACTIONS: FACTIONS[options.fac].name.toUpperCase(),
        optionsArc: options.arc,
        optionsTitle: options.title,
        optionsBrief: options.brief,
        optionsLocked: legacyHtml(
          options.locked
            ? renderSynUiArcCardsHtmlFragment022({ optionsLocked: options.locked })
            : renderSynUiArcCardsHtmlFragment023({ optionsFac: legacyHtml(options.fac) }),
        ),
      }),
    )
    .join('');
}

/**
 * Computes bunk availability warning for passenger missions.
 * @param clientGameState Game state object
 * @param passengerMissionOffer Mission offer data
 * @returns Warning text if insufficient bunks, else empty string
 */
export function bunkInfo(
  clientGameState: ClientGameState,
  passengerMissionOffer: PassengerMissionOffer,
): string {
  if (passengerMissionOffer.type !== 'passenger') return '';
  const playerPayload = clientGameState.you!,
    bunks2 = bunks(clientGameState.A!.ships[playerPayload.ship.hull], playerPayload.ship),
    used = occupiedPassengerSeats(playerPayload.missions);
  return passengerMissionOffer.pax! > bunks2 - used
    ? `Needs ${passengerMissionOffer.pax} passenger seats; your ship has ${Math.max(0, bunks2 - used)} free.`
    : '';
}
