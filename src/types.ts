export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type CameraMode = 'dynamic' | 'close' | 'cinematic';

export type WeatherMode = 'clear' | 'rain';

export type TimePreset = 'day' | 'sunset' | 'night';

export type EnemyArchetype = 'brawler' | 'enforcer' | 'brute';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BuildingBox {
  id: number;
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  height: number;
  style: 'glass' | 'artdeco' | 'brick' | 'modern';
  hasWaterTank?: boolean;
  hasAntenna?: boolean;
  hasBillboard?: boolean;
}

export interface AnchorPoint {
  x: number;
  y: number;
  z: number;
  buildingId: number;
  distance: number;
}

export interface SwingState {
  active: boolean;
  anchor: AnchorPoint | null;
  ropeLength: number;
  hand: 'left' | 'right';
  swingTime: number;
  peakSpeed: number;
}

export interface PlayerSimState {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  grounded: boolean;
  onWall: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  sprintActive: boolean;
  aiming: boolean;
  hp: number;
  maxHp: number;
  webFluid: number;
  maxWebFluid: number;
  comboCount: number;
  comboTimer: number;
  maxCombo: number;
  attackPhase: 'idle' | 'windup' | 'active' | 'recovery';
  attackStep: 0 | 1 | 2;
  attackTimer: number;
  dodgeTimer: number;
  dodgeCooldown: number;
  invulnTimer: number;
  counterWindowTimer: number;
  spiderSenseActive: boolean;
  webZipCooldown: number;
  webZipTimer: number;
  webZipTarget: Vec3 | null;
  swing: SwingState;
  maxSpeedRecorded: number;
  score: number;
  crimesStopped: number;
  totalCrimesGoal: number;
  hitFlashTimer: number;
}

export interface EnemySimState {
  id: number;
  archetype: EnemyArchetype;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  state: 'patrol' | 'chase' | 'kite' | 'telegraph' | 'attack' | 'recover' | 'webbed' | 'stagger' | 'ko';
  stateTimer: number;
  attackCooldown: number;
  hasAttackToken: boolean;
  webBuildUp: number;
  webbedTimer: number;
  hitFlashTimer: number;
  koTimer: number;
  patrolOrigin: Vec3;
  strafeDir: number;
  chargeDir: Vec3;
}

export interface ProjectileSim {
  id: number;
  owner: 'player' | 'enemy';
  kind: 'web' | 'plasma';
  position: Vec3;
  velocity: Vec3;
  life: number;
  damage: number;
  radius: number;
}

export interface CrimeMission {
  id: number;
  title: string;
  district: string;
  description: string;
  center: Vec3;
  enemyCount: number;
  enemiesRemaining: number;
  completed: boolean;
  rewardScore: number;
}

export interface HudSnapshot {
  gameState: GameState;
  victory: boolean;
  hp: number;
  maxHp: number;
  webFluid: number;
  maxWebFluid: number;
  speedKmh: number;
  altitudeM: number;
  swinging: boolean;
  aiming: boolean;
  anchorAvailable: boolean;
  anchorScreenX: number;
  anchorScreenY: number;
  anchorOnScreen: boolean;
  spiderSense: boolean;
  counterReady: boolean;
  comboCount: number;
  maxCombo: number;
  score: number;
  crimesStopped: number;
  totalCrimesGoal: number;
  maxSpeedKmh: number;
  cameraMode: CameraMode;
  weather: WeatherMode;
  timeOfDay: number; // 0..24 hours
  timePreset: TimePreset;
  muted: boolean;
  touchControlsEnabled: boolean;
  mission: CrimeMission | null;
  missionDistanceM: number;
  missionBearingDeg: number;
  bannerText: string;
  bannerSubtext: string;
  bannerVisible: boolean;
  enemiesProjected: Array<{
    id: number;
    archetype: EnemyArchetype;
    hpRatio: number;
    webbed: boolean;
    telegraphing: boolean;
    screenX: number;
    screenY: number;
    visible: boolean;
  }>;
}
