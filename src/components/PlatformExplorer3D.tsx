import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { SeoPillarId } from '../types/navigation';
import { useThemeStore } from '../stores/useThemeStore';
import {
  SEO_PILLARS,
  computeDampedValue,
  getPillarById,
} from '../utils/seoPreviewLogic';

interface PlatformExplorer3DProps {
  activePillar: SeoPillarId;
  onSelectPillar: (id: SeoPillarId) => void;
}

const EXPLORER_READOUTS: Record<
  SeoPillarId,
  { title: string; subtitle: string }
> = {
  'technical-seo': {
    title: 'Technical Crawl Engine',
    subtitle: 'HTTP + Headless Chromium · SSRF-Guarded',
  },
  'keyword-intelligence': {
    title: 'Google Search Console Sync',
    subtitle: 'OAuth webmasters.readonly · Top Queries',
  },
  'ai-content': {
    title: 'PageSpeed Insights v5',
    subtitle: 'Live CWV (LCP, CLS, INP, TTFB)',
  },
  'geo-visibility': {
    title: 'Ticket & Reverification Loop',
    subtitle: 'Dual RBAC Signoff · Targeted Re-Crawl',
  },
  'analytics-roi': {
    title: 'GA4 Organic Sessions',
    subtitle: 'OAuth analytics.readonly · Landing Pages',
  },
};

const _tempVec = new THREE.Vector3();
const _tempTarget = new THREE.Vector3();
const _tempMat = new THREE.Matrix4();
const _tempQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3(1, 1, 1);

function createPedestalGridTexture(isDark: boolean): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isDark ? '#111827' : '#F3F4FA';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = isDark
      ? 'rgba(139, 107, 255, 0.22)'
      : 'rgba(112, 71, 235, 0.16)';
    ctx.lineWidth = 1.5;
    const step = size / 8;
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    ctx.strokeStyle = isDark
      ? 'rgba(34, 211, 238, 0.25)'
      : 'rgba(37, 99, 235, 0.22)';
    ctx.lineWidth = 2;
    for (const r of [90, 160, 224]) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createRadialShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      10,
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
    grad.addColorStop(0.55, 'rgba(112, 71, 235, 0.14)');
    grad.addColorStop(1, 'rgba(112, 71, 235, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function PlatformExplorer3D({
  activePillar,
  onSelectPillar,
}: PlatformExplorer3DProps) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const mountRef = useRef<HTMLDivElement>(null);
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);

  const activePillarRef = useRef<SeoPillarId>(activePillar);
  const explodeTargetRef = useRef<number>(explodeFactor);
  const cameraGoalRef = useRef<{
    pos: [number, number, number];
    target: [number, number, number];
    active: boolean;
  }>({
    pos: getPillarById(activePillar).cameraPosition,
    target: getPillarById(activePillar).cameraTarget,
    active: false,
  });
  const requestRenderFnRef = useRef<(() => void) | null>(null);
  const themeSyncRef = useRef<((dark: boolean) => void) | null>(null);

  useEffect(() => {
    activePillarRef.current = activePillar;
    const spec = getPillarById(activePillar);
    cameraGoalRef.current = {
      pos: spec.cameraPosition,
      target: spec.cameraTarget,
      active: true,
    };
    requestRenderFnRef.current?.();
  }, [activePillar]);

  useEffect(() => {
    explodeTargetRef.current = explodeFactor;
    requestRenderFnRef.current?.();
  }, [explodeFactor]);

  useEffect(() => {
    themeSyncRef.current?.(isDark);
    requestRenderFnRef.current?.();
  }, [isDark]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 520;
    const initialBg = isDark ? '#090D16' : '#F7F8FC';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialBg);
    scene.fog = new THREE.Fog(initialBg, 14, 34);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    const initialPillar = getPillarById(activePillarRef.current);
    camera.position.set(...initialPillar.cameraPosition);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const keyLight = new THREE.DirectionalLight('#FFF6EA', 2.1);
    keyLight.position.set(6, 9, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight('#E0E7FF', '#CBD5E1', 1.1);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight('#7047EB', 0.95);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...initialPillar.cameraTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 4.2;
    controls.maxDistance = 12.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minPolarAngle = 0.3;

    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];
    const disposableTexs: THREE.Texture[] = [];

    const lightGridTex = createPedestalGridTexture(false);
    const darkGridTex = createPedestalGridTexture(true);
    lightGridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    darkGridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    disposableTexs.push(lightGridTex, darkGridTex);

    const shadowTexture = createRadialShadowTexture();
    disposableTexs.push(shadowTexture);

    const baseFloorGeo = new THREE.CylinderGeometry(4.6, 4.85, 0.14, 48);
    const baseFloorMat = new THREE.MeshStandardMaterial({
      color: isDark ? '#1E293B' : '#FFFFFF',
      map: isDark ? darkGridTex : lightGridTex,
      roughness: 0.72,
      metalness: 0.08,
    });
    disposableGeos.push(baseFloorGeo);
    disposableMats.push(baseFloorMat);
    const baseFloor = new THREE.Mesh(baseFloorGeo, baseFloorMat);
    baseFloor.position.y = -0.07;
    baseFloor.receiveShadow = true;
    scene.add(baseFloor);

    const contactShadowGeo = new THREE.CircleGeometry(3.4, 48);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    disposableGeos.push(contactShadowGeo);
    disposableMats.push(contactShadowMat);
    const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.015;
    scene.add(contactShadow);

    themeSyncRef.current = (dark: boolean) => {
      const bg = dark ? '#090D16' : '#F7F8FC';
      scene.background = new THREE.Color(bg);
      scene.fog = new THREE.Fog(bg, 14, 34);
      baseFloorMat.map = dark ? darkGridTex : lightGridTex;
      baseFloorMat.color.set(dark ? '#1E293B' : '#FFFFFF');
      baseFloorMat.needsUpdate = true;
    };

    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    const lathePoints = [
      new THREE.Vector2(0.01, 0),
      new THREE.Vector2(0.72, 0.04),
      new THREE.Vector2(0.54, 0.35),
      new THREE.Vector2(0.32, 0.9),
      new THREE.Vector2(0.42, 1.35),
      new THREE.Vector2(0.24, 1.85),
      new THREE.Vector2(0.01, 2.15),
    ];
    const spindleGeo = new THREE.LatheGeometry(lathePoints, 32);
    const spindleMat = new THREE.MeshPhysicalMaterial({
      color: '#7047EB',
      roughness: 0.18,
      metalness: 0.85,
      clearcoat: 0.8,
    });
    disposableGeos.push(spindleGeo);
    disposableMats.push(spindleMat);
    const spindleMesh = new THREE.Mesh(spindleGeo, spindleMat);
    spindleMesh.castShadow = true;
    coreGroup.add(spindleMesh);

    const hexShape = new THREE.Shape();
    const hexR = 0.96;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * hexR;
      const py = Math.sin(a) * hexR;
      if (i === 0) hexShape.moveTo(px, py);
      else hexShape.lineTo(px, py);
    }
    hexShape.closePath();
    const collarGeo = new THREE.ExtrudeGeometry(hexShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04,
    });
    collarGeo.rotateX(Math.PI / 2);
    const collarMat = new THREE.MeshStandardMaterial({
      color: '#EEF0FF',
      roughness: 0.58,
      metalness: 0.25,
    });
    disposableGeos.push(collarGeo);
    disposableMats.push(collarMat);
    const collarMesh = new THREE.Mesh(collarGeo, collarMat);
    collarMesh.position.y = 0.18;
    collarMesh.castShadow = true;
    coreGroup.add(collarMesh);

    const ringGeoA = new THREE.TorusGeometry(1.38, 0.045, 16, 64);
    const ringMatA = new THREE.MeshStandardMaterial({
      color: '#2563EB',
      roughness: 0.32,
      metalness: 0.78,
    });
    disposableGeos.push(ringGeoA);
    disposableMats.push(ringMatA);
    const ringMeshA = new THREE.Mesh(ringGeoA, ringMatA);
    ringMeshA.position.y = 1.15;
    ringMeshA.rotation.set(Math.PI / 3, 0.2, 0);
    coreGroup.add(ringMeshA);

    const ringGeoB = new THREE.TorusGeometry(1.65, 0.032, 16, 64);
    const ringMatB = new THREE.MeshStandardMaterial({
      color: '#0D9488',
      roughness: 0.25,
      metalness: 0.65,
    });
    disposableGeos.push(ringGeoB);
    disposableMats.push(ringMatB);
    const ringMeshB = new THREE.Mesh(ringGeoB, ringMatB);
    ringMeshB.position.y = 1.25;
    ringMeshB.rotation.set(-Math.PI / 3.4, -0.35, 0);
    coreGroup.add(ringMeshB);

    const pillarBaseGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.16, 24);
    const pillarShaftGeo = new THREE.CylinderGeometry(0.14, 0.2, 0.78, 24);
    const pillarCrownGeo = new THREE.OctahedronGeometry(0.22, 0);
    const pillarBaseMat = new THREE.MeshStandardMaterial({
      color: '#E2E8F0',
      roughness: 0.72,
      metalness: 0.12,
    });
    disposableGeos.push(pillarBaseGeo, pillarShaftGeo, pillarCrownGeo);
    disposableMats.push(pillarBaseMat);

    const satelliteGroups: {
      id: SeoPillarId;
      group: THREE.Group;
      basePos: THREE.Vector3;
      crown: THREE.Mesh;
      crownMat: THREE.MeshStandardMaterial;
    }[] = [];

    const radius = 2.65;
    SEO_PILLARS.forEach((pillar, index) => {
      const angle = (index / SEO_PILLARS.length) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;

      const satGroup = new THREE.Group();
      satGroup.position.set(px, 0, pz);

      const baseMesh = new THREE.Mesh(pillarBaseGeo, pillarBaseMat);
      baseMesh.position.y = 0.08;
      baseMesh.castShadow = true;
      satGroup.add(baseMesh);

      const shaftMat = new THREE.MeshStandardMaterial({
        color: '#FFFFFF',
        roughness: 0.45,
        metalness: 0.2,
      });
      disposableMats.push(shaftMat);
      const shaftMesh = new THREE.Mesh(pillarShaftGeo, shaftMat);
      shaftMesh.position.y = 0.55;
      shaftMesh.castShadow = true;
      satGroup.add(shaftMesh);

      const crownMat = new THREE.MeshStandardMaterial({
        color: pillar.accentHex,
        roughness: 0.2,
        metalness: 0.75,
        emissive: new THREE.Color(pillar.accentHex),
        emissiveIntensity: 0.12,
      });
      disposableMats.push(crownMat);
      const crownMesh = new THREE.Mesh(pillarCrownGeo, crownMat);
      crownMesh.position.y = 1.18;
      crownMesh.castShadow = true;
      satGroup.add(crownMesh);

      scene.add(satGroup);
      satelliteGroups.push({
        id: pillar.id,
        group: satGroup,
        basePos: new THREE.Vector3(px, 0, pz),
        crown: crownMesh,
        crownMat,
      });

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(angle) * 0.75, 0.16, Math.sin(angle) * 0.75),
        new THREE.Vector3(Math.cos(angle) * 1.65, 0.06, Math.sin(angle) * 1.65),
        new THREE.Vector3(px * 0.88, 0.1, pz * 0.88),
      ]);
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.025, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: pillar.accentHex,
        roughness: 0.35,
        metalness: 0.6,
      });
      disposableGeos.push(tubeGeo);
      disposableMats.push(tubeMat);
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tubeMesh);
    });

    const nodeCount = 32;
    const nodeGeo = new THREE.OctahedronGeometry(0.055, 0);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: '#0891B2',
      roughness: 0.25,
      metalness: 0.7,
    });
    disposableGeos.push(nodeGeo);
    disposableMats.push(nodeMat);

    const instancedNodes = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      const a = (i / nodeCount) * Math.PI * 2;
      const r = 2.0 + (i % 4) * 0.55;
      const y = 0.65 + (i % 5) * 0.38;
      _tempVec.set(Math.cos(a) * r, y, Math.sin(a) * r);
      _tempQuat.setFromAxisAngle(_tempTarget.set(0, 1, 0), a);
      const scaleVar = 0.85 + ((i * 7) % 10) * 0.03;
      _tempScale.set(scaleVar, scaleVar, scaleVar);
      _tempMat.compose(_tempVec, _tempQuat, _tempScale);
      instancedNodes.setMatrixAt(i, _tempMat);
    }
    instancedNodes.instanceMatrix.needsUpdate = true;
    instancedNodes.computeBoundingSphere();
    scene.add(instancedNodes);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let currentExplode = 0;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    const onControlStart = () => {
      cameraGoalRef.current.active = false;
    };
    const onControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function stepScene(dt: number): boolean {
      let needsAnotherFrame = false;

      const explodeDiff = Math.abs(explodeTargetRef.current - currentExplode);
      if (explodeDiff > 0.002) {
        currentExplode = computeDampedValue(
          currentExplode,
          explodeTargetRef.current,
          8,
          dt,
        );
        needsAnotherFrame = true;
      } else {
        currentExplode = explodeTargetRef.current;
      }

      collarMesh.position.y = 0.18 + currentExplode * 0.45;
      ringMeshA.position.y = 1.15 + currentExplode * 0.55;
      ringMeshB.position.y = 1.25 + currentExplode * 0.78;
      spindleMesh.position.y = currentExplode * 0.35;

      satelliteGroups.forEach((sat) => {
        const isCurrent = sat.id === activePillarRef.current;
        const radialPush = 1 + currentExplode * 0.28;
        sat.group.position.set(
          sat.basePos.x * radialPush,
          currentExplode * (isCurrent ? 0.55 : 0.25),
          sat.basePos.z * radialPush,
        );
        sat.crown.position.y = 1.18 + currentExplode * 0.35;
        sat.crownMat.emissiveIntensity = isCurrent ? 0.45 : 0.1;
      });

      if (cameraGoalRef.current.active) {
        const [gx, gy, gz] = cameraGoalRef.current.pos;
        const [tx, ty, tz] = cameraGoalRef.current.target;

        camera.position.x = computeDampedValue(camera.position.x, gx, 5.5, dt);
        camera.position.y = computeDampedValue(camera.position.y, gy, 5.5, dt);
        camera.position.z = computeDampedValue(camera.position.z, gz, 5.5, dt);

        controls.target.x = computeDampedValue(controls.target.x, tx, 5.5, dt);
        controls.target.y = computeDampedValue(controls.target.y, ty, 5.5, dt);
        controls.target.z = computeDampedValue(controls.target.z, tz, 5.5, dt);

        const dist =
          Math.abs(camera.position.x - gx) +
          Math.abs(camera.position.y - gy) +
          Math.abs(camera.position.z - gz);
        if (dist < 0.03) {
          camera.position.set(gx, gy, gz);
          controls.target.set(tx, ty, tz);
          cameraGoalRef.current.active = false;
        } else {
          needsAnotherFrame = true;
        }
      }

      controls.update();
      return needsAnotherFrame;
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const keepStepping = stepScene(dt);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || keepStepping) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    requestRenderFnRef.current = requestRender;
    requestRender();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 960;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      disposableTexs.forEach((t) => t.dispose());
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      requestRenderFnRef.current = null;
      themeSyncRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readout = EXPLORER_READOUTS[activePillar];

  return (
    <section
      id="platform-explorer"
      aria-labelledby="platform-explorer-heading"
      className="bg-[var(--bg-canvas)] py-16 sm:py-20 border-b border-[var(--border-hairline)]"
    >
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xs font-semibold tracking-[0.12em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
              Interactive Architecture Model
            </p>
            <h2
              id="platform-explorer-heading"
              className="mt-1.5 font-display text-2xl sm:text-[32px] font-bold tracking-tight text-[var(--text-primary)] text-balance"
            >
              Explore the Rovix Search Intelligence Core
            </h2>
          </div>
          <p className="max-w-md text-sm text-[var(--text-muted)]">
            Drag to orbit or select a node below to inspect how technical crawling,
            GSC/GA4 sync, and reverification work together.
          </p>
        </div>

        <div className="relative h-[460px] sm:h-[540px] w-full overflow-hidden rounded-[24px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] shadow-[0_24px_48px_-20px_rgba(15,23,42,0.12)]">
          <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-[310px] rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-4 py-3 shadow-sm">
            <div className="font-display text-[13.5px] font-semibold text-[var(--text-primary)]">
              {readout.title}
            </div>
            <div className="mt-0.5 font-mono text-[11px] font-medium text-[#7047EB] dark:text-[#8B6BFF]">
              {readout.subtitle}
            </div>
          </div>

          <div
            ref={mountRef}
            data-testid="threejs-platform-canvas"
            className="h-full w-full cursor-grab active:cursor-grabbing"
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center px-3">
            <button
              type="button"
              onClick={() => setControlsCollapsed((prev) => !prev)}
              aria-expanded={!controlsCollapsed}
              className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-3 py-1 text-[11.5px] font-medium text-[var(--text-secondary)] shadow-sm cursor-pointer hover:text-[var(--text-primary)]"
            >
              {controlsCollapsed ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Show Controls</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Hide Controls</span>
                </>
              )}
            </button>

            {!controlsCollapsed && (
              <div className="pointer-events-auto flex w-full max-w-[840px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-3.5 py-2.5 shadow-[0_14px_32px_-12px_rgba(15,23,42,0.2)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  {SEO_PILLARS.map((p) => {
                    const active = p.id === activePillar;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPillar(p.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#7047EB] text-white'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {EXPLORER_READOUTS[p.id].title}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                    <span className="whitespace-nowrap">Explode</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={explodeFactor}
                      onChange={(e) => setExplodeFactor(Number(e.target.value))}
                      aria-label="Exploded architecture view"
                      className="h-1.5 w-20 accent-[#7047EB] cursor-pointer"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setExplodeFactor(0);
                      const spec = getPillarById(activePillar);
                      cameraGoalRef.current = {
                        pos: spec.cameraPosition,
                        target: spec.cameraTarget,
                        active: true,
                      };
                      requestRenderFnRef.current?.();
                    }}
                    aria-label="Reset 3D camera view"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
