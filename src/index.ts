import * as THREE from 'three';
import * as xb from 'xrblocks';
import { SpiderManGame } from './game/SpiderManGame';
import { GameHudController } from './game/hud';
import type { HudSnapshot } from './types';

/**
 * Detects CPU software WebGL (SwiftShader, llvmpipe, WARP) from the GPU renderer string.
 * Used strictly for rendering cost & frame pacing (never alters scene content or logic).
 */
function detectSoftwareWebGL(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) ?? '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

async function bootstrap(): Promise<void> {
  const viewportEl = document.getElementById('game-viewport')!;
  const uiRoot = document.getElementById('game-ui-root')!;
  const isSoftwareGl = detectSoftwareWebGL();

  // Create dedicated canvas inside isolated #game-viewport mount container
  const canvas = document.createElement('canvas');
  canvas.dataset.testid = 'game-canvas';
  viewportEl.appendChild(canvas);

  let hudController: GameHudController | null = null;
  let pendingSnapshot: HudSnapshot | null = null;

  const gameScript = new SpiderManGame(isSoftwareGl, (snap) => {
    if (hudController) {
      hudController.update(snap);
    } else {
      pendingSnapshot = snap;
    }
  });

  hudController = new GameHudController(uiRoot, gameScript);

  // Configure XR Blocks for full-bleed 3D open-world browser & XR play
  const options = new xb.Options();
  options.canvas = canvas;
  options.antialias = !isSoftwareGl;
  options.enableVR();
  options.xrButton.enabled = false;
  options.enableSimulator = false;
  options.reticles.enabled = false;
  options.camera.near = 0.25;
  options.camera.far = 950;
  options.setAppTitle('Spider-Man 3D: Web of New York');

  xb.add(gameScript);
  await xb.init(options);

  if (pendingSnapshot) {
    hudController.update(pendingSnapshot);
    pendingSnapshot = null;
  }

  // Keep canvas sized crisply to container
  const renderer = xb.core.renderer as THREE.WebGLRenderer;
  const camera = xb.core.camera;
  const handleResize = () => {
    const w = viewportEl.clientWidth || window.innerWidth;
    const h = viewportEl.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  handleResize();
  window.addEventListener('resize', handleResize);

  // On software WebGL (headless Chromium / SwiftShader), pace frames via fenceSync + afterDraw
  // so main-thread UI and browser automation never starve. On real GPUs, xrblocks runs at native refresh!
  if (isSoftwareGl) {
    renderer.setAnimationLoop(null);
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            window.setTimeout(cb, 80);
          }
        };
        window.setTimeout(poll, 5);
      } else {
        window.setTimeout(cb, 80);
      }
    };

    const tickSoftware = () => {
      const now = performance.now();
      const dtMs = Math.min(50, Math.max(16, now - lastTime));
      lastTime = now;
      xb.core.stepFrame(dtMs);
      afterDraw(tickSoftware);
    };

    tickSoftware();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void bootstrap();
});
