import type { AnchorPoint, BuildingBox, Vec3 } from '../types';

export const GRAVITY = 28.0;
export const SWING_GRAVITY = 31.0;
export const AIR_DRAG = 0.085;
export const SWING_DRAG = 0.025;
export const MIN_ROPE_LENGTH = 8.0;
export const MAX_ROPE_LENGTH = 56.0;
export const MAX_SWING_SPEED = 54.0;
export const RELEASE_FORWARD_BOOST = 6.5;
export const RELEASE_UPWARD_BOOST = 7.2;

export function vecLengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vecLength(v: Vec3): number {
  return Math.sqrt(vecLengthSq(v));
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Finds the best elevated building anchor point for web attachment based on
 * player position, movement/camera forward direction, and nearby skyline.
 */
export function findBestWebAnchor(
  playerPos: Vec3,
  forwardDir: Vec3,
  buildings: readonly BuildingBox[],
  maxRange = 72
): AnchorPoint | null {
  const fLen = Math.hypot(forwardDir.x, forwardDir.z) || 1;
  const fx = forwardDir.x / fLen;
  const fz = forwardDir.z / fLen;

  let bestScore = -Infinity;
  let bestAnchor: AnchorPoint | null = null;

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    // Skip very short props/kiosks
    if (b.height < 12) continue;

    // Candidate point: nearest face corner facing player, elevated well above player
    const clampedX = clamp(playerPos.x + fx * 18, b.cx - b.halfW, b.cx + b.halfW);
    const clampedZ = clamp(playerPos.z + fz * 18, b.cz - b.halfD, b.cz + b.halfD);

    // Push anchor to the outer facade edge closest to the player so web never clips through wall
    const dxCenter = playerPos.x - b.cx;
    const dzCenter = playerPos.z - b.cz;
    let ax = clampedX;
    let az = clampedZ;
    if (Math.abs(dxCenter) / b.halfW > Math.abs(dzCenter) / b.halfD) {
      ax = b.cx + Math.sign(dxCenter || 1) * b.halfW;
    } else {
      az = b.cz + Math.sign(dzCenter || 1) * b.halfD;
    }

    const desiredY = clamp(playerPos.y + 18, 12, b.height - 1.5);
    const ay = Math.min(b.height - 0.8, Math.max(10, desiredY));

    const dx = ax - playerPos.x;
    const dy = ay - playerPos.y;
    const dz = az - playerPos.z;
    const dist = Math.hypot(dx, dy, dz);

    if (dist < 6 || dist > maxRange) continue;
    if (dy < 3.0) continue; // Anchor must be above player for pendulum swing

    const horizDist = Math.hypot(dx, dz) || 1;
    const forwardAlign = (dx * fx + dz * fz) / horizDist;

    // Prefer anchors ahead of camera direction, ideal rope length ~24-38m, and good height
    if (forwardAlign < -0.15) continue;

    const idealDistScore = 1 - Math.abs(dist - 30) / 42;
    const heightBonus = clamp(dy / 26, 0.1, 1.25);
    const score = forwardAlign * 2.4 + idealDistScore * 1.45 + heightBonus * 0.9;

    if (score > bestScore) {
      bestScore = score;
      bestAnchor = {
        x: ax,
        y: ay,
        z: az,
        buildingId: b.id,
        distance: dist,
      };
    }
  }

  return bestAnchor;
}

export interface PendulumStepInput {
  position: Vec3;
  velocity: Vec3;
  anchor: Vec3;
  ropeLength: number;
  steerForward: Vec3;
  steerInputForward: number;
  steerInputRight: number;
  sprintHeld: boolean;
  dt: number;
}

export interface PendulumStepResult {
  position: Vec3;
  velocity: Vec3;
  ropeLength: number;
  tension: number;
}

/**
 * Pure pendulum physics solver for Spider-Man web swinging.
 * Combines gravity, taut-rope constraint projection, natural arc momentum gain,
 * steering torque, and subtle ground-clearance reeling.
 */
export function stepSwingPendulum(input: PendulumStepInput): PendulumStepResult {
  const dt = clamp(input.dt, 0.001, 0.05);
  let px = input.position.x;
  let py = input.position.y;
  let pz = input.position.z;
  let vx = input.velocity.x;
  let vy = input.velocity.y;
  let vz = input.velocity.z;
  let ropeLength = clamp(input.ropeLength, MIN_ROPE_LENGTH, MAX_ROPE_LENGTH);

  // Subtle automatic ground clearance reel-in so swings swoop smoothly above traffic
  if (py < 4.5 && ropeLength > MIN_ROPE_LENGTH + 2) {
    const clearanceNeed = (4.5 - py) * 3.8 * dt;
    ropeLength = Math.max(MIN_ROPE_LENGTH, ropeLength - clearanceNeed);
  }

  // Gravity
  vy -= SWING_GRAVITY * dt;

  // Player pump / directional swing steering along horizontal camera axes
  const fLen = Math.hypot(input.steerForward.x, input.steerForward.z) || 1;
  const fx = input.steerForward.x / fLen;
  const fz = input.steerForward.z / fLen;
  const rx = -fz;
  const rz = fx;

  const pumpAccel = input.sprintHeld ? 24.0 : 16.5;
  if (Math.abs(input.steerInputForward) > 0.01) {
    vx += fx * input.steerInputForward * pumpAccel * dt;
    vz += fz * input.steerInputForward * pumpAccel * dt;
  }
  if (Math.abs(input.steerInputRight) > 0.01) {
    vx += rx * input.steerInputRight * 12.0 * dt;
    vz += rz * input.steerInputRight * 12.0 * dt;
  }

  // Mild air resistance
  const dragFactor = Math.max(0, 1 - SWING_DRAG * dt);
  vx *= dragFactor;
  vy *= dragFactor;
  vz *= dragFactor;

  // Integrate tentative position
  px += vx * dt;
  py += vy * dt;
  pz += vz * dt;

  // Pendulum radial constraint
  const ox = px - input.anchor.x;
  const oy = py - input.anchor.y;
  const oz = pz - input.anchor.z;
  const dist = Math.hypot(ox, oy, oz) || 0.0001;
  let tension = 0;

  if (dist > ropeLength) {
    const nx = ox / dist;
    const ny = oy / dist;
    const nz = oz / dist;

    // Pull position back onto pendulum arc
    px = input.anchor.x + nx * ropeLength;
    py = input.anchor.y + ny * ropeLength;
    pz = input.anchor.z + nz * ropeLength;

    // Remove outward radial velocity component
    const radialVel = vx * nx + vy * ny + vz * nz;
    if (radialVel > 0) {
      tension = radialVel;
      vx -= nx * radialVel;
      vy -= ny * radialVel;
      vz -= nz * radialVel;

      // Natural superhero momentum conversion on bottom of swing arc
      const tangSpeed = Math.hypot(vx, vy, vz);
      if (tangSpeed > 2.0 && ny < -0.25) {
        const arcBoost = Math.min(radialVel * 0.24, 3.6) * dt * 10;
        const invT = 1 / tangSpeed;
        vx += vx * invT * arcBoost;
        vy += vy * invT * arcBoost;
        vz += vz * invT * arcBoost;
      }
    }
  }

  // Cap terminal swing velocity
  const speed = Math.hypot(vx, vy, vz);
  if (speed > MAX_SWING_SPEED) {
    const scale = MAX_SWING_SPEED / speed;
    vx *= scale;
    vy *= scale;
    vz *= scale;
  }

  return {
    position: { x: px, y: py, z: pz },
    velocity: { x: vx, y: vy, z: vz },
    ropeLength,
    tension,
  };
}

/**
 * Computes launch velocity when releasing a web swing.
 * Rewards releasing with forward/upward momentum near the upswing.
 */
export function computeSwingReleaseVelocity(
  velocity: Vec3,
  forwardDir: Vec3,
  sprintHeld: boolean
): Vec3 {
  const fLen = Math.hypot(forwardDir.x, forwardDir.z) || 1;
  const fx = forwardDir.x / fLen;
  const fz = forwardDir.z / fLen;

  const horizSpeed = Math.hypot(velocity.x, velocity.z);
  const boostFactor = clamp(horizSpeed / 22, 0.35, 1.35) * (sprintHeld ? 1.18 : 1.0);

  return {
    x: velocity.x + fx * RELEASE_FORWARD_BOOST * boostFactor,
    y: Math.max(velocity.y, 2.5) + RELEASE_UPWARD_BOOST * boostFactor,
    z: velocity.z + fz * RELEASE_FORWARD_BOOST * boostFactor,
  };
}

/**
 * Computes a high-speed Web Zip impulse toward either a targeted rooftop perch
 * or a forward-upward burst when airborne.
 */
export function computeWebZipVelocity(
  playerPos: Vec3,
  targetPoint: Vec3 | null,
  forwardDir: Vec3
): Vec3 {
  if (targetPoint) {
    const dx = targetPoint.x - playerPos.x;
    const dy = targetPoint.y - playerPos.y + 2.2;
    const dz = targetPoint.z - playerPos.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const speed = clamp(dist * 1.45, 26, 44);
    return {
      x: (dx / dist) * speed,
      y: clamp((dy / dist) * speed + 4.5, 6, 28),
      z: (dz / dist) * speed,
    };
  }

  const fLen = Math.hypot(forwardDir.x, forwardDir.z) || 1;
  return {
    x: (forwardDir.x / fLen) * 32,
    y: 11.5,
    z: (forwardDir.z / fLen) * 32,
  };
}

export interface BuildingCollisionResult {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  hitWall: boolean;
  wallNormal: Vec3;
}

/**
 * Resolves player cylinder collision against ground plane and city building AABBs.
 * Supports smooth rooftop landing and wall sliding.
 */
export function resolveBuildingCollisions(
  position: Vec3,
  velocity: Vec3,
  buildings: readonly BuildingBox[],
  playerRadius = 0.55,
  worldBound = 205
): BuildingCollisionResult {
  let px = clamp(position.x, -worldBound, worldBound);
  let py = position.y;
  let pz = clamp(position.z, -worldBound, worldBound);
  let vx = velocity.x;
  let vy = velocity.y;
  let vz = velocity.z;
  let grounded = false;
  let hitWall = false;
  const wallNormal: Vec3 = { x: 0, y: 0, z: 0 };

  // Ground plane
  if (py <= 0) {
    py = 0;
    if (vy < 0) vy = 0;
    grounded = true;
  }

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const minX = b.cx - b.halfW - playerRadius;
    const maxX = b.cx + b.halfW + playerRadius;
    const minZ = b.cz - b.halfD - playerRadius;
    const maxZ = b.cz + b.halfD + playerRadius;

    if (px <= minX || px >= maxX || pz <= minZ || pz >= maxZ) continue;

    // Rooftop landing check (within step-up / descending landing window)
    if (py >= b.height - 1.35 && py <= b.height + 0.35 && vy <= 0.5) {
      py = b.height;
      vy = 0;
      grounded = true;
      continue;
    }

    if (py < b.height - 0.35) {
      // Side wall push-out along minimum penetration axis
      const penLeft = Math.abs(px - minX);
      const penRight = Math.abs(maxX - px);
      const penFront = Math.abs(pz - minZ);
      const penBack = Math.abs(maxZ - pz);
      const minPen = Math.min(penLeft, penRight, penFront, penBack);

      hitWall = true;
      if (minPen === penLeft) {
        px = minX;
        if (vx > 0) vx = 0;
        wallNormal.x = -1;
      } else if (minPen === penRight) {
        px = maxX;
        if (vx < 0) vx = 0;
        wallNormal.x = 1;
      } else if (minPen === penFront) {
        pz = minZ;
        if (vz > 0) vz = 0;
        wallNormal.z = -1;
      } else {
        pz = maxZ;
        if (vz < 0) vz = 0;
        wallNormal.z = 1;
      }
    }
  }

  return {
    position: { x: px, y: py, z: pz },
    velocity: { x: vx, y: vy, z: vz },
    grounded,
    hitWall,
    wallNormal,
  };
}
