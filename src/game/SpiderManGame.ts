import * as THREE from 'three';
import * as xb from 'xrblocks';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import type {
  AnchorPoint,
  CameraMode,
  CrimeMission,
  EnemySimState,
  GameState,
  HudSnapshot,
  PlayerSimState,
  ProjectileSim,
  TimePreset,
  Vec3,
  WeatherMode,
} from '../types';
import { createProceduralTextures, type ProceduralTextureBundle } from './textures';
import { buildManhattanCity, type CityWorld } from './cityBuilder';
import { SpiderManRig } from './spiderManModel';
import { EnemyMeshRig } from './enemyModels';
import { ParticlePool } from './particlePool';
import { SoundEngine } from './audio';
import {
  AIR_DRAG,
  GRAVITY,
  clamp,
  computeSwingReleaseVelocity,
  computeWebZipVelocity,
  findBestWebAnchor,
  resolveBuildingCollisions,
  stepSwingPendulum,
} from './swingPhysics';
import {
  COMBO_SPECS,
  CRIME_TEMPLATES,
  applyWebShotHit,
  createCrimeMission,
  createEmptyCombatEvents,
  resolvePlayerMeleeHit,
  stepEnemiesAI,
  triggerPlayerDodge,
} from './combatSystem';

// Pre-allocated scratch math helpers (zero GC inside frame loop)
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _vecD = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _handPos = new THREE.Vector3();
const _anchorVec = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _projVec = new THREE.Vector3();

const SPAWN_POS: Vec3 = { x: 0, y: 0, z: 4 };

export interface VirtualTouchInput {
  moveX: number;
  moveY: number;
  swingHeld: boolean;
  sprintHeld: boolean;
}

export class SpiderManGame extends xb.Script {
  private readonly isSoftwareGl: boolean;
  private readonly onHudUpdate: (snapshot: HudSnapshot) => void;

  private textures!: ProceduralTextureBundle;
  private city!: CityWorld;
  private hero!: SpiderManRig;
  private particles!: ParticlePool;
  public readonly sound = new SoundEngine();

  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private pmremEnvTex: THREE.Texture | null = null;

  // Dynamic Web visuals
  private webLineMesh!: THREE.Mesh;
  private webAnchorOrb!: THREE.Mesh;
  private zipLineMesh!: THREE.Mesh;
  private zipLineTimer = 0;

  // Crime Beacon visuals
  private crimeBeaconGroup = new THREE.Group();
  private crimeBeaconPillar!: THREE.Mesh;
  private crimeBeaconRing!: THREE.Mesh;

  // Rapier physics world (initialized async for dynamic world crates/props)
  private rapierWorld: RAPIER.World | null = null;
  private rapierProps: Array<{ body: RAPIER.RigidBody; mesh: THREE.Mesh }> = [];

  // Simulation state
  private gameState: GameState = 'title';
  private victory = false;
  private cameraMode: CameraMode = 'dynamic';
  private weather: WeatherMode = 'clear';
  private timeOfDay = 13.5; // Bright midday Manhattan start
  private timePreset: TimePreset = 'day';
  private autoCycleTime = true;
  private touchControlsEnabled = false;

  private player!: PlayerSimState;
  private currentMissionIndex = 0;
  private currentMission: CrimeMission | null = null;
  private enemies: EnemySimState[] = [];
  private enemyRigs = new Map<number, EnemyMeshRig>();
  private projectiles: ProjectileSim[] = [];
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private nextProjectileId = 1;
  private currentMeleeHitIds = new Set<number>();

  // Camera state
  private camYaw = 0; // 0 looks toward -Z (down Midtown Avenue toward Empire/Oscorp landmarks!)
  private camPitch = 0.22;
  private camPosCurrent = new THREE.Vector3(0, 18, 30);
  private camLookCurrent = new THREE.Vector3(0, 12, -25);
  private currentFov = 62;
  private trauma = 0;
  private hitstopTimer = 0;
  private titleTourTime = 0;
  private previewAnchor: AnchorPoint | null = null;

  // Banner notifications
  private bannerText = '';
  private bannerSubtext = '';
  private bannerTimer = 0;

  // Input Hub (continuous held vs edge-triggered justPressed)
  private keysHeld = new Set<string>();
  private keysJustPressed = new Set<string>();
  private mouseLeftHeld = false;
  private mouseLeftDownTime = 0;
  private mouseRightHeld = false;
  private mouseDragActive = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  public touchInput: VirtualTouchInput = {
    moveX: 0,
    moveY: 0,
    swingHeld: false,
    sprintHeld: false,
  };
  private hudEmitAccum = 0;
  private webShotGeo!: THREE.SphereGeometry;
  private webShotMat!: THREE.MeshStandardMaterial;
  private plasmaShotMat!: THREE.MeshStandardMaterial;

  // Bound event listeners for clean disposal
  private boundKeyDown!: (e: KeyboardEvent) => void;
  private boundKeyUp!: (e: KeyboardEvent) => void;
  private boundMouseDown!: (e: MouseEvent) => void;
  private boundMouseUp!: (e: MouseEvent) => void;
  private boundMouseMove!: (e: MouseEvent) => void;
  private boundContextMenu!: (e: MouseEvent) => void;
  private boundBlur!: () => void;
  private boundVisibility!: () => void;

  constructor(
    isSoftwareGl: boolean,
    onHudUpdate: (snapshot: HudSnapshot) => void
  ) {
    super();
    this.isSoftwareGl = isSoftwareGl;
    this.onHudUpdate = onHudUpdate;
    this.player = this.createInitialPlayerState();
  }

  private createInitialPlayerState(): PlayerSimState {
    return {
      position: { ...SPAWN_POS },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: Math.PI, // Facing -Z straight down Midtown Avenue!
      grounded: true,
      onWall: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      sprintActive: false,
      aiming: false,
      hp: 100,
      maxHp: 100,
      webFluid: 100,
      maxWebFluid: 100,
      comboCount: 0,
      comboTimer: 0,
      maxCombo: 0,
      attackPhase: 'idle',
      attackStep: 0,
      attackTimer: 0,
      dodgeTimer: 0,
      dodgeCooldown: 0,
      invulnTimer: 0,
      counterWindowTimer: 0,
      spiderSenseActive: false,
      webZipCooldown: 0,
      webZipTimer: 0,
      webZipTarget: null,
      swing: {
        active: false,
        anchor: null,
        ropeLength: 24,
        hand: 'right',
        swingTime: 0,
        peakSpeed: 0,
      },
      maxSpeedRecorded: 0,
      score: 0,
      crimesStopped: 0,
      totalCrimesGoal: CRIME_TEMPLATES.length,
      hitFlashTimer: 0,
    };
  }

  public override async init(): Promise<void> {
    const renderer = xb.core.renderer as THREE.WebGLRenderer;
    const scene = xb.core.scene;
    const camera = xb.core.camera;

    // Configure modern PBR tone mapping & color space
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    camera.fov = 62;
    camera.near = 0.25;
    camera.far = 950;
    camera.updateProjectionMatrix();

    // Mandatory studio environment map via RoomEnvironment + PMREMGenerator
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.pmremEnvTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.pmremEnvTex;
    pmrem.dispose();

    // Horizon-matched exponential fog
    scene.fog = new THREE.FogExp2(0xa7d1f2, 0.0019);

    // Warm/cool 3D outdoor lighting rig
    this.hemiLight = new THREE.HemisphereLight(0x8ec5f8, 0x525866, 1.3);
    this.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.5);
    this.sunLight.position.set(60, 110, -45);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    const d = 58;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.add(this.sunLight);
    this.add(this.sunLight.target);

    // Procedural Textures + Living Manhattan City
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.city = buildManhattanCity(this.textures, this.isSoftwareGl);
    this.add(this.city.root);

    // Hero Spider-Man Rig
    this.hero = new SpiderManRig(this.textures);
    this.add(this.hero.root);

    // Zero-GC Particle Pool
    this.particles = new ParticlePool();
    this.add(this.particles.mesh);

    // Dynamic Web Strand & Anchor Visuals
    const webMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xe2e8f0,
      emissiveIntensity: 0.35,
      roughness: 0.25,
    });
    this.webLineMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.028, 1, 6),
      webMat
    );
    this.webLineMesh.visible = false;
    this.add(this.webLineMesh);

    this.zipLineMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.032, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    this.zipLineMesh.visible = false;
    this.add(this.zipLineMesh);

    this.webAnchorOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.webAnchorOrb.visible = false;
    this.add(this.webAnchorOrb);

    // Shared projectile geometry/materials
    this.webShotGeo = new THREE.SphereGeometry(0.22, 8, 8);
    this.webShotMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe2e8f0,
      emissiveIntensity: 0.55,
      roughness: 0.2,
    });
    this.plasmaShotMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.8,
      roughness: 0.15,
    });

    // Street Crime Holographic Waypoint Beacon
    this.crimeBeaconPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 1.35, 80, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.crimeBeaconPillar.position.y = 40;
    this.crimeBeaconRing = new THREE.Mesh(
      new THREE.RingGeometry(4.8, 5.4, 32),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.crimeBeaconRing.rotation.x = -Math.PI / 2;
    this.crimeBeaconRing.position.y = 0.08;
    this.crimeBeaconGroup.add(this.crimeBeaconPillar, this.crimeBeaconRing);
    this.add(this.crimeBeaconGroup);

    // Initialize Rapier physics world for interactive street crates/props
    void this.initRapierPhysics();

    // Load initial Street Crime Mission
    this.loadCrimeMission(0, false);

    // Bind input listeners
    this.bindInputListeners();

    // Sync initial visual pose
    this.hero.update(this.player, 0.016);
    this.city.update(
      0.016,
      this.hero.root.position,
      this.timeOfDay,
      this.weather,
      this.sunLight,
      this.hemiLight,
      scene
    );

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Check `?autostart=1` query param for automated testing / quick start
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      this.startGame();
    } else {
      document.body.dataset.state = 'title';
      this.emitHud();
    }
  }

  private async initRapierPhysics(): Promise<void> {
    try {
      await RAPIER.init();
      const world = new RAPIER.World({ x: 0, y: -24, z: 0 });
      const groundCollider = RAPIER.ColliderDesc.cuboid(220, 0.5, 220).setTranslation(
        0,
        -0.5,
        0
      );
      world.createCollider(groundCollider);

      // Spawn a few knockable street barrels/crates near Midtown plaza
      const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      const crateMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.65,
        metalness: 0.2,
      });
      const spots = [
        [7, 0.5, -24],
        [8.1, 0.5, -24.5],
        [-7.5, 0.5, -36],
        [6.5, 0.5, -46],
      ];
      for (const [x, y, z] of spots) {
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(1.2)
        );
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.45, 0.45, 0.45), body);
        const mesh = new THREE.Mesh(crateGeo, crateMat);
        mesh.position.set(x, y, z);
        mesh.castShadow = !this.isSoftwareGl;
        this.add(mesh);
        this.rapierProps.push({ body, mesh });
      }
      this.rapierWorld = world;
    } catch {
      // Rapier optional fallback if WASM fails in restricted env
      this.rapierWorld = null;
    }
  }

  private bindInputListeners(): void {
    this.boundKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const code = e.code;

      // Title start handshake via Enter or Space
      if (this.gameState === 'title' && (code === 'Enter' || code === 'Space')) {
        e.preventDefault();
        this.startGame();
        return;
      }

      // Pause / Resume via Escape or P
      if (code === 'Escape' || code === 'KeyP') {
        if (this.gameState === 'playing') {
          e.preventDefault();
          this.pauseGame();
          return;
        } else if (this.gameState === 'paused') {
          e.preventDefault();
          this.resumeGame();
          return;
        }
      }

      if (this.gameState !== 'playing') return;

      if (
        code === 'Space' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        e.preventDefault();
      }

      if (!this.keysHeld.has(code)) {
        this.keysJustPressed.add(code);
      }
      this.keysHeld.add(code);

      if (code === 'KeyC') this.cycleCameraMode();
      if (code === 'KeyM') this.toggleMute();
      if (code === 'KeyT') this.cycleTimePreset();
      if (code === 'KeyR') this.toggleWeather();
    };

    this.boundKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      this.keysHeld.delete(code);
      // Variable jump height cut when releasing Space early while ascending
      if (
        code === 'Space' &&
        this.gameState === 'playing' &&
        !this.player.swing.active &&
        this.player.velocity.y > 4.5
      ) {
        this.player.velocity.y *= 0.55;
      }
    };

    this.boundMouseDown = (e: MouseEvent) => {
      if (this.gameState !== 'playing') return;
      // Ignore clicks on interactive HUD buttons
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, [data-ui-interactive="true"]')) return;

      this.sound.unlock();
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      if (e.button === 0) {
        this.mouseLeftHeld = true;
        this.mouseLeftDownTime = performance.now();
        this.handlePrimaryFireStart();
      } else if (e.button === 2) {
        this.mouseRightHeld = true;
        this.player.aiming = true;
        this.mouseDragActive = true;
      }
    };

    this.boundMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        if (this.mouseLeftHeld) {
          this.mouseLeftHeld = false;
          this.handlePrimaryFireEnd();
        }
      } else if (e.button === 2) {
        this.mouseRightHeld = false;
        this.player.aiming = false;
        this.mouseDragActive = false;
      }
    };

    this.boundMouseMove = (e: MouseEvent) => {
      if (this.gameState !== 'playing') return;
      const locked = document.pointerLockElement != null;
      if (!locked && !this.mouseDragActive && !this.mouseLeftHeld) {
        // Gentle subtle mouse steering even without pointer lock
        if (Math.abs(e.movementX) < 120 && Math.abs(e.movementY) < 120) {
          this.camYaw -= e.movementX * 0.0022;
          this.camPitch = clamp(this.camPitch + e.movementY * 0.0016, -0.35, 1.05);
        }
        return;
      }
      const dx = locked ? e.movementX : e.clientX - this.lastPointerX;
      const dy = locked ? e.movementY : e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.camYaw -= dx * 0.0034;
      this.camPitch = clamp(this.camPitch + dy * 0.0026, -0.38, 1.1);
    };

    this.boundContextMenu = (e: MouseEvent) => {
      if (this.gameState === 'playing') {
        e.preventDefault();
      }
    };

    this.boundBlur = () => this.clearHeldInputs();
    this.boundVisibility = () => {
      if (document.hidden) this.clearHeldInputs();
    };

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('contextmenu', this.boundContextMenu);
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('visibilitychange', this.boundVisibility);
  }

  private clearHeldInputs(): void {
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    if (this.mouseLeftHeld) {
      this.mouseLeftHeld = false;
      this.releaseWebSwing();
    }
    this.mouseRightHeld = false;
    this.mouseDragActive = false;
    this.player.aiming = false;
    this.touchInput.moveX = 0;
    this.touchInput.moveY = 0;
    this.touchInput.swingHeld = false;
    this.touchInput.sprintHeld = false;
  }

  // XR Blocks pinch / trigger integration for Android XR headsets!
  public override onSelectStart(): void {
    if (this.gameState === 'title') {
      this.startGame();
      return;
    }
    if (this.gameState === 'playing') {
      this.tryAttachWebSwing();
    }
  }

  public override onSelectEnd(): void {
    if (this.gameState === 'playing') {
      this.releaseWebSwing();
    }
  }

  // =========================================================================
  // GAME LIFECYCLE CONTROLS
  // =========================================================================
  public startGame(): void {
    this.sound.unlock();
    this.sound.setPaused(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.clearHeldInputs();

    this.gameState = 'playing';
    this.victory = false;
    document.body.dataset.state = 'playing';

    // Reset player at Midtown Avenue launch vista facing -Z toward landmarks & crime 1
    this.player = this.createInitialPlayerState();
    this.camYaw = 0;
    this.camPitch = 0.2;
    this.camPosCurrent.set(0, 4.2, 12);
    this.camLookCurrent.set(0, 2.2, -16);
    this.currentFov = 62;
    this.trauma = 0;
    this.hitstopTimer = 0;

    this.clearProjectiles();
    this.loadCrimeMission(0, true);
    this.emitHud();
  }

  public restartGame(): void {
    this.startGame();
  }

  public pauseGame(): void {
    if (this.gameState !== 'playing') return;
    this.gameState = 'paused';
    document.body.dataset.state = 'paused';
    this.clearHeldInputs();
    this.sound.setPaused(true);
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.emitHud();
  }

  public resumeGame(): void {
    if (this.gameState !== 'paused') return;
    this.gameState = 'playing';
    document.body.dataset.state = 'playing';
    this.clearHeldInputs();
    this.sound.setPaused(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.emitHud();
  }

  public returnToTitle(): void {
    this.gameState = 'title';
    document.body.dataset.state = 'title';
    this.clearHeldInputs();
    this.sound.setPaused(true);
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.emitHud();
  }

  public cycleCameraMode(): void {
    const order: CameraMode[] = ['dynamic', 'close', 'cinematic'];
    this.cameraMode = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.showBanner(`CAMERA: ${this.cameraMode.toUpperCase()}`, '', 1.4);
    this.emitHud();
  }

  public setTimePreset(preset: TimePreset): void {
    this.timePreset = preset;
    this.timeOfDay = this.city.setTimePreset(preset);
    this.emitHud();
  }

  public cycleTimePreset(): void {
    const order: TimePreset[] = ['day', 'sunset', 'night'];
    const next = order[(order.indexOf(this.timePreset) + 1) % order.length];
    this.setTimePreset(next);
    this.showBanner(`TIME: ${next.toUpperCase()}`, '', 1.5);
  }

  public toggleWeather(): void {
    this.weather = this.weather === 'clear' ? 'rain' : 'clear';
    this.showBanner(
      this.weather === 'rain' ? 'WEATHER: MANHATTAN STORM' : 'WEATHER: CLEAR SKIES',
      '',
      1.6
    );
    this.emitHud();
  }

  public toggleMute(): void {
    this.sound.unlock();
    this.sound.setMuted(!this.sound.isMuted);
    this.emitHud();
  }

  public toggleTouchControls(): void {
    this.touchControlsEnabled = !this.touchControlsEnabled;
    this.emitHud();
  }

  public triggerTouchAction(action: 'jump' | 'zip' | 'attack' | 'dodge'): void {
    if (this.gameState !== 'playing') return;
    this.sound.unlock();
    if (action === 'jump') this.player.jumpBufferTimer = 0.14;
    if (action === 'zip') this.performWebZip();
    if (action === 'attack') this.performWebAttackOrMelee();
    if (action === 'dodge') this.performDodge();
  }

  private showBanner(title: string, sub = '', duration = 2.6): void {
    this.bannerText = title;
    this.bannerSubtext = sub;
    this.bannerTimer = duration;
  }

  // =========================================================================
  // MISSION & ENEMY MANAGEMENT
  // =========================================================================
  private loadCrimeMission(index: number, announce: boolean): void {
    // Clean previous enemy rigs
    for (const rig of this.enemyRigs.values()) {
      this.remove(rig.root);
      rig.dispose();
    }
    this.enemyRigs.clear();

    this.currentMissionIndex = index;
    const { mission, enemies } = createCrimeMission(index);
    this.currentMission = mission;
    this.enemies = enemies;

    for (const enemy of enemies) {
      const rig = new EnemyMeshRig(enemy, this.textures);
      rig.update(enemy, 0.016);
      this.enemyRigs.set(enemy.id, rig);
      this.add(rig.root);
    }

    this.crimeBeaconGroup.position.set(mission.center.x, 0, mission.center.z);
    this.crimeBeaconGroup.visible = true;

    if (announce) {
      this.showBanner(
        `CRIME DISPATCH: ${mission.title}`,
        `${mission.district} — ${mission.description}`,
        3.6
      );
    }
  }

  private clearProjectiles(): void {
    for (const mesh of this.projectileMeshes.values()) {
      this.remove(mesh);
    }
    this.projectileMeshes.clear();
    this.projectiles = [];
  }

  // =========================================================================
  // PLAYER ACTIONS (WEB SWING, WEB ZIP, MELEE COMBO, WEB SHOOTER, DODGE)
  // =========================================================================
  private getCameraForwardFlat(): Vec3 {
    return {
      x: -Math.sin(this.camYaw),
      y: 0,
      z: -Math.cos(this.camYaw),
    };
  }

  private handlePrimaryFireStart(): void {
    // If aiming with RMB, shoot precision web blast
    if (this.player.aiming) {
      this.shootWebProjectile();
      return;
    }

    // If on ground and right next to an enemy, quick strike; otherwise shoot web to swing!
    const closeEnemy = this.findNearestEnemy(4.8);
    if (this.player.grounded && closeEnemy) {
      this.startMeleeCombo();
      return;
    }

    this.tryAttachWebSwing();
  }

  private handlePrimaryFireEnd(): void {
    if (this.player.swing.active) {
      this.releaseWebSwing();
    } else if (
      performance.now() - this.mouseLeftDownTime < 180 &&
      this.player.grounded &&
      !this.player.aiming
    ) {
      // Quick ground click near enemies executes melee combo
      const nearby = this.findNearestEnemy(6.0);
      if (nearby) this.startMeleeCombo();
    }
  }

  private tryAttachWebSwing(): void {
    if (this.player.swing.active) return;
    const fwd = this.getCameraForwardFlat();
    let anchor = findBestWebAnchor(
      this.player.position,
      fwd,
      this.city.buildings,
      78
    );

    // Fallback high sky-anchor if player is over Central Park or wide intersection
    if (!anchor) {
      const side = this.player.swing.hand === 'right' ? 1 : -1;
      const rx = -fwd.z;
      const rz = fwd.x;
      anchor = {
        x: this.player.position.x + fwd.x * 24 + rx * side * 12,
        y: Math.max(this.player.position.y + 24, 34),
        z: this.player.position.z + fwd.z * 24 + rz * side * 12,
        buildingId: -1,
        distance: 32,
      };
    }

    // Give a snappy upward hop if launching from the ground into a swing!
    if (this.player.grounded) {
      this.player.position.y += 0.65;
      this.player.velocity.y = Math.max(this.player.velocity.y, 10.5);
      this.player.velocity.x += fwd.x * 6.5;
      this.player.velocity.z += fwd.z * 6.5;
      this.player.grounded = false;
      this.hero.triggerTakeoffStretch();
    }

    const dx = anchor.x - this.player.position.x;
    const dy = anchor.y - this.player.position.y;
    const dz = anchor.z - this.player.position.z;
    const dist = Math.hypot(dx, dy, dz);

    this.player.swing.active = true;
    this.player.swing.anchor = anchor;
    this.player.swing.ropeLength = clamp(dist * 0.94, 10, 52);
    this.player.swing.hand = this.player.swing.hand === 'right' ? 'left' : 'right';
    this.player.swing.swingTime = 0;
    this.player.webFluid = Math.max(0, this.player.webFluid - 3);

    this.sound.playThwip();
    this.particles.spawnBurst(anchor.x, anchor.y, anchor.z, 8, 0xffffff, 5, 0.85, 8, 0.35);
    this.trauma = Math.min(1, this.trauma + 0.14);
  }

  private releaseWebSwing(): void {
    if (!this.player.swing.active) return;
    const fwd = this.getCameraForwardFlat();
    const sprintHeld =
      this.keysHeld.has('ShiftLeft') ||
      this.keysHeld.has('ShiftRight') ||
      this.touchInput.sprintHeld;
    this.player.velocity = computeSwingReleaseVelocity(
      this.player.velocity,
      fwd,
      sprintHeld
    );
    this.player.swing.active = false;
    this.player.swing.anchor = null;
    this.webLineMesh.visible = false;
    this.webAnchorOrb.visible = false;
    this.hero.triggerTakeoffStretch();
    this.sound.playJump();
  }

  private performWebZip(): void {
    if (this.player.webZipCooldown > 0) return;

    // Release swing if currently swinging
    if (this.player.swing.active) {
      this.player.swing.active = false;
      this.player.swing.anchor = null;
      this.webLineMesh.visible = false;
      this.webAnchorOrb.visible = false;
    }

    const fwd = this.getCameraForwardFlat();
    // Prioritize zip-striking a nearby enemy in sight, or zipping onto a rooftop/forward perch!
    const targetEnemy = this.findEnemyInAimCone(28);
    let targetPoint: Vec3 | null = null;
    if (targetEnemy) {
      targetPoint = {
        x: targetEnemy.position.x,
        y: targetEnemy.position.y + 1.2,
        z: targetEnemy.position.z,
      };
    } else {
      const anchor = findBestWebAnchor(this.player.position, fwd, this.city.buildings, 54);
      if (anchor) {
        targetPoint = { x: anchor.x, y: anchor.y, z: anchor.z };
      }
    }

    this.player.velocity = computeWebZipVelocity(this.player.position, targetPoint, fwd);
    this.player.grounded = false;
    this.player.webZipTimer = 0.38;
    this.player.webZipCooldown = 1.15;
    this.player.webZipTarget = targetPoint;
    this.player.webFluid = Math.max(0, this.player.webFluid - 10);

    this.sound.playWebZip();
    this.hero.triggerTakeoffStretch();
    this.trauma = Math.min(1, this.trauma + 0.24);

    if (targetPoint) {
      this.updateCylinderLine(
        this.zipLineMesh,
        _vecA.set(this.player.position.x, this.player.position.y + 1.3, this.player.position.z),
        _vecB.set(targetPoint.x, targetPoint.y, targetPoint.z)
      );
      this.zipLineMesh.visible = true;
      this.zipLineTimer = 0.24;
      this.particles.spawnBurst(
        targetPoint.x,
        targetPoint.y,
        targetPoint.z,
        12,
        0xe0f2fe,
        7,
        0.95,
        8,
        0.35
      );
    }
  }

  private performWebAttackOrMelee(): void {
    const closeEnemy = this.findNearestEnemy(4.8);
    if (closeEnemy && !this.player.aiming) {
      this.startMeleeCombo();
    } else {
      this.shootWebProjectile();
    }
  }

  private startMeleeCombo(): void {
    if (this.player.attackPhase === 'windup' || this.player.attackPhase === 'active') {
      return;
    }
    const nextStep: 0 | 1 | 2 =
      this.player.comboTimer > 0.2
        ? (((this.player.attackStep + 1) % 3) as 0 | 1 | 2)
        : 0;

    // Auto-orient Spider-Man toward nearest enemy for snappy superhero combat feel
    const target = this.findNearestEnemy(6.5);
    if (target) {
      const dx = target.position.x - this.player.position.x;
      const dz = target.position.z - this.player.position.z;
      this.player.yaw = Math.atan2(dx, dz);
      // Small forward magnetic lunge into strike range
      const dist = Math.hypot(dx, dz);
      if (dist > 1.7) {
        this.player.velocity.x = (dx / dist) * 9.5;
        this.player.velocity.z = (dz / dist) * 9.5;
      }
    }

    const spec = COMBO_SPECS[nextStep];
    this.player.attackStep = nextStep;
    this.player.attackPhase = 'windup';
    this.player.attackTimer = spec.windup;
    this.currentMeleeHitIds.clear();
  }

  private shootWebProjectile(): void {
    if (this.player.webFluid < 8) return;
    this.player.webFluid = Math.max(0, this.player.webFluid - 8);

    const fwd = this.getCameraForwardFlat();
    const targetEnemy = this.findEnemyInAimCone(34);
    let vx = fwd.x * 42;
    let vy = -Math.sin(this.camPitch) * 16;
    let vz = fwd.z * 42;

    if (targetEnemy) {
      const dx = targetEnemy.position.x - this.player.position.x;
      const dy = targetEnemy.position.y + 1.15 - (this.player.position.y + 1.35);
      const dz = targetEnemy.position.z - this.player.position.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      vx = (dx / d) * 44;
      vy = (dy / d) * 44;
      vz = (dz / d) * 44;
      this.player.yaw = Math.atan2(dx, dz);
    }

    const id = this.nextProjectileId++;
    const proj: ProjectileSim = {
      id,
      owner: 'player',
      kind: 'web',
      position: {
        x: this.player.position.x + Math.sin(this.player.yaw) * 0.65,
        y: this.player.position.y + 1.35,
        z: this.player.position.z + Math.cos(this.player.yaw) * 0.65,
      },
      velocity: { x: vx, y: vy, z: vz },
      life: 1.4,
      damage: 10,
      radius: 0.45,
    };
    this.spawnProjectileMesh(proj);
    this.sound.playThwip();
    this.particles.spawnBurst(
      proj.position.x,
      proj.position.y,
      proj.position.z,
      5,
      0xffffff,
      4,
      0.55,
      6,
      0.22
    );
  }

  private spawnProjectileMesh(proj: ProjectileSim): void {
    this.projectiles.push(proj);
    const mesh = new THREE.Mesh(
      this.webShotGeo,
      proj.kind === 'web' ? this.webShotMat : this.plasmaShotMat
    );
    mesh.position.set(proj.position.x, proj.position.y, proj.position.z);
    if (proj.kind === 'plasma') mesh.scale.setScalar(1.15);
    this.projectileMeshes.set(proj.id, mesh);
    this.add(mesh);
  }

  private performDodge(): void {
    const fwd = this.getCameraForwardFlat();
    const rx = -fwd.z;
    const rz = fwd.x;
    let mx = 0;
    let mz = 0;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) {
      mx -= rx;
      mz -= rz;
    }
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) {
      mx += rx;
      mz += rz;
    }
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) {
      mx -= fwd.x;
      mz -= fwd.z;
    }
    if (mx === 0 && mz === 0) {
      mx = rx;
      mz = rz;
    }

    const events = createEmptyCombatEvents();
    const dodged = triggerPlayerDodge(
      this.player,
      this.enemies,
      this.projectiles,
      { x: mx, y: 0, z: mz },
      events
    );
    if (dodged) {
      this.sound.playDodge(events.perfectDodge);
      this.particles.spawnBurst(
        this.player.position.x,
        this.player.position.y + 0.8,
        this.player.position.z,
        events.perfectDodge ? 14 : 6,
        events.perfectDodge ? 0xfacc15 : 0x93c5fd,
        6,
        0.75,
        8,
        0.32
      );
      if (events.perfectDodge) {
        this.showBanner('PERFECT DODGE!', 'Counter Attack Ready (+50% DMG)', 1.6);
      }
    }
  }

  private findNearestEnemy(maxDist: number): EnemySimState | null {
    let best: EnemySimState | null = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (e.state === 'ko') continue;
      const d = Math.hypot(
        e.position.x - this.player.position.x,
        e.position.z - this.player.position.z
      );
      if (d < bestD && Math.abs(e.position.y - this.player.position.y) < 5) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private findEnemyInAimCone(maxDist: number): EnemySimState | null {
    const fwd = this.getCameraForwardFlat();
    let best: EnemySimState | null = null;
    let bestScore = -Infinity;
    for (const e of this.enemies) {
      if (e.state === 'ko') continue;
      const dx = e.position.x - this.player.position.x;
      const dz = e.position.z - this.player.position.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > maxDist) continue;
      const align = (dx * fwd.x + dz * fwd.z) / d;
      if (align < 0.35) continue;
      const score = align * 2.0 - d / maxDist;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private updateCylinderLine(
    mesh: THREE.Mesh,
    start: THREE.Vector3,
    end: THREE.Vector3
  ): void {
    _vecC.subVectors(end, start);
    const len = _vecC.length();
    if (len < 0.05) {
      mesh.visible = false;
      return;
    }
    mesh.position.copy(start).addScaledVector(_vecC, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(_upAxis, _vecC.normalize());
    mesh.visible = true;
  }

  // =========================================================================
  // MAIN 60FPS UPDATE LOOP (xb.Script.update)
  // =========================================================================
  public override update(): void {
    const rawDt = xb.getDeltaTime() || 0.016;
    const dt = Math.min(rawDt, 0.05);
    const camera = xb.core.camera;
    const scene = xb.core.scene;

    // Always decay camera trauma & banner in real time
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    }

    // Gentle automatic day/night progression
    if (this.autoCycleTime && this.gameState !== 'paused') {
      this.timeOfDay = (this.timeOfDay + dt * 0.045) % 24;
    }

    // Title Screen: Live Manhattan Skyline Flyover!
    if (this.gameState === 'title') {
      this.titleTourTime += dt;
      // Perch hero heroically on Midtown rooftop ledge during title screen
      this.player.position = { x: -17.5, y: 28.0, z: 18.0 };
      this.player.yaw = Math.PI * 0.85;
      this.player.grounded = true;
      this.player.velocity = { x: 0, y: 0, z: 0 };
      this.hero.update(this.player, dt);

      const angle = this.titleTourTime * 0.14;
      camera.position.set(
        -10 + Math.sin(angle) * 14,
        33.5 + Math.sin(angle * 1.4) * 2.5,
        28 + Math.cos(angle) * 8
      );
      camera.lookAt(-15, 29.2, -32);
      this.city.update(
        dt,
        this.hero.root.position,
        this.timeOfDay,
        this.weather,
        this.sunLight,
        this.hemiLight,
        scene
      );
      this.particles.update(dt);
      return;
    }

    if (this.gameState === 'paused' || this.gameState === 'gameover') {
      this.keysJustPressed.clear();
      return;
    }

    // Hitstop freeze frames on heavy impacts (visuals/camera shake keep running!)
    let simDt = dt;
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      simDt = 0;
    }

    if (simDt > 0) {
      this.stepSimulation(simDt);
    }

    // Animate visual meshes
    this.hero.update(this.player, dt);
    this.updateWebVisuals(dt);
    this.updateCameraRig(dt, camera);
    this.particles.update(dt);
    this.city.update(
      dt,
      this.hero.root.position,
      this.timeOfDay,
      this.weather,
      this.sunLight,
      this.hemiLight,
      scene
    );

    // Crime beacon animation
    if (this.crimeBeaconGroup.visible) {
      this.crimeBeaconRing.rotation.z += dt * 1.4;
      const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.08;
      this.crimeBeaconRing.scale.setScalar(pulse);
    }

    // Dynamic wind & rain sound ambience
    const speed = Math.hypot(
      this.player.velocity.x,
      this.player.velocity.y,
      this.player.velocity.z
    );
    this.sound.updateAmbience(speed, this.weather === 'rain');

    // Clear one-shot key edges
    this.keysJustPressed.clear();

    // Throttle DOM HUD updates to ~15Hz for zero layout jank
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.066) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private stepSimulation(dt: number): void {
    const p = this.player;
    const events = createEmptyCombatEvents();

    // Cooldowns & timers
    p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
    p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - dt);
    p.dodgeTimer = Math.max(0, p.dodgeTimer - dt);
    p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.counterWindowTimer = Math.max(0, p.counterWindowTimer - dt);
    p.webZipCooldown = Math.max(0, p.webZipCooldown - dt);
    p.webZipTimer = Math.max(0, p.webZipTimer - dt);
    p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);

    // Regenerate web fluid rapidly so swinging/shooting stays fluid
    p.webFluid = Math.min(p.maxWebFluid, p.webFluid + (p.swing.active ? 7 : 18) * dt);

    if (p.comboTimer > 0) {
      p.comboTimer = Math.max(0, p.comboTimer - dt);
      if (p.comboTimer === 0) p.comboCount = 0;
    }

    // Edge-triggered one-shot controls
    if (this.keysJustPressed.has('Space')) {
      p.jumpBufferTimer = 0.14;
    }
    if (this.keysJustPressed.has('KeyE')) {
      this.performWebZip();
    }
    if (this.keysJustPressed.has('KeyF')) {
      this.performWebAttackOrMelee();
    }
    if (this.keysJustPressed.has('KeyQ')) {
      this.performDodge();
    }
    if (
      (this.keysJustPressed.has('ShiftLeft') || this.keysJustPressed.has('ShiftRight')) &&
      p.spiderSenseActive
    ) {
      this.performDodge();
    }

    // Touch swing synchronization
    if (this.touchInput.swingHeld && !p.swing.active) {
      this.tryAttachWebSwing();
    } else if (!this.touchInput.swingHeld && !this.mouseLeftHeld && p.swing.active) {
      this.releaseWebSwing();
    }

    // Continuous movement intent
    let moveForward = this.touchInput.moveY;
    let moveRight = this.touchInput.moveX;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) moveForward += 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) moveForward -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) moveRight += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) moveRight -= 1;

    const inputLen = Math.hypot(moveForward, moveRight);
    if (inputLen > 1) {
      moveForward /= inputLen;
      moveRight /= inputLen;
    }

    const sprintHeld =
      this.keysHeld.has('ShiftLeft') ||
      this.keysHeld.has('ShiftRight') ||
      this.touchInput.sprintHeld;
    p.sprintActive = sprintHeld && inputLen > 0.1;

    const fwd = this.getCameraForwardFlat();
    const rx = -fwd.z;
    const rz = fwd.x;

    // 1. Swing vs Ground/Air Physics
    if (p.swing.active && p.swing.anchor) {
      p.swing.swingTime += dt;
      const stepRes = stepSwingPendulum({
        position: p.position,
        velocity: p.velocity,
        anchor: p.swing.anchor,
        ropeLength: p.swing.ropeLength,
        steerForward: fwd,
        steerInputForward: moveForward,
        steerInputRight: moveRight,
        sprintHeld,
        dt,
      });
      p.position = stepRes.position;
      p.velocity = stepRes.velocity;
      p.swing.ropeLength = stepRes.ropeLength;
      p.grounded = false;

      // Space bar while swinging releases with extra acrobatic launch boost!
      if (p.jumpBufferTimer > 0) {
        p.jumpBufferTimer = 0;
        this.releaseWebSwing();
        p.velocity.y += 4.2;
      }
    } else {
      // Standard locomotion + air control
      const targetSpeed = p.sprintActive ? 16.5 : 8.5;
      const wishX = fwd.x * moveForward + rx * moveRight;
      const wishZ = fwd.z * moveForward + rz * moveRight;

      if (p.grounded) {
        p.coyoteTimer = 0.11;
        const accel = 1 - Math.exp(-13 * dt);
        if (p.dodgeTimer <= 0 && p.attackPhase === 'idle') {
          p.velocity.x += (wishX * targetSpeed - p.velocity.x) * accel;
          p.velocity.z += (wishZ * targetSpeed - p.velocity.z) * accel;
        }
      } else {
        // Responsive air steering + gentle air drag
        p.velocity.x += wishX * 14.0 * dt;
        p.velocity.z += wishZ * 14.0 * dt;
        const drag = Math.max(0, 1 - AIR_DRAG * dt);
        p.velocity.x *= drag;
        p.velocity.z *= drag;
        p.velocity.y -= GRAVITY * dt;
      }

      // Jump with coyote time & input buffer
      if (p.jumpBufferTimer > 0 && (p.grounded || p.coyoteTimer > 0)) {
        p.jumpBufferTimer = 0;
        p.coyoteTimer = 0;
        p.grounded = false;
        p.velocity.y = sprintHeld ? 16.5 : 13.8;
        this.hero.triggerTakeoffStretch();
        this.sound.playJump();
        this.particles.spawnBurst(
          p.position.x,
          p.position.y + 0.1,
          p.position.z,
          6,
          0xd1d5db,
          3.8,
          0.6,
          10,
          0.3
        );
      }

      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.position.z += p.velocity.z * dt;
    }

    // 2. Building & Ground Collisions
    const wasAirborne = !p.grounded;
    const preVy = p.velocity.y;
    const col = resolveBuildingCollisions(p.position, p.velocity, this.city.buildings);
    p.position = col.position;
    p.velocity = col.velocity;
    p.grounded = col.grounded;
    p.onWall = col.hitWall;

    // Wall-run / wall-kick helper when sprinting into a skyscraper!
    if (col.hitWall && sprintHeld && !p.swing.active && moveForward > 0.2) {
      p.velocity.y = Math.max(p.velocity.y, 12.5);
    }

    if (wasAirborne && p.grounded && preVy < -6) {
      this.sound.playLand(Math.abs(preVy) / 25);
      this.particles.spawnBurst(
        p.position.x,
        p.position.y + 0.1,
        p.position.z,
        10,
        0xcbd5e1,
        5.5,
        0.75,
        12,
        0.35
      );
      if (p.swing.active) this.releaseWebSwing();
    }

    // Align character smoothly with movement direction
    const horizSpeed = Math.hypot(p.velocity.x, p.velocity.z);
    if (horizSpeed > 0.8 && p.attackPhase === 'idle') {
      const targetYaw = Math.atan2(p.velocity.x, p.velocity.z);
      let diff = targetYaw - p.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.yaw += diff * (1 - Math.exp(-12 * dt));
    }

    const totalSpeed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z);
    if (totalSpeed > p.maxSpeedRecorded) {
      p.maxSpeedRecorded = totalSpeed;
    }

    // 3. Melee Attack State Machine
    if (p.attackPhase !== 'idle') {
      p.attackTimer -= dt;
      const spec = COMBO_SPECS[p.attackStep];
      if (p.attackPhase === 'windup' && p.attackTimer <= 0) {
        p.attackPhase = 'active';
        p.attackTimer = spec.active;
      } else if (p.attackPhase === 'active') {
        resolvePlayerMeleeHit(
          p,
          this.enemies,
          { x: Math.sin(p.yaw), y: 0, z: Math.cos(p.yaw) },
          this.currentMeleeHitIds,
          events
        );
        if (p.attackTimer <= 0) {
          p.attackPhase = 'recovery';
          p.attackTimer = spec.recovery;
        }
      } else if (p.attackPhase === 'recovery' && p.attackTimer <= 0) {
        p.attackPhase = 'idle';
      }
    }

    // 4. Step Projectiles & Hit Detection
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= dt;
      proj.position.x += proj.velocity.x * dt;
      proj.position.y += proj.velocity.y * dt;
      proj.position.z += proj.velocity.z * dt;

      let removeProj = proj.life <= 0 || proj.position.y < 0;

      if (!removeProj && proj.owner === 'player') {
        for (const enemy of this.enemies) {
          if (enemy.state === 'ko') continue;
          const dist = Math.hypot(
            enemy.position.x - proj.position.x,
            enemy.position.y + 1.0 - proj.position.y,
            enemy.position.z - proj.position.z
          );
          if (dist < enemy.radius + proj.radius + 0.5) {
            applyWebShotHit(p, enemy, events);
            removeProj = true;
            break;
          }
        }
      } else if (!removeProj && proj.owner === 'enemy') {
        const dist = Math.hypot(
          p.position.x - proj.position.x,
          p.position.y + 1.0 - proj.position.y,
          p.position.z - proj.position.z
        );
        if (dist < 1.15 && p.invulnTimer <= 0) {
          p.hp = Math.max(0, p.hp - proj.damage);
          p.invulnTimer = 0.6;
          p.hitFlashTimer = 0.16;
          p.comboCount = 0;
          events.playerDamaged += proj.damage;
          removeProj = true;
        }
      }

      const mesh = this.projectileMeshes.get(proj.id);
      if (removeProj) {
        if (mesh) {
          this.remove(mesh);
          this.projectileMeshes.delete(proj.id);
        }
        this.projectiles.splice(i, 1);
      } else if (mesh) {
        mesh.position.set(proj.position.x, proj.position.y, proj.position.z);
      }
    }

    // 5. Step Enemy AI
    const prevSense = p.spiderSenseActive;
    stepEnemiesAI(
      this.enemies,
      p,
      dt,
      () => this.nextProjectileId++,
      events
    );
    if (p.spiderSenseActive && !prevSense) {
      this.sound.playSpiderSense();
    }

    for (const enemyProj of events.enemyFiredProjectile) {
      this.spawnProjectileMesh(enemyProj);
    }

    // Process combat feedback juice (hitstop, trauma shake, particles, SFX)
    for (const hit of events.playerHitEnemy) {
      this.sound.playPunch(hit.heavy);
      this.hitstopTimer = Math.max(this.hitstopTimer, hit.hitstop);
      this.trauma = Math.min(1, this.trauma + (hit.heavy ? 0.42 : 0.18));
      this.particles.spawnBurst(
        hit.position.x,
        hit.position.y,
        hit.position.z,
        hit.heavy ? 20 : 9,
        hit.killed ? 0xfacc15 : hit.heavy ? 0xff4d4d : 0xffffff,
        hit.heavy ? 10 : 6.5,
        hit.heavy ? 1.1 : 0.75,
        14,
        0.42
      );
    }
    for (const webbed of events.enemyWebbed) {
      this.sound.playWebbed();
      this.particles.spawnBurst(
        webbed.position.x,
        webbed.position.y,
        webbed.position.z,
        16,
        0xf8fafc,
        7.5,
        1.0,
        10,
        0.48
      );
    }
    if (events.playerDamaged > 0) {
      this.sound.playPlayerHurt();
      this.trauma = Math.min(1, this.trauma + 0.48);
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
      this.particles.spawnBurst(
        p.position.x,
        p.position.y + 1.1,
        p.position.z,
        14,
        0xef4444,
        7,
        0.85,
        14,
        0.4
      );
    }

    // Update enemy 3D rigs & prune completed KOs
    let aliveCount = 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const rig = this.enemyRigs.get(e.id);
      if (rig) rig.update(e, dt);
      if (e.state === 'ko') {
        if (e.koTimer <= 0) {
          if (rig) {
            this.remove(rig.root);
            rig.dispose();
            this.enemyRigs.delete(e.id);
          }
          this.enemies.splice(i, 1);
        }
      } else {
        aliveCount++;
      }
    }

    // Mission completion & Victory / Game Over transitions
    if (this.currentMission) {
      this.currentMission.enemiesRemaining = aliveCount;
      if (aliveCount === 0 && !this.currentMission.completed) {
        this.currentMission.completed = true;
        p.crimesStopped += 1;
        p.score += this.currentMission.rewardScore;
        p.hp = Math.min(p.maxHp, p.hp + 30);
        this.sound.playMissionComplete();

        if (p.crimesStopped >= p.totalCrimesGoal) {
          this.crimeBeaconGroup.visible = false;
          this.victory = true;
          this.gameState = 'gameover';
          document.body.dataset.state = 'gameover';
          this.clearHeldInputs();
          if (document.pointerLockElement) document.exitPointerLock?.();
          this.emitHud();
          return;
        } else {
          this.showBanner(
            'STREET CRIME STOPPED!',
            `+${this.currentMission.rewardScore} PTS · +30 HP · Next crime dispatched`,
            3.2
          );
          this.loadCrimeMission(this.currentMissionIndex + 1, false);
        }
      }
    }

    if (p.hp <= 0) {
      this.victory = false;
      this.gameState = 'gameover';
      document.body.dataset.state = 'gameover';
      this.clearHeldInputs();
      if (document.pointerLockElement) document.exitPointerLock?.();
      this.emitHud();
      return;
    }

    // Update preview web anchor for HUD targeting reticle
    this.previewAnchor = findBestWebAnchor(p.position, fwd, this.city.buildings, 74);

    // Step Rapier physics props
    if (this.rapierWorld) {
      this.rapierWorld.step();
      for (const prop of this.rapierProps) {
        const t = prop.body.translation();
        const r = prop.body.rotation();
        prop.mesh.position.set(t.x, t.y, t.z);
        prop.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        // Kick crates if Spider-Man runs/swings through them
        const d = Math.hypot(t.x - p.position.x, t.z - p.position.z);
        if (d < 1.35 && Math.abs(t.y - p.position.y) < 1.8) {
          prop.body.applyImpulse(
            { x: p.velocity.x * 0.45, y: 2.5, z: p.velocity.z * 0.45 },
            true
          );
        }
      }
    }
  }

  private updateWebVisuals(dt: number): void {
    if (this.player.swing.active && this.player.swing.anchor) {
      this.hero.getHandWorldPosition(this.player.swing.hand, _handPos);
      _anchorVec.set(
        this.player.swing.anchor.x,
        this.player.swing.anchor.y,
        this.player.swing.anchor.z
      );
      this.updateCylinderLine(this.webLineMesh, _handPos, _anchorVec);
      this.webAnchorOrb.position.copy(_anchorVec);
      this.webAnchorOrb.visible = true;
    } else {
      this.webLineMesh.visible = false;
      this.webAnchorOrb.visible = false;
    }

    if (this.zipLineTimer > 0) {
      this.zipLineTimer = Math.max(0, this.zipLineTimer - dt);
      if (this.zipLineTimer === 0) {
        this.zipLineMesh.visible = false;
      }
    }
  }

  private updateCameraRig(dt: number, camera: THREE.PerspectiveCamera): void {
    const p = this.player;
    const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z);

    // Camera distance & height based on CameraMode + Aim + Swing speed
    let dist =
      this.cameraMode === 'close' ? 4.8 : this.cameraMode === 'cinematic' ? 11.2 : 7.4;
    let heightOffset =
      this.cameraMode === 'close' ? 2.1 : this.cameraMode === 'cinematic' ? 4.2 : 2.9;
    let sideOffset = 0;

    if (p.aiming) {
      dist = 3.2;
      heightOffset = 1.95;
      sideOffset = 0.85;
    } else if (p.swing.active) {
      dist += clamp(speed * 0.085, 0, 3.6);
      heightOffset += 0.6;
    }

    const sinY = Math.sin(this.camYaw);
    const cosY = Math.cos(this.camYaw);
    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);

    _camTarget.set(
      p.position.x + cosY * sideOffset,
      p.position.y + 1.55,
      p.position.z - sinY * sideOffset
    );
    _camDesired.set(
      _camTarget.x + sinY * cosP * dist,
      Math.max(1.0, _camTarget.y + sinP * dist + heightOffset * 0.35),
      _camTarget.z + cosY * cosP * dist
    );

    // Building wall pull-in so camera never clips inside skyscrapers
    for (let i = 0; i < this.city.buildings.length; i++) {
      const b = this.city.buildings[i];
      if (
        _camDesired.y < b.height + 0.6 &&
        Math.abs(_camDesired.x - b.cx) < b.halfW + 0.7 &&
        Math.abs(_camDesired.z - b.cz) < b.halfD + 0.7
      ) {
        _camDesired.lerp(_camTarget, 0.55);
      }
    }

    // Frame-rate independent exponential damping
    const posAlpha = 1 - Math.exp(-10.5 * dt);
    const lookAlpha = 1 - Math.exp(-14.0 * dt);
    this.camPosCurrent.lerp(_camDesired, posAlpha);
    this.camLookCurrent.lerp(_camTarget, lookAlpha);

    // Trauma-squared rotational/positional shake
    const shake = this.trauma * this.trauma;
    const shakeX = shake * (Math.random() - 0.5) * 0.65;
    const shakeY = shake * (Math.random() - 0.5) * 0.65;

    camera.position.set(
      this.camPosCurrent.x + shakeX,
      this.camPosCurrent.y + shakeY,
      this.camPosCurrent.z
    );
    camera.lookAt(this.camLookCurrent);

    // Speed-reactive FOV kick for exhilarating web-swing velocity!
    const targetFov = p.aiming
      ? 48
      : clamp(62 + Math.max(0, speed - 12) * 0.62, 62, 84);
    this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-7 * dt));
    if (Math.abs(camera.fov - this.currentFov) > 0.05) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }
  }

  private emitHud(): void {
    const p = this.player;
    const camera = xb.core.camera;
    const speedMps = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z);

    // Project preview web anchor to screen coordinates (guarded with z in [-1, 1])
    let anchorScreenX = 0.5;
    let anchorScreenY = 0.42;
    let anchorOnScreen = false;
    const activeAnchor = p.swing.anchor ?? this.previewAnchor;
    if (activeAnchor) {
      _projVec.set(activeAnchor.x, activeAnchor.y, activeAnchor.z).project(camera);
      if (_projVec.z >= -1 && _projVec.z <= 1) {
        anchorScreenX = (_projVec.x + 1) * 0.5;
        anchorScreenY = (1 - _projVec.y) * 0.5;
        anchorOnScreen =
          anchorScreenX > 0.06 &&
          anchorScreenX < 0.94 &&
          anchorScreenY > 0.08 &&
          anchorScreenY < 0.88;
      }
    }

    // Project nearby enemy health bars
    const enemiesProjected = this.enemies
      .filter((e) => e.state !== 'ko')
      .map((e) => {
        const dist = Math.hypot(
          e.position.x - p.position.x,
          e.position.z - p.position.z
        );
        _projVec.set(e.position.x, e.position.y + e.height + 0.5, e.position.z).project(camera);
        const visible =
          dist < 38 &&
          _projVec.z >= -1 &&
          _projVec.z <= 1 &&
          _projVec.x >= -0.95 &&
          _projVec.x <= 0.95 &&
          _projVec.y >= -0.95 &&
          _projVec.y <= 0.95;
        return {
          id: e.id,
          archetype: e.archetype,
          hpRatio: e.hp / e.maxHp,
          webbed: e.state === 'webbed',
          telegraphing: e.state === 'telegraph',
          screenX: (_projVec.x + 1) * 0.5,
          screenY: (1 - _projVec.y) * 0.5,
          visible,
        };
      });

    // Mission distance & relative compass bearing
    let missionDistanceM = 0;
    let missionBearingDeg = 0;
    if (this.currentMission) {
      const dx = this.currentMission.center.x - p.position.x;
      const dz = this.currentMission.center.z - p.position.z;
      missionDistanceM = Math.round(Math.hypot(dx, dz));
      const worldAngle = Math.atan2(-dx, -dz);
      let rel = worldAngle - this.camYaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      missionBearingDeg = (rel * 180) / Math.PI;
    }

    this.onHudUpdate({
      gameState: this.gameState,
      victory: this.victory,
      hp: Math.round(p.hp),
      maxHp: p.maxHp,
      webFluid: Math.round(p.webFluid),
      maxWebFluid: p.maxWebFluid,
      speedKmh: Math.round(speedMps * 3.6),
      altitudeM: Math.max(0, Math.round(p.position.y)),
      swinging: p.swing.active,
      aiming: p.aiming,
      anchorAvailable: Boolean(activeAnchor),
      anchorScreenX,
      anchorScreenY,
      anchorOnScreen,
      spiderSense: p.spiderSenseActive,
      counterReady: p.counterWindowTimer > 0,
      comboCount: p.comboCount,
      maxCombo: p.maxCombo,
      score: Math.round(p.score),
      crimesStopped: p.crimesStopped,
      totalCrimesGoal: p.totalCrimesGoal,
      maxSpeedKmh: Math.round(p.maxSpeedRecorded * 3.6),
      cameraMode: this.cameraMode,
      weather: this.weather,
      timeOfDay: this.timeOfDay,
      timePreset: this.timePreset,
      muted: this.sound.isMuted,
      touchControlsEnabled: this.touchControlsEnabled,
      mission: this.currentMission ? { ...this.currentMission } : null,
      missionDistanceM,
      missionBearingDeg,
      bannerText: this.bannerText,
      bannerSubtext: this.bannerSubtext,
      bannerVisible: this.bannerTimer > 0,
      enemiesProjected,
    });
  }

  public override dispose(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('contextmenu', this.boundContextMenu);
    window.removeEventListener('blur', this.boundBlur);
    document.removeEventListener('visibilitychange', this.boundVisibility);

    this.textures?.dispose();
    this.city?.dispose();
    this.hero?.dispose();
    this.particles?.dispose();
    this.sound.dispose();
    this.pmremEnvTex?.dispose();
    for (const rig of this.enemyRigs.values()) rig.dispose();
  }
}
