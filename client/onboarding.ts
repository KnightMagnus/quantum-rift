import { overlays } from './overlay-controller.ts';
import { escapeHtml } from './html.ts';

/** Presentation callbacks; onboarding never sends gameplay actions. */
interface OnboardingOptions {
  /** Current captain identity, scoped to this browser and mode. */
  captain: () => string | null;
  /** Display the actual saved binding for a gameplay action. */
  key: (action: string) => string;
  /** Reveal the sidebar before the tour takes input ownership. */
  revealSidebar: () => void;
  /** Select an existing sidebar tab through its UI owner. */
  selectTab: (tab: string) => void;
  /** Preserve the captain's sidebar tab across a replay. */
  currentTab: () => string;
  /** Restore ordinary landing/story/tutorial presentation. */
  finished: () => void;
}

/** A single spotlight on the existing interface, not a cloned control. */
interface TourStep {
  /** Selector of the actual control being described. */
  target: string;
  /** Short player-facing heading. */
  title: string;
  /** One feature explanation. */
  text: string;
  /** Existing sidebar panel to reveal without clicking a gameplay action. */
  tab?: string;
}

const tourSteps: TourStep[] = [
  {
    target: '#radarwrap',
    title: 'System Map',
    text: 'The system map shows the planetary bodies, stations, and ships in your current star system.',
  },
  {
    target: '#status',
    title: 'Ship Status',
    text: 'This panel shows your shields, armor, fuel, credits, and current ship.',
  },
  {
    target: '#target',
    title: 'Target Details',
    text: 'This panel shows the selected ship’s name, distance, shields, and armor. Selecting a ship does not fire your weapons.',
  },
  {
    target: '#nav',
    title: 'Navigation And Secondary Weapons',
    text: 'NAV shows your destination. SEC shows your equipped secondary weapons.',
  },
  {
    target: '[data-tab="radio"]',
    title: 'Rift Radio',
    text: 'The RADIO tab lets you choose a radio station. More stations become available as you explore.',
    tab: 'radio',
  },
  {
    target: '[data-tab="codex"]',
    title: 'Codex',
    text: 'The CODEX tab contains information about ships, equipment, factions, and discovered locations.',
    tab: 'codex',
  },
  {
    target: '[data-tab="missions"]',
    title: 'Missions',
    text: 'The MISSIONS tab lists your accepted jobs and their objectives.',
    tab: 'missions',
  },
  {
    target: '[data-tab="station"]',
    title: 'Personal Station',
    text: 'The STATION tab lets you manage your personal station. You can claim an abandoned station and upgrade it.',
    tab: 'station',
  },
  {
    target: '[data-tab="ops"]',
    title: 'Bulletin',
    text: 'The BULLETIN tab shows public reports and activity across the galaxy.',
    tab: 'ops',
  },
  {
    target: '[data-tab="captains"]',
    title: 'Allies',
    text: 'The ALLIES tab contains your friends, messages, trading, duels, and Armada.',
    tab: 'captains',
  },
  {
    target: '[data-tab="log"]',
    title: 'Log',
    text: 'The LOG tab records game events and messages.',
    tab: 'log',
  },
  {
    target: '#traytoggle',
    title: 'Sidebar',
    text: 'The TRAY button opens and closes the sidebar, which contains the system map and menu tabs.',
  },
  {
    target: '#cbhelp',
    title: 'Help',
    text: 'The HELP menu shows your current controls and lets you replay this introduction.',
  },
  {
    target: '#optbtn',
    title: 'Settings',
    text: 'The SETTINGS menu lets you change display, sound, and control settings, including key bindings.',
  },
  {
    target: '#cbvol',
    title: 'Volume',
    text: 'This button opens the volume slider and mute control.',
  },
  {
    target: '#chatexpand',
    title: 'Chat History',
    text: 'The EXPAND button shows your chat history above the console. Select it again to return to the compact view.',
  },
  {
    target: '#chatin',
    title: 'Chat Input',
    text: 'Enter a message here to chat with other players online. In Solo, this adds a note to your log.',
  },
  {
    target: '[data-ch="armada"]',
    title: 'Armada Chat',
    text: 'The ARMADA channel sends messages to your Armada.',
  },
  {
    target: '[data-ch="sys"]',
    title: 'System Chat',
    text: 'The SYSTEM channel sends messages to players in your current star system.',
  },
  {
    target: '[data-ch=""]',
    title: 'Galaxy Chat',
    text: 'The ALL channel sends messages to players across the galaxy.',
  },
  {
    target: '#captainshortcut',
    title: 'Captain',
    text: 'CAPTAIN opens your profile, career, wingmates, and captain listings.',
  },
  {
    target: '#hailindicator',
    title: 'Hails',
    text: 'The HAIL button opens incoming and archived hails. To contact a selected ship, use its target actions when available.',
  },
  {
    target: '#fleetindicator',
    title: 'Fleet Orders',
    text: 'The FLEET button opens formation and wing orders when you have ships or drones to command.',
  },
  {
    target: '#combatindicator',
    title: 'Combat Assist',
    text: 'The COMBAT button opens combat-assist controls.',
  },
  {
    target: '#dronesindicator',
    title: 'Drone Controls',
    text: 'The DRONES button opens launch and recall controls when your ship has a fitted drone bay.',
  },
  {
    target: '#attentionindicator',
    title: 'Alert Indicator',
    text: 'The ALERT indicator turns red when you are being targeted and orange after a recent scan.',
  },
  {
    target: '#miningindicator',
    title: 'Mining Controls',
    text: 'The MINING button opens mining controls when the required equipment is fitted. It is disabled otherwise.',
  },
  {
    target: '#industrialindicator',
    title: 'Dredge Refining',
    text: 'The REFINE button opens refining controls when you are flying a Dredge.',
  },
  {
    target: '#towingindicator',
    title: 'Towing',
    text: 'The TOW button opens towing controls when your ship has a suitable rig or a tow available.',
  },
  {
    target: '#cbmap',
    title: 'Galaxy Map',
    text: 'The MAP button opens the galaxy map, where you can select a destination for jump travel.',
  },
  {
    target: '#ejectshortcut',
    title: 'Eject',
    text: 'EJECT opens the quit menu, just like Escape. You can cancel to keep playing.',
  },
  {
    target: '#shipshortcut',
    title: 'Ship Details',
    text: 'INFO shows your ship, cargo, and fitted equipment.',
  },
  {
    target: '#jumpholo',
    title: 'Jump',
    text: 'The JUMP button starts travel along your plotted route. It is available when you are in flight, have enough fuel, and can jump.',
  },
];

/** A markup anchored to the corresponding subject in a real capture. */
interface ImageAnnotation {
  /** Short explanation of the marked subject. */
  label: string;
  /** Horizontal location as a percentage of the uniform image frame. */
  x: number;
  /** Vertical location as a percentage of the uniform image frame. */
  y: number;
  /** Optional vertical label offset in pixels from the marker’s top edge. */
  labelY?: number;
  /** Optional horizontal label offset in pixels from the marker’s center. */
  labelX?: number;
}

/** Uniform slide frame; each image is a real local-game capture. */
interface BriefingSlide {
  /** Section label above the title. */
  chapter: string;
  /** Slide heading. */
  title: string;
  /** Short spoiler-free explanation. */
  text: string;
  /** Screenshot filename within the onboarding image directory. */
  image: string;
  /** Factual image caption. */
  caption: string;
  /** Optional author disclosure, kept separate from gameplay instructions. */
  disclosure?: string;
  /** Optional author signature. */
  signature?: string;
  /** Live key-binding rows, or numbered pointer/button instructions. */
  controls?: Array<[string, string]>;
  /** Image focus labels with normalized locations and optional label displacement. */
  annotations?: ImageAnnotation[];
}

export function createOnboarding(options: OnboardingOptions) {
  let owner: string | null = null;
  let active = false;
  let stage: 'tour' | 'briefing' = 'tour';
  let index = 0;
  let savedTab = 'missions';
  let layoutFrame = 0;
  let visibleTourSteps: TourStep[] = [];
  const root = document.createElement('section');
  root.id = 'onboarding';
  root.className = 'overlay hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'onboarding-title');
  document.body.append(root);
  const storageKey = () => 'rift.onboarding.v1.' + options.captain();
  const slides = (): BriefingSlide[] => [
    {
      chapter: '01 / Station',
      title: 'Welcome to the Rift',
      text: 'You are a new Captain fresh out of the Quantum Station Flight School, a Quantum Concord megastructure in a region of space known only as “The Rift” to its human inhabitants. Three hundred years ago, Earth’s people watched its skies change in an instant, and they were now inhabitants of a densely populated area of folded space. To this day, the perpetrators of this mass-teleportation are unknown.',
      image: 'station.webp',
      caption: 'Quantum Station, Concordia',
    },
    {
      chapter: '02 / Activities',
      title: 'Activities',
      text: 'Captains can take full advantage of the galaxy in whatever playstyle they choose. You can trade cargo, take jobs, hunt pirates, explore the Rift, recruit a crew, and claim a personal station to call home. In online mode, you can form Armadas with your friends, Duel, or face off for real in The Crucible.',
      image: 'jobs.webp',
      caption: 'Landed Menu',
    },
    {
      chapter: '03 / Flying',
      title: 'Flight Controls',
      text: 'Select DEPART to leave a station. Use thrust to increase speed and turn to change direction. Reverse thrust does not stop your ship immediately. Full stop uses autopilot to slow your ship down.',
      image: 'flight.webp',
      caption: 'Space-lanes of Concordia',
      controls: [
        ['thrust', 'Thrust'],
        ['left', 'Turn left'],
        ['right', 'Turn right'],
        ['rev', 'Reverse thrust'],
        ['stop', 'Full stop'],
        ['ab', 'Boost'],
      ],
    },
    {
      chapter: '04 / Combat',
      title: 'Targeting and weapons',
      text: 'Click a ship or use the targeting controls to select it. The target panel shows its distance, shields, and armor. Hold primary fire to shoot. Secondary fire uses your equipped secondary weapon. Your own shields and armor appear in the ship status panel.',
      image: 'combat.webp',
      caption: 'Ship combat',
      controls: [
        ['target', 'Next target'],
        ['nearest', 'Nearest hostile'],
        ['fire1', 'Primary fire (hold)'],
        ['fire2', 'Secondary fire'],
      ],
      annotations: [
        { label: 'Selected hostile', x: 50, y: 28, labelY: 3, labelX: 110 },
        { label: 'Primary fire', x: 50, y: 53, labelY: 3, labelX: 100 },
      ],
    },
    {
      chapter: '05 / Mining',
      title: 'Mining',
      text: 'Fit mining equipment and scan nearby asteroids for seams. Aim the mining beam at a seam and hold fire to cut it. When READY appears, release fire at 60–80 heat for better-quality material. Collect the released resources while you have cargo space.',
      image: 'mining.webp',
      caption: 'Asteroid mining',
      controls: [
        ['surveyPulse', 'Scan nearby asteroids'],
        ['miningPanel', 'Open mining controls'],
        ['fire1', 'Hold beam / Release when READY'],
      ],
      annotations: [
        { label: 'Selected asteroid', x: 25.6, y: 50, labelY: -72 },
        { label: 'Mining beam', x: 38, y: 50, labelY: 42 },
      ],
    },
    {
      chapter: '06 / Landing',
      title: 'Landing and Departure',
      text: 'Double-click a landable planet or station to approach and land. You can also select it and use Land. Autopilot handles the approach and braking. Steer to take control of your ship. Select DEPART to leave.',
      image: 'landing.webp',
      caption: "Landing at a planet's spacedock",
      controls: [['land', 'Approach and land']],
      annotations: [{ label: 'Landable destination', x: 26, y: 83, labelY: -65 }],
    },
    {
      chapter: '07 / Jumping',
      title: 'Jump Travel',
      text: 'Open MAP and select a neighbouring system. Check your fuel, close the map, and use the jump control or JUMP button. Autopilot moves your ship clear of nearby bodies before jumping.',
      image: 'jump.webp',
      caption: 'Warp-Jumping into the unknown',
      controls: [
        ['map', 'Open galaxy map'],
        ['jump', 'Initiate jump'],
      ],
    },
    {
      chapter: '08 / Stations',
      title: 'Personal Stations',
      text: 'You can claim an abandoned station hull and upgrade it. The STATION tab contains your personal station controls.',
      image: 'station-hull.webp',
      caption: 'Abandoned Station Hull',
    },
    {
      chapter: '09 / Exploration',
      title: 'Exploration',
      text: 'Visit other star systems to discover new locations. The CODEX tab contains information about the places you discover.',
      image: 'map.webp',
      caption: 'MAP',
    },
    {
      chapter: '10 / Explore',
      title: 'Explore the Rift!',
      text: "There's plenty more to do in the Rift, but I'd rather you discover it for yourself! That's what has drawn me to space games ever since I played Escape Velocity Nova as a kid, and its why this game exists today.",
      image: 'station.webp',
      caption: 'Quantum Station, Concordia',
      disclosure:
        'AI Transparency: AI was used for coding (Claude Opus 5.5, ChatGPT Sol), and generative AI was used for Captain Portraits (ChatGPT Sol) and in-game Music (SUNO), of which I am the rightsholder.',
      signature: '- MAGNUS',
    },
  ];
  function finish() {
    if (!active) return;
    try {
      localStorage.setItem(storageKey(), 'complete');
    } catch {}
    active = false;
    cancelAnimationFrame(layoutFrame);
    document.body.classList.remove('onboarding-active');
    overlays.close('onboarding');
    options.selectTab(savedTab);
    options.finished();
  }
  function advance() {
    if (stage === 'tour' && index === visibleTourSteps.length - 1) {
      stage = 'briefing';
      index = 0;
    } else if (stage === 'briefing' && index === slides().length - 1) {
      finish();
      return;
    } else index++;
    render();
  }
  function skip() {
    if (stage === 'tour') {
      stage = 'briefing';
      index = 0;
      render();
    } else finish();
  }
  function back() {
    if (index > 0) {
      index--;
      render();
    }
  }
  function layout() {
    if (!active || stage !== 'tour') return;
    const step = visibleTourSteps[index];
    const target = document.querySelector<HTMLElement>(step.target);
    const card = root.querySelector<HTMLElement>('.intro-callout')!;
    const spot = root.querySelector<HTMLElement>('.intro-spot')!;
    const arrow = root.querySelector<SVGPathElement>('.intro-arrow > path')!;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const padding = 7;
    const left = Math.max(6, rect.left - padding),
      top = Math.max(6, rect.top - padding);
    const right = Math.min(innerWidth - 6, rect.right + padding),
      bottom = Math.min(innerHeight - 6, rect.bottom + padding);
    Object.assign(spot.style, {
      left: left + 'px',
      top: top + 'px',
      width: Math.max(0, right - left) + 'px',
      height: Math.max(0, bottom - top) + 'px',
    });
    const preferredWidth = Math.min(430, innerWidth - 32);
    const besideWidth = Math.min(preferredWidth, left - 56);
    card.style.width =
      (besideWidth >= 250 && innerWidth < 1100 ? besideWidth : preferredWidth) + 'px';
    const width = card.offsetWidth,
      height = card.offsetHeight;
    let cardX: number, cardY: number, startX: number, startY: number, endX: number, endY: number;
    if (left >= width + 40) {
      cardX = Math.max(16, left - width - Math.min(90, left - width - 16));
      cardY = Math.max(24, Math.min(innerHeight - height - 24, (top + bottom - height) / 2));
      startX = cardX + width + 9;
      startY = cardY + height / 2;
      endX = left - 10;
      endY = (top + bottom) / 2;
    } else {
      cardX = Math.max(16, Math.min(innerWidth - width - 16, (left + right - width) / 2));
      const above = top >= height + 90;
      cardY = Math.max(
        16,
        above ? top - height - 70 : Math.min(innerHeight - height - 16, bottom + 70),
      );
      startX = Math.max(cardX + 25, Math.min(cardX + width - 25, (left + right) / 2));
      startY = above ? cardY + height + 9 : cardY - 9;
      endX = (left + right) / 2;
      endY = above ? top - 10 : bottom + 10;
    }
    Object.assign(card.style, { left: cardX + 'px', top: cardY + 'px' });
    arrow.setAttribute(
      'd',
      `M ${startX} ${startY} Q ${(startX + endX) / 2} ${startY} ${endX} ${endY}`,
    );
    layoutFrame = requestAnimationFrame(layout);
  }
  function render() {
    cancelAnimationFrame(layoutFrame);
    root.dataset.stage = stage;
    root.dataset.tourTarget = stage === 'tour' ? visibleTourSteps[index].target : '';
    if (stage === 'tour') {
      const step = visibleTourSteps[index];
      if (step.tab) options.selectTab(step.tab);
      root.innerHTML = `<div class="intro-spot" aria-hidden="true"></div><svg class="intro-arrow" aria-hidden="true"><defs><marker id="intro-arrowhead" markerWidth="12" markerHeight="12" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#f3cd76"/></marker></defs><path fill="none" stroke="#f3cd76" stroke-width="3" marker-end="url(#intro-arrowhead)"/></svg><div class="intro-callout"><div class="intro-eyebrow">CAPTAIN’S ORIENTATION <span>${String(index + 1).padStart(2, '0')} / ${visibleTourSteps.length}</span></div><h2 id="onboarding-title">${escapeHtml(step.title)}</h2><p>${escapeHtml(step.text)}</p><div class="intro-progress" aria-hidden="true"><i style="width:${((index + 1) / visibleTourSteps.length) * 100}%"></i></div><div class="intro-actions"><button data-intro="skip" class="intro-skip">Skip menu tour</button><div><button data-intro="back" ${index === 0 ? 'disabled' : ''}>Back</button><button data-intro="next" class="intro-next">${index === visibleTourSteps.length - 1 ? 'Continue' : 'Next'} <span aria-hidden="true">→</span></button></div></div></div>`;
      layout();
    } else {
      const slide = slides()[index];
      root.innerHTML = `<div class="intro-deck"><header><div class="intro-brand">QR</div><div><b>CAPTAIN’S BRIEFING</b></div><span class="intro-deck-count">${String(index + 1).padStart(2, '0')} <i>/</i> ${String(slides().length).padStart(2, '0')}</span></header><div class="intro-deck-main"><figure><div class="intro-image"><img src="assets/onboarding/${slide.image}" alt="${escapeHtml(slide.caption)}"/>${slide.annotations?.map((annotation) => `<div class="intro-annotation" style="left:${annotation.x}%;top:${annotation.y}%;${annotation.labelY === undefined ? '' : `--label-y:${annotation.labelY}px;`}${annotation.labelX === undefined ? '' : `--label-x:${annotation.labelX}px;`}"><i></i><span>${escapeHtml(annotation.label)}</span></div>`).join('') || ''}</div><figcaption><span class="intro-live-dot"></span>${escapeHtml(slide.caption)}</figcaption></figure><article><div class="intro-eyebrow">${slide.chapter}</div><h2 id="onboarding-title">${slide.title}</h2><p>${escapeHtml(slide.text)}</p>${slide.disclosure ? `<p class="intro-disclosure">${escapeHtml(slide.disclosure)}</p>` : ''}${slide.signature ? `<div class="intro-signature">${escapeHtml(slide.signature)}</div>` : ''}${slide.controls ? `<div class="intro-bindings">${slide.controls.map(([action, label]) => `<div><kbd>${escapeHtml(options.key(action))}</kbd><span>${escapeHtml(label)}</span></div>`).join('')}</div><small>These are your current key bindings. Change them in SETTINGS.</small>` : ''}</article></div><footer><button data-intro="skip" class="intro-skip">Skip introduction</button><div class="intro-dots" aria-label="Slide ${index + 1} of ${slides().length}">${slides()
        .map(
          (_, number) =>
            `<i class="${number === index ? 'current' : number < index ? 'seen' : ''}"></i>`,
        )
        .join(
          '',
        )}</div><div><button data-intro="back" ${index === 0 ? 'disabled' : ''}>Back</button><button data-intro="next" class="intro-next">${index === slides().length - 1 ? 'Finish' : 'Next'} <span aria-hidden="true">→</span></button></div></footer></div>`;
    }
    root.querySelector<HTMLButtonElement>('[data-intro="next"]')!.onclick = advance;
    root.querySelector<HTMLButtonElement>('[data-intro="skip"]')!.onclick = skip;
    root.querySelector<HTMLButtonElement>('[data-intro="back"]')!.onclick = back;
    root.querySelector<HTMLElement>('[data-intro="next"]')!.focus({ preventScroll: true });
  }
  function start(replay = false) {
    const captain = options.captain();
    if (!captain || active || (!replay && owner === captain)) return;
    owner = captain;
    if (!replay) {
      try {
        if (localStorage.getItem(storageKey()) === 'complete') return;
      } catch {}
    }
    savedTab = options.currentTab();
    options.revealSidebar();
    document.body.classList.add('onboarding-active');
    visibleTourSteps = tourSteps.filter((step) => {
      const target = document.querySelector<HTMLElement>(step.target);
      return (
        target && getComputedStyle(target).display !== 'none' && target.getClientRects().length
      );
    });
    active = true;
    stage = visibleTourSteps.length ? 'tour' : 'briefing';
    index = 0;
    document.body.classList.add('onboarding-active');
    document.getElementById('land')!.classList.add('hidden');
    document.getElementById('tut')!.classList.add('hidden');
    render();
    overlays.open('onboarding');
  }
  overlays.register({
    id: 'onboarding',
    priority: 35,
    initialFocus: () => root.querySelector('[data-intro="next"]'),
    dismiss: skip,
    keyDown(event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (!event.repeat) event.key === 'ArrowRight' ? advance() : back();
        return true;
      }
      return false;
    },
    reset() {
      active = false;
      owner = null;
      cancelAnimationFrame(layoutFrame);
      document.body.classList.remove('onboarding-active');
    },
  });
  return { start, active: () => active };
}
