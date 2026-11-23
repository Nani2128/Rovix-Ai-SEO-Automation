import {
  type ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ThemePresetId } from '../../config/themes';
import {
  extractTheme3DPalette,
  getStateVisualSpec,
  resolveAgentFactoryLayout,
  type Theme3DPalette,
} from '../../lib/agentFactoryState';
import { formatMicroUsd } from '../../lib/usageCostEngine';
import type {
  AgentActiveCommunicationLink,
  AgentId,
  AgentStationNodeSnapshot,
} from '../../types/agentFactory';

export interface AgentFactorySceneSettings {
  showLabels: boolean;
  ambientAnimation: boolean;
  focusOnSelect: boolean;
  showSecondaryLinks: boolean;
}

export interface AgentFactoryScene3DProps {
  nodes: AgentStationNodeSnapshot[];
  activeLinks: AgentActiveCommunicationLink[];
  selectedAgentId: AgentId;
  hoveredAgentId: AgentId | null;
  themePreset: ThemePresetId;
  reducedMotion: boolean;
  resetSignal: number;
  focusSelectedSignal: number;
  settings: AgentFactorySceneSettings;
  onSelectAgent: (agentId: AgentId) => void;
  onHoverAgent: (agentId: AgentId | null) => void;
  onWebGLUnavailable: () => void;
}

interface ProjectedLabel {
  agentId: AgentId;
  x: number;
  y: number;
  visible: boolean;
}

interface StationSceneRig {
  agentId: AgentId;
  rootGroup: THREE.Group;
  robotGroup: THREE.Group;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshStandardMaterial;
  screenMat: THREE.MeshStandardMaterial;
  plinthMesh: THREE.Mesh;
  plinthTrimMesh: THREE.Mesh;
  relayTileMat: THREE.MeshStandardMaterial;
  conduitMat: THREE.MeshStandardMaterial;
  conduitCurve: THREE.CatmullRomCurve3 | null;
  worldAnchor: THREE.Vector3;
  baseY: number;
}

const DEFAULT_CAMERA_POS = new THREE.Vector3(14.8, 12.6, 15.8);
const DEFAULT_TARGET_POS = new THREE.Vector3(0, 0.35, 0);

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      probeCanvas.getContext('webgl2') ||
      probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const rendererStr = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
      rendererStr,
    );
  } catch {
    return true;
  }
}

function createRoundedRectShape(
  width: number,
  depth: number,
  radius: number,
): THREE.Shape {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hw, hd);
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}

function createHoloPanelTexture(
  accentHex: string,
  title: string,
  isOrchestrator: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(10, 18, 34, 0.58)';
    ctx.fillRect(0, 0, 256, 128);

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 248, 120);

    ctx.fillStyle = accentHex;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(14, 14, isOrchestrator ? 96 : 72, 6);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(14, 28, 224, 2);

    ctx.globalAlpha = 0.72;
    const barCount = isOrchestrator ? 8 : 5;
    for (let i = 0; i < barCount; i++) {
      const h = 14 + ((i * 19 + title.length * 7) % 36);
      ctx.fillRect(16 + i * 18, 96 - h, 10, h);
    }

    ctx.beginPath();
    ctx.arc(204, 66, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(148, 66);
    ctx.lineTo(184, 66);
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#E2E8F0';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(title.toUpperCase().slice(0, 16), 14, 114);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addRoleMicroProps(params: {
  propKind: AgentStationNodeSnapshot['propKind'];
  group: THREE.Group;
  darkBodyMat: THREE.Material;
  accentMat: THREE.Material;
  trimMat: THREE.Material;
  disposableGeos: THREE.BufferGeometry[];
}) {
  const { propKind, group, darkBodyMat, accentMat, trimMat, disposableGeos } =
    params;
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };

  switch (propKind) {
    case 'server': {
      const rackGeo = track(new THREE.BoxGeometry(0.28, 0.68, 0.32));
      const rack1 = new THREE.Mesh(rackGeo, darkBodyMat);
      rack1.position.set(-0.78, 0.42, 0.25);
      const rack2 = new THREE.Mesh(rackGeo, darkBodyMat);
      rack2.position.set(0.78, 0.36, 0.28);
      rack2.scale.set(0.9, 0.82, 0.9);
      const ledGeo = track(new THREE.BoxGeometry(0.18, 0.04, 0.03));
      const led1 = new THREE.Mesh(ledGeo, accentMat);
      led1.position.set(-0.78, 0.56, 0.42);
      const led2 = new THREE.Mesh(ledGeo, accentMat);
      led2.position.set(-0.78, 0.44, 0.42);
      group.add(rack1, rack2, led1, led2);
      break;
    }
    case 'radar': {
      const mastGeo = track(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 10));
      const dishGeo = track(new THREE.ConeGeometry(0.24, 0.16, 14));
      const mast = new THREE.Mesh(mastGeo, trimMat);
      mast.position.set(-0.76, 0.35, 0.2);
      const dish = new THREE.Mesh(dishGeo, accentMat);
      dish.position.set(-0.76, 0.62, 0.22);
      dish.rotation.x = Math.PI * 0.35;
      const box = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.26, 0.22, 0.26)),
        darkBodyMat,
      );
      box.position.set(0.74, 0.2, 0.32);
      group.add(mast, dish, box);
      break;
    }
    case 'compare': {
      const colGeo = track(new THREE.BoxGeometry(0.22, 0.56, 0.22));
      const colL = new THREE.Mesh(colGeo, darkBodyMat);
      colL.position.set(-0.78, 0.36, 0.25);
      const colR = new THREE.Mesh(colGeo, trimMat);
      colR.position.set(0.78, 0.44, 0.22);
      colR.scale.y = 1.2;
      const cap = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.24, 0.08, 0.24)),
        accentMat,
      );
      cap.position.set(0.78, 0.78, 0.22);
      group.add(colL, colR, cap);
      break;
    }
    case 'tags': {
      const tileGeo = track(new THREE.BoxGeometry(0.3, 0.08, 0.22));
      for (let i = 0; i < 3; i++) {
        const tile = new THREE.Mesh(tileGeo, i === 2 ? accentMat : trimMat);
        tile.position.set(-0.75, 0.16 + i * 0.1, 0.26);
        tile.rotation.y = i * 0.12;
        group.add(tile);
      }
      const cyl = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 14)),
        darkBodyMat,
      );
      cyl.position.set(0.76, 0.27, 0.26);
      group.add(cyl);
      break;
    }
    case 'globe': {
      const ped = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.14, 0.18, 0.22, 12)),
        darkBodyMat,
      );
      ped.position.set(-0.75, 0.2, 0.24);
      const globe = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.2, 16, 14)),
        accentMat,
      );
      globe.position.set(-0.75, 0.48, 0.24);
      const orbit = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.27, 0.022, 8, 24)),
        trimMat,
      );
      orbit.position.set(-0.75, 0.48, 0.24);
      orbit.rotation.set(0.55, 0.35, 0);
      group.add(ped, globe, orbit);
      break;
    }
    case 'gauge': {
      const arc = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.22, 0.045, 8, 18, Math.PI)),
        accentMat,
      );
      arc.position.set(-0.74, 0.3, 0.24);
      const base = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.36, 0.14, 0.24)),
        darkBodyMat,
      );
      base.position.set(-0.74, 0.16, 0.24);
      const canister = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 14)),
        trimMat,
      );
      canister.position.set(0.76, 0.3, 0.26);
      group.add(arc, base, canister);
      break;
    }
    case 'docs': {
      const folioGeo = track(new THREE.BoxGeometry(0.26, 0.34, 0.06));
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(folioGeo, i === 0 ? accentMat : trimMat);
        f.position.set(-0.78 + i * 0.06, 0.28 + i * 0.04, 0.26 - i * 0.06);
        f.rotation.y = -0.25 + i * 0.12;
        group.add(f);
      }
      const pad = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.26, 0.2, 0.22)),
        darkBodyMat,
      );
      pad.position.set(0.75, 0.19, 0.26);
      group.add(pad);
      break;
    }
    case 'quill': {
      const spire = new THREE.Mesh(
        track(new THREE.ConeGeometry(0.16, 0.5, 6)),
        trimMat,
      );
      spire.position.set(-0.74, 0.34, 0.24);
      const pod = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.24, 0.18, 0.24)),
        darkBodyMat,
      );
      pod.position.set(0.74, 0.18, 0.26);
      group.add(spire, pod);
      break;
    }
    case 'shield': {
      const monolith = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.18, 0.22, 0.52, 6)),
        darkBodyMat,
      );
      monolith.position.set(-0.74, 0.35, 0.22);
      const badge = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.14, 0.035, 8, 18)),
        accentMat,
      );
      badge.position.set(-0.74, 0.68, 0.22);
      const cube = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.22, 0.22, 0.22)),
        trimMat,
      );
      cube.position.set(0.75, 0.2, 0.28);
      group.add(monolith, badge, cube);
      break;
    }
    case 'chart':
    default: {
      for (let i = 0; i < 3; i++) {
        const h = 0.18 + i * 0.16;
        const bar = new THREE.Mesh(
          track(new THREE.BoxGeometry(0.11, h, 0.12)),
          i === 2 ? accentMat : trimMat,
        );
        bar.position.set(-0.84 + i * 0.13, 0.1 + h / 2, 0.26);
        group.add(bar);
      }
      const rack = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.15, 0.15, 0.36, 14)),
        darkBodyMat,
      );
      rack.position.set(0.75, 0.27, 0.26);
      group.add(rack);
      break;
    }
  }
}

interface InnerSceneProps {
  nodes: AgentStationNodeSnapshot[];
  activeLinks: AgentActiveCommunicationLink[];
  selectedAgentId: AgentId;
  hoveredAgentId: AgentId | null;
  palette: Theme3DPalette;
  reducedMotion: boolean;
  resetSignal: number;
  focusSelectedSignal: number;
  settings: AgentFactorySceneSettings;
  isSoftwareGl: boolean;
  onSelectAgent: (agentId: AgentId) => void;
  onHoverAgent: (agentId: AgentId | null) => void;
  onLabelsUpdate: (labels: ProjectedLabel[]) => void;
}

function AgentFactorySceneContent({
  nodes,
  activeLinks,
  selectedAgentId,
  hoveredAgentId,
  palette,
  reducedMotion,
  resetSignal,
  focusSelectedSignal,
  settings,
  isSoftwareGl,
  onSelectAgent,
  onHoverAgent,
  onLabelsUpdate,
}: InnerSceneProps) {
  const { gl, scene, camera, size, invalidate } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const sceneRootRef = useRef<THREE.Group>(null);

  // Live prop refs so mounted procedural geometry updates cleanly without rebuilding WebGL context
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const activeLinksRef = useRef(activeLinks);
  activeLinksRef.current = activeLinks;
  const selectedIdRef = useRef(selectedAgentId);
  selectedIdRef.current = selectedAgentId;
  const hoveredIdRef = useRef(hoveredAgentId);
  hoveredIdRef.current = hoveredAgentId;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const onSelectRef = useRef(onSelectAgent);
  onSelectRef.current = onSelectAgent;
  const onHoverRef = useRef(onHoverAgent);
  onHoverRef.current = onHoverAgent;
  const onLabelsUpdateRef = useRef(onLabelsUpdate);
  onLabelsUpdateRef.current = onLabelsUpdate;

  // Camera smooth transition state driven inside useFrame + OrbitControls
  const transitionActiveRef = useRef(false);
  const camGoalRef = useRef(DEFAULT_CAMERA_POS.clone());
  const targetGoalRef = useRef(DEFAULT_TARGET_POS.clone());
  const motionTimerRef = useRef<number | null>(null);
  const lastLabelsSigRef = useRef('');

  const layoutCoords = useMemo(() => resolveAgentFactoryLayout(), []);
  const coordById = useMemo(
    () => new Map(layoutCoords.map((c) => [c.agentId, c])),
    [layoutCoords],
  );

  // Refs to mutable Three.js scene objects for zero-GC material/packet updates
  const rigsRef = useRef<Map<AgentId, StationSceneRig>>(new Map());
  const packetInstancedRef = useRef<THREE.InstancedMesh | null>(null);
  const secondaryLinesRef = useRef<THREE.LineSegments | null>(null);
  const secondaryLinesGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const peerArcLinesRef = useRef<THREE.LineSegments | null>(null);
  const peerArcLinesGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const themeRefs = useRef<{
    floorMat: THREE.MeshStandardMaterial;
    gridRingMat: THREE.MeshBasicMaterial;
    plinthMat: THREE.MeshStandardMaterial;
    plinthTrimMat: THREE.MeshStandardMaterial;
    microDarkMat: THREE.MeshStandardMaterial;
    robotShellMat: THREE.MeshStandardMaterial;
    robotVisorMat: THREE.MeshPhysicalMaterial;
    hemiLight: THREE.HemisphereLight;
    keyLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
    secondaryLineMat: THREE.LineBasicMaterial;
  } | null>(null);

  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpPoint = useMemo(() => new THREE.Vector3(), []);
  const tmpProj = useMemo(() => new THREE.Vector3(), []);

  const applyVisualState = useCallback(() => {
    const currentNodes = nodesRef.current;
    const selId = selectedIdRef.current;
    const hovId = hoveredIdRef.current;
    const links = activeLinksRef.current;
    const p = paletteRef.current;
    const rigs = rigsRef.current;
    const selectedDef = currentNodes.find((n) => n.agentId === selId);
    const connectedSet = new Set<AgentId>(
      selectedDef ? [selId, ...selectedDef.connectedAgentIds] : [],
    );

    currentNodes.forEach((node) => {
      const rig = rigs.get(node.agentId);
      if (!rig) return;
      const spec = getStateVisualSpec(node.state);
      const isSelected = node.agentId === selId;
      const isHovered = node.agentId === hovId;
      const isNeighbor = connectedSet.has(node.agentId);
      const isUnavailable = node.state === 'unavailable';
      const isActive =
        node.state === 'running' ||
        node.state === 'communicating' ||
        node.state === 'retrying';

      const boost = isSelected ? 0.55 : isHovered ? 0.35 : 0;

      rig.ringMat.color.set(spec.colorHex);
      rig.ringMat.emissive.set(spec.emissiveHex);
      rig.ringMat.emissiveIntensity =
        (isUnavailable ? 0.1 : spec.emissiveIntensity) + boost;

      rig.coreMat.emissive.set(spec.emissiveHex);
      rig.coreMat.emissiveIntensity =
        (isUnavailable ? 0.08 : spec.emissiveIntensity * 0.9) + boost;

      rig.eyeMat.emissive.set(
        node.state === 'failed'
          ? '#EF4444'
          : isUnavailable
            ? '#475569'
            : spec.emissiveHex,
      );
      rig.eyeMat.emissiveIntensity = isUnavailable ? 0.1 : 1.45;

      rig.screenMat.opacity = isUnavailable ? 0.28 : isSelected ? 0.92 : 0.78;
      rig.screenMat.emissiveIntensity = isUnavailable
        ? 0.05
        : isSelected || isActive
          ? 0.55
          : 0.28;

      const hasDirectLink = links.some(
        (l) =>
          l.sourceAgentId === node.agentId ||
          l.destinationAgentId === node.agentId,
      );

      if (!node.isOrchestrator) {
        rig.conduitMat.color.set(
          hasDirectLink || isActive ? spec.colorHex : p.conduitIdleHex,
        );
        rig.conduitMat.emissive.set(spec.emissiveHex);
        rig.conduitMat.emissiveIntensity = hasDirectLink
          ? 1.15
          : isActive
            ? 0.75
            : isSelected || isHovered
              ? 0.45
              : 0.08;
        rig.conduitMat.opacity =
          hasDirectLink || isActive ? 0.95 : isNeighbor ? 0.8 : 0.45;

        rig.relayTileMat.emissive.set(spec.emissiveHex);
        rig.relayTileMat.emissiveIntensity =
          hasDirectLink || isActive ? 1.2 : 0.25;
      }
    });

    const secGeo = secondaryLinesGeoRef.current;
    const secLines = secondaryLinesRef.current;
    if (secGeo && secLines) {
      if (settingsRef.current.showSecondaryLinks && selectedDef) {
        const verts: number[] = [];
        const selCoord = coordById.get(selectedDef.agentId);
        if (selCoord) {
          for (const targetId of selectedDef.connectedAgentIds) {
            if (targetId === 'orchestrator' || selectedDef.isOrchestrator) continue;
            const tgtCoord = coordById.get(targetId);
            if (!tgtCoord) continue;
            verts.push(
              selCoord.x,
              0.14,
              selCoord.z,
              tgtCoord.x,
              0.14,
              tgtCoord.z,
            );
          }
        }
        secGeo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(verts, 3),
        );
        secGeo.computeBoundingSphere();
        secLines.visible = verts.length > 0;
      } else {
        secLines.visible = false;
      }
    }

    // Stage 3: Live peer-to-peer communication arcs (visible strictly when real peer links are active)
    const peerArcGeo = peerArcLinesGeoRef.current;
    const peerArcLines = peerArcLinesRef.current;
    if (peerArcGeo && peerArcLines) {
      const peerVerts: number[] = [];
      const peerColors: number[] = [];
      const arcSegments = 14;
      const cTmp = new THREE.Color();

      for (const link of links) {
        const isPeer =
          link.isPeerToPeer ||
          (link.sourceAgentId !== 'orchestrator' &&
            link.destinationAgentId !== 'orchestrator' &&
            link.sourceAgentId !== link.destinationAgentId);
        if (!isPeer) continue;
        const srcCoord = coordById.get(link.sourceAgentId);
        const dstCoord = coordById.get(link.destinationAgentId);
        if (!srcCoord || !dstCoord) continue;

        const colorHex =
          link.status === 'failed'
            ? '#EF4444'
            : link.status === 'conflict'
              ? '#F59E0B'
              : link.status === 'delivered'
                ? '#10B981'
                : '#A78BFA';
        cTmp.set(colorHex);

        const baseY = 0.85;
        const apexY = 2.15;
        for (let s = 0; s < arcSegments; s++) {
          const u0 = s / arcSegments;
          const u1 = (s + 1) / arcSegments;
          const x0 = srcCoord.x + (dstCoord.x - srcCoord.x) * u0;
          const z0 = srcCoord.z + (dstCoord.z - srcCoord.z) * u0;
          const y0 = baseY + 4 * (apexY - baseY) * u0 * (1 - u0);

          const x1 = srcCoord.x + (dstCoord.x - srcCoord.x) * u1;
          const z1 = srcCoord.z + (dstCoord.z - srcCoord.z) * u1;
          const y1 = baseY + 4 * (apexY - baseY) * u1 * (1 - u1);

          peerVerts.push(x0, y0, z0, x1, y1, z1);
          peerColors.push(cTmp.r, cTmp.g, cTmp.b, cTmp.r, cTmp.g, cTmp.b);
        }
      }

      if (peerVerts.length > 0) {
        peerArcGeo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(peerVerts, 3),
        );
        peerArcGeo.setAttribute(
          'color',
          new THREE.Float32BufferAttribute(peerColors, 3),
        );
        peerArcGeo.computeBoundingSphere();
        peerArcLines.visible = true;
      } else {
        peerArcLines.visible = false;
      }
    }
  }, [coordById]);

  const applyTheme = useCallback(
    (p: Theme3DPalette) => {
      scene.background = new THREE.Color(p.canvasBg);
      scene.fog = new THREE.Fog(p.fogHex, 24, 52);
      const t = themeRefs.current;
      if (t) {
        t.floorMat.color.set(p.floorHex);
        t.gridRingMat.color.set(p.gridLineHex);
        t.plinthMat.color.set(p.plinthHex);
        t.plinthTrimMat.color.set(p.plinthTrimHex);
        t.microDarkMat.color.set(p.plinthTrimHex);
        t.robotShellMat.color.set(p.robotShellHex);
        t.robotVisorMat.color.set(p.robotVisorHex);
        t.hemiLight.color.set(p.ambientLightHex);
        t.hemiLight.groundColor.set(p.ambientGroundHex);
        t.keyLight.color.set(p.keyLightHex);
        t.rimLight.color.set(p.accentSecondary);
        t.secondaryLineMat.color.set(p.accentSecondary);
      }
      applyVisualState();
      invalidate();
    },
    [scene, applyVisualState, invalidate],
  );

  const focusAgent = useCallback(
    (agentId: AgentId) => {
      const coord = coordById.get(agentId);
      if (!coord) return;
      targetGoalRef.current.set(coord.x, 0.55, coord.z);
      if (agentId === 'orchestrator') {
        camGoalRef.current.set(9.2, 8.2, 10.0);
      } else {
        const len = Math.hypot(coord.x, coord.z) || 1;
        const nx = coord.x / len;
        const nz = coord.z / len;
        camGoalRef.current.set(
          coord.x + nx * 4.4 - nz * 2.2,
          4.4,
          coord.z + nz * 4.4 + nx * 2.2,
        );
      }

      if (reducedMotionRef.current && controlsRef.current) {
        camera.position.copy(camGoalRef.current);
        controlsRef.current.target.copy(targetGoalRef.current);
        controlsRef.current.update();
        transitionActiveRef.current = false;
      } else {
        transitionActiveRef.current = true;
      }
      invalidate();
    },
    [coordById, camera, invalidate],
  );

  const resetCamera = useCallback(() => {
    const w = Math.max(size.width, 320);
    const h = Math.max(size.height, 320);
    const aspect = w / h;
    const scale =
      aspect < 1.08 ? Math.min(1.38, 1.08 / Math.max(aspect, 0.72)) : 1;
    camGoalRef.current.copy(DEFAULT_CAMERA_POS).multiplyScalar(scale);
    targetGoalRef.current.copy(DEFAULT_TARGET_POS);

    if (reducedMotionRef.current && controlsRef.current) {
      camera.position.copy(camGoalRef.current);
      controlsRef.current.target.copy(targetGoalRef.current);
      controlsRef.current.update();
      transitionActiveRef.current = false;
    } else {
      transitionActiveRef.current = true;
    }
    invalidate();
  }, [size.width, size.height, camera, invalidate]);

  // One-time procedural station & studio environment assembly inside R3F scene
  useEffect(() => {
    const root = sceneRootRef.current;
    if (!root) return;

    const currentPalette = paletteRef.current;
    scene.background = new THREE.Color(currentPalette.canvasBg);
    scene.fog = new THREE.Fog(currentPalette.fogHex, 24, 52);

    const aspect = Math.max(size.width, 320) / Math.max(size.height, 320);
    const distanceScale =
      aspect < 1.08 ? Math.min(1.38, 1.08 / Math.max(aspect, 0.72)) : 1;
    camera.position.copy(DEFAULT_CAMERA_POS).multiplyScalar(distanceScale);
    if (controlsRef.current) {
      controlsRef.current.target.copy(DEFAULT_TARGET_POS);
      controlsRef.current.update();
    }

    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];
    const disposableTextures: THREE.Texture[] = [];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposableGeos.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      disposableMats.push(m);
      return m;
    };

    // Studio three-point + hemisphere lights
    const hemiLight = new THREE.HemisphereLight(
      currentPalette.ambientLightHex,
      currentPalette.ambientGroundHex,
      0.95,
    );
    root.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      currentPalette.keyLightHex,
      1.75,
    );
    keyLight.position.set(10, 16, 11);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 42;
      const d = 14;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0004;
    }
    root.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      currentPalette.accentSecondary,
      0.65,
    );
    rimLight.position.set(-11, 8, -12);
    root.add(rimLight);

    // Floor & concentric radial deck rings
    const floorMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: currentPalette.floorHex,
        roughness: 0.88,
        metalness: 0.12,
      }),
    );
    const floorMesh = new THREE.Mesh(
      trackGeo(new THREE.CircleGeometry(12.4, 64)),
      floorMat,
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.02;
    floorMesh.receiveShadow = !isSoftwareGl;
    root.add(floorMesh);

    const gridRingMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: currentPalette.gridLineHex,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
      }),
    );
    [2.8, 5.3, 6.45, 8.8].forEach((r) => {
      const ring = new THREE.Mesh(
        trackGeo(new THREE.RingGeometry(r - 0.025, r + 0.025, 64)),
        gridRingMat,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.01;
      root.add(ring);
    });

    const plinthMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: currentPalette.plinthHex,
        roughness: 0.38,
        metalness: 0.25,
      }),
    );
    const plinthTrimMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: currentPalette.plinthTrimHex,
        roughness: 0.35,
        metalness: 0.45,
      }),
    );
    const robotShellMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: currentPalette.robotShellHex,
        roughness: 0.26,
        metalness: 0.18,
      }),
    );
    const robotVisorMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: currentPalette.robotVisorHex,
        roughness: 0.12,
        metalness: 0.4,
        clearcoat: 0.85,
        clearcoatRoughness: 0.15,
      }),
    );
    const microDarkMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: currentPalette.plinthTrimHex,
        roughness: 0.55,
        metalness: 0.35,
      }),
    );

    const stationBaseShape = createRoundedRectShape(2.28, 1.85, 0.28);
    const stationBaseGeo = trackGeo(
      new THREE.ExtrudeGeometry(stationBaseShape, {
        depth: 0.16,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 2,
      }),
    );
    stationBaseGeo.rotateX(Math.PI / 2);

    const stationRimGeo = trackGeo(new THREE.TorusGeometry(0.56, 0.045, 10, 32));
    stationRimGeo.rotateX(Math.PI / 2);

    const screenGeo = trackGeo(
      new THREE.CylinderGeometry(
        1.02,
        1.02,
        1.1,
        24,
        1,
        true,
        Math.PI * 0.68,
        Math.PI * 0.64,
      ),
    );
    const robotTorsoGeo = trackGeo(
      new THREE.CylinderGeometry(0.24, 0.3, 0.46, 18),
    );
    const robotHeadGeo = trackGeo(new THREE.CapsuleGeometry(0.26, 0.14, 8, 18));
    const robotVisorGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.16, 0.12));
    const robotEyeGeo = trackGeo(new THREE.SphereGeometry(0.038, 10, 10));
    const robotCoreRingGeo = trackGeo(
      new THREE.TorusGeometry(0.085, 0.02, 8, 18),
    );
    const robotAntennaStemGeo = trackGeo(
      new THREE.CylinderGeometry(0.014, 0.018, 0.18, 8),
    );
    const robotAntennaTipGeo = trackGeo(new THREE.SphereGeometry(0.04, 10, 10));
    const hitBoxStationGeo = trackGeo(new THREE.BoxGeometry(2.5, 2.0, 2.1));

    const rigs = new Map<AgentId, StationSceneRig>();
    const interactableHitboxes: THREE.Mesh[] = [];
    const hitboxAgentMap = new Map<THREE.Object3D, AgentId>();

    for (const node of nodesRef.current) {
      const coord = coordById.get(node.agentId);
      if (!coord) continue;

      const stationGroup = new THREE.Group();
      stationGroup.position.set(coord.x, coord.y, coord.z);
      stationGroup.rotation.y = coord.yaw;
      root.add(stationGroup);

      const visualSpec = getStateVisualSpec(node.state);
      const ringMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: visualSpec.colorHex,
          emissive: visualSpec.emissiveHex,
          emissiveIntensity: visualSpec.emissiveIntensity,
          roughness: 0.25,
          metalness: 0.45,
        }),
      );
      const coreMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: node.accentHex,
          emissive: visualSpec.emissiveHex,
          emissiveIntensity: visualSpec.emissiveIntensity * 0.9,
          roughness: 0.2,
          metalness: 0.5,
        }),
      );
      const eyeMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#FFFFFF',
          emissive: visualSpec.emissiveHex,
          emissiveIntensity: node.state === 'unavailable' ? 0.08 : 1.4,
        }),
      );

      const screenTex = createHoloPanelTexture(
        node.accentHex,
        node.shortName,
        node.isOrchestrator,
      );
      disposableTextures.push(screenTex);
      const screenMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: screenTex,
          color: '#FFFFFF',
          emissive: new THREE.Color(node.accentHex),
          emissiveIntensity: node.state === 'unavailable' ? 0.08 : 0.35,
          transparent: true,
          opacity: node.state === 'unavailable' ? 0.32 : 0.82,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );

      if (node.isOrchestrator) {
        const tier1 = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(2.35, 2.52, 0.2, 40)),
          plinthMat,
        );
        tier1.position.y = 0.1;
        tier1.castShadow = !isSoftwareGl;
        tier1.receiveShadow = !isSoftwareGl;

        const tier2 = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(1.78, 1.92, 0.2, 40)),
          plinthTrimMat,
        );
        tier2.position.y = 0.3;
        tier2.castShadow = !isSoftwareGl;

        const tier3 = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(1.22, 1.32, 0.18, 36)),
          plinthMat,
        );
        tier3.position.y = 0.48;

        const outerGlowRing = new THREE.Mesh(
          trackGeo(new THREE.TorusGeometry(2.34, 0.048, 10, 48)),
          ringMat,
        );
        outerGlowRing.rotation.x = Math.PI / 2;
        outerGlowRing.position.y = 0.21;

        const innerGlowRing = new THREE.Mesh(
          trackGeo(new THREE.TorusGeometry(1.22, 0.045, 10, 40)),
          ringMat,
        );
        innerGlowRing.rotation.x = Math.PI / 2;
        innerGlowRing.position.y = 0.58;

        const holoArcA = new THREE.Mesh(
          trackGeo(
            new THREE.CylinderGeometry(
              1.66,
              1.66,
              1.45,
              28,
              1,
              true,
              Math.PI * 0.58,
              Math.PI * 0.84,
            ),
          ),
          screenMat,
        );
        holoArcA.position.y = 1.28;

        const holoArcB = new THREE.Mesh(
          trackGeo(
            new THREE.CylinderGeometry(
              1.66,
              1.66,
              1.2,
              24,
              1,
              true,
              -Math.PI * 0.35,
              Math.PI * 0.65,
            ),
          ),
          screenMat,
        );
        holoArcB.position.y = 1.15;

        const robotGroup = new THREE.Group();
        robotGroup.position.y = 0.6;
        robotGroup.scale.setScalar(1.48);

        const torso = new THREE.Mesh(robotTorsoGeo, robotShellMat);
        torso.position.y = 0.24;
        const chestRing = new THREE.Mesh(robotCoreRingGeo, coreMat);
        chestRing.position.set(0, 0.24, 0.27);
        const head = new THREE.Mesh(robotHeadGeo, robotShellMat);
        head.position.y = 0.68;
        head.rotation.z = Math.PI / 2;
        const visor = new THREE.Mesh(robotVisorGeo, robotVisorMat);
        visor.position.set(0, 0.68, 0.19);
        const eyeL = new THREE.Mesh(robotEyeGeo, eyeMat);
        eyeL.position.set(-0.085, 0.68, 0.255);
        const eyeR = new THREE.Mesh(robotEyeGeo, eyeMat);
        eyeR.position.set(0.085, 0.68, 0.255);
        const antStem = new THREE.Mesh(robotAntennaStemGeo, plinthTrimMat);
        antStem.position.set(0, 0.98, 0);
        const antTip = new THREE.Mesh(robotAntennaTipGeo, coreMat);
        antTip.position.set(0, 1.09, 0);

        robotGroup.add(
          torso,
          chestRing,
          head,
          visor,
          eyeL,
          eyeR,
          antStem,
          antTip,
        );

        const hitMesh = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(2.45, 2.45, 2.35, 16)),
          trackMat(new THREE.MeshBasicMaterial({ visible: false })),
        );
        hitMesh.position.y = 1.15;
        interactableHitboxes.push(hitMesh);
        hitboxAgentMap.set(hitMesh, node.agentId);

        stationGroup.add(
          tier1,
          tier2,
          tier3,
          outerGlowRing,
          innerGlowRing,
          holoArcA,
          holoArcB,
          robotGroup,
          hitMesh,
        );

        rigs.set(node.agentId, {
          agentId: node.agentId,
          rootGroup: stationGroup,
          robotGroup,
          ringMesh: outerGlowRing,
          ringMat,
          coreMat,
          eyeMat,
          screenMat,
          plinthMesh: tier1,
          plinthTrimMesh: tier2,
          relayTileMat: ringMat,
          conduitMat: ringMat,
          conduitCurve: null,
          worldAnchor: new THREE.Vector3(coord.x, 2.55, coord.z),
          baseY: 0.6,
        });
      } else {
        const baseMesh = new THREE.Mesh(stationBaseGeo, plinthMat);
        baseMesh.position.y = 0.18;
        baseMesh.castShadow = !isSoftwareGl;
        baseMesh.receiveShadow = !isSoftwareGl;

        const padDisc = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.56, 0.6, 0.06, 28)),
          plinthTrimMat,
        );
        padDisc.position.set(0, 0.2, 0.05);

        const glowRing = new THREE.Mesh(stationRimGeo, ringMat);
        glowRing.position.set(0, 0.24, 0.05);

        const holoScreen = new THREE.Mesh(screenGeo, screenMat);
        holoScreen.position.set(0, 0.85, -0.05);

        const robotGroup = new THREE.Group();
        robotGroup.position.set(0, 0.24, 0.05);

        const torso = new THREE.Mesh(robotTorsoGeo, robotShellMat);
        torso.position.y = 0.24;
        const chestRing = new THREE.Mesh(robotCoreRingGeo, coreMat);
        chestRing.position.set(0, 0.24, 0.27);
        const head = new THREE.Mesh(robotHeadGeo, robotShellMat);
        head.position.y = 0.66;
        head.rotation.z = Math.PI / 2;
        const visor = new THREE.Mesh(robotVisorGeo, robotVisorMat);
        visor.position.set(0, 0.66, 0.19);
        const eyeL = new THREE.Mesh(robotEyeGeo, eyeMat);
        eyeL.position.set(-0.085, 0.66, 0.255);
        const eyeR = new THREE.Mesh(robotEyeGeo, eyeMat);
        eyeR.position.set(0.085, 0.66, 0.255);
        const antStem = new THREE.Mesh(robotAntennaStemGeo, plinthTrimMat);
        antStem.position.set(0, 0.94, 0);
        const antTip = new THREE.Mesh(robotAntennaTipGeo, coreMat);
        antTip.position.set(0, 1.05, 0);

        robotGroup.add(
          torso,
          chestRing,
          head,
          visor,
          eyeL,
          eyeR,
          antStem,
          antTip,
        );

        addRoleMicroProps({
          propKind: node.propKind,
          group: stationGroup,
          darkBodyMat: microDarkMat,
          accentMat: coreMat,
          trimMat: plinthTrimMat,
          disposableGeos,
        });

        const hubEdgeDist = 2.38;
        const stationEdgeOffset = 1.02;
        const len = Math.hypot(coord.x, coord.z);
        const dirX = coord.x / len;
        const dirZ = coord.z / len;
        const perpX = -dirZ;
        const perpZ = dirX;

        const startPt = new THREE.Vector3(
          dirX * hubEdgeDist,
          0.035,
          dirZ * hubEdgeDist,
        );
        const relayPt = new THREE.Vector3(
          dirX * 3.85 + perpX * 0.22,
          0.035,
          dirZ * 3.85 + perpZ * 0.22,
        );
        const bendPt = new THREE.Vector3(
          dirX * (len - stationEdgeOffset - 0.9) - perpX * 0.16,
          0.035,
          dirZ * (len - stationEdgeOffset - 0.9) - perpZ * 0.16,
        );
        const endPt = new THREE.Vector3(
          coord.x - dirX * stationEdgeOffset,
          0.035,
          coord.z - dirZ * stationEdgeOffset,
        );

        const conduitCurve = new THREE.CatmullRomCurve3([
          startPt,
          relayPt,
          bendPt,
          endPt,
        ]);
        const conduitMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: currentPalette.conduitIdleHex,
            emissive: new THREE.Color(visualSpec.emissiveHex),
            emissiveIntensity: 0.18,
            roughness: 0.4,
            metalness: 0.5,
            transparent: true,
            opacity: 0.72,
          }),
        );
        const conduitMesh = new THREE.Mesh(
          trackGeo(new THREE.TubeGeometry(conduitCurve, 28, 0.048, 8, false)),
          conduitMat,
        );
        root.add(conduitMesh);

        const relayPad = new THREE.Group();
        relayPad.position.set(relayPt.x, 0.04, relayPt.z);
        relayPad.rotation.y = Math.atan2(dirX, dirZ);
        const relayBox = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.46, 0.1, 0.46)),
          plinthMat,
        );
        const relayTileMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: node.accentHex,
            emissive: new THREE.Color(visualSpec.emissiveHex),
            emissiveIntensity: 0.35,
            roughness: 0.25,
          }),
        );
        const relayTile = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.28, 0.03, 0.28)),
          relayTileMat,
        );
        relayTile.position.y = 0.06;
        relayPad.add(relayBox, relayTile);
        root.add(relayPad);

        const hitMesh = new THREE.Mesh(
          hitBoxStationGeo,
          trackMat(new THREE.MeshBasicMaterial({ visible: false })),
        );
        hitMesh.position.set(0, 0.95, 0);
        interactableHitboxes.push(hitMesh);
        hitboxAgentMap.set(hitMesh, node.agentId);

        stationGroup.add(
          baseMesh,
          padDisc,
          glowRing,
          holoScreen,
          robotGroup,
          hitMesh,
        );

        rigs.set(node.agentId, {
          agentId: node.agentId,
          rootGroup: stationGroup,
          robotGroup,
          ringMesh: glowRing,
          ringMat,
          coreMat,
          eyeMat,
          screenMat,
          plinthMesh: baseMesh,
          plinthTrimMesh: padDisc,
          relayTileMat,
          conduitMat,
          conduitCurve,
          worldAnchor: new THREE.Vector3(coord.x, 2.02, coord.z),
          baseY: 0.24,
        });
      }
    }

    // InstancedMesh packets strictly count = 0 when idle
    const MAX_PACKETS = 48;
    const packetGeo = trackGeo(new THREE.SphereGeometry(0.085, 10, 10));
    const packetMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: '#FFFFFF',
      }),
    );
    const packetInstanced = new THREE.InstancedMesh(
      packetGeo,
      packetMat,
      MAX_PACKETS,
    );
    packetInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    packetInstanced.count = 0;
    packetInstanced.frustumCulled = false;
    root.add(packetInstanced);

    const secondaryLineMat = trackMat(
      new THREE.LineBasicMaterial({
        color: currentPalette.accentSecondary,
        transparent: true,
        opacity: 0.42,
      }),
    );
    const secondaryLinesGeo = trackGeo(new THREE.BufferGeometry());
    const secondaryLines = new THREE.LineSegments(
      secondaryLinesGeo,
      secondaryLineMat,
    );
    root.add(secondaryLines);

    const peerArcMat = trackMat(
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
      }),
    );
    const peerArcGeo = trackGeo(new THREE.BufferGeometry());
    const peerArcLines = new THREE.LineSegments(peerArcGeo, peerArcMat);
    peerArcLines.visible = false;
    root.add(peerArcLines);

    rigsRef.current = rigs;
    packetInstancedRef.current = packetInstanced;
    secondaryLinesRef.current = secondaryLines;
    secondaryLinesGeoRef.current = secondaryLinesGeo;
    peerArcLinesRef.current = peerArcLines;
    peerArcLinesGeoRef.current = peerArcGeo;
    themeRefs.current = {
      floorMat,
      gridRingMat,
      plinthMat,
      plinthTrimMat,
      microDarkMat,
      robotShellMat,
      robotVisorMat,
      hemiLight,
      keyLight,
      rimLight,
      secondaryLineMat,
    };

    // Raycast hover + drag-guarded click selection on canvas element
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverRaycast = 0;

    const pickAgentAtEvent = (ev: PointerEvent | MouseEvent): AgentId | null => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(interactableHitboxes, false);
      if (hits.length === 0) return null;
      return hitboxAgentMap.get(hits[0].object) ?? null;
    };

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownPos = { x: ev.clientX, y: ev.clientY };
    };

    const onPointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverRaycast < 45) return;
      lastHoverRaycast = now;
      const hitAgent = pickAgentAtEvent(ev);
      gl.domElement.style.cursor = hitAgent ? 'pointer' : 'grab';
      if (hitAgent !== hoveredIdRef.current) {
        onHoverRef.current(hitAgent);
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      const dist = Math.hypot(
        ev.clientX - pointerDownPos.x,
        ev.clientY - pointerDownPos.y,
      );
      if (dist > 6) return;
      const hitAgent = pickAgentAtEvent(ev);
      if (hitAgent) {
        onSelectRef.current(hitAgent);
        if (settingsRef.current.focusOnSelect) {
          focusAgent(hitAgent);
        }
      }
    };

    gl.domElement.addEventListener('pointerdown', onPointerDown);
    gl.domElement.addEventListener('pointermove', onPointerMove);
    gl.domElement.addEventListener('pointerup', onPointerUp);

    applyVisualState();
    invalidate();

    return () => {
      if (motionTimerRef.current !== null) {
        window.clearTimeout(motionTimerRef.current);
        motionTimerRef.current = null;
      }
      gl.domElement.removeEventListener('pointerdown', onPointerDown);
      gl.domElement.removeEventListener('pointermove', onPointerMove);
      gl.domElement.removeEventListener('pointerup', onPointerUp);
      root.clear();
      rigsRef.current.clear();
      packetInstancedRef.current = null;
      secondaryLinesRef.current = null;
      secondaryLinesGeoRef.current = null;
      peerArcLinesRef.current = null;
      peerArcLinesGeoRef.current = null;
      themeRefs.current = null;
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      disposableTextures.forEach((t) => t.dispose());
      envTarget.dispose();
    };
  }, [
    gl,
    scene,
    camera,
    coordById,
    isSoftwareGl,
    applyVisualState,
    focusAgent,
    invalidate,
    size.width,
    size.height,
  ]);

  // Reactive visual state & theme sync (never tears down WebGL context)
  useEffect(() => {
    applyVisualState();
    invalidate();
  }, [
    nodes,
    activeLinks,
    selectedAgentId,
    hoveredAgentId,
    settings,
    applyVisualState,
    invalidate,
  ]);

  useEffect(() => {
    applyTheme(palette);
  }, [palette, applyTheme]);

  useEffect(() => {
    if (resetSignal > 0) {
      resetCamera();
    }
  }, [resetSignal, resetCamera]);

  useEffect(() => {
    if (focusSelectedSignal > 0) {
      focusAgent(selectedAgentId);
    }
  }, [focusSelectedSignal, selectedAgentId, focusAgent]);

  // Smooth damped camera transitions, live state-driven motion, & projected 2D labels
  useFrame((state, delta) => {
    const dt = Math.min(0.05, Math.max(0.001, delta));
    const tSec = state.clock.elapsedTime;
    const ctrl = controlsRef.current;

    if (transitionActiveRef.current && ctrl) {
      const alpha = 1 - Math.exp(-6.5 * dt);
      camera.position.lerp(camGoalRef.current, alpha);
      ctrl.target.lerp(targetGoalRef.current, alpha);
      ctrl.update();
      if (
        camera.position.distanceToSquared(camGoalRef.current) < 0.003 &&
        ctrl.target.distanceToSquared(targetGoalRef.current) < 0.003
      ) {
        camera.position.copy(camGoalRef.current);
        ctrl.target.copy(targetGoalRef.current);
        ctrl.update();
        transitionActiveRef.current = false;
      } else {
        invalidate();
      }
    } else if (ctrl && !isSoftwareGl && ctrl.enableDamping) {
      ctrl.update();
    }

    const allowBob =
      !reducedMotionRef.current && settingsRef.current.ambientAnimation;
    const rigs = rigsRef.current;
    const packetInstanced = packetInstancedRef.current;
    const MAX_PACKETS = 48;
    let packetIdx = 0;
    let hasAnimatedStation = false;

    nodesRef.current.forEach((node) => {
      const rig = rigs.get(node.agentId);
      if (!rig) return;

      const isActive =
        node.state === 'running' ||
        node.state === 'communicating' ||
        node.state === 'retrying';
      if (!node.isOrchestrator && isActive) {
        hasAnimatedStation = true;
      }

      if (allowBob && isActive) {
        rig.robotGroup.position.y =
          rig.baseY + Math.sin(tSec * 3.4 + rig.rootGroup.position.x) * 0.055;
      } else {
        rig.robotGroup.position.y = rig.baseY;
      }

      if (
        allowBob &&
        !node.isOrchestrator &&
        rig.conduitCurve &&
        isActive &&
        packetInstanced &&
        packetIdx + 1 < MAX_PACKETS
      ) {
        const spec = getStateVisualSpec(node.state);
        tmpColor.set(spec.emissiveHex);
        for (let pIdx = 0; pIdx < 2; pIdx++) {
          const u = (tSec * 0.55 + pIdx * 0.5) % 1;
          rig.conduitCurve.getPointAt(u, tmpPoint);
          dummyObj.position.set(tmpPoint.x, tmpPoint.y + 0.06, tmpPoint.z);
          dummyObj.scale.setScalar(1);
          dummyObj.updateMatrix();
          packetInstanced.setMatrixAt(packetIdx, dummyObj.matrix);
          packetInstanced.setColorAt(packetIdx, tmpColor);
          packetIdx++;
        }
      }
    });

    if (allowBob && packetInstanced) {
      for (const link of activeLinksRef.current) {
        if (packetIdx + 2 >= MAX_PACKETS) break;
        const linkColorHex =
          link.status === 'failed'
            ? '#EF4444'
            : link.status === 'conflict'
              ? '#F59E0B'
              : link.status === 'delivered'
                ? '#10B981'
                : '#A78BFA';
        tmpColor.set(linkColorHex);

        const isPeer =
          link.isPeerToPeer ||
          (link.sourceAgentId !== 'orchestrator' &&
            link.destinationAgentId !== 'orchestrator' &&
            link.sourceAgentId !== link.destinationAgentId);

        if (isPeer) {
          const srcCoord = coordById.get(link.sourceAgentId);
          const dstCoord = coordById.get(link.destinationAgentId);
          if (!srcCoord || !dstCoord) continue;
          const baseY = 0.85;
          const apexY = 2.15;
          for (let k = 0; k < 2; k++) {
            const u = (tSec * 0.72 + k * 0.5) % 1;
            const px = srcCoord.x + (dstCoord.x - srcCoord.x) * u;
            const pz = srcCoord.z + (dstCoord.z - srcCoord.z) * u;
            const py = baseY + 4 * (apexY - baseY) * u * (1 - u);
            dummyObj.position.set(px, py, pz);
            dummyObj.scale.setScalar(1.24);
            dummyObj.updateMatrix();
            packetInstanced.setMatrixAt(packetIdx, dummyObj.matrix);
            packetInstanced.setColorAt(packetIdx, tmpColor);
            packetIdx++;
          }
          continue;
        }

        const targetStationId =
          link.sourceAgentId === 'orchestrator'
            ? link.destinationAgentId
            : link.sourceAgentId;
        const rig = rigs.get(targetStationId);
        if (!rig?.conduitCurve) continue;
        const outbound = link.sourceAgentId === 'orchestrator';
        for (let k = 0; k < 2; k++) {
          const rawU = (tSec * 0.8 + k * 0.5) % 1;
          const u = outbound ? rawU : 1 - rawU;
          rig.conduitCurve.getPointAt(u, tmpPoint);
          dummyObj.position.set(tmpPoint.x, tmpPoint.y + 0.07, tmpPoint.z);
          dummyObj.scale.setScalar(1.18);
          dummyObj.updateMatrix();
          packetInstanced.setMatrixAt(packetIdx, dummyObj.matrix);
          packetInstanced.setColorAt(packetIdx, tmpColor);
          packetIdx++;
        }
      }
    }

    if (packetInstanced) {
      packetInstanced.count = packetIdx;
      if (packetIdx > 0) {
        packetInstanced.instanceMatrix.needsUpdate = true;
        if (packetInstanced.instanceColor) {
          packetInstanced.instanceColor.needsUpdate = true;
        }
      }
    }

    // Project 2D labels cleanly when positions shift by >=2px
    const w = Math.max(size.width, 320);
    const h = Math.max(size.height, 320);
    const nextLabels: ProjectedLabel[] = [];
    const sigParts: string[] = [];
    rigs.forEach((rig, id) => {
      tmpProj.copy(rig.worldAnchor).project(camera);
      const rawX = ((tmpProj.x + 1) / 2) * w;
      const rawY = ((-tmpProj.y + 1) / 2) * h;
      const visible =
        tmpProj.z >= -1 &&
        tmpProj.z <= 1 &&
        rawX >= -30 &&
        rawX <= w + 30 &&
        rawY >= -16 &&
        rawY <= h + 16;
      const x = Math.round(Math.max(66, Math.min(w - 66, rawX)));
      const y = Math.round(Math.max(30, Math.min(h - 40, rawY)));
      nextLabels.push({ agentId: id, x, y, visible });
      sigParts.push(`${id}:${Math.round(x / 2)}:${Math.round(y / 2)}:${visible ? 1 : 0}`);
    });
    const sig = sigParts.join('|');
    if (sig !== lastLabelsSigRef.current) {
      lastLabelsSigRef.current = sig;
      onLabelsUpdateRef.current(nextLabels);
    }

    // Schedule paced next tick only when live agent motion or active packets exist
    const needsContinuousMotion =
      allowBob && (hasAnimatedStation || activeLinksRef.current.length > 0);
    if (needsContinuousMotion && motionTimerRef.current === null) {
      motionTimerRef.current = window.setTimeout(
        () => {
          motionTimerRef.current = null;
          invalidate();
        },
        isSoftwareGl ? 95 : 32,
      );
    }
  });

  return (
    <>
      <group ref={sceneRootRef} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!isSoftwareGl}
        dampingFactor={0.08}
        enablePan
        enableZoom
        minDistance={6.5}
        maxDistance={34}
        maxPolarAngle={Math.PI * 0.44}
        minPolarAngle={0.25}
        onStart={() => {
          transitionActiveRef.current = false;
        }}
        onChange={() => {
          invalidate();
        }}
      />
    </>
  );
}

export function AgentFactoryScene3D({
  nodes,
  activeLinks,
  selectedAgentId,
  hoveredAgentId,
  themePreset,
  reducedMotion,
  resetSignal,
  focusSelectedSignal,
  settings,
  onSelectAgent,
  onHoverAgent,
  onWebGLUnavailable,
}: AgentFactoryScene3DProps) {
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);

  const palette = useMemo(
    () => extractTheme3DPalette(themePreset),
    [themePreset],
  );

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.agentId, n])),
    [nodes],
  );

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[22px] border border-[var(--border-hairline)]"
      style={{ backgroundColor: palette.canvasBg }}
    >
      <div
        data-testid="agent-factory-3d-canvas"
        className="h-full w-full cursor-grab active:cursor-grabbing"
      >
        <Canvas
          frameloop="demand"
          dpr={isSoftwareGl ? 1 : [1, 2]}
          shadows={!isSoftwareGl}
          gl={{
            antialias: !isSoftwareGl,
            powerPreference: 'high-performance',
          }}
          camera={{
            position: [14.8, 12.6, 15.8],
            fov: 36,
            near: 0.1,
            far: 120,
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.06;
            gl.domElement.setAttribute(
              'aria-label',
              '3D Isometric AI Agent Factory Canvas',
            );
            const handleLost = (e: Event) => {
              e.preventDefault();
              onWebGLUnavailable();
            };
            gl.domElement.addEventListener('webglcontextlost', handleLost, {
              once: true,
            });
          }}
        >
          <AgentFactorySceneContent
            nodes={nodes}
            activeLinks={activeLinks}
            selectedAgentId={selectedAgentId}
            hoveredAgentId={hoveredAgentId}
            palette={palette}
            reducedMotion={reducedMotion}
            resetSignal={resetSignal}
            focusSelectedSignal={focusSelectedSignal}
            settings={settings}
            isSoftwareGl={isSoftwareGl}
            onSelectAgent={onSelectAgent}
            onHoverAgent={onHoverAgent}
            onLabelsUpdate={setLabels}
          />
        </Canvas>
      </div>

      {/* Semantic Non-Blurred Projected DOM Labels Overlay */}
      {settings.showLabels && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {labels.map((lbl) => {
            if (!lbl.visible) return null;
            const node = nodeById.get(lbl.agentId);
            if (!node) return null;
            const spec = getStateVisualSpec(node.state);
            const isSelected = node.agentId === selectedAgentId;
            return (
              <div
                key={node.agentId}
                style={{
                  transform: `translate3d(${Math.round(lbl.x)}px, ${Math.round(lbl.y)}px, 0) translate(-50%, -100%)`,
                  backgroundColor: palette.hudSurfaceBg,
                  borderColor: isSelected ? spec.colorHex : palette.hudBorder,
                  color: palette.hudTextPrimary,
                }}
                className={`absolute left-0 top-0 flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-colors ${
                  isSelected ? 'ring-2 ring-offset-1 ring-cyan-400/50' : ''
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: spec.colorHex }}
                />
                <span className="whitespace-nowrap">{node.shortName}</span>
                <span
                  className="font-mono text-[9.5px] uppercase tracking-wide"
                  style={{ color: palette.hudTextMuted }}
                >
                  {spec.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Subtle Orbit Navigation Tip Bar (No backdrop-blur over WebGL) */}
      <div
        style={{
          backgroundColor: palette.hudSurfaceBg,
          borderColor: palette.hudBorder,
          color: palette.hudTextMuted,
        }}
        className="pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-3 rounded-xl border px-3 py-1.5 text-[11px] sm:inline-flex"
      >
        <span>Drag: Orbit</span>
        <span aria-hidden="true">·</span>
        <span>Right-Drag: Pan</span>
        <span aria-hidden="true">·</span>
        <span>Scroll: Zoom</span>
        <span aria-hidden="true">·</span>
        <span>Click Station: Inspect</span>
      </div>

      {/* Stage 5 Uncluttered Focused Station Usage & Cost Telemetry Strip */}
      {(() => {
        const focusedNode =
          (hoveredAgentId ? nodeById.get(hoveredAgentId) : null) ??
          nodeById.get(selectedAgentId) ??
          null;
        if (!focusedNode) return null;
        const usage = focusedNode.metrics.usageTelemetry;
        const costText =
          !usage || usage.totalRequests === 0
            ? 'No metered runs'
            : usage.measuredCostMicros !== null
              ? formatMicroUsd(usage.measuredCostMicros)
              : 'Cost unavailable';
        const tokenText =
          usage && usage.totalTokens > 0
            ? `${usage.totalTokens.toLocaleString()} tok`
            : '0 tok';
        const latencyText =
          usage && usage.avgLatencyMs !== null
            ? usage.avgLatencyMs < 1000
              ? `${Math.round(usage.avgLatencyMs)}ms`
              : `${(usage.avgLatencyMs / 1000).toFixed(2)}s`
            : '—';

        return (
          <div
            data-testid="agent-factory-3d-usage-hud"
            style={{
              backgroundColor: palette.hudSurfaceBg,
              borderColor: palette.hudBorder,
              color: palette.hudTextPrimary,
            }}
            className="pointer-events-none absolute bottom-3 right-3 z-10 hidden items-center gap-2.5 rounded-xl border px-3 py-1.5 text-[11px] md:inline-flex"
          >
            <span className="font-semibold">{focusedNode.shortName}</span>
            <span style={{ color: palette.hudTextMuted }} aria-hidden="true">
              ·
            </span>
            <span className="font-mono tabular-nums">{tokenText}</span>
            <span style={{ color: palette.hudTextMuted }} aria-hidden="true">
              ·
            </span>
            <span className="font-mono font-semibold tabular-nums">{costText}</span>
            <span style={{ color: palette.hudTextMuted }} aria-hidden="true">
              ·
            </span>
            <span
              className="font-mono tabular-nums"
              style={{ color: palette.hudTextMuted }}
            >
              {latencyText}
            </span>
          </div>
        );
      })()}
    </div>
  );
}
