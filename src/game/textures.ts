import * as THREE from 'three';

export interface ProceduralTextureBundle {
  buildingMaps: Record<
    'glass' | 'artdeco' | 'brick' | 'modern',
    { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }
  >;
  roadMap: THREE.CanvasTexture;
  roadBump: THREE.CanvasTexture;
  sidewalkMap: THREE.CanvasTexture;
  parkGrassMap: THREE.CanvasTexture;
  spiderRedMap: THREE.CanvasTexture;
  spiderChestMap: THREE.CanvasTexture;
  spiderBlueMap: THREE.CanvasTexture;
  spiderSuitBump: THREE.CanvasTexture;
  billboards: THREE.CanvasTexture[];
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function finalizeColorTex(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function finalizeDataTex(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeBuildingTextures(
  style: 'glass' | 'artdeco' | 'brick' | 'modern',
  maxAniso: number
) {
  const w = 256;
  const h = 512;
  const cColor = document.createElement('canvas');
  cColor.width = w;
  cColor.height = h;
  const ctx = cColor.getContext('2d')!;

  const cEmit = document.createElement('canvas');
  cEmit.width = w;
  cEmit.height = h;
  const ectx = cEmit.getContext('2d')!;
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, w, h);

  const cBump = document.createElement('canvas');
  cBump.width = w;
  cBump.height = h;
  const bctx = cBump.getContext('2d')!;
  bctx.fillStyle = '#909090';
  bctx.fillRect(0, 0, w, h);

  // Base facade wall colors
  const baseBg =
    style === 'glass'
      ? '#24364a'
      : style === 'artdeco'
        ? '#9d9589'
        : style === 'brick'
          ? '#7b3e30'
          : '#49525e';
  ctx.fillStyle = baseBg;
  ctx.fillRect(0, 0, w, h);

  // Subtle architectural ribs / masonry lines
  if (style === 'brick') {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < h; y += 8) {
      ctx.fillRect(0, y, w, 1);
    }
  } else if (style === 'artdeco') {
    ctx.fillStyle = '#b4aca0';
    for (let x = 0; x < w; x += 32) {
      ctx.fillRect(x, 0, 7, h);
    }
    ctx.fillStyle = '#7e766b';
    for (let y = 0; y < h; y += 64) {
      ctx.fillRect(0, y, w, 5);
    }
  } else if (style === 'glass') {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#365574');
    grad.addColorStop(0.5, '#1e354d');
    grad.addColorStop(1, '#2b4a68');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Deterministic pseudo-random for rich lit-window variation
  let seed =
    style === 'glass' ? 11 : style === 'artdeco' ? 37 : style === 'brick' ? 71 : 103;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const cols = style === 'glass' ? 8 : 6;
  const rows = style === 'glass' ? 16 : 14;
  const cellW = w / cols;
  const cellH = h / rows;
  const padX = style === 'glass' ? 3 : 6;
  const padY = style === 'glass' ? 4 : 7;

  for (let r = 0; r < rows; r++) {
    const floorLitBias = rand() > 0.35 ? 0.55 : 0.2;
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + padX;
      const y = r * cellH + padY;
      const ww = cellW - padX * 2;
      const wh = cellH - padY * 2;

      const litRoll = rand();
      const isLit = litRoll < floorLitBias;

      // Window frame recess in bump map
      bctx.fillStyle = '#383838';
      bctx.fillRect(x, y, ww, wh);
      bctx.fillStyle = '#c8c8c8';
      bctx.fillRect(x - 1, y + wh, ww + 2, 2);

      // Day reflection tint
      if (style === 'glass') {
        ctx.fillStyle = isLit ? '#8bc2e8' : '#4a7294';
      } else if (style === 'modern') {
        ctx.fillStyle = isLit ? '#9fc5de' : '#324254';
      } else {
        ctx.fillStyle = isLit ? '#687f96' : '#252e38';
      }
      ctx.fillRect(x, y, ww, wh);

      // Mullion highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, ww, 2);

      // Night emissive glow (warm tungsten / cool office fluorescent)
      if (isLit) {
        const warm = rand() > 0.35;
        ectx.fillStyle = warm
          ? rand() > 0.5
            ? '#ffd98a'
            : '#ffbe66'
          : '#b6e3ff';
        ectx.fillRect(x + 1, y + 1, ww - 2, wh - 2);
        // Blinds / silhouette band
        if (rand() > 0.55) {
          ectx.fillStyle = 'rgba(15,20,30,0.45)';
          ectx.fillRect(x + 1, y + 1, ww - 2, wh * 0.35);
        }
      }
    }
  }

  // Horizontal steel spandrels on glass/modern towers
  if (style === 'glass' || style === 'modern') {
    ctx.fillStyle = '#18212b';
    for (let r = 0; r < rows; r++) {
      ctx.fillRect(0, r * cellH, w, 3);
    }
    bctx.fillStyle = '#dedede';
    for (let r = 0; r < rows; r++) {
      bctx.fillRect(0, r * cellH, w, 3);
    }
  }

  return {
    map: finalizeColorTex(cColor, maxAniso),
    emissiveMap: finalizeColorTex(cEmit, maxAniso),
    bumpMap: finalizeDataTex(cBump, maxAniso),
  };
}

function makeRoadTexture(maxAniso: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = 256;
  b.height = 256;
  const bctx = b.getContext('2d')!;

  ctx.fillStyle = '#2b2e33';
  ctx.fillRect(0, 0, 256, 256);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 256, 256);

  // Asphalt grain
  for (let i = 0; i < 3200; i++) {
    const x = (i * 73) % 256;
    const y = (i * 151) % 256;
    const v = 34 + ((i * 29) % 26);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
    ctx.fillRect(x, y, 2, 2);
    const bv = 105 + ((i * 19) % 50);
    bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bctx.fillRect(x, y, 2, 2);
  }

  // Double yellow NYC center line
  ctx.fillStyle = '#e8b62c';
  ctx.fillRect(121, 0, 5, 256);
  ctx.fillRect(130, 0, 5, 256);

  // Dashed white lane dividers
  ctx.fillStyle = '#d9dde3';
  for (let y = 12; y < 256; y += 56) {
    ctx.fillRect(62, y, 4, 28);
    ctx.fillRect(190, y, 4, 28);
  }

  // Curb edge line
  ctx.fillStyle = '#535862';
  ctx.fillRect(0, 0, 8, 256);
  ctx.fillRect(248, 0, 8, 256);

  return {
    map: finalizeColorTex(c, maxAniso, 1, 14),
    bump: finalizeDataTex(b, maxAniso, 1, 14),
  };
}

function makeSidewalkTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8a8e94';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1600; i++) {
    const x = (i * 53) % 256;
    const y = (i * 97) % 256;
    const v = 124 + ((i * 17) % 28);
    ctx.fillStyle = `rgb(${v},${v + 1},${v + 2})`;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = '#5c6066';
  ctx.lineWidth = 2;
  for (let k = 0; k <= 256; k += 64) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, k);
    ctx.lineTo(256, k);
    ctx.stroke();
  }
  return finalizeColorTex(c, maxAniso, 18, 18);
}

function makeParkGrassTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3c6e35';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 3600; i++) {
    const x = (i * 67) % 256;
    const y = (i * 131) % 256;
    const g = 92 + ((i * 31) % 44);
    ctx.fillStyle = `rgb(${Math.round(g * 0.56)},${g},${Math.round(g * 0.48)})`;
    ctx.fillRect(x, y, 2, 3);
  }
  return finalizeColorTex(c, maxAniso, 10, 10);
}

function makeSpiderSuitTextures(maxAniso: number) {
  // 1. Red web-pattern fabric
  const cRed = document.createElement('canvas');
  cRed.width = 256;
  cRed.height = 256;
  const rctx = cRed.getContext('2d')!;
  rctx.fillStyle = '#cf1b26';
  rctx.fillRect(0, 0, 256, 256);

  // Subtle fabric micro-grid
  rctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < 256; y += 4) {
    rctx.fillRect(0, y, 256, 1);
  }

  // Crisp black web pattern
  rctx.strokeStyle = '#14151a';
  rctx.lineWidth = 2.4;
  for (let x = 0; x <= 256; x += 32) {
    rctx.beginPath();
    rctx.moveTo(x, 0);
    rctx.lineTo(x, 256);
    rctx.stroke();
  }
  for (let y = 0; y <= 256; y += 28) {
    rctx.beginPath();
    for (let x = 0; x <= 256; x += 32) {
      rctx.moveTo(x, y);
      rctx.quadraticCurveTo(x + 16, y + 8, x + 32, y);
    }
    rctx.stroke();
  }

  // 2. Chest texture with iconic black Spider Emblem
  const cChest = document.createElement('canvas');
  cChest.width = 256;
  cChest.height = 256;
  const cctx = cChest.getContext('2d')!;
  cctx.drawImage(cRed, 0, 0);

  // Draw crisp centered spider emblem
  cctx.save();
  cctx.translate(128, 128);
  cctx.fillStyle = '#0e1015';
  cctx.strokeStyle = '#0e1015';
  cctx.lineCap = 'round';
  cctx.lineJoin = 'round';

  // Head/thorax + pointed abdomen
  cctx.beginPath();
  cctx.ellipse(0, -18, 10, 12, 0, 0, Math.PI * 2);
  cctx.fill();
  cctx.beginPath();
  cctx.moveTo(0, -8);
  cctx.bezierCurveTo(18, -2, 16, 26, 0, 44);
  cctx.bezierCurveTo(-16, 26, -18, -2, 0, -8);
  cctx.fill();

  // 8 sharp angular spider legs
  cctx.lineWidth = 5.5;
  const legs: Array<[number, number, number, number, number, number]> = [
    [6, -16, 30, -34, 46, -54],
    [8, -10, 38, -20, 56, -24],
    [8, -2, 42, 6, 54, 24],
    [7, 8, 32, 24, 40, 52],
  ];
  for (const side of [-1, 1]) {
    for (const [x0, y0, x1, y1, x2, y2] of legs) {
      cctx.beginPath();
      cctx.moveTo(side * x0, y0);
      cctx.lineTo(side * x1, y1);
      cctx.lineTo(side * x2, y2);
      cctx.stroke();
    }
  }
  cctx.restore();

  // 3. Athletic cobalt-blue suit fabric
  const cBlue = document.createElement('canvas');
  cBlue.width = 256;
  cBlue.height = 256;
  const bctx = cBlue.getContext('2d')!;
  bctx.fillStyle = '#13428c';
  bctx.fillRect(0, 0, 256, 256);

  bctx.strokeStyle = 'rgba(255,255,255,0.06)';
  bctx.lineWidth = 1.5;
  for (let y = 0; y < 256; y += 12) {
    for (let x = 0; x < 256; x += 12) {
      bctx.strokeRect(x + (y % 24 === 0 ? 0 : 6), y, 8, 8);
    }
  }

  // 4. Suit bump texture
  const cBump = document.createElement('canvas');
  cBump.width = 256;
  cBump.height = 256;
  const bumpCtx = cBump.getContext('2d')!;
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, 256, 256);
  bumpCtx.strokeStyle = '#d8d8d8';
  bumpCtx.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) {
    bumpCtx.beginPath();
    bumpCtx.moveTo(x, 0);
    bumpCtx.lineTo(x, 256);
    bumpCtx.stroke();
  }

  return {
    spiderRedMap: finalizeColorTex(cRed, maxAniso, 2, 2),
    spiderChestMap: finalizeColorTex(cChest, maxAniso, 1, 1),
    spiderBlueMap: finalizeColorTex(cBlue, maxAniso, 2, 2),
    spiderSuitBump: finalizeDataTex(cBump, maxAniso, 2, 2),
  };
}

function makeBillboards(maxAniso: number): THREE.CanvasTexture[] {
  const designs = [
    {
      bg: '#b91c1c',
      accent: '#fde047',
      title: 'DAILY BUGLE',
      sub: 'WALL-CRAWLER SPOTTED OVER MIDTOWN!',
    },
    {
      bg: '#064e3b',
      accent: '#34d399',
      title: 'OSCORP',
      sub: 'NEXT-GEN CLEAN ENERGY & BIO-TECH',
    },
    {
      bg: '#1e3a8a',
      accent: '#38bdf8',
      title: 'MIDTOWN EXPO',
      sub: 'NEW YORK FUTURE SKYLINE 2026',
    },
    {
      bg: '#3b0764',
      accent: '#f472b6',
      title: 'BROADWAY LIVE',
      sub: 'NIGHTLY SHOWS AT TIMES PLAZA',
    },
  ];

  return designs.map((d) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = d.bg;
    ctx.fillRect(0, 0, 512, 256);

    // Bold diagonal stripe
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(310, 0);
    ctx.lineTo(512, 0);
    ctx.lineTo(512, 256);
    ctx.lineTo(220, 256);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = d.accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, 488, 232);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 66px "Barlow Condensed", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.title, 256, 108);

    ctx.fillStyle = d.accent;
    ctx.font = '700 23px Inter, Arial, sans-serif';
    ctx.fillText(d.sub, 256, 178);

    return finalizeColorTex(c, maxAniso, 1, 1);
  });
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0,0,0,0.72)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(
  maxAnisotropy: number
): ProceduralTextureBundle {
  const buildingMaps = {
    glass: makeBuildingTextures('glass', maxAnisotropy),
    artdeco: makeBuildingTextures('artdeco', maxAnisotropy),
    brick: makeBuildingTextures('brick', maxAnisotropy),
    modern: makeBuildingTextures('modern', maxAnisotropy),
  };
  const road = makeRoadTexture(maxAnisotropy);
  const sidewalkMap = makeSidewalkTexture(maxAnisotropy);
  const parkGrassMap = makeParkGrassTexture(maxAnisotropy);
  const suit = makeSpiderSuitTextures(maxAnisotropy);
  const billboards = makeBillboards(maxAnisotropy);
  const contactShadowMap = makeContactShadowTexture();

  return {
    buildingMaps,
    roadMap: road.map,
    roadBump: road.bump,
    sidewalkMap,
    parkGrassMap,
    ...suit,
    billboards,
    contactShadowMap,
    dispose() {
      for (const style of Object.values(buildingMaps)) {
        style.map.dispose();
        style.emissiveMap.dispose();
        style.bumpMap.dispose();
      }
      road.map.dispose();
      road.bump.dispose();
      sidewalkMap.dispose();
      parkGrassMap.dispose();
      suit.spiderRedMap.dispose();
      suit.spiderChestMap.dispose();
      suit.spiderBlueMap.dispose();
      suit.spiderSuitBump.dispose();
      billboards.forEach((b) => b.dispose());
      contactShadowMap.dispose();
    },
  };
}
