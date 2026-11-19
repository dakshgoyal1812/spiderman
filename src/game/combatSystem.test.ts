import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCrimeMission,
  createEmptyCombatEvents,
  resolvePlayerMeleeHit,
  applyWebShotHit,
  triggerPlayerDodge,
  stepEnemiesAI,
  MAX_CONCURRENT_ATTACKERS,
} from './combatSystem';
import type { PlayerSimState } from '../types';

function makePlayer(): PlayerSimState {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
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
    attackPhase: 'active',
    attackStep: 0,
    attackTimer: 0.1,
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
      ropeLength: 20,
      hand: 'right',
      swingTime: 0,
      peakSpeed: 0,
    },
    maxSpeedRecorded: 0,
    score: 0,
    crimesStopped: 0,
    totalCrimesGoal: 4,
    hitFlashTimer: 0,
  };
}

test('web shots immobilize enemies into webbed state and bonus melee damage applies', () => {
  const player = makePlayer();
  const { enemies } = createCrimeMission(0);
  const target = enemies[0];
  target.position = { x: 0, y: 0, z: -2.0 };
  const events = createEmptyCombatEvents();

  applyWebShotHit(player, target, events);
  assert.notEqual(target.state, 'webbed', 'First web shot builds web meter');
  applyWebShotHit(player, target, events);
  assert.equal(target.state, 'webbed', 'Second web shot immobilizes brawler');
  assert.equal(events.enemyWebbed.length, 1);

  const hpBefore = target.hp;
  const hitSet = new Set<number>();
  resolvePlayerMeleeHit(player, [target], { x: 0, y: 0, z: -1 }, hitSet, events);
  assert.ok(hpBefore - target.hp >= 26, 'Webbed enemy takes bonus melee damage');
  assert.equal(player.comboCount, 3);
});

test('dodge during enemy telegraph triggers perfect dodge counter window', () => {
  const player = makePlayer();
  const { enemies } = createCrimeMission(0);
  enemies[0].position = { x: 0, y: 0, z: -3.5 };
  enemies[0].state = 'telegraph';
  enemies[0].stateTimer = 0.3;

  const events = createEmptyCombatEvents();
  const dodged = triggerPlayerDodge(player, enemies, [], { x: 1, y: 0, z: 0 }, events);
  assert.equal(dodged, true);
  assert.equal(events.perfectDodge, true);
  assert.ok(player.counterWindowTimer > 1.5, 'Perfect dodge opens counter window');
  assert.ok(player.invulnTimer > 0.25, 'Dodge grants i-frames');
});

test('enemy AI enforces attack-token pool limit and distinct behaviors', () => {
  const player = makePlayer();
  const { enemies } = createCrimeMission(3); // 5 enemies (brawlers, enforcers, brute)
  enemies.forEach((e, i) => {
    e.position = { x: (i - 2) * 2.2, y: 0, z: -2.5 };
    e.attackCooldown = 0;
  });

  const events = createEmptyCombatEvents();
  let pid = 1;
  stepEnemiesAI(enemies, player, 0.05, () => pid++, events);

  const tokenHolders = enemies.filter((e) => e.hasAttackToken).length;
  assert.ok(
    tokenHolders <= MAX_CONCURRENT_ATTACKERS,
    `Expected <= ${MAX_CONCURRENT_ATTACKERS} simultaneous attackers, got ${tokenHolders}`
  );
  assert.equal(player.spiderSenseActive, tokenHolders > 0 || events.telegraphStarted);
});
