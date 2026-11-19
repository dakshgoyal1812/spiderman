import type {
  CrimeMission,
  EnemyArchetype,
  EnemySimState,
  PlayerSimState,
  ProjectileSim,
  Vec3,
} from '../types';

export interface AttackSpec {
  step: 0 | 1 | 2;
  name: string;
  windup: number;
  active: number;
  recovery: number;
  damage: number;
  range: number;
  knockback: number;
  hitstop: number;
}

export const COMBO_SPECS: readonly AttackSpec[] = [
  {
    step: 0,
    name: 'Spider Jab',
    windup: 0.06,
    active: 0.12,
    recovery: 0.12,
    damage: 18,
    range: 3.1,
    knockback: 4.5,
    hitstop: 0.03,
  },
  {
    step: 1,
    name: 'Spinning Kick',
    windup: 0.08,
    active: 0.14,
    recovery: 0.14,
    damage: 24,
    range: 3.4,
    knockback: 7.5,
    hitstop: 0.045,
  },
  {
    step: 2,
    name: 'Web-Slam Finisher',
    windup: 0.11,
    active: 0.16,
    recovery: 0.22,
    damage: 38,
    range: 4.2,
    knockback: 14.0,
    hitstop: 0.07,
  },
];

export const MAX_CONCURRENT_ATTACKERS = 2;

export function createEnemySim(
  id: number,
  archetype: EnemyArchetype,
  pos: Vec3
): EnemySimState {
  const maxHp = archetype === 'brute' ? 130 : archetype === 'enforcer' ? 75 : 85;
  const radius = archetype === 'brute' ? 0.8 : 0.55;
  const height = archetype === 'brute' ? 2.3 : 1.85;
  return {
    id,
    archetype,
    position: { ...pos },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: Math.random() * Math.PI * 2,
    hp: maxHp,
    maxHp,
    radius,
    height,
    state: 'patrol',
    stateTimer: 0.4 + Math.random() * 0.6,
    attackCooldown: 0.8 + Math.random() * 0.8,
    hasAttackToken: false,
    webBuildUp: 0,
    webbedTimer: 0,
    hitFlashTimer: 0,
    koTimer: 0,
    patrolOrigin: { ...pos },
    strafeDir: Math.random() > 0.5 ? 1 : -1,
    chargeDir: { x: 0, y: 0, z: 1 },
  };
}

export interface CombatEvents {
  playerHitEnemy: Array<{
    enemyId: number;
    damage: number;
    heavy: boolean;
    position: Vec3;
    killed: boolean;
    hitstop: number;
  }>;
  enemyWebbed: Array<{ enemyId: number; position: Vec3 }>;
  playerDamaged: number;
  perfectDodge: boolean;
  enemyFiredProjectile: ProjectileSim[];
  telegraphStarted: boolean;
}

export function createEmptyCombatEvents(): CombatEvents {
  return {
    playerHitEnemy: [],
    enemyWebbed: [],
    playerDamaged: 0,
    perfectDodge: false,
    enemyFiredProjectile: [],
    telegraphStarted: false,
  };
}

/**
 * Applies melee strike hit detection from Spider-Man to nearby enemies.
 */
export function resolvePlayerMeleeHit(
  player: PlayerSimState,
  enemies: EnemySimState[],
  forwardDir: Vec3,
  alreadyHitIds: Set<number>,
  events: CombatEvents
): void {
  const spec = COMBO_SPECS[player.attackStep];
  const isCounter = player.counterWindowTimer > 0;
  const fLen = Math.hypot(forwardDir.x, forwardDir.z) || 1;
  const fx = forwardDir.x / fLen;
  const fz = forwardDir.z / fLen;

  for (const enemy of enemies) {
    if (enemy.state === 'ko' || alreadyHitIds.has(enemy.id)) continue;

    const dx = enemy.position.x - player.position.x;
    const dy = enemy.position.y - player.position.y;
    const dz = enemy.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > spec.range + enemy.radius || Math.abs(dy) > 2.6) continue;

    // Generous front hemisphere check (always hits if very close)
    const dot = dist > 0.35 ? (dx * fx + dz * fz) / dist : 1;
    if (dot < -0.15) continue;

    alreadyHitIds.add(enemy.id);

    // Webbed enemies & counter-attacks deal bonus damage
    const webMult = enemy.state === 'webbed' ? 1.45 : 1.0;
    const counterMult = isCounter ? 1.5 : 1.0;
    const damage = Math.round(spec.damage * webMult * counterMult);
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hitFlashTimer = 0.08;

    const invD = dist > 0.01 ? 1 / dist : 1;
    const kb = enemy.archetype === 'brute' ? spec.knockback * 0.55 : spec.knockback;
    enemy.velocity.x = (dx * invD || fx) * kb;
    enemy.velocity.z = (dz * invD || fz) * kb;
    enemy.velocity.y = spec.step === 2 ? 5.2 : 2.0;

    player.comboCount += 1;
    player.comboTimer = 4.2;
    if (player.comboCount > player.maxCombo) {
      player.maxCombo = player.comboCount;
    }
    player.score += damage * (1 + Math.min(player.comboCount, 12) * 0.15);

    const killed = enemy.hp <= 0;
    if (killed) {
      enemy.state = 'ko';
      enemy.koTimer = 0.65;
      enemy.hasAttackToken = false;
      player.score += enemy.archetype === 'brute' ? 350 : 200;
    } else if (enemy.state !== 'webbed') {
      enemy.state = 'stagger';
      enemy.stateTimer = spec.step === 2 ? 0.55 : 0.32;
      enemy.hasAttackToken = false;
    }

    events.playerHitEnemy.push({
      enemyId: enemy.id,
      damage,
      heavy: spec.step === 2 || isCounter || killed,
      position: { x: enemy.position.x, y: enemy.position.y + 1.2, z: enemy.position.z },
      killed,
      hitstop: killed ? 0.065 : spec.hitstop,
    });
  }

  if (isCounter && events.playerHitEnemy.length > 0) {
    player.counterWindowTimer = 0;
  }
}

/**
 * Applies a player web-shot hit to an enemy, stacking immobilization up to webbed state.
 */
export function applyWebShotHit(
  player: PlayerSimState,
  enemy: EnemySimState,
  events: CombatEvents
): void {
  if (enemy.state === 'ko') return;

  const damage = 10;
  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.hitFlashTimer = 0.07;
  enemy.webBuildUp += enemy.archetype === 'brute' ? 38 : 55;

  player.comboCount += 1;
  player.comboTimer = 4.0;
  if (player.comboCount > player.maxCombo) {
    player.maxCombo = player.comboCount;
  }
  player.score += 35;

  if (enemy.hp <= 0) {
    enemy.state = 'ko';
    enemy.koTimer = 0.65;
    enemy.hasAttackToken = false;
    player.score += 200;
    events.playerHitEnemy.push({
      enemyId: enemy.id,
      damage,
      heavy: true,
      position: { x: enemy.position.x, y: enemy.position.y + 1.1, z: enemy.position.z },
      killed: true,
      hitstop: 0.05,
    });
    return;
  }

  if (enemy.webBuildUp >= 100) {
    enemy.webBuildUp = 0;
    enemy.state = 'webbed';
    enemy.webbedTimer = enemy.archetype === 'brute' ? 3.4 : 4.8;
    enemy.hasAttackToken = false;
    enemy.velocity.x = 0;
    enemy.velocity.z = 0;
    events.enemyWebbed.push({
      enemyId: enemy.id,
      position: { x: enemy.position.x, y: enemy.position.y + 1.0, z: enemy.position.z },
    });
  } else if (enemy.state !== 'webbed' && enemy.state !== 'attack') {
    enemy.state = 'stagger';
    enemy.stateTimer = 0.22;
  }

  events.playerHitEnemy.push({
    enemyId: enemy.id,
    damage,
    heavy: false,
    position: { x: enemy.position.x, y: enemy.position.y + 1.1, z: enemy.position.z },
    killed: false,
    hitstop: 0.02,
  });
}

/**
 * Triggers a Spider-Sense dodge roll. If triggered while any enemy is telegraphing
 * or a hostile projectile is nearby, grants a Perfect Dodge counter window!
 */
export function triggerPlayerDodge(
  player: PlayerSimState,
  enemies: readonly EnemySimState[],
  projectiles: readonly ProjectileSim[],
  moveDir: Vec3,
  events: CombatEvents
): boolean {
  if (player.dodgeCooldown > 0) return false;

  player.dodgeTimer = 0.32;
  player.dodgeCooldown = 0.62;
  player.invulnTimer = 0.36;

  // Check if danger is imminent for Perfect Dodge -> Counter Window
  let dangerNearby = false;
  for (const e of enemies) {
    if (e.state === 'telegraph' || e.state === 'attack') {
      const dist = Math.hypot(
        e.position.x - player.position.x,
        e.position.z - player.position.z
      );
      if (dist < 11.5) {
        dangerNearby = true;
        break;
      }
    }
  }
  if (!dangerNearby) {
    for (const p of projectiles) {
      if (p.owner === 'enemy') {
        const dist = Math.hypot(
          p.position.x - player.position.x,
          p.position.z - player.position.z
        );
        if (dist < 8.0) {
          dangerNearby = true;
          break;
        }
      }
    }
  }

  if (dangerNearby) {
    player.counterWindowTimer = 2.4;
    player.score += 120;
    events.perfectDodge = true;
  }

  const len = Math.hypot(moveDir.x, moveDir.z) || 1;
  player.velocity.x = (moveDir.x / len) * 16.5;
  player.velocity.z = (moveDir.z / len) * 16.5;
  if (player.grounded) {
    player.velocity.y = 4.2;
    player.grounded = false;
  }
  return true;
}

/**
 * Advances all 3 distinct enemy archetype AI state machines with a shared
 * attack-token pool and visible windup telegraphs.
 */
export function stepEnemiesAI(
  enemies: EnemySimState[],
  player: PlayerSimState,
  dt: number,
  nextProjectileId: () => number,
  events: CombatEvents
): void {
  let activeTokens = 0;
  for (const e of enemies) {
    if (e.hasAttackToken && e.state !== 'ko' && e.state !== 'webbed') {
      activeTokens++;
    }
  }

  let anyTelegraphNear = false;

  for (const enemy of enemies) {
    enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

    if (enemy.state === 'ko') {
      enemy.koTimer = Math.max(0, enemy.koTimer - dt);
      enemy.position.x += enemy.velocity.x * dt;
      enemy.position.z += enemy.velocity.z * dt;
      enemy.velocity.x *= Math.max(0, 1 - 6 * dt);
      enemy.velocity.z *= Math.max(0, 1 - 6 * dt);
      continue;
    }

    if (enemy.state === 'webbed') {
      enemy.webbedTimer -= dt;
      if (enemy.webbedTimer <= 0) {
        enemy.state = 'chase';
        enemy.stateTimer = 0.4;
      }
      continue;
    }

    // Apply knockback & gravity when staggered
    if (enemy.state === 'stagger') {
      enemy.stateTimer -= dt;
      enemy.position.x += enemy.velocity.x * dt;
      enemy.position.z += enemy.velocity.z * dt;
      enemy.position.y = Math.max(0, enemy.position.y + enemy.velocity.y * dt);
      if (enemy.position.y > 0) enemy.velocity.y -= 24 * dt;
      else enemy.velocity.y = 0;
      enemy.velocity.x *= Math.max(0, 1 - 5.5 * dt);
      enemy.velocity.z *= Math.max(0, 1 - 5.5 * dt);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'chase';
      }
      continue;
    }

    const dx = player.position.x - enemy.position.x;
    const dz = player.position.z - enemy.position.z;
    const dy = Math.abs(player.position.y - enemy.position.y);
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist;
    const nz = dz / dist;
    const engaged = dist < 38 && dy < 16;

    // Face player when engaged
    if (engaged && enemy.state !== 'attack') {
      enemy.yaw = Math.atan2(nx, nz);
    }

    if (enemy.state === 'telegraph') {
      enemy.stateTimer -= dt;
      if (dist < 14) anyTelegraphNear = true;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'attack';
        if (enemy.archetype === 'brawler') {
          enemy.stateTimer = 0.24;
          enemy.velocity.x = nx * 10;
          enemy.velocity.z = nz * 10;
        } else if (enemy.archetype === 'brute') {
          // Bull-rush charge along locked direction
          enemy.stateTimer = 0.55;
          enemy.velocity.x = enemy.chargeDir.x * 16.5;
          enemy.velocity.z = enemy.chargeDir.z * 16.5;
        } else {
          // Enforcer fires plasma/taser bolt
          enemy.stateTimer = 0.25;
          const aimDy = player.position.y + 1.0 - (enemy.position.y + 1.35);
          const aimDist = Math.hypot(dx, aimDy, dz) || 1;
          events.enemyFiredProjectile.push({
            id: nextProjectileId(),
            owner: 'enemy',
            kind: 'plasma',
            position: {
              x: enemy.position.x + nx * 0.8,
              y: enemy.position.y + 1.35,
              z: enemy.position.z + nz * 0.8,
            },
            velocity: {
              x: (dx / aimDist) * 21,
              y: (aimDy / aimDist) * 21,
              z: (dz / aimDist) * 21,
            },
            life: 2.8,
            damage: 13,
            radius: 0.45,
          });
        }
      }
      continue;
    }

    if (enemy.state === 'attack') {
      enemy.stateTimer -= dt;
      if (enemy.archetype === 'brawler' || enemy.archetype === 'brute') {
        enemy.position.x += enemy.velocity.x * dt;
        enemy.position.z += enemy.velocity.z * dt;
        const hitDist = enemy.archetype === 'brute' ? 2.1 : 1.75;
        if (dist < hitDist && dy < 2.2 && player.invulnTimer <= 0) {
          const dmg = enemy.archetype === 'brute' ? 22 : 12;
          player.hp = Math.max(0, player.hp - dmg);
          player.invulnTimer = 0.65;
          player.hitFlashTimer = 0.16;
          player.comboCount = 0;
          events.playerDamaged += dmg;
        }
      }
      if (enemy.stateTimer <= 0) {
        enemy.state = 'recover';
        enemy.stateTimer = enemy.archetype === 'brute' ? 0.85 : 0.48;
        enemy.attackCooldown = enemy.archetype === 'brute' ? 2.4 : 1.5;
        if (enemy.hasAttackToken) {
          enemy.hasAttackToken = false;
          activeTokens = Math.max(0, activeTokens - 1);
        }
        enemy.velocity.x = 0;
        enemy.velocity.z = 0;
      }
      continue;
    }

    if (enemy.state === 'recover') {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = engaged ? 'chase' : 'patrol';
      }
      continue;
    }

    // Idle patrol when far away
    if (!engaged) {
      enemy.state = 'patrol';
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.yaw += (Math.random() - 0.5) * 1.8;
        enemy.stateTimer = 1.6 + Math.random() * 1.4;
      }
      const pdx = enemy.patrolOrigin.x - enemy.position.x;
      const pdz = enemy.patrolOrigin.z - enemy.position.z;
      if (Math.hypot(pdx, pdz) > 6.5) {
        enemy.yaw = Math.atan2(pdx, pdz);
      }
      enemy.position.x += Math.sin(enemy.yaw) * 1.6 * dt;
      enemy.position.z += Math.cos(enemy.yaw) * 1.6 * dt;
      continue;
    }

    // Distinct archetype movement & decision policies
    if (enemy.archetype === 'brawler') {
      // Policy 1: Aggressive melee chaser + flanker
      const moveSpeed = 5.4;
      if (dist > 2.3) {
        enemy.position.x += nx * moveSpeed * dt;
        enemy.position.z += nz * moveSpeed * dt;
      } else if (
        enemy.attackCooldown <= 0 &&
        activeTokens < MAX_CONCURRENT_ATTACKERS
      ) {
        enemy.hasAttackToken = true;
        activeTokens++;
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.48;
        events.telegraphStarted = true;
      } else {
        // Circle strafe while waiting for attack token
        enemy.position.x += -nz * enemy.strafeDir * 2.8 * dt;
        enemy.position.z += nx * enemy.strafeDir * 2.8 * dt;
      }
    } else if (enemy.archetype === 'enforcer') {
      // Policy 2: Ranged kiter keeping 10-16m standoff distance
      enemy.state = 'kite';
      const strafeX = -nz * enemy.strafeDir;
      const strafeZ = nx * enemy.strafeDir;
      if (dist < 8.5) {
        enemy.position.x += (-nx * 4.5 + strafeX * 2.4) * dt;
        enemy.position.z += (-nz * 4.5 + strafeZ * 2.4) * dt;
      } else if (dist > 17.5) {
        enemy.position.x += (nx * 4.6 + strafeX * 1.5) * dt;
        enemy.position.z += (nz * 4.6 + strafeZ * 1.5) * dt;
      } else {
        enemy.position.x += strafeX * 3.1 * dt;
        enemy.position.z += strafeZ * 3.1 * dt;
      }
      if (
        dist <= 22 &&
        enemy.attackCooldown <= 0 &&
        activeTokens < MAX_CONCURRENT_ATTACKERS
      ) {
        enemy.hasAttackToken = true;
        activeTokens++;
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.62;
        events.telegraphStarted = true;
      }
    } else {
      // Policy 3: Armored Brute line-of-sight bull-rush charger
      const moveSpeed = 3.8;
      if (dist > 8.5) {
        enemy.position.x += nx * moveSpeed * dt;
        enemy.position.z += nz * moveSpeed * dt;
      } else if (
        enemy.attackCooldown <= 0 &&
        activeTokens < MAX_CONCURRENT_ATTACKERS
      ) {
        enemy.hasAttackToken = true;
        activeTokens++;
        enemy.chargeDir = { x: nx, y: 0, z: nz };
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.72;
        events.telegraphStarted = true;
      } else {
        enemy.position.x += nx * 1.4 * dt;
        enemy.position.z += nz * 1.4 * dt;
      }
    }
  }

  // Keep enemies from stacking on top of each other
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.state === 'ko') continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.state === 'ko') continue;
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const minDist = a.radius + b.radius + 0.45;
      if (d < minDist) {
        const push = (minDist - d) * 0.5;
        const px = (dx / d) * push;
        const pz = (dz / d) * push;
        a.position.x -= px;
        a.position.z -= pz;
        b.position.x += px;
        b.position.z += pz;
      }
    }
  }

  player.spiderSenseActive = anyTelegraphNear;
}

export const CRIME_TEMPLATES: ReadonlyArray<{
  title: string;
  district: string;
  description: string;
  center: Vec3;
  archetypes: EnemyArchetype[];
  rewardScore: number;
}> = [
  {
    title: 'MIDTOWN ARMORED HEIST',
    district: 'Midtown Avenue',
    description: 'Stop armed raiders cracking an armored van near the plaza.',
    center: { x: 0, y: 0, z: -48 },
    archetypes: ['brawler', 'brawler', 'enforcer'],
    rewardScore: 750,
  },
  {
    title: 'CENTRAL PARK AMBUSH',
    district: 'Central Park South',
    description: 'Neutralize shock-troops threatening park visitors.',
    center: { x: 56, y: 0, z: -6 },
    archetypes: ['brawler', 'enforcer', 'enforcer', 'brute'],
    rewardScore: 1000,
  },
  {
    title: 'DOWNTOWN TECH CONVOY',
    district: 'Financial District',
    description: 'Intercept heavy syndicate muscle seizing Oscorp cargo.',
    center: { x: -56, y: 0, z: 54 },
    archetypes: ['brawler', 'enforcer', 'brute', 'brute'],
    rewardScore: 1350,
  },
  {
    title: 'HARBOR BRIDGE BLOCKADE',
    district: 'East River Bridge Approach',
    description: 'Clear the final syndicate blockade to secure Manhattan.',
    center: { x: 0, y: 0, z: 108 },
    archetypes: ['brawler', 'brawler', 'enforcer', 'enforcer', 'brute'],
    rewardScore: 1800,
  },
];

export function createCrimeMission(index: number): {
  mission: CrimeMission;
  enemies: EnemySimState[];
} {
  const tpl = CRIME_TEMPLATES[index % CRIME_TEMPLATES.length];
  const mission: CrimeMission = {
    id: index + 1,
    title: tpl.title,
    district: tpl.district,
    description: tpl.description,
    center: { ...tpl.center },
    enemyCount: tpl.archetypes.length,
    enemiesRemaining: tpl.archetypes.length,
    completed: false,
    rewardScore: tpl.rewardScore,
  };

  const enemies = tpl.archetypes.map((arch, idx) => {
    const angle = (idx / tpl.archetypes.length) * Math.PI * 2;
    const radius = 4.2 + (idx % 2) * 1.8;
    return createEnemySim(index * 100 + idx + 1, arch, {
      x: tpl.center.x + Math.cos(angle) * radius,
      y: 0,
      z: tpl.center.z + Math.sin(angle) * radius,
    });
  });

  return { mission, enemies };
}
