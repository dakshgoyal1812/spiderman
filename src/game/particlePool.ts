import * as THREE from 'three';

const POOL_CAPACITY = 360;

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Zero-GC pooled InstancedMesh particle ring buffer for web bursts,
 * impact sparks, landing dust, and shockwave accents.
 */
export class ParticlePool {
  public readonly mesh: THREE.InstancedMesh;
  private readonly slots: ParticleSlot[] = [];
  private cursor = 0;

  constructor() {
    const geo = new THREE.IcosahedronGeometry(0.12, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, POOL_CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    for (let i = 0; i < POOL_CAPACITY; i++) {
      this.slots.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0,
        gravity: 12,
      });
      _dummy.position.set(0, -999, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
      this.mesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speed = 6,
    size = 1.0,
    gravity = 14,
    life = 0.45
  ): void {
    _color.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % POOL_CAPACITY;
      const slot = this.slots[idx];

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.72;
      const spd = speed * (0.45 + Math.random() * 0.75);

      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = Math.sin(phi) * Math.cos(theta) * spd;
      slot.vy = Math.cos(phi) * spd + speed * 0.25;
      slot.vz = Math.sin(phi) * Math.sin(theta) * spd;
      slot.life = life * (0.7 + Math.random() * 0.5);
      slot.maxLife = slot.life;
      slot.size = size * (0.65 + Math.random() * 0.6);
      slot.gravity = gravity;

      this.mesh.setColorAt(idx, _color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public update(dt: number): void {
    let anyDirty = false;
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const s = this.slots[i];
      if (!s.active) continue;
      anyDirty = true;

      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      s.vy -= s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.05) {
        s.y = 0.05;
        s.vy *= -0.35;
        s.vx *= 0.7;
        s.vz *= 0.7;
      }

      const ratio = s.life / s.maxLife;
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.rotation.set(s.life * 6, s.life * 4, 0);
      _dummy.scale.setScalar(Math.max(0.001, s.size * ratio));
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }

    if (anyDirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
