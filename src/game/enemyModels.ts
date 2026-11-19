import * as THREE from 'three';
import type { EnemySimState } from '../types';
import type { ProceduralTextureBundle } from './textures';

/**
 * Multi-part composite 3D enemy character rig with archetype-specific silhouette:
 * - Brawler: crimson-accented street raider with heavy gauntlets
 * - Enforcer: violet/cyan high-tech shock trooper with visor & pulse rifle
 * - Brute: towering exo-armored juggernaut with hazard shoulder plates
 */
export class EnemyMeshRig {
  public readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly webCocoon: THREE.Mesh;
  private readonly telegraphRing: THREE.Mesh;
  private readonly primaryMat: THREE.MeshStandardMaterial;
  private readonly accentMat: THREE.MeshStandardMaterial;
  private phase = Math.random() * 6.28;

  constructor(enemy: EnemySimState, textures: ProceduralTextureBundle) {
    this.root.name = `Enemy_${enemy.archetype}_${enemy.id}`;
    this.root.add(this.body);

    const scale =
      enemy.archetype === 'brute' ? 1.28 : enemy.archetype === 'enforcer' ? 1.0 : 1.03;

    const primaryHex =
      enemy.archetype === 'brute'
        ? 0x3b4252
        : enemy.archetype === 'enforcer'
          ? 0x262238
          : 0x282b30;
    const accentHex =
      enemy.archetype === 'brute'
        ? 0xf59e0b
        : enemy.archetype === 'enforcer'
          ? 0x22d3ee
          : 0xdc2626;

    this.primaryMat = new THREE.MeshStandardMaterial({
      color: primaryHex,
      roughness: enemy.archetype === 'brute' ? 0.35 : 0.7,
      metalness: enemy.archetype === 'brute' ? 0.65 : 0.15,
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: accentHex,
      emissiveIntensity: enemy.archetype === 'enforcer' ? 0.45 : 0.15,
      roughness: 0.32,
      metalness: 0.45,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x15171c,
      roughness: 0.78,
      metalness: 0.1,
    });

    // Ground contact shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.75 * scale, 18),
      new THREE.MeshBasicMaterial({
        map: textures.contactShadowMap,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    this.root.add(shadow);

    // Telegraph danger ring on floor
    this.telegraphRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75 * scale, 1.05 * scale, 24),
      new THREE.MeshBasicMaterial({
        color: enemy.archetype === 'brute' ? 0xf59e0b : 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    this.telegraphRing.rotation.x = -Math.PI / 2;
    this.telegraphRing.position.y = 0.05;
    this.telegraphRing.visible = false;
    this.root.add(this.telegraphRing);

    // Torso
    const torsoW = enemy.archetype === 'brute' ? 0.38 : 0.25;
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(torsoW, torsoW * 0.76, 0.58 * scale, 10),
      this.primaryMat
    );
    torso.position.y = 1.18 * scale;
    torso.castShadow = true;
    this.body.add(torso);

    // Chest armor / emblem band
    const chestPlate = new THREE.Mesh(
      new THREE.BoxGeometry(torsoW * 1.9, 0.24 * scale, 0.32 * scale),
      this.accentMat
    );
    chestPlate.position.set(0, 1.28 * scale, 0.04);
    this.body.add(chestPlate);

    // Head / Helmet
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16 * scale, 14, 12),
      darkMat
    );
    head.position.y = 1.63 * scale;
    head.castShadow = true;
    this.body.add(head);

    // Visor / Mask accent
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.24 * scale, 0.08 * scale, 0.14 * scale),
      this.accentMat
    );
    visor.position.set(0, 1.64 * scale, 0.11 * scale);
    this.body.add(visor);

    // Arms
    this.leftArm.position.set(-torsoW - 0.07, 1.38 * scale, 0);
    this.rightArm.position.set(torsoW + 0.07, 1.38 * scale, 0);
    this.body.add(this.leftArm, this.rightArm);

    const armGeo = new THREE.CylinderGeometry(0.08 * scale, 0.07 * scale, 0.55 * scale, 10);
    const lArmMesh = new THREE.Mesh(armGeo, this.primaryMat);
    lArmMesh.position.y = -0.25 * scale;
    lArmMesh.castShadow = true;
    this.leftArm.add(lArmMesh);

    const rArmMesh = new THREE.Mesh(armGeo, this.primaryMat);
    rArmMesh.position.y = -0.25 * scale;
    rArmMesh.castShadow = true;
    this.rightArm.add(rArmMesh);

    if (enemy.archetype === 'enforcer') {
      // Shock pulse rifle on right arm
      const rifle = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.12, 0.62),
        this.accentMat
      );
      rifle.position.set(0, -0.45, 0.25);
      this.rightArm.add(rifle);
    } else if (enemy.archetype === 'brute') {
      // Heavy armored pauldrons & hydraulic fists
      for (const arm of [this.leftArm, this.rightArm]) {
        const pauldron = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.22, 0.3),
          this.accentMat
        );
        pauldron.position.y = 0.04;
        arm.add(pauldron);
        const fist = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.22, 0.22),
          this.accentMat
        );
        fist.position.y = -0.58 * scale;
        arm.add(fist);
      }
    }

    // Legs
    this.leftLeg.position.set(-0.14 * scale, 0.85 * scale, 0);
    this.rightLeg.position.set(0.14 * scale, 0.85 * scale, 0);
    this.body.add(this.leftLeg, this.rightLeg);

    const legGeo = new THREE.CylinderGeometry(0.095 * scale, 0.075 * scale, 0.84 * scale, 10);
    const lLeg = new THREE.Mesh(legGeo, darkMat);
    lLeg.position.y = -0.42 * scale;
    lLeg.castShadow = true;
    this.leftLeg.add(lLeg);
    const rLeg = new THREE.Mesh(legGeo, darkMat);
    rLeg.position.y = -0.42 * scale;
    rLeg.castShadow = true;
    this.rightLeg.add(rLeg);

    // Webbed cocoon overlay (visible when Spider-Man immobilizes enemy)
    this.webCocoon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42 * scale, 0.48 * scale, 1.35 * scale, 10, 3),
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        emissive: 0xcbd5e1,
        emissiveIntensity: 0.2,
        roughness: 0.4,
        wireframe: false,
        transparent: true,
        opacity: 0.82,
      })
    );
    this.webCocoon.position.y = 0.92 * scale;
    this.webCocoon.visible = false;
    this.body.add(this.webCocoon);
  }

  public update(enemy: EnemySimState, dt: number): void {
    this.root.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
    this.root.rotation.y = enemy.yaw;

    // Hit flash
    const flash = enemy.hitFlashTimer > 0 ? 0.85 : 0;
    this.primaryMat.emissive.setRGB(flash, flash, flash);

    // Webbed cocoon state
    this.webCocoon.visible = enemy.state === 'webbed';

    // Telegraph warning ring
    const isTelegraph = enemy.state === 'telegraph';
    this.telegraphRing.visible = isTelegraph;
    if (isTelegraph) {
      const pulse = 1 + Math.sin(performance.now() * 0.025) * 0.16;
      this.telegraphRing.scale.setScalar(pulse);
    }

    // KO topple transition
    if (enemy.state === 'ko') {
      const t = 1 - Math.max(0, enemy.koTimer / 0.65);
      this.body.rotation.x = -Math.min(1, t * 2.1) * (Math.PI * 0.48);
      this.body.position.y = -Math.min(1, t * 2.1) * 0.25;
      this.root.scale.setScalar(Math.max(0.01, 1 - Math.max(0, t - 0.55) * 2.1));
      return;
    }

    this.body.rotation.x = 0;
    this.body.position.y = 0;
    this.root.scale.setScalar(1);

    if (enemy.state === 'webbed') {
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
      return;
    }

    if (isTelegraph) {
      // Windup crouch & raise weapon/fists clearly
      this.body.position.y = -0.1;
      this.rightArm.rotation.x = -2.2;
      this.leftArm.rotation.x = enemy.archetype === 'brute' ? -2.2 : -0.6;
      return;
    }

    if (enemy.state === 'attack') {
      this.rightArm.rotation.x = -0.35;
      this.leftArm.rotation.x = enemy.archetype === 'brute' ? -1.4 : 0.4;
      return;
    }

    // Walking stride
    const moving = enemy.state === 'chase' || enemy.state === 'kite' || enemy.state === 'patrol';
    if (moving) {
      this.phase += dt * (enemy.state === 'patrol' ? 4.5 : 8.5);
      const s = Math.sin(this.phase);
      this.leftLeg.rotation.x = s * 0.55;
      this.rightLeg.rotation.x = -s * 0.55;
      this.leftArm.rotation.x = -s * 0.45;
      this.rightArm.rotation.x =
        enemy.archetype === 'enforcer' ? -1.35 : s * 0.45;
    } else {
      this.leftLeg.rotation.x *= 0.85;
      this.rightLeg.rotation.x *= 0.85;
      this.leftArm.rotation.x *= 0.85;
      this.rightArm.rotation.x *= 0.85;
    }
  }

  public dispose(): void {
    this.primaryMat.dispose();
    this.accentMat.dispose();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
      }
    });
  }
}
