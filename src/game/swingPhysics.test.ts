import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findBestWebAnchor,
  stepSwingPendulum,
  computeSwingReleaseVelocity,
  computeWebZipVelocity,
  resolveBuildingCollisions,
} from './swingPhysics';
import type { BuildingBox } from '../types';

const SAMPLE_BUILDINGS: BuildingBox[] = [
  { id: 1, cx: 22, cz: -30, halfW: 9, halfD: 9, height: 65, style: 'glass' },
  { id: 2, cx: -22, cz: -30, halfW: 9, halfD: 9, height: 55, style: 'artdeco' },
  { id: 3, cx: 0, cz: 35, halfW: 10, halfD: 10, height: 48, style: 'brick' },
];

test('findBestWebAnchor picks elevated forward building anchor', () => {
  const anchor = findBestWebAnchor(
    { x: 0, y: 12, z: 0 },
    { x: 0, y: 0, z: -1 },
    SAMPLE_BUILDINGS
  );
  assert.ok(anchor, 'Expected an anchor to be found');
  assert.ok(anchor.y > 15, 'Anchor should be elevated above player');
  assert.ok(anchor.z < 0, 'Anchor should be in forward (-Z) direction');
});

test('stepSwingPendulum constrains rope length and preserves/builds tangential momentum', () => {
  const anchor = { x: 0, y: 40, z: -15 };
  let position = { x: 0, y: 20, z: 0 };
  let velocity = { x: 0, y: -4, z: -14 };
  let ropeLength = Math.hypot(
    position.x - anchor.x,
    position.y - anchor.y,
    position.z - anchor.z
  );

  for (let i = 0; i < 40; i++) {
    const res = stepSwingPendulum({
      position,
      velocity,
      anchor,
      ropeLength,
      steerForward: { x: 0, y: 0, z: -1 },
      steerInputForward: 1,
      steerInputRight: 0,
      sprintHeld: true,
      dt: 0.016,
    });
    position = res.position;
    velocity = res.velocity;
    ropeLength = res.ropeLength;
    const dist = Math.hypot(
      position.x - anchor.x,
      position.y - anchor.y,
      position.z - anchor.z
    );
    assert.ok(dist <= ropeLength + 0.05, 'Position must stay constrained within rope length');
  }

  const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
  assert.ok(finalSpeed > 18, `Expected swing momentum to build, got ${finalSpeed}`);
  assert.ok(position.z < -5, 'Expected pendulum to swing forward past origin');
});

test('computeSwingReleaseVelocity adds forward and upward launch boost', () => {
  const launch = computeSwingReleaseVelocity(
    { x: 0, y: 3, z: -24 },
    { x: 0, y: 0, z: -1 },
    true
  );
  assert.ok(launch.z < -28, 'Release should boost forward speed');
  assert.ok(launch.y > 8, 'Release should launch player upward');
});

test('computeWebZipVelocity launches rapidly toward rooftop target', () => {
  const vel = computeWebZipVelocity(
    { x: 0, y: 5, z: 0 },
    { x: 0, y: 20, z: -20 },
    { x: 0, y: 0, z: -1 }
  );
  assert.ok(vel.z < -18, 'Zip should propel strongly toward target');
  assert.ok(vel.y > 10, 'Zip should lift player toward rooftop');
});

test('resolveBuildingCollisions lands smoothly on rooftop and slides along walls', () => {
  // Rooftop landing
  const rooftopRes = resolveBuildingCollisions(
    { x: 22, y: 64.9, z: -30 },
    { x: 2, y: -5, z: 0 },
    SAMPLE_BUILDINGS
  );
  assert.equal(rooftopRes.grounded, true);
  assert.equal(rooftopRes.position.y, 65);
  assert.equal(rooftopRes.velocity.y, 0);

  // Side wall push-out
  const wallRes = resolveBuildingCollisions(
    { x: 12.7, y: 10, z: -30 },
    { x: 8, y: 0, z: 0 },
    SAMPLE_BUILDINGS
  );
  assert.equal(wallRes.hitWall, true);
  assert.ok(wallRes.position.x <= 12.46);
  assert.equal(wallRes.velocity.x, 0);
});
