import gsap from 'gsap';
import type { HudSnapshot, TimePreset } from '../types';
import type { SpiderManGame } from './SpiderManGame';

const SPIDER_EMBLEM_SVG = `
<svg class="title-lockup-svg" viewBox="0 0 540 164" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spider-Man 3D: Web of New York">
  <!-- Geometric Spider Crest Emblem -->
  <g transform="translate(8, 12)">
    <polygon points="56,4 106,32 106,96 56,124 6,96 6,32" fill="#b91c1c" stroke="#f8fafc" stroke-width="3.5"/>
    <polygon points="56,14 97,37 97,91 56,114 15,91 15,37" fill="#0f172a" fill-opacity="0.35"/>
    <!-- Subtle geometric web lines inside crest -->
    <path d="M56 14 V114 M15 37 L97 91 M97 37 L15 91" stroke="#f8fafc" stroke-opacity="0.24" stroke-width="1.5"/>
    <!-- Crisp Spider Silhouette -->
    <ellipse cx="56" cy="52" rx="6.5" ry="8" fill="#0b0f19"/>
    <path d="M56 58 C67 62 65 82 56 96 C47 82 45 62 56 58 Z" fill="#0b0f19"/>
    <path d="M51 52 L34 38 L24 22 M61 52 L78 38 L88 22
             M49 58 L28 52 L17 48 M63 58 L84 52 L95 48
             M49 64 L27 72 L18 88 M63 64 L85 72 L94 88
             M51 70 L36 86 L31 105 M61 70 L76 86 L81 105"
          stroke="#f8fafc" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <!-- Angular Hero Typography -->
  <text x="132" y="76" font-family="'Barlow Condensed', Impact, sans-serif" font-weight="800" font-style="italic" font-size="68" letter-spacing="1.5" fill="#f8fafc" stroke="#090d16" stroke-width="6" paint-order="stroke fill">SPIDER-MAN</text>
  <rect x="134" y="92" width="388" height="4" fill="#ef4444"/>
  <text x="134" y="128" font-family="'Barlow Condensed', Impact, sans-serif" font-weight="700" font-size="31" letter-spacing="6.5" fill="#e2e8f0" stroke="#090d16" stroke-width="4" paint-order="stroke fill">WEB OF NEW YORK</text>
</svg>
`;

const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
const ICON_WEATHER = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
const ICON_TIME = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const ICON_CAM = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`;
const ICON_TOUCH = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;

export class GameHudController {
  private readonly root: HTMLElement;
  private readonly game: SpiderManGame;
  private lastGameState = '';
  private trailingHp = 100;

  // Cached DOM references (mutated directly, zero reconciliation jank)
  private titleOverlay!: HTMLElement;
  private playHud!: HTMLElement;
  private pauseModal!: HTMLElement;
  private gameOverModal!: HTMLElement;
  private touchLayer!: HTMLElement;

  private hpFill!: HTMLElement;
  private hpTrail!: HTMLElement;
  private hpText!: HTMLElement;
  private webFill!: HTMLElement;
  private speedValue!: HTMLElement;
  private altitudeValue!: HTMLElement;
  private scoreValue!: HTMLElement;
  private crimesValue!: HTMLElement;
  private comboCluster!: HTMLElement;
  private comboNum!: HTMLElement;
  private counterTag!: HTMLElement;
  private missionTitle!: HTMLElement;
  private missionMeta!: HTMLElement;
  private missionArrow!: HTMLElement;
  private bannerEl!: HTMLElement;
  private bannerTitleEl!: HTMLElement;
  private bannerSubEl!: HTMLElement;
  private vignetteEl!: HTMLElement;
  private crosshairEl!: HTMLElement;
  private anchorReticleEl!: HTMLElement;
  private enemyBarsLayer!: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private weatherBtn!: HTMLButtonElement;
  private timeBtn!: HTMLButtonElement;
  private camBtn!: HTMLButtonElement;
  private touchBtn!: HTMLButtonElement;

  private goTitle!: HTMLElement;
  private goSub!: HTMLElement;
  private goScore!: HTMLElement;
  private goCrimes!: HTMLElement;
  private goMaxSpeed!: HTMLElement;
  private goMaxCombo!: HTMLElement;

  constructor(root: HTMLElement, game: SpiderManGame) {
    this.root = root;
    this.game = game;
    this.renderShell();
    this.bindEvents();
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <!-- TITLE SCREEN -->
      <section class="screen-overlay title-screen" id="title-overlay" aria-label="Title Screen">
        <div class="title-left-column">
          <div class="title-emblem-wrap">${SPIDER_EMBLEM_SVG}</div>
          <div class="title-actions">
            <button type="button" class="btn-hero-start" data-start="true" id="btn-start-game">
              SWING INTO MANHATTAN
            </button>
            <div class="title-presets" role="group" aria-label="Skyline Time Preset">
              <button type="button" class="btn-preset active" data-time="day">Midday</button>
              <button type="button" class="btn-preset" data-time="sunset">Golden Hour</button>
              <button type="button" class="btn-preset" data-time="night">Midnight</button>
              <button type="button" class="btn-preset" id="btn-title-rain">Rain: Off</button>
            </div>
          </div>
        </div>
        <div class="title-controls-hint" aria-label="Controls Summary">
          WASD Move · Space Jump · Hold LMB Web-Swing · RMB Aim · E Web Zip · F Attack · Q Dodge · C Camera · Esc Pause
        </div>
      </section>

      <!-- ACTIVE GAMEPLAY HUD (>= 85% unobstructed center playfield) -->
      <section class="hud-layer hidden" id="play-hud" aria-label="Gameplay HUD">
        <div class="danger-vignette" id="danger-vignette"></div>

        <!-- Center Aim Crosshair -->
        <div class="center-crosshair" id="center-crosshair" aria-hidden="true">
          <svg viewBox="0 0 36 36" width="36" height="36" fill="none">
            <circle cx="18" cy="18" r="10" stroke="#f8fafc" stroke-width="1.6" stroke-opacity="0.78"/>
            <line x1="18" y1="2" x2="18" y2="9" stroke="#ef4444" stroke-width="2"/>
            <line x1="18" y1="27" x2="18" y2="34" stroke="#ef4444" stroke-width="2"/>
            <line x1="2" y1="18" x2="9" y2="18" stroke="#ef4444" stroke-width="2"/>
            <line x1="27" y1="18" x2="34" y2="18" stroke="#ef4444" stroke-width="2"/>
            <circle cx="18" cy="18" r="2" fill="#f8fafc"/>
          </svg>
        </div>

        <!-- Dynamic Web Anchor Reticle (projected onto target skyscraper) -->
        <div class="anchor-reticle hidden" id="anchor-reticle" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30" fill="none">
            <polygon points="16,2 30,16 16,30 2,16" stroke="#f8fafc" stroke-width="2" fill="rgba(239,68,68,0.18)"/>
            <circle cx="16" cy="16" r="3" fill="#ef4444"/>
          </svg>
        </div>

        <!-- Projected World Enemy Health Bars -->
        <div class="enemy-bars-layer" id="enemy-bars-layer"></div>

        <!-- Top-Left: Vitality, Web Fluid & Mission Tracker -->
        <div class="hud-top-left">
          <div class="vitality-cluster">
            <div class="vitality-header">
              <span class="kicker">SUIT INTEGRITY</span>
              <span class="hp-readout tabular-nums" id="hud-hp-text">100</span>
            </div>
            <div class="bar-track hp-track">
              <div class="bar-trail" id="hud-hp-trail" style="width:100%"></div>
              <div class="bar-fill hp-fill" id="hud-hp-fill" style="width:100%"></div>
            </div>
            <div class="bar-track web-track">
              <div class="bar-fill web-fill" id="hud-web-fill" style="width:100%"></div>
            </div>
          </div>

          <div class="mission-cluster" id="hud-mission-box">
            <div class="mission-compass" id="hud-mission-arrow" aria-hidden="true">▲</div>
            <div class="mission-info">
              <div class="mission-title" id="hud-mission-title">MIDTOWN ARMORED HEIST</div>
              <div class="mission-meta tabular-nums" id="hud-mission-meta">52m · 3 Hostiles</div>
            </div>
          </div>
        </div>

        <!-- Top-Right: Score, Crimes Counter & Utility Icon Bar -->
        <div class="hud-top-right">
          <div class="score-cluster">
            <div class="stat-pair">
              <span class="kicker">CRIMES</span>
              <span class="hero-num tabular-nums" id="hud-crimes">0/4</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-pair">
              <span class="kicker">SCORE</span>
              <span class="hero-num tabular-nums" id="hud-score">0</span>
            </div>
          </div>

          <div class="utility-bar" data-ui-interactive="true">
            <button type="button" class="icon-btn" id="btn-hud-time" tabindex="-1" aria-label="Cycle Time of Day" title="Cycle Time [T]">${ICON_TIME}</button>
            <button type="button" class="icon-btn" id="btn-hud-weather" tabindex="-1" aria-label="Toggle Rain Weather" title="Toggle Rain [R]">${ICON_WEATHER}</button>
            <button type="button" class="icon-btn" id="btn-hud-camera" tabindex="-1" aria-label="Change Camera Mode" title="Camera [C]">${ICON_CAM}</button>
            <button type="button" class="icon-btn" id="btn-hud-touch" tabindex="-1" aria-label="Toggle Mobile Touch Controls" title="Touch Controls">${ICON_TOUCH}</button>
            <button type="button" class="icon-btn" id="btn-hud-mute" tabindex="-1" aria-label="Toggle Audio Mute" title="Mute [M]">${ICON_SOUND_ON}</button>
            <button type="button" class="icon-btn" id="btn-hud-pause" tabindex="-1" aria-label="Pause Game" title="Pause [Esc]">${ICON_PAUSE}</button>
          </div>
        </div>

        <!-- Dynamic Event Banner (Top-Center, non-blocking) -->
        <div class="event-banner hidden" id="hud-banner" role="status" aria-live="polite">
          <div class="banner-title" id="hud-banner-title"></div>
          <div class="banner-sub" id="hud-banner-sub"></div>
        </div>

        <!-- Bottom-Left: Combo & Counter Readout (visible during combat) -->
        <div class="combo-cluster hidden" id="hud-combo-cluster">
          <div class="combo-num tabular-nums" id="hud-combo-num">0x</div>
          <div class="kicker">COMBO</div>
          <div class="counter-tag hidden" id="hud-counter-tag">COUNTER READY!</div>
        </div>

        <!-- Bottom-Right: Speedometer & Altitude -->
        <div class="hud-bottom-right">
          <div class="telemetry-pair">
            <span class="telemetry-num tabular-nums" id="hud-speed">0</span>
            <span class="kicker">KM/H</span>
          </div>
          <div class="stat-divider"></div>
          <div class="telemetry-pair">
            <span class="telemetry-num tabular-nums" id="hud-alt">0</span>
            <span class="kicker">ALT M</span>
          </div>
        </div>

        <!-- Optional Mobile Touch Controls -->
        <div class="touch-layer hidden" id="touch-layer" data-ui-interactive="true">
          <div class="touch-pad" id="touch-joystick" aria-label="Movement Joystick">
            <div class="touch-knob" id="touch-knob"></div>
          </div>
          <div class="touch-actions">
            <button type="button" class="touch-btn touch-swing" id="touch-btn-swing">SWING</button>
            <button type="button" class="touch-btn" id="touch-btn-jump">JUMP</button>
            <button type="button" class="touch-btn" id="touch-btn-zip">ZIP</button>
            <button type="button" class="touch-btn touch-attack" id="touch-btn-attack">ATTACK</button>
            <button type="button" class="touch-btn" id="touch-btn-dodge">DODGE</button>
          </div>
        </div>
      </section>

      <!-- PAUSE MODAL -->
      <section class="modal-backdrop hidden" id="pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-heading">
        <div class="modal-card">
          <h2 id="pause-heading" class="modal-title">PATROL PAUSED</h2>
          <p class="modal-subtitle">Midtown Scanner Standing By</p>
          <div class="modal-controls-grid">
            <div><kbd>WASD</kbd> Move</div>
            <div><kbd>SPACE</kbd> Jump / Release</div>
            <div><kbd>LMB</kbd> Hold Web-Swing</div>
            <div><kbd>RMB</kbd> Precision Aim</div>
            <div><kbd>E</kbd> Web Zip</div>
            <div><kbd>F</kbd> Web / Melee Attack</div>
            <div><kbd>Q</kbd> Dodge / Counter</div>
            <div><kbd>C</kbd> Camera · <kbd>T</kbd> Time · <kbd>R</kbd> Rain</div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-primary" id="btn-resume">RESUME PATROL</button>
            <button type="button" class="btn-secondary" id="btn-restart-pause">RESTART</button>
            <button type="button" class="btn-secondary" id="btn-title-pause">MAIN MENU</button>
          </div>
        </div>
      </section>

      <!-- VICTORY / GAME OVER MODAL -->
      <section class="modal-backdrop hidden" id="gameover-modal" role="dialog" aria-modal="true" aria-labelledby="gameover-heading">
        <div class="modal-card">
          <h2 id="gameover-heading" class="modal-title">MANHATTAN SECURED</h2>
          <p class="modal-subtitle" id="gameover-sub">All street crimes neutralized across the city.</p>
          <div class="modal-stats-row">
            <div class="modal-stat-tile">
              <span class="kicker">SCORE</span>
              <span class="modal-stat-val tabular-nums" id="go-score">0</span>
            </div>
            <div class="modal-stat-tile">
              <span class="kicker">CRIMES</span>
              <span class="modal-stat-val tabular-nums" id="go-crimes">0/4</span>
            </div>
            <div class="modal-stat-tile">
              <span class="kicker">TOP SPEED</span>
              <span class="modal-stat-val tabular-nums" id="go-speed">0</span>
            </div>
            <div class="modal-stat-tile">
              <span class="kicker">MAX COMBO</span>
              <span class="modal-stat-val tabular-nums" id="go-combo">0x</span>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-primary" data-start="true" id="btn-play-again">PATROL AGAIN</button>
            <button type="button" class="btn-secondary" id="btn-title-gameover">MAIN MENU</button>
          </div>
        </div>
      </section>
    `;

    this.titleOverlay = this.root.querySelector('#title-overlay')!;
    this.playHud = this.root.querySelector('#play-hud')!;
    this.pauseModal = this.root.querySelector('#pause-modal')!;
    this.gameOverModal = this.root.querySelector('#gameover-modal')!;
    this.touchLayer = this.root.querySelector('#touch-layer')!;

    this.hpFill = this.root.querySelector('#hud-hp-fill')!;
    this.hpTrail = this.root.querySelector('#hud-hp-trail')!;
    this.hpText = this.root.querySelector('#hud-hp-text')!;
    this.webFill = this.root.querySelector('#hud-web-fill')!;
    this.speedValue = this.root.querySelector('#hud-speed')!;
    this.altitudeValue = this.root.querySelector('#hud-alt')!;
    this.scoreValue = this.root.querySelector('#hud-score')!;
    this.crimesValue = this.root.querySelector('#hud-crimes')!;
    this.comboCluster = this.root.querySelector('#hud-combo-cluster')!;
    this.comboNum = this.root.querySelector('#hud-combo-num')!;
    this.counterTag = this.root.querySelector('#hud-counter-tag')!;
    this.missionTitle = this.root.querySelector('#hud-mission-title')!;
    this.missionMeta = this.root.querySelector('#hud-mission-meta')!;
    this.missionArrow = this.root.querySelector('#hud-mission-arrow')!;
    this.bannerEl = this.root.querySelector('#hud-banner')!;
    this.bannerTitleEl = this.root.querySelector('#hud-banner-title')!;
    this.bannerSubEl = this.root.querySelector('#hud-banner-sub')!;
    this.vignetteEl = this.root.querySelector('#danger-vignette')!;
    this.crosshairEl = this.root.querySelector('#center-crosshair')!;
    this.anchorReticleEl = this.root.querySelector('#anchor-reticle')!;
    this.enemyBarsLayer = this.root.querySelector('#enemy-bars-layer')!;

    this.muteBtn = this.root.querySelector('#btn-hud-mute')!;
    this.weatherBtn = this.root.querySelector('#btn-hud-weather')!;
    this.timeBtn = this.root.querySelector('#btn-hud-time')!;
    this.camBtn = this.root.querySelector('#btn-hud-camera')!;
    this.touchBtn = this.root.querySelector('#btn-hud-touch')!;

    this.goTitle = this.root.querySelector('#gameover-heading')!;
    this.goSub = this.root.querySelector('#gameover-sub')!;
    this.goScore = this.root.querySelector('#go-score')!;
    this.goCrimes = this.root.querySelector('#go-crimes')!;
    this.goMaxSpeed = this.root.querySelector('#go-speed')!;
    this.goMaxCombo = this.root.querySelector('#go-combo')!;
  }

  private bindEvents(): void {
    const startBtn = this.root.querySelector('#btn-start-game') as HTMLButtonElement;
    startBtn.addEventListener('click', () => this.game.startGame());

    // Title screen time & rain preset buttons
    const timeBtns = this.root.querySelectorAll<HTMLButtonElement>('.btn-preset[data-time]');
    timeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.time as TimePreset;
        this.game.setTimePreset(preset);
        timeBtns.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    const rainTitleBtn = this.root.querySelector('#btn-title-rain') as HTMLButtonElement;
    rainTitleBtn.addEventListener('click', () => {
      this.game.toggleWeather();
    });

    // HUD utility bar
    this.timeBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.game.cycleTimePreset();
    });
    this.weatherBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.game.toggleWeather();
    });
    this.camBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.game.cycleCameraMode();
    });
    this.touchBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.game.toggleTouchControls();
    });
    this.muteBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.game.toggleMute();
    });
    this.root.querySelector('#btn-hud-pause')!.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.game.pauseGame();
    });

    // Pause modal
    this.root.querySelector('#btn-resume')!.addEventListener('click', () => this.game.resumeGame());
    this.root
      .querySelector('#btn-restart-pause')!
      .addEventListener('click', () => this.game.restartGame());
    this.root
      .querySelector('#btn-title-pause')!
      .addEventListener('click', () => this.game.returnToTitle());

    // Game over / Victory modal
    this.root
      .querySelector('#btn-play-again')!
      .addEventListener('click', () => this.game.restartGame());
    this.root
      .querySelector('#btn-title-gameover')!
      .addEventListener('click', () => this.game.returnToTitle());

    // Optional Mobile Touch Controls
    this.bindTouchControls();
  }

  private bindTouchControls(): void {
    const pad = this.root.querySelector('#touch-joystick') as HTMLElement;
    const knob = this.root.querySelector('#touch-knob') as HTMLElement;
    let activeTouchId: number | null = null;

    const updateStick = (clientX: number, clientY: number) => {
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const maxR = rect.width * 0.4;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > maxR) {
        dx = (dx / d) * maxR;
        dy = (dy / d) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.game.touchInput.moveX = dx / maxR;
      this.game.touchInput.moveY = -dy / maxR;
      this.game.touchInput.sprintHeld = d > maxR * 0.78;
    };

    const resetStick = () => {
      activeTouchId = null;
      knob.style.transform = 'translate(0px, 0px)';
      this.game.touchInput.moveX = 0;
      this.game.touchInput.moveY = 0;
      this.game.touchInput.sprintHeld = false;
    };

    pad.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      activeTouchId = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      updateStick(e.clientX, e.clientY);
    });
    pad.addEventListener('pointermove', (e) => {
      if (activeTouchId !== e.pointerId) return;
      updateStick(e.clientX, e.clientY);
    });
    pad.addEventListener('pointerup', resetStick);
    pad.addEventListener('pointercancel', resetStick);

    const swingBtn = this.root.querySelector('#touch-btn-swing') as HTMLButtonElement;
    swingBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.touchInput.swingHeld = true;
    });
    const endSwing = () => {
      this.game.touchInput.swingHeld = false;
    };
    swingBtn.addEventListener('pointerup', endSwing);
    swingBtn.addEventListener('pointercancel', endSwing);

    this.root.querySelector('#touch-btn-jump')!.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.triggerTouchAction('jump');
    });
    this.root.querySelector('#touch-btn-zip')!.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.triggerTouchAction('zip');
    });
    this.root.querySelector('#touch-btn-attack')!.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.triggerTouchAction('attack');
    });
    this.root.querySelector('#touch-btn-dodge')!.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.triggerTouchAction('dodge');
    });
  }

  public update(snap: HudSnapshot): void {
    // State transitions with smooth GSAP entrance
    if (snap.gameState !== this.lastGameState) {
      this.lastGameState = snap.gameState;
      this.titleOverlay.classList.toggle('hidden', snap.gameState !== 'title');
      this.playHud.classList.toggle('hidden', snap.gameState !== 'playing');
      this.pauseModal.classList.toggle('hidden', snap.gameState !== 'paused');
      this.gameOverModal.classList.toggle('hidden', snap.gameState !== 'gameover');

      if (snap.gameState === 'paused') {
        const card = this.pauseModal.querySelector('.modal-card');
        if (card) gsap.fromTo(card, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: 'power2.out' });
      } else if (snap.gameState === 'gameover') {
        const card = this.gameOverModal.querySelector('.modal-card');
        if (card) gsap.fromTo(card, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.24, ease: 'power2.out' });
      }
    }

    // Update Title screen weather label if visible
    if (snap.gameState === 'title') {
      const rainBtn = this.root.querySelector('#btn-title-rain') as HTMLButtonElement | null;
      if (rainBtn) {
        rainBtn.textContent = snap.weather === 'rain' ? 'Rain: On' : 'Rain: Off';
        rainBtn.classList.toggle('active', snap.weather === 'rain');
      }
      return;
    }

    // Update Victory / Game Over modal numbers
    if (snap.gameState === 'gameover') {
      this.goTitle.textContent = snap.victory ? 'MANHATTAN SECURED' : 'SUIT COMPROMISED';
      this.goSub.textContent = snap.victory
        ? 'Every street crime neutralized. New York is safe tonight.'
        : 'Regroup on the skyline and jump back into the action.';
      this.goScore.textContent = `${snap.score}`;
      this.goCrimes.textContent = `${snap.crimesStopped}/${snap.totalCrimesGoal}`;
      this.goMaxSpeed.textContent = `${snap.maxSpeedKmh} KM/H`;
      this.goMaxCombo.textContent = `${snap.maxCombo}x`;
      return;
    }

    // Vitality bar + delayed trailing damage ghost bar
    const hpPct = Math.max(0, Math.min(100, (snap.hp / snap.maxHp) * 100));
    this.trailingHp += (hpPct - this.trailingHp) * 0.16;
    if (hpPct > this.trailingHp) this.trailingHp = hpPct;
    this.hpFill.style.width = `${hpPct}%`;
    this.hpTrail.style.width = `${this.trailingHp}%`;
    this.hpText.textContent = `${snap.hp}`;
    this.webFill.style.width = `${Math.max(0, Math.min(100, (snap.webFluid / snap.maxWebFluid) * 100))}%`;

    // Telemetry
    this.speedValue.textContent = `${snap.speedKmh}`;
    this.altitudeValue.textContent = `${snap.altitudeM}`;
    this.scoreValue.textContent = `${snap.score}`;
    this.crimesValue.textContent = `${snap.crimesStopped}/${snap.totalCrimesGoal}`;

    // Combo & Perfect Counter badge
    const showCombo = snap.comboCount >= 2 || snap.counterReady;
    this.comboCluster.classList.toggle('hidden', !showCombo);
    this.comboNum.textContent = `${snap.comboCount}x`;
    this.counterTag.classList.toggle('hidden', !snap.counterReady);

    // Mission compass & live distance
    if (snap.mission) {
      this.missionTitle.textContent = snap.mission.title;
      this.missionMeta.textContent = `${snap.missionDistanceM}m · ${snap.mission.enemiesRemaining} Hostile${snap.mission.enemiesRemaining === 1 ? '' : 's'}`;
      this.missionArrow.style.transform = `rotate(${Math.round(snap.missionBearingDeg)}deg)`;
    }

    // Dynamic event banner
    this.bannerEl.classList.toggle('hidden', !snap.bannerVisible);
    if (snap.bannerVisible) {
      this.bannerTitleEl.textContent = snap.bannerText;
      this.bannerSubEl.textContent = snap.bannerSubtext;
    }

    // Spider-Sense / Low-HP peripheral vignette
    const lowHp = snap.hp <= 30;
    this.vignetteEl.classList.toggle('sense-active', snap.spiderSense);
    this.vignetteEl.classList.toggle('low-hp', lowHp);

    // Center crosshair (crisp when aiming, subtle otherwise)
    this.crosshairEl.classList.toggle('aiming', snap.aiming);

    // Projected Web Anchor Reticle
    const showAnchor = snap.anchorAvailable && snap.anchorOnScreen;
    this.anchorReticleEl.classList.toggle('hidden', !showAnchor);
    if (showAnchor) {
      this.anchorReticleEl.style.left = `${(snap.anchorScreenX * 100).toFixed(2)}%`;
      this.anchorReticleEl.style.top = `${(snap.anchorScreenY * 100).toFixed(2)}%`;
      this.anchorReticleEl.classList.toggle('attached', snap.swinging);
    }

    // Projected Enemy Health Bars
    let barsHtml = '';
    for (const e of snap.enemiesProjected) {
      if (!e.visible) continue;
      const pct = Math.max(0, Math.min(100, Math.round(e.hpRatio * 100)));
      const badge = e.webbed ? 'WEBBED' : e.telegraphing ? '!' : e.archetype.toUpperCase();
      barsHtml += `
        <div class="enemy-hp-tag ${e.webbed ? 'is-webbed' : ''} ${e.telegraphing ? 'is-telegraph' : ''}"
             style="left:${(e.screenX * 100).toFixed(1)}%;top:${(e.screenY * 100).toFixed(1)}%">
          <span class="enemy-hp-label">${badge}</span>
          <div class="enemy-hp-track"><div class="enemy-hp-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }
    this.enemyBarsLayer.innerHTML = barsHtml;

    // Utility button active states
    this.muteBtn.innerHTML = snap.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    this.weatherBtn.classList.toggle('active', snap.weather === 'rain');
    this.touchBtn.classList.toggle('active', snap.touchControlsEnabled);
    this.touchLayer.classList.toggle('hidden', !snap.touchControlsEnabled);
  }
}
