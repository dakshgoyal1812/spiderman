import * as THREE from 'three';
import type { ProceduralTextureBundle } from './textures';
import type { PlayerSimState } from '../types';

const _handWorld = new THREE.Vector3();

/**
 * Detailed articulated 3D Spider-Man composite character mesh (18+ sculpted parts)
 * with red web-pattern suit, cobalt blue athletic sides, iconic chest/back spider emblem,
 * expressive black-rimmed white lenses, and smooth procedural locomotion/swing/combat rig.
 * Grounded at bottom-center pivot (y = 0 at soles of boots).
 */
export class SpiderManRig {
  public readonly root = new THREE.Group();
  public readonly bodyPivot = new THREE.Group();
  public readonly contactShadow: THREE.Mesh;

  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftShoulder = new THREE.Group();
  private readonly leftElbow = new THREE.Group();
  private readonly rightShoulder = new THREE.Group();
  private readonly rightElbow = new THREE.Group();
  private readonly leftHip = new THREE.Group();
  private readonly leftKnee = new THREE.Group();
  private readonly rightHip = new THREE.Group();
  private readonly rightKnee = new THREE.Group();
  private readonly leftHandTip = new THREE.Object3D();
  private readonly rightHandTip = new THREE.Object3D();
  private readonly spiderSenseCrown = new THREE.Group();

  private readonly redMat: THREE.MeshStandardMaterial;
  private readonly chestMat: THREE.MeshStandardMaterial;
  private readonly blueMat: THREE.MeshStandardMaterial;
  private readonly lensMat: THREE.MeshStandardMaterial;
  private readonly rimMat: THREE.MeshStandardMaterial;
  private readonly cuffMat: THREE.MeshStandardMaterial;

  private stridePhase = 0;
  private breathPhase = 0;
  private scaleX = 1;
  private scaleY = 1;
  private scaleZ = 1;
  private currentPitch = 0;
  private currentRoll = 0;
  private wasGrounded = true;

  constructor(textures: ProceduralTextureBundle) {
    this.root.name = 'SpiderManHero';
    this.root.add(this.bodyPivot);

    // PBR Materials with clear roughness/metalness contrast
    this.redMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.spiderRedMap,
      bumpMap: textures.spiderSuitBump,
      bumpScale: 0.015,
      roughness: 0.56,
      metalness: 0.08,
    });
    this.chestMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.spiderChestMap,
      bumpMap: textures.spiderSuitBump,
      bumpScale: 0.018,
      roughness: 0.52,
      metalness: 0.1,
    });
    this.blueMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.spiderBlueMap,
      bumpMap: textures.spiderSuitBump,
      bumpScale: 0.012,
      roughness: 0.72,
      metalness: 0.06,
    });
    this.lensMat = new THREE.MeshStandardMaterial({
      color: 0xf8fbff,
      emissive: 0xdbeafe,
      emissiveIntensity: 0.25,
      roughness: 0.12,
      metalness: 0.15,
    });
    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0x0d0f14,
      roughness: 0.35,
      metalness: 0.2,
    });
    this.cuffMat = new THREE.MeshStandardMaterial({
      color: 0x262a33,
      roughness: 0.28,
      metalness: 0.78,
    });

    // Contact shadow grounded directly under character
    this.contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 24),
      new THREE.MeshBasicMaterial({
        map: textures.contactShadowMap,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.025;
    this.root.add(this.contactShadow);

    // Pelvis / Waist (sits at y = 0.94m)
    this.torsoGroup.position.set(0, 0.96, 0);
    this.bodyPivot.add(this.torsoGroup);

    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.145, 0.22, 14),
      this.redMat
    );
    pelvis.scale.set(1.15, 1, 0.8);
    pelvis.position.y = 0.02;
    pelvis.castShadow = true;
    this.torsoGroup.add(pelvis);

    // Blue athletic side waist
    const waist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.15, 0.24, 14),
      this.blueMat
    );
    waist.scale.set(1.12, 1, 0.8);
    waist.position.y = 0.21;
    waist.castShadow = true;
    this.torsoGroup.add(waist);

    // Broad V-taper muscular chest with spider emblem
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.185, 0.34, 16),
      this.chestMat
    );
    chest.scale.set(1.15, 1, 0.78);
    chest.position.y = 0.45;
    chest.castShadow = true;
    this.torsoGroup.add(chest);

    // Front & back red spider emblem plaques (clear high-contrast read)
    const frontEmblem = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.28),
      this.chestMat
    );
    frontEmblem.position.set(0, 0.46, 0.19);
    this.torsoGroup.add(frontEmblem);

    const backEmblem = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.26),
      this.chestMat
    );
    backEmblem.position.set(0, 0.46, -0.19);
    backEmblem.rotation.y = Math.PI;
    this.torsoGroup.add(backEmblem);

    // Red trapezius/collar yoke
    const collar = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 14, 10),
      this.redMat
    );
    collar.scale.set(1.2, 0.55, 0.82);
    collar.position.set(0, 0.61, 0);
    collar.castShadow = true;
    this.torsoGroup.add(collar);

    // Head & iconic Spider-Man mask
    this.headGroup.position.set(0, 0.67, 0.01);
    this.torsoGroup.add(this.headGroup);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.078, 0.11, 10),
      this.redMat
    );
    neck.position.y = 0.04;
    this.headGroup.add(neck);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 18, 16),
      this.redMat
    );
    head.scale.set(0.92, 1.12, 1.02);
    head.position.y = 0.175;
    head.castShadow = true;
    this.headGroup.add(head);

    // Expressive angled white mask lenses + black rims
    const lensShape = new THREE.Shape();
    lensShape.moveTo(0, 0);
    lensShape.quadraticCurveTo(0.045, 0.048, 0.088, 0.036);
    lensShape.quadraticCurveTo(0.072, -0.022, 0.018, -0.025);
    lensShape.closePath();

    const rimGeo = new THREE.ExtrudeGeometry(lensShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.006,
      bevelSegments: 2,
    });
    const innerGeo = new THREE.ExtrudeGeometry(lensShape, {
      depth: 0.018,
      bevelEnabled: false,
    });

    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.016, 0.175, 0.13);
      eyeGroup.rotation.y = side * 0.24;
      eyeGroup.rotation.z = side * 0.08;
      if (side < 0) eyeGroup.scale.x = -1;

      const rim = new THREE.Mesh(rimGeo, this.rimMat);
      const lens = new THREE.Mesh(innerGeo, this.lensMat);
      lens.scale.set(0.76, 0.72, 1.05);
      lens.position.set(0.01, 0.003, 0.004);
      eyeGroup.add(rim, lens);
      this.headGroup.add(eyeGroup);
    }

    // Spider-Sense golden tingle rays above head (visible on danger telegraph)
    const rayGeo = new THREE.ConeGeometry(0.025, 0.18, 4);
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.position.set(Math.cos(angle) * 0.24, 0.36, Math.sin(angle) * 0.24);
      ray.rotation.z = -Math.cos(angle) * 0.65;
      ray.rotation.x = Math.sin(angle) * 0.65;
      this.spiderSenseCrown.add(ray);
    }
    this.spiderSenseCrown.visible = false;
    this.headGroup.add(this.spiderSenseCrown);

    // Arms (Red shoulders/gauntlets + Blue biceps/inner sleeves + metallic web-shooter cuffs)
    this.buildArm(this.leftShoulder, this.leftElbow, this.leftHandTip, -1);
    this.buildArm(this.rightShoulder, this.rightElbow, this.rightHandTip, 1);

    // Legs (Blue thighs + Red web boots)
    this.buildLeg(this.leftHip, this.leftKnee, -1);
    this.buildLeg(this.rightHip, this.rightKnee, 1);
  }

  private buildArm(
    shoulder: THREE.Group,
    elbow: THREE.Group,
    handTip: THREE.Object3D,
    side: -1 | 1
  ): void {
    shoulder.position.set(side * 0.29, 0.56, 0);
    this.torsoGroup.add(shoulder);

    const deltoid = new THREE.Mesh(
      new THREE.SphereGeometry(0.088, 12, 10),
      this.redMat
    );
    deltoid.castShadow = true;
    shoulder.add(deltoid);

    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.056, 0.3, 12),
      this.blueMat
    );
    upperArm.position.y = -0.15;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    elbow.position.set(0, -0.3, 0);
    shoulder.add(elbow);

    const elbowJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.056, 10, 8),
      this.redMat
    );
    elbow.add(elbowJoint);

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.044, 0.28, 12),
      this.redMat
    );
    forearm.position.y = -0.14;
    forearm.castShadow = true;
    elbow.add(forearm);

    // Metallic mechanical web-shooter wrist cuff
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.05, 0.045, 12),
      this.cuffMat
    );
    cuff.position.y = -0.255;
    elbow.add(cuff);

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 10, 8),
      this.redMat
    );
    hand.scale.set(0.9, 1.2, 0.72);
    hand.position.y = -0.31;
    elbow.add(hand);

    handTip.position.set(0, -0.34, 0.03);
    elbow.add(handTip);
  }

  private buildLeg(hip: THREE.Group, knee: THREE.Group, side: -1 | 1): void {
    hip.position.set(side * 0.125, -0.06, 0);
    this.torsoGroup.add(hip);

    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.068, 0.44, 12),
      this.blueMat
    );
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    hip.add(thigh);

    knee.position.set(0, -0.44, 0);
    hip.add(knee);

    const kneeJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.066, 10, 8),
      this.redMat
    );
    knee.add(kneeJoint);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.066, 0.05, 0.41, 12),
      this.redMat
    );
    shin.position.y = -0.21;
    shin.castShadow = true;
    knee.add(shin);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.09, 0.22),
      this.redMat
    );
    boot.position.set(0, -0.425, 0.05);
    boot.castShadow = true;
    knee.add(boot);
  }

  public getHandWorldPosition(
    hand: 'left' | 'right',
    out = _handWorld
  ): THREE.Vector3 {
    const tip = hand === 'left' ? this.leftHandTip : this.rightHandTip;
    return tip.getWorldPosition(out);
  }

  public triggerTakeoffStretch(): void {
    this.scaleX = 0.86;
    this.scaleY = 1.18;
    this.scaleZ = 0.86;
  }

  public triggerLandingSquash(impactSpeed: number): void {
    const amount = Math.min(0.28, 0.1 + impactSpeed * 0.008);
    this.scaleX = 1 + amount;
    this.scaleY = 1 - amount;
    this.scaleZ = 1 + amount;
  }

  public update(player: PlayerSimState, dt: number): void {
    this.breathPhase += dt * 3.2;

    // Position & facing yaw
    this.root.position.set(player.position.x, player.position.y, player.position.z);
    this.bodyPivot.rotation.y = player.yaw;

    // Ground contact shadow stays flush on ground beneath Spider-Man, fading with altitude
    const alt = Math.max(0, player.position.y);
    this.contactShadow.position.y = -alt + 0.025;
    const shadowScale = Math.max(0.35, 1 - alt * 0.025);
    this.contactShadow.scale.setScalar(shadowScale);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      Math.max(0.08, 0.52 * (1 - alt / 35));

    // Landing squash trigger
    if (player.grounded && !this.wasGrounded) {
      this.triggerLandingSquash(Math.abs(player.velocity.y));
    }
    this.wasGrounded = player.grounded;

    // Smoothly damp squash-and-stretch back to 1
    const damp = 1 - Math.exp(-12 * dt);
    this.scaleX += (1 - this.scaleX) * damp;
    this.scaleY += (1 - this.scaleY) * damp;
    this.scaleZ += (1 - this.scaleZ) * damp;
    this.bodyPivot.scale.set(this.scaleX, this.scaleY, this.scaleZ);

    // Hit flash feedback
    const flash = player.hitFlashTimer > 0 ? 0.65 : 0;
    this.redMat.emissive.setRGB(flash, flash * 0.25, flash * 0.25);
    this.chestMat.emissive.setRGB(flash, flash * 0.25, flash * 0.25);

    // Spider-sense visual indicator
    this.spiderSenseCrown.visible = player.spiderSenseActive;
    if (player.spiderSenseActive) {
      this.spiderSenseCrown.rotation.y += dt * 8;
    }

    const horizSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const lerpA = 1 - Math.exp(-14 * dt);

    // Default neutral pose targets
    let torsoPitch = 0;
    let torsoRoll = 0;
    let torsoY = 0.96;
    let lShX = 0;
    let lShZ = -0.14;
    let lElX = -0.25;
    let rShX = 0;
    let rShZ = 0.14;
    let rElX = -0.25;
    let lHipX = 0;
    let lKneeX = 0.08;
    let rHipX = 0;
    let rKneeX = 0.08;
    let headPitch = 0;

    if (player.dodgeTimer > 0) {
      // Acrobatic 360 dodge flip
      const t = 1 - player.dodgeTimer / 0.32;
      torsoPitch = t * Math.PI * 2;
      lHipX = -1.2;
      lKneeX = 1.6;
      rHipX = -1.2;
      rKneeX = 1.6;
      lShX = -1.0;
      rShX = -1.0;
    } else if (player.attackPhase !== 'idle') {
      // 3-hit superhero melee combo poses
      if (player.attackStep === 0) {
        // Snappy right Spider-Jab
        torsoPitch = 0.22;
        torsoRoll = -0.28;
        rShX = -1.55;
        rElX = -0.1;
        lShX = 0.45;
        lElX = -1.1;
        lHipX = -0.35;
        rHipX = 0.35;
      } else if (player.attackStep === 1) {
        // Spinning roundhouse kick
        torsoPitch = -0.25;
        torsoRoll = 0.42;
        rHipX = -1.45;
        rKneeX = 0.12;
        lHipX = 0.2;
        lShX = -0.8;
        rShX = 0.85;
      } else {
        // Web-Slam leaping double-fist smash
        torsoPitch = 0.55;
        lShX = -2.1;
        rShX = -2.1;
        lElX = -0.3;
        rElX = -0.3;
        lHipX = -0.7;
        lKneeX = 1.1;
        rHipX = -0.45;
        rKneeX = 0.9;
      }
    } else if (player.swing.active) {
      // Iconic dynamic web-swinging silhouette!
      const riseFactor = THREE.MathUtils.clamp(player.velocity.y / 18, -1, 1);
      torsoPitch = 0.22 - riseFactor * 0.32;
      torsoRoll = THREE.MathUtils.clamp(
        (player.velocity.x * Math.cos(player.yaw) -
          player.velocity.z * Math.sin(player.yaw)) *
          0.025,
        -0.48,
        0.48
      );
      headPitch = -0.22;

      if (player.swing.hand === 'right') {
        rShX = -2.65;
        rShZ = 0.25;
        rElX = -0.15;
        lShX = 0.55;
        lShZ = -0.45;
        lElX = -0.75;
      } else {
        lShX = -2.65;
        lShZ = -0.25;
        lElX = -0.15;
        rShX = 0.55;
        rShZ = 0.45;
        rElX = -0.75;
      }
      // Knees tucked dynamically during swing arc
      lHipX = -0.85 - riseFactor * 0.35;
      lKneeX = 1.35;
      rHipX = -0.35 - riseFactor * 0.25;
      rKneeX = 0.85;
    } else if (player.webZipTimer > 0) {
      // Superman/Spider bullet zip pose
      torsoPitch = 0.82;
      lShX = -2.55;
      rShX = -2.55;
      lElX = -0.1;
      rElX = -0.1;
      lHipX = 0.45;
      rHipX = 0.3;
      lKneeX = 0.4;
      rKneeX = 0.55;
    } else if (!player.grounded) {
      // Airborne acrobatic jump / fall pose
      const vy = player.velocity.y;
      if (vy > 2) {
        // Ascending agile tuck
        torsoPitch = 0.18;
        lShX = -1.2;
        rShX = -0.9;
        lElX = -0.7;
        rElX = -0.8;
        lHipX = -0.95;
        lKneeX = 1.45;
        rHipX = -0.35;
        rKneeX = 0.85;
      } else {
        // Diving / freefall pose
        torsoPitch = 0.48;
        lShX = -0.6;
        lShZ = -0.85;
        rShX = -0.6;
        rShZ = 0.85;
        lHipX = -0.55;
        lKneeX = 1.1;
        rHipX = -0.25;
        rKneeX = 0.7;
      }
    } else if (horizSpeed > 0.6) {
      // Gait-synced walking & sprinting cycle (no foot skating)
      const isSprint = horizSpeed > 9.5;
      this.stridePhase += horizSpeed * dt * (isSprint ? 1.12 : 1.42);
      const s = Math.sin(this.stridePhase);
      const c = Math.cos(this.stridePhase);
      const amp = isSprint ? 1.05 : 0.68;

      torsoPitch = isSprint ? 0.34 : 0.12;
      torsoY = 0.94 + Math.abs(c) * (isSprint ? 0.08 : 0.04);
      lHipX = s * amp;
      rHipX = -s * amp;
      lKneeX = Math.max(0.1, -c * amp * 1.15);
      rKneeX = Math.max(0.1, c * amp * 1.15);

      lShX = -s * amp * 0.95;
      rShX = s * amp * 0.95;
      lElX = isSprint ? -1.25 : -0.65;
      rElX = isSprint ? -1.25 : -0.65;
    } else {
      // Iconic superhero crouched-ready idle stance
      const b = Math.sin(this.breathPhase);
      torsoPitch = 0.1 + b * 0.02;
      torsoY = 0.92 + b * 0.015;
      lHipX = -0.28;
      lKneeX = 0.52;
      rHipX = -0.18;
      rKneeX = 0.38;
      lShX = -0.22;
      lShZ = -0.22;
      lElX = -0.75;
      rShX = -0.28;
      rShZ = 0.22;
      rElX = -0.82;
    }

    if (player.aiming && !player.swing.active) {
      rShX = -1.52;
      rElX = -0.12;
    }

    this.currentPitch += (torsoPitch - this.currentPitch) * lerpA;
    this.currentRoll += (torsoRoll - this.currentRoll) * lerpA;
    this.torsoGroup.rotation.x = this.currentPitch;
    this.torsoGroup.rotation.z = this.currentRoll;
    this.torsoGroup.position.y += (torsoY - this.torsoGroup.position.y) * lerpA;

    this.headGroup.rotation.x += (headPitch - this.headGroup.rotation.x) * lerpA;
    this.leftShoulder.rotation.x += (lShX - this.leftShoulder.rotation.x) * lerpA;
    this.leftShoulder.rotation.z += (lShZ - this.leftShoulder.rotation.z) * lerpA;
    this.leftElbow.rotation.x += (lElX - this.leftElbow.rotation.x) * lerpA;
    this.rightShoulder.rotation.x += (rShX - this.rightShoulder.rotation.x) * lerpA;
    this.rightShoulder.rotation.z += (rShZ - this.rightShoulder.rotation.z) * lerpA;
    this.rightElbow.rotation.x += (rElX - this.rightElbow.rotation.x) * lerpA;

    this.leftHip.rotation.x += (lHipX - this.leftHip.rotation.x) * lerpA;
    this.leftKnee.rotation.x += (lKneeX - this.leftKnee.rotation.x) * lerpA;
    this.rightHip.rotation.x += (rHipX - this.rightHip.rotation.x) * lerpA;
    this.rightKnee.rotation.x += (rKneeX - this.rightKnee.rotation.x) * lerpA;
  }

  public dispose(): void {
    this.redMat.dispose();
    this.chestMat.dispose();
    this.blueMat.dispose();
    this.lensMat.dispose();
    this.rimMat.dispose();
    this.cuffMat.dispose();
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  }
}
