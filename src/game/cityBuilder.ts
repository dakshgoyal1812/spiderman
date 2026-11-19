import * as THREE from 'three';
import type { BuildingBox, TimePreset, WeatherMode } from '../types';
import type { ProceduralTextureBundle } from './textures';

interface TrafficCar {
  group: THREE.Group;
  axis: 'x' | 'z';
  laneCoord: number;
  dir: 1 | -1;
  pos: number;
  speed: number;
}

interface PedestrianActor {
  group: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  axis: 'x' | 'z';
  sidewalkCoord: number;
  dir: 1 | -1;
  pos: number;
  speed: number;
  phase: number;
}

interface CloudCluster {
  group: THREE.Group;
  speed: number;
}

export interface CityWorld {
  root: THREE.Group;
  buildings: BuildingBox[];
  update: (
    dt: number,
    playerPos: THREE.Vector3,
    timeOfDay: number,
    weather: WeatherMode,
    sunLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight,
    scene: THREE.Scene
  ) => void;
  setTimePreset: (preset: TimePreset) => number;
  dispose: () => void;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _skyZenith = new THREE.Color();
const _skyHorizon = new THREE.Color();
const _sunColor = new THREE.Color();
const _hemiSky = new THREE.Color();
const _hemiGround = new THREE.Color();

// Deterministic seeded RNG so city skyline is richly composed and repeatable
function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildManhattanCity(
  textures: ProceduralTextureBundle,
  isSoftwareGl: boolean
): CityWorld {
  const root = new THREE.Group();
  root.name = 'ManhattanCity';
  const buildings: BuildingBox[] = [];
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  const rand = createRng(202607);

  // =========================================================================
  // 1. SKY DOME (Procedural Day/Sunset/Night + Sun Glow + Stars)
  // =========================================================================
  const skyMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x1f62b5) },
        uHorizon: { value: new THREE.Color(0xa9d2f2) },
        uSunDir: { value: new THREE.Vector3(0.45, 0.72, -0.5).normalize() },
        uSunGlow: { value: new THREE.Color(0xfff1cc) },
        uNightFactor: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunGlow;
        uniform float uNightFactor;
        varying vec3 vWorldDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.58));

          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunGlow * pow(sunDot, 16.0) * 0.42;
          col += uSunGlow * smoothstep(0.996, 0.9995, sunDot) * 1.4;

          if (uNightFactor > 0.05 && dir.y > 0.08) {
            vec2 starUv = floor(dir.xz / (dir.y + 0.15) * 130.0);
            float star = step(0.994, hash(starUv));
            col += vec3(0.85, 0.92, 1.0) * star * uNightFactor * smoothstep(0.08, 0.35, dir.y);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  const skyDome = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(720, 28, 18)), skyMat);
  root.add(skyDome);

  // =========================================================================
  // 2. SURROUNDING HUDSON / EAST RIVER WATER & ISLAND BASE
  // =========================================================================
  const waterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x164468,
      roughness: 0.22,
      metalness: 0.48,
    })
  );
  const waterPlane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1500, 1500)), waterMat);
  waterPlane.rotation.x = -Math.PI / 2;
  waterPlane.position.y = -1.4;
  root.add(waterPlane);

  // Manhattan concrete island plinth
  const islandMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.sidewalkMap,
      roughness: 0.88,
      metalness: 0.04,
    })
  );
  const islandDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(430, 1.4, 430)), islandMat);
  islandDeck.position.set(0, -0.7, 0);
  islandDeck.receiveShadow = true;
  root.add(islandDeck);

  // Seawall perimeter concrete ledge
  const seawallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x626770, roughness: 0.85, metalness: 0.08 })
  );
  const seawall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(436, 2.0, 436)), seawallMat);
  seawall.position.set(0, -1.05, 0);
  root.add(seawall);

  // =========================================================================
  // 3. ROAD NETWORK (Avenues + Cross Streets, offset y = 0.025 to prevent Z-fighting)
  // =========================================================================
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.roadMap,
      bumpMap: textures.roadBump,
      bumpScale: 0.04,
      roughness: 0.78,
      metalness: 0.06,
    })
  );

  const AVENUE_COORDS = [-168, -112, -56, 0, 56, 112, 168];
  const ROAD_WIDTH = 15;
  const roadGeoNS = trackGeo(new THREE.PlaneGeometry(ROAD_WIDTH, 424));
  const roadGeoEW = trackGeo(new THREE.PlaneGeometry(ROAD_WIDTH, 424));

  for (const coord of AVENUE_COORDS) {
    // North-South avenue
    const ns = new THREE.Mesh(roadGeoNS, roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(coord, 0.025, 0);
    ns.receiveShadow = true;
    root.add(ns);

    // East-West cross street (slightly higher offset by 0.01 at intersections with polygonOffset)
    const ew = new THREE.Mesh(roadGeoEW, roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.rotation.z = Math.PI / 2;
    ew.position.set(0, 0.035, coord);
    ew.receiveShadow = true;
    root.add(ew);
  }

  // =========================================================================
  // 4. SHARED BUILDING MATERIALS (Day albedo + Night glowing emissive windows)
  // =========================================================================
  const styleMats: Record<'glass' | 'artdeco' | 'brick' | 'modern', THREE.MeshStandardMaterial> = {
    glass: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.buildingMaps.glass.map,
        emissive: 0xffe6b3,
        emissiveMap: textures.buildingMaps.glass.emissiveMap,
        emissiveIntensity: 0.12,
        bumpMap: textures.buildingMaps.glass.bumpMap,
        bumpScale: 0.14,
        roughness: 0.22,
        metalness: 0.52,
      })
    ),
    artdeco: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.buildingMaps.artdeco.map,
        emissive: 0xffd994,
        emissiveMap: textures.buildingMaps.artdeco.emissiveMap,
        emissiveIntensity: 0.12,
        bumpMap: textures.buildingMaps.artdeco.bumpMap,
        bumpScale: 0.18,
        roughness: 0.72,
        metalness: 0.12,
      })
    ),
    brick: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.buildingMaps.brick.map,
        emissive: 0xffcf82,
        emissiveMap: textures.buildingMaps.brick.emissiveMap,
        emissiveIntensity: 0.12,
        bumpMap: textures.buildingMaps.brick.bumpMap,
        bumpScale: 0.2,
        roughness: 0.84,
        metalness: 0.05,
      })
    ),
    modern: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.buildingMaps.modern.map,
        emissive: 0xd4ecff,
        emissiveMap: textures.buildingMaps.modern.emissiveMap,
        emissiveIntensity: 0.12,
        bumpMap: textures.buildingMaps.modern.bumpMap,
        bumpScale: 0.15,
        roughness: 0.34,
        metalness: 0.42,
      })
    ),
  };

  const roofConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x525760, roughness: 0.88, metalness: 0.05 })
  );
  const darkMetalMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2a303a, roughness: 0.42, metalness: 0.74 })
  );
  const woodTankMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x825a3c, roughness: 0.85, metalness: 0.04 })
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff1e1e,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    })
  );

  // =========================================================================
  // 5. CITY BLOCKS: SKYSCRAPERS, CENTRAL PARK, ROOFTOP PROPS & BILLBOARDS
  // =========================================================================
  const blockCenters = [-140, -84, -28, 28, 84, 140];
  let nextBuildingId = 1;
  const beaconMeshes: THREE.Mesh[] = [];

  const unitBoxGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const tankBarrelGeo = trackGeo(new THREE.CylinderGeometry(1.45, 1.5, 3.2, 12));
  const tankConeGeo = trackGeo(new THREE.ConeGeometry(1.65, 1.3, 12));
  const tankLegGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6));
  const antennaPoleGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.22, 12, 8));
  const beaconGeo = trackGeo(new THREE.SphereGeometry(0.28, 8, 8));
  const hvacGeo = trackGeo(new THREE.BoxGeometry(2.6, 1.3, 2.2));
  const billboardFrameGeo = trackGeo(new THREE.BoxGeometry(12.6, 6.6, 0.45));
  const billboardFaceGeo = trackGeo(new THREE.PlaneGeometry(12.0, 6.0));
  const billboardMats = textures.billboards.map((tex) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.55,
        roughness: 0.35,
      })
    )
  );

  const addRooftopWaterTank = (x: number, y: number, z: number) => {
    const tank = new THREE.Group();
    tank.position.set(x, y, z);
    for (const sx of [-0.9, 0.9]) {
      for (const sz of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(tankLegGeo, darkMetalMat);
        leg.position.set(sx, 1.1, sz);
        tank.add(leg);
      }
    }
    const barrel = new THREE.Mesh(tankBarrelGeo, woodTankMat);
    barrel.position.y = 3.5;
    barrel.castShadow = !isSoftwareGl;
    const cone = new THREE.Mesh(tankConeGeo, darkMetalMat);
    cone.position.y = 5.75;
    tank.add(barrel, cone);
    root.add(tank);
  };

  const addRooftopAntenna = (x: number, y: number, z: number, heightScale = 1) => {
    const ant = new THREE.Group();
    ant.position.set(x, y, z);
    const pole = new THREE.Mesh(antennaPoleGeo, darkMetalMat);
    pole.scale.set(1, heightScale, 1);
    pole.position.y = 6 * heightScale;
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = 12.1 * heightScale;
    beaconMeshes.push(beacon);
    ant.add(pole, beacon);
    root.add(ant);
  };

  const addSkyscraper = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    h: number,
    style: 'glass' | 'artdeco' | 'brick' | 'modern',
    options?: {
      stepped?: boolean;
      waterTank?: boolean;
      antenna?: boolean;
      billboard?: number;
      landmark?: boolean;
    }
  ) => {
    const bId = nextBuildingId++;
    buildings.push({
      id: bId,
      cx,
      cz,
      halfW: w * 0.5,
      halfD: d * 0.5,
      height: h,
      style,
      hasWaterTank: options?.waterTank,
      hasAntenna: options?.antenna,
      hasBillboard: options?.billboard !== undefined,
    });

    const grp = new THREE.Group();
    grp.position.set(cx, 0, cz);

    // Main shaft
    const shaft = new THREE.Mesh(unitBoxGeo, styleMats[style]);
    shaft.scale.set(w, h, d);
    shaft.position.y = h * 0.5;
    shaft.castShadow = !isSoftwareGl;
    shaft.receiveShadow = true;
    grp.add(shaft);

    // Raised parapet cornice rim around rooftop
    const parapet = new THREE.Mesh(unitBoxGeo, roofConcreteMat);
    parapet.scale.set(w + 0.6, 0.7, d + 0.6);
    parapet.position.y = h + 0.35;
    grp.add(parapet);

    let topY = h + 0.7;

    // Stepped Art Deco / Landmark crown setback
    if (options?.stepped || options?.landmark) {
      const crownH = options?.landmark ? 22 : Math.min(14, h * 0.22);
      const crownW = w * 0.68;
      const crownD = d * 0.68;
      const crown = new THREE.Mesh(unitBoxGeo, styleMats[style]);
      crown.scale.set(crownW, crownH, crownD);
      crown.position.y = h + crownH * 0.5;
      crown.castShadow = !isSoftwareGl;
      grp.add(crown);
      topY = h + crownH;

      if (options?.landmark) {
        const spireBase = new THREE.Mesh(unitBoxGeo, darkMetalMat);
        spireBase.scale.set(crownW * 0.45, 9, crownD * 0.45);
        spireBase.position.y = topY + 4.5;
        grp.add(spireBase);
        topY += 9;
      }
    }

    // Rooftop HVAC mechanical box
    if (w > 11 && !options?.landmark) {
      const hvac = new THREE.Mesh(hvacGeo, roofConcreteMat);
      hvac.position.set(-w * 0.22, h + 0.95, d * 0.18);
      grp.add(hvac);
    }

    // Glowing Times-Square style billboard mounted on tower facade
    if (options?.billboard !== undefined) {
      const bIdx = options.billboard % billboardMats.length;
      const board = new THREE.Group();
      const faceY = Math.min(h - 6, 18 + (bId % 3) * 6);
      const faceOnZ = bId % 2 === 0;
      const frame = new THREE.Mesh(billboardFrameGeo, darkMetalMat);
      const face = new THREE.Mesh(billboardFaceGeo, billboardMats[bIdx]);
      face.position.z = 0.26;
      board.add(frame, face);
      if (faceOnZ) {
        board.position.set(0, faceY, d * 0.5 + 0.3);
      } else {
        board.rotation.y = Math.PI * 0.5;
        board.position.set(w * 0.5 + 0.3, faceY, 0);
      }
      grp.add(board);
    }

    root.add(grp);

    if (options?.waterTank) {
      addRooftopWaterTank(cx + w * 0.22, h + 0.3, cz - d * 0.2);
    }
    if (options?.antenna) {
      addRooftopAntenna(cx, topY, cz, options.landmark ? 1.8 : 1.0);
    }
  };

  // Build every Manhattan city block
  for (let gx = 0; gx < blockCenters.length; gx++) {
    for (let gz = 0; gz < blockCenters.length; gz++) {
      const bx = blockCenters[gx];
      const bz = blockCenters[gz];

      // Central Park oasis at (bx = 28, bz = -28) and (bx = 84, bz = -28)
      if ((bx === 28 && bz === -28) || (bx === 84 && bz === -28)) {
        continue;
      }

      // Open Midtown Plaza right in front of spawn (bx = 28, bz = -84 is landmark, keep avenue x=0 clear!)
      // Iconic Empire-style Art Deco Landmark framed in initial spawn vista!
      if (bx === -28 && bz === -84) {
        addSkyscraper(bx, bz, 26, 26, 94, 'artdeco', {
          landmark: true,
          antenna: true,
          billboard: 0,
        });
        continue;
      }
      // Iconic Oscorp Glass Spire flanking the right side of spawn vista!
      if (bx === 28 && bz === -84) {
        addSkyscraper(bx, bz, 24, 24, 86, 'glass', {
          stepped: true,
          antenna: true,
          billboard: 1,
        });
        continue;
      }
      // Hero Spawn Launchpad Building (Spider-Man starts perched here overlooking Midtown!)
      if (bx === -28 && bz === 28) {
        addSkyscraper(bx, bz, 22, 22, 28, 'artdeco', {
          waterTank: true,
          billboard: 2,
        });
        continue;
      }

      // Subdivide standard blocks into 2 buildings per block for dense NYC canyon swinging!
      const splitHorizontal = (gx + gz) % 2 === 0;
      const styles: Array<'glass' | 'artdeco' | 'brick' | 'modern'> = [
        'glass',
        'artdeco',
        'brick',
        'modern',
      ];
      const distFromCore = Math.hypot(bx, bz);
      const isMidtown = distFromCore < 105;

      for (let sub = 0; sub < 2; sub++) {
        const offset = sub === 0 ? -9.5 : 9.5;
        const cx = splitHorizontal ? bx + offset : bx;
        const cz = splitHorizontal ? bz : bz + offset;
        const w = splitHorizontal ? 16 + rand() * 2.2 : 30 + rand() * 5;
        const d = splitHorizontal ? 30 + rand() * 5 : 16 + rand() * 2.2;
        const baseH = isMidtown ? 36 + rand() * 48 : 22 + rand() * 34;
        const style = styles[Math.floor(rand() * styles.length)];

        addSkyscraper(cx, cz, w, d, baseH, style, {
          stepped: baseH > 54 && rand() > 0.35,
          waterTank: style === 'brick' || (baseH < 50 && rand() > 0.45),
          antenna: baseH > 62 && rand() > 0.4,
          billboard: isMidtown && rand() > 0.72 ? Math.floor(rand() * 4) : undefined,
        });
      }
    }
  }

  // =========================================================================
  // 6. CENTRAL PARK GREEN AREA (Composite Instanced Trees + Pond + Pathways)
  // =========================================================================
  const parkGroup = new THREE.Group();
  parkGroup.position.set(56, 0.08, -28);
  const parkLawnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.parkGrassMap,
      roughness: 0.92,
      metalness: 0.0,
    })
  );
  const parkLawn = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(92, 0.16, 40)), parkLawnMat);
  parkLawn.receiveShadow = true;
  parkGroup.add(parkLawn);

  // Park Pond
  const pond = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(10.5, 24)),
    trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x247ba0,
        roughness: 0.15,
        metalness: 0.35,
      })
    )
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(16, 0.12, 2);
  parkGroup.add(pond);

  // Park dirt/stone walkway cross
  const pathMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb0a999, roughness: 0.9 })
  );
  const pathH = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(88, 3.6)), pathMat);
  pathH.rotation.x = -Math.PI / 2;
  pathH.position.set(0, 0.11, -7);
  parkGroup.add(pathH);

  // Composite Instanced Trees (trunk + lower canopy + upper crown with tint variation)
  const treeCount = 46;
  const trunkMesh = new THREE.InstancedMesh(
    trackGeo(new THREE.CylinderGeometry(0.24, 0.38, 3.2, 8)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0x5c4028, roughness: 0.9 })),
    treeCount
  );
  const crownLowMesh = new THREE.InstancedMesh(
    trackGeo(new THREE.DodecahedronGeometry(2.1, 1)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })),
    treeCount
  );
  const crownTopMesh = new THREE.InstancedMesh(
    trackGeo(new THREE.DodecahedronGeometry(1.45, 1)),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 })),
    treeCount
  );
  trunkMesh.castShadow = !isSoftwareGl;
  crownLowMesh.castShadow = !isSoftwareGl;

  let tIdx = 0;
  for (let i = 0; i < 80 && tIdx < treeCount; i++) {
    const tx = (rand() - 0.5) * 82;
    const tz = (rand() - 0.5) * 32;
    // Keep clear of pond and central footpath
    if (Math.hypot(tx - 16, tz - 2) < 12.5) continue;
    if (Math.abs(tz + 7) < 3.0) continue;

    const s = 0.82 + rand() * 0.42;
    _dummy.position.set(tx, 1.6 * s, tz);
    _dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    _dummy.scale.set(s, s, s);
    _dummy.updateMatrix();
    trunkMesh.setMatrixAt(tIdx, _dummy.matrix);

    _dummy.position.set(tx, 3.7 * s, tz);
    _dummy.scale.set(s, s * 0.85, s);
    _dummy.updateMatrix();
    crownLowMesh.setMatrixAt(tIdx, _dummy.matrix);

    _dummy.position.set(tx + 0.25 * s, 5.1 * s, tz - 0.15 * s);
    _dummy.scale.set(s * 0.95, s * 0.9, s * 0.95);
    _dummy.updateMatrix();
    crownTopMesh.setMatrixAt(tIdx, _dummy.matrix);

    const gHue = 0.26 + rand() * 0.08;
    const gLight = 0.28 + rand() * 0.14;
    _color.setHSL(gHue, 0.48, gLight);
    crownLowMesh.setColorAt(tIdx, _color);
    _color.setHSL(gHue + 0.02, 0.54, gLight + 0.08);
    crownTopMesh.setColorAt(tIdx, _color);
    tIdx++;
  }
  trunkMesh.count = tIdx;
  crownLowMesh.count = tIdx;
  crownTopMesh.count = tIdx;
  trunkMesh.computeBoundingSphere();
  crownLowMesh.computeBoundingSphere();
  crownTopMesh.computeBoundingSphere();
  parkGroup.add(trunkMesh, crownLowMesh, crownTopMesh);
  root.add(parkGroup);

  // =========================================================================
  // 7. ICONIC BROOKLYN / MANHATTAN SUSPENSION BRIDGE (South River Crossing)
  // =========================================================================
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(0, 0, 215);
  const bridgeStoneMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xa0988c, roughness: 0.78, metalness: 0.08 })
  );
  const cableMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.35, metalness: 0.78 })
  );

  // Bridge roadway deck
  const bridgeDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18, 1.4, 150)), roadMat);
  bridgeDeck.position.set(0, 1.0, 55);
  bridgeGroup.add(bridgeDeck);

  // Twin gothic suspension towers
  for (const tz of [12, 96]) {
    const tower = new THREE.Group();
    tower.position.set(0, 0, tz);
    for (const tx of [-9.5, 9.5]) {
      const pier = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 46, 5.2)), bridgeStoneMat);
      pier.position.set(tx, 21, 0);
      tower.add(pier);
    }
    const crossBeamTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22.5, 4.5, 5.0)), bridgeStoneMat);
    crossBeamTop.position.set(0, 41, 0);
    const crossBeamMid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22.5, 3.2, 4.6)), bridgeStoneMat);
    crossBeamMid.position.set(0, 22, 0);
    tower.add(crossBeamTop, crossBeamMid);
    bridgeGroup.add(tower);
  }

  // Sweeping catenary main cables (TubeGeometry) + vertical suspenders
  for (const side of [-9.2, 9.2]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side, 4, -22),
      new THREE.Vector3(side, 43, 12),
      new THREE.Vector3(side, 14, 54),
      new THREE.Vector3(side, 43, 96),
      new THREE.Vector3(side, 4, 130),
    ]);
    const mainCable = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(curve, 36, 0.35, 8, false)),
      cableMat
    );
    bridgeGroup.add(mainCable);

    // Vertical suspender rods
    for (let s = 0; s <= 18; s++) {
      const t = s / 18;
      const pt = curve.getPoint(t);
      const rodH = Math.max(1, pt.y - 1.5);
      const rod = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.08, 0.08, rodH, 5)),
        cableMat
      );
      rod.position.set(pt.x, 1.5 + rodH * 0.5, pt.z);
      bridgeGroup.add(rod);
    }
  }
  root.add(bridgeGroup);

  // Distant outer-borough horizon skyline silhouettes across the river
  const distantMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x3a4b5c, roughness: 0.9, metalness: 0.1 })
  );
  const distantCount = 44;
  const distantMesh = new THREE.InstancedMesh(unitBoxGeo, distantMat, distantCount);
  for (let i = 0; i < distantCount; i++) {
    const angle = (i / distantCount) * Math.PI * 2;
    const dist = 340 + rand() * 90;
    const h = 24 + rand() * 68;
    _dummy.position.set(Math.cos(angle) * dist, h * 0.5 - 1.4, Math.sin(angle) * dist);
    _dummy.rotation.set(0, rand() * 0.4, 0);
    _dummy.scale.set(14 + rand() * 18, h, 14 + rand() * 18);
    _dummy.updateMatrix();
    distantMesh.setMatrixAt(i, _dummy.matrix);
  }
  distantMesh.computeBoundingSphere();
  root.add(distantMesh);

  // =========================================================================
  // 8. MOVING NYC TRAFFIC (Composite Yellow Cabs, Sedans, Vans)
  // =========================================================================
  const trafficCars: TrafficCar[] = [];
  const carBodyGeo = trackGeo(new THREE.BoxGeometry(1.9, 0.72, 4.2));
  const carCabinGeo = trackGeo(new THREE.BoxGeometry(1.68, 0.62, 2.2));
  const carWheelGeo = trackGeo(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10));
  const taxiSignGeo = trackGeo(new THREE.BoxGeometry(0.65, 0.22, 0.25));
  const lightGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.16, 0.08));

  const wheelMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.9 }));
  const glassCarMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1f2d3d, roughness: 0.15, metalness: 0.7 }));
  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfff8dc, emissive: 0xfff4c2, emissiveIntensity: 1.6 })
  );
  const taillightMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff1111, emissiveIntensity: 1.6 })
  );
  const carPalette = [0xf5b800, 0xf5b800, 0x1d4ed8, 0xdc2626, 0xe5e7eb, 0x1f2937, 0x0f766e];
  const carBodyMats = carPalette.map((hex) =>
    trackMat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 0.45 }))
  );

  for (let i = 0; i < 34; i++) {
    const axis: 'x' | 'z' = i % 2 === 0 ? 'z' : 'x';
    const ave = AVENUE_COORDS[i % AVENUE_COORDS.length];
    const dir: 1 | -1 = i % 4 < 2 ? 1 : -1;
    const laneOffset = dir * 3.4;
    const matIdx = i % carBodyMats.length;
    const isTaxi = matIdx <= 1;

    const grp = new THREE.Group();
    const body = new THREE.Mesh(carBodyGeo, carBodyMats[matIdx]);
    body.position.y = 0.65;
    const cabin = new THREE.Mesh(carCabinGeo, glassCarMat);
    cabin.position.set(0, 1.28, -0.15);
    grp.add(body, cabin);

    if (isTaxi) {
      const sign = new THREE.Mesh(taxiSignGeo, headlightMat);
      sign.position.set(0, 1.68, -0.1);
      grp.add(sign);
    }

    // 4 wheels
    for (const wx of [-0.95, 0.95]) {
      for (const wz of [-1.25, 1.25]) {
        const w = new THREE.Mesh(carWheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.35, wz);
        grp.add(w);
      }
    }

    // Headlights & Taillights
    for (const lx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(lightGeo, headlightMat);
      hl.position.set(lx, 0.68, 2.12);
      const tl = new THREE.Mesh(lightGeo, taillightMat);
      tl.position.set(lx, 0.68, -2.12);
      grp.add(hl, tl);
    }

    const startPos = (rand() - 0.5) * 360;
    if (axis === 'z') {
      grp.position.set(ave + laneOffset, 0.04, startPos);
      grp.rotation.y = dir > 0 ? 0 : Math.PI;
    } else {
      grp.position.set(startPos, 0.04, ave + laneOffset);
      grp.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }

    root.add(grp);
    trafficCars.push({
      group: grp,
      axis,
      laneCoord: ave + laneOffset,
      dir,
      pos: startPos,
      speed: 9 + rand() * 7.5,
    });
  }

  // =========================================================================
  // 9. WALKING PEDESTRIANS ON SIDEWALKS (Composite Animated Figures)
  // =========================================================================
  const pedestrians: PedestrianActor[] = [];
  const pedHeadGeo = trackGeo(new THREE.SphereGeometry(0.14, 8, 8));
  const pedTorsoGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.58, 0.22));
  const pedLegGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.62, 0.14));
  const skinMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xdca583, roughness: 0.78 }));
  const pantsMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x263240, roughness: 0.85 }));
  const jacketColors = [0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b, 0x8b5cf6, 0x475569, 0xec4899];
  const jacketMats = jacketColors.map((hex) =>
    trackMat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }))
  );

  for (let i = 0; i < 42; i++) {
    const axis: 'x' | 'z' = i % 2 === 0 ? 'z' : 'x';
    const ave = AVENUE_COORDS[1 + (i % (AVENUE_COORDS.length - 2))];
    const side = i % 4 < 2 ? 1 : -1;
    const sidewalkCoord = ave + side * 9.2;
    const dir: 1 | -1 = rand() > 0.5 ? 1 : -1;

    const grp = new THREE.Group();
    const torso = new THREE.Mesh(pedTorsoGeo, jacketMats[i % jacketMats.length]);
    torso.position.y = 1.02;
    const head = new THREE.Mesh(pedHeadGeo, skinMat);
    head.position.y = 1.48;
    const leftLeg = new THREE.Mesh(pedLegGeo, pantsMat);
    leftLeg.position.set(-0.09, 0.38, 0);
    const rightLeg = new THREE.Mesh(pedLegGeo, pantsMat);
    rightLeg.position.set(0.09, 0.38, 0);
    grp.add(torso, head, leftLeg, rightLeg);

    const startPos = (rand() - 0.5) * 280;
    if (axis === 'z') {
      grp.position.set(sidewalkCoord, 0.05, startPos);
      grp.rotation.y = dir > 0 ? 0 : Math.PI;
    } else {
      grp.position.set(startPos, 0.05, sidewalkCoord);
      grp.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    root.add(grp);
    pedestrians.push({
      group: grp,
      leftLeg,
      rightLeg,
      axis,
      sidewalkCoord,
      dir,
      pos: startPos,
      speed: 1.5 + rand() * 1.1,
      phase: rand() * 6.28,
    });
  }

  // =========================================================================
  // 10. DRIFTING 3D CLOUDS
  // =========================================================================
  const clouds: CloudCluster[] = [];
  const cloudMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.88,
    })
  );
  const puffGeo = trackGeo(new THREE.DodecahedronGeometry(12, 1));
  for (let i = 0; i < 18; i++) {
    const cg = new THREE.Group();
    const puffs = 3 + (i % 3);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(puffGeo, cloudMat);
      m.position.set((p - 1) * 11, (p % 2) * 3.5, (rand() - 0.5) * 9);
      m.scale.set(1.3 + rand() * 0.5, 0.55 + rand() * 0.25, 1.0 + rand() * 0.4);
      cg.add(m);
    }
    cg.position.set((rand() - 0.5) * 520, 145 + rand() * 45, (rand() - 0.5) * 520);
    root.add(cg);
    clouds.push({ group: cg, speed: 1.8 + rand() * 2.4 });
  }

  // =========================================================================
  // 11. DYNAMIC RAIN PARTICLE SYSTEM (InstancedMesh Streaks around Player)
  // =========================================================================
  const RAIN_COUNT = 520;
  const rainOffsets = new Float32Array(RAIN_COUNT * 3);
  const rainSpeeds = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainOffsets[i * 3] = (rand() - 0.5) * 76;
    rainOffsets[i * 3 + 1] = rand() * 44;
    rainOffsets[i * 3 + 2] = (rand() - 0.5) * 76;
    rainSpeeds[i] = 30 + rand() * 14;
  }
  const rainMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xcbe3ff,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    })
  );
  const rainMesh = new THREE.InstancedMesh(
    trackGeo(new THREE.BoxGeometry(0.035, 1.35, 0.035)),
    rainMat,
    RAIN_COUNT
  );
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  root.add(rainMesh);

  let beaconTimer = 0;

  return {
    root,
    buildings,
    setTimePreset(preset: TimePreset): number {
      if (preset === 'day') return 13.5;
      if (preset === 'sunset') return 18.2;
      return 22.5;
    },
    update(dt, playerPos, timeOfDay, weather, sunLight, hemiLight, scene) {
      // 1. Update Traffic
      for (let i = 0; i < trafficCars.length; i++) {
        const car = trafficCars[i];
        car.pos += car.dir * car.speed * dt;
        if (car.pos > 195) car.pos = -195;
        else if (car.pos < -195) car.pos = 195;

        if (car.axis === 'z') {
          car.group.position.z = car.pos;
        } else {
          car.group.position.x = car.pos;
        }
      }

      // 2. Update Pedestrians
      for (let i = 0; i < pedestrians.length; i++) {
        const ped = pedestrians[i];
        ped.pos += ped.dir * ped.speed * dt;
        if (ped.pos > 160) ped.pos = -160;
        else if (ped.pos < -160) ped.pos = 160;

        ped.phase += dt * ped.speed * 4.5;
        const swing = Math.sin(ped.phase) * 0.42;
        ped.leftLeg.rotation.x = swing;
        ped.rightLeg.rotation.x = -swing;

        if (ped.axis === 'z') {
          ped.group.position.z = ped.pos;
        } else {
          ped.group.position.x = ped.pos;
        }
      }

      // 3. Drifting Clouds
      for (let i = 0; i < clouds.length; i++) {
        clouds[i].group.position.x += clouds[i].speed * dt;
        if (clouds[i].group.position.x > 290) clouds[i].group.position.x = -290;
      }

      // 4. Blinking Rooftop Aviation Beacons
      beaconTimer += dt;
      beaconMat.emissiveIntensity = Math.sin(beaconTimer * 4.2) > 0 ? 2.4 : 0.25;

      // 5. Day / Sunset / Night Cycle + Weather Atmosphere
      const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
      const sunElev = Math.sin(sunAngle);
      const sunAzim = Math.cos(sunAngle);
      const isRaining = weather === 'rain';

      const dayFactor = THREE.MathUtils.clamp((sunElev + 0.1) / 0.55, 0, 1);
      const sunsetFactor =
        THREE.MathUtils.clamp(1 - Math.abs(sunElev - 0.08) / 0.28, 0, 1) *
        (isRaining ? 0.35 : 1.0);
      const nightFactor = THREE.MathUtils.clamp(-sunElev * 2.4 + 0.25, 0, 1);

      // Sky colors
      _skyZenith.setHex(0x0b152c).lerp(_color.setHex(0x1f62b5), dayFactor);
      if (sunsetFactor > 0.01) {
        _skyZenith.lerp(_color.setHex(0x2d2458), sunsetFactor * 0.65);
      }
      if (isRaining) {
        _skyZenith.lerp(_color.setHex(0x2c3645), 0.65);
      }

      _skyHorizon.setHex(0x182542).lerp(_color.setHex(0xa7d1f2), dayFactor);
      if (sunsetFactor > 0.01) {
        _skyHorizon.lerp(_color.setHex(0xf9734a), sunsetFactor * 0.85);
      }
      if (isRaining) {
        _skyHorizon.lerp(_color.setHex(0x4b5766), 0.7);
      }

      skyMat.uniforms.uZenith.value.copy(_skyZenith);
      skyMat.uniforms.uHorizon.value.copy(_skyHorizon);
      skyMat.uniforms.uNightFactor.value = isRaining ? nightFactor * 0.15 : nightFactor;
      skyMat.uniforms.uSunDir.value
        .set(sunAzim * 0.85, Math.max(-0.15, sunElev), -0.45)
        .normalize();
      skyMat.uniforms.uSunGlow.value
        .setHex(sunsetFactor > 0.3 ? 0xff9248 : 0xfff2cc)
        .multiplyScalar(isRaining ? 0.2 : 1 - nightFactor * 0.8);

      // Horizon-matched fog
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(_skyHorizon);
        const targetDensity = isRaining ? 0.0046 : nightFactor > 0.5 ? 0.0028 : 0.0019;
        scene.fog.density += (targetDensity - scene.fog.density) * Math.min(1, dt * 3);
      }
      cloudMat.color.copy(_skyHorizon).lerp(_color.setHex(0xffffff), isRaining ? 0.1 : 0.55);

      // Sun / Moon Directional Light & Hemisphere Fill
      const lightElev = Math.max(0.25, Math.abs(sunElev));
      sunLight.position.set(
        playerPos.x + sunAzim * 95,
        playerPos.y + lightElev * 120,
        playerPos.z - 55
      );
      sunLight.target.position.set(playerPos.x, 0, playerPos.z);
      sunLight.target.updateMatrixWorld();

      _sunColor.setHex(0x7ca6e8).lerp(_color.setHex(0xfff1d6), dayFactor);
      if (sunsetFactor > 0.05) _sunColor.lerp(_color.setHex(0xff9654), sunsetFactor * 0.8);
      sunLight.color.copy(_sunColor);
      sunLight.intensity = (0.75 + dayFactor * 1.95) * (isRaining ? 0.58 : 1.0);

      _hemiSky.setHex(0x2c426e).lerp(_color.setHex(0x8ec5f8), dayFactor);
      _hemiGround.setHex(0x1c202a).lerp(_color.setHex(0x525866), dayFactor);
      hemiLight.color.copy(_hemiSky);
      hemiLight.groundColor.copy(_hemiGround);
      hemiLight.intensity = (0.65 + dayFactor * 0.7) * (isRaining ? 0.8 : 1.0);

      // Emissive skyscraper windows glow vibrantly at dusk & night!
      const windowGlow = THREE.MathUtils.clamp(0.08 + nightFactor * 1.05 + sunsetFactor * 0.45 + (isRaining ? 0.25 : 0), 0.08, 1.25);
      styleMats.glass.emissiveIntensity = windowGlow;
      styleMats.artdeco.emissiveIntensity = windowGlow * 0.95;
      styleMats.brick.emissiveIntensity = windowGlow * 0.9;
      styleMats.modern.emissiveIntensity = windowGlow * 1.05;

      // Wet asphalt specular sheen in rain
      roadMat.roughness = isRaining ? 0.34 : 0.78;
      roadMat.metalness = isRaining ? 0.28 : 0.06;

      // 6. Dynamic Rain Streaks around Player
      rainMesh.visible = isRaining;
      if (isRaining) {
        const px = playerPos.x;
        const py = Math.max(0, playerPos.y);
        const pz = playerPos.z;
        for (let i = 0; i < RAIN_COUNT; i++) {
          let ry = rainOffsets[i * 3 + 1] - rainSpeeds[i] * dt;
          if (ry < 0) ry += 44;
          rainOffsets[i * 3 + 1] = ry;

          _dummy.position.set(
            px + rainOffsets[i * 3],
            py + ry - 8,
            pz + rainOffsets[i * 3 + 2]
          );
          _dummy.rotation.set(0.08, 0, 0.1);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          rainMesh.setMatrixAt(i, _dummy.matrix);
        }
        rainMesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
    },
  };
}
