import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RotateCcw } from 'lucide-react';
import { useThemeStore } from '../../stores/useThemeStore';
import type { TopologyGraph, TopologyNode } from '../../utils/crawlTopology';

export function UrlTopology3DCanvas({
  graph,
  selectedId,
  onHoverNode,
  onSelectNode,
}: {
  graph: TopologyGraph;
  selectedId: string | null;
  onHoverNode: (node: TopologyNode | null) => void;
  onSelectNode: (node: TopologyNode) => void;
}) {
  const isDark = useThemeStore((s) => s.resolvedTheme) === 'dark';
  const mountRef = useRef<HTMLDivElement>(null);
  const [resetTick, setResetTick] = useState(0);
  const onHoverRef = useRef(onHoverNode);
  const onSelectRef = useRef(onSelectNode);
  onHoverRef.current = onHoverNode;
  onSelectRef.current = onSelectNode;

  useEffect(() => {
    const container = mountRef.current;
    if (!container || graph.nodes.length === 0) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 360;
    const bgHex = isDark ? '#0B111E' : '#F3F5FA';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.Fog(bgHex, 12, 28);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
    camera.position.set(0, 4.8, 7.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const keyLight = new THREE.DirectionalLight('#FFFFFF', 1.8);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight('#E0E7FF', '#CBD5E1', 0.9);
    scene.add(hemiLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.4, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3.5;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    const disposableGeos: THREE.BufferGeometry[] = [];
    const disposableMats: THREE.Material[] = [];

    // Subtle concentric depth reference rings
    const uniqueDepths = Array.from(new Set(graph.nodes.map((n) => n.depth))).sort(
      (a, b) => a - b,
    );
    uniqueDepths.forEach((depth, idx) => {
      if (idx === 0) return;
      const r = 1.55 + idx * 1.15;
      const ringGeo = new THREE.RingGeometry(r - 0.015, r + 0.015, 64);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isDark ? '#334155' : '#CBD5E1',
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      });
      disposableGeos.push(ringGeo);
      disposableMats.push(ringMat);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = Math.max(0.25, 2.35 - idx * 0.48);
      scene.add(ringMesh);
    });

    // Edge lines between real crawled parent -> child URLs
    const edgePositions: number[] = [];
    for (const edge of graph.edges) {
      edgePositions.push(...edge.fromSpatial, ...edge.toSpatial);
    }
    if (edgePositions.length > 0) {
      const linesGeo = new THREE.BufferGeometry();
      linesGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(edgePositions, 3),
      );
      const linesMat = new THREE.LineBasicMaterial({
        color: isDark ? '#475569' : '#94A3B8',
        transparent: true,
        opacity: 0.6,
      });
      disposableGeos.push(linesGeo);
      disposableMats.push(linesMat);
      const lineSegments = new THREE.LineSegments(linesGeo, linesMat);
      scene.add(lineSegments);
    }

    // URL Nodes
    const nodeGeo = new THREE.SphereGeometry(0.19, 20, 20);
    const rootGeo = new THREE.OctahedronGeometry(0.27, 1);
    disposableGeos.push(nodeGeo, rootGeo);

    const interactableMeshes: THREE.Mesh[] = [];
    const nodeMap = new Map<THREE.Object3D, TopologyNode>();

    for (const node of graph.nodes) {
      const isRoot = node.depth === 0;
      const isSelected = node.id === selectedId;
      const mat = new THREE.MeshStandardMaterial({
        color: node.color,
        roughness: 0.25,
        metalness: 0.55,
        emissive: new THREE.Color(node.color),
        emissiveIntensity: isSelected ? 0.55 : isRoot ? 0.25 : 0.1,
      });
      disposableMats.push(mat);

      const mesh = new THREE.Mesh(isRoot ? rootGeo : nodeGeo, mat);
      mesh.position.set(node.spatialX, node.spatialY, node.spatialZ);
      if (isSelected) mesh.scale.setScalar(1.3);
      scene.add(mesh);
      interactableMeshes.push(mesh);
      nodeMap.set(mesh, node);
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let hoveredMesh: THREE.Mesh | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

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

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    const onControlChange = () => requestRender();
    controls.addEventListener('change', onControlChange);

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactableMeshes, false);
      const hitMesh = (hits[0]?.object as THREE.Mesh | undefined) ?? null;

      if (hitMesh !== hoveredMesh) {
        if (hoveredMesh) {
          const prevNode = nodeMap.get(hoveredMesh);
          hoveredMesh.scale.setScalar(prevNode?.id === selectedId ? 1.3 : 1);
        }
        hoveredMesh = hitMesh;
        if (hoveredMesh) {
          hoveredMesh.scale.setScalar(1.38);
          const matched = nodeMap.get(hoveredMesh) ?? null;
          onHoverRef.current(matched);
          renderer.domElement.style.cursor = 'pointer';
        } else {
          onHoverRef.current(null);
          renderer.domElement.style.cursor = 'grab';
        }
        requestRender();
      }
    };

    const onPointerClick = () => {
      if (hoveredMesh) {
        const matched = nodeMap.get(hoveredMesh);
        if (matched) onSelectRef.current(matched);
      }
    };

    renderer.domElement.addEventListener('pointermove', updatePointer);
    renderer.domElement.addEventListener('click', onPointerClick);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    requestRender();

    return () => {
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', updatePointer);
      renderer.domElement.removeEventListener('click', onPointerClick);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [graph, isDark, selectedId, resetTick]);

  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
      <div
        ref={mountRef}
        data-testid="url-topology-3d-canvas"
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setResetTick((t) => t + 1)}
          aria-label="Reset 3D topology camera"
          className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] shadow-sm hover:border-[#7047EB] cursor-pointer"
        >
          <RotateCcw className="h-3 w-3 text-[#7047EB]" aria-hidden="true" />
          <span>Reset Orbit</span>
        </button>
      </div>
    </div>
  );
}
