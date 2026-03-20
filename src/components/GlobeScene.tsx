import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getCountryData } from '@/data/countryData';

const GLOBE_RADIUS = 1;
const ATMOSPHERE_RADIUS = 1.14;
const GLOBE_BG = '#0a0a0f';
const COUNTRY_COLOR = 0x6a6aff;
const COUNTRY_HOVER_COLOR = 0xa0a0ff;
const OCEAN_COLOR = 0x12123a;
const GRID_COLOR = 0x3a3a8e;

// Hardcoded country positions (lat/lng → 3D) for clickable regions
const COUNTRY_MARKERS: { name: string; lat: number; lng: number }[] = [
  { name: 'United States of America', lat: 39.8, lng: -98.6 },
  { name: 'Brazil', lat: -14.2, lng: -51.9 },
  { name: 'United Kingdom', lat: 54.0, lng: -2.0 },
  { name: 'France', lat: 46.6, lng: 2.2 },
  { name: 'Germany', lat: 51.2, lng: 10.4 },
  { name: 'Nigeria', lat: 9.1, lng: 8.7 },
  { name: 'India', lat: 20.6, lng: 79.0 },
  { name: 'Japan', lat: 36.2, lng: 138.3 },
  { name: 'Australia', lat: -25.3, lng: 133.8 },
  { name: 'South Korea', lat: 35.9, lng: 127.8 },
  { name: 'Russia', lat: 61.5, lng: 105.3 },
  { name: 'Canada', lat: 56.1, lng: -106.3 },
  { name: 'Mexico', lat: 23.6, lng: -102.6 },
  { name: 'Argentina', lat: -38.4, lng: -63.6 },
  { name: 'South Africa', lat: -30.6, lng: 22.9 },
  { name: 'Egypt', lat: 26.8, lng: 30.8 },
  { name: 'China', lat: 35.9, lng: 104.2 },
  { name: 'Indonesia', lat: -0.8, lng: 113.9 },
  { name: 'Turkey', lat: 39.0, lng: 35.2 },
  { name: 'Italy', lat: 41.9, lng: 12.6 },
  { name: 'Spain', lat: 40.5, lng: -3.7 },
  { name: 'Colombia', lat: 4.6, lng: -74.3 },
  { name: 'Kenya', lat: -0.02, lng: 37.9 },
  { name: 'Thailand', lat: 15.9, lng: 101.0 },
  { name: 'Sweden', lat: 60.1, lng: 18.6 },
];

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

interface GlobeProps {
  onCountryClick: (name: string) => void;
  isPanelOpen: boolean;
}

export default function GlobeScene({ onCountryClick, isPanelOpen }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    markers: THREE.Mesh[];
    markerNames: string[];
    globe: THREE.Mesh;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    hoveredMarker: THREE.Mesh | null;
    frameId: number;
  } | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mouseScreenRef = useRef({ x: 0, y: 0 });

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const s = sceneRef.current;
      if (!s || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      s.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      s.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      s.raycaster.setFromCamera(s.mouse, s.camera);
      const hits = s.raycaster.intersectObjects(s.markers);
      if (hits.length > 0) {
        const idx = s.markers.indexOf(hits[0].object as THREE.Mesh);
        if (idx >= 0) onCountryClick(s.markerNames[idx]);
      }
    },
    [onCountryClick]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(new THREE.Color(GLOBE_BG), 1);
    container.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 3.2);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 6;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    // Lights
    const ambient = new THREE.AmbientLight(0x8888bb, 2.0);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xaaaaee, 1.2);
    directional.position.set(5, 3, 5);
    scene.add(directional);
    const backLight = new THREE.DirectionalLight(0x6666aa, 0.6);
    backLight.position.set(-5, -2, -5);
    scene.add(backLight);

    // Globe sphere
    const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
      color: OCEAN_COLOR,
      emissive: 0x0a0a2a,
      shininess: 25,
      specular: 0x4444aa,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // Grid lines (longitude/latitude)
    const gridMat = new THREE.LineBasicMaterial({ color: GRID_COLOR, transparent: true, opacity: 0.45 });
    for (let i = 0; i < 18; i++) {
      const curve = new THREE.EllipseCurve(0, 0, GLOBE_RADIUS + 0.002, GLOBE_RADIUS + 0.002, 0, Math.PI * 2, false, 0);
      const points2d = curve.getPoints(64);
      const points3d = points2d.map(p => new THREE.Vector3(p.x, p.y, 0));
      const geo = new THREE.BufferGeometry().setFromPoints(points3d);
      const line = new THREE.Line(geo, gridMat);
      line.rotation.y = (i / 18) * Math.PI;
      scene.add(line);
    }
    for (let i = 1; i < 12; i++) {
      const lat = (i / 12) * Math.PI;
      const r = Math.sin(lat) * (GLOBE_RADIUS + 0.002);
      const y = Math.cos(lat) * (GLOBE_RADIUS + 0.002);
      const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0);
      const points2d = curve.getPoints(64);
      const points3d = points2d.map(p => new THREE.Vector3(p.x, y, p.y));
      const geo = new THREE.BufferGeometry().setFromPoints(points3d);
      const line = new THREE.Line(geo, gridMat);
      scene.add(line);
    }

    // Atmosphere glow
    const atmosGeo = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
          gl_FragColor = vec4(0.35, 0.35, 0.7, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);

    // Country markers (small glowing dots)
    const markers: THREE.Mesh[] = [];
    const markerNames: string[] = [];
    const markerGeo = new THREE.SphereGeometry(0.035, 16, 16);

    COUNTRY_MARKERS.forEach(({ name, lat, lng }) => {
      const pos = latLngToVec3(lat, lng, GLOBE_RADIUS + 0.01);
      const mat = new THREE.MeshBasicMaterial({
        color: COUNTRY_COLOR,
        transparent: true,
        opacity: 0.8,
      });
      const marker = new THREE.Mesh(markerGeo, mat);
      marker.position.copy(pos);
      scene.add(marker);
      markers.push(marker);
      markerNames.push(name);

      // Outer glow ring
      const ringGeo = new THREE.RingGeometry(0.04, 0.06, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: COUNTRY_COLOR,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      scene.add(ring);
    });

    // Stars background
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 2000;
    const starsPositions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount * 3; i++) {
      starsPositions[i] = (Math.random() - 0.5) * 80;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0x8888bb, size: 0.1, sizeAttenuation: true });
    const stars = new THREE.Points(starsGeo, starsMat);
    scene.add(stars);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const state = {
      renderer, scene, camera, controls, markers, markerNames, globe, raycaster, mouse,
      hoveredMarker: null as THREE.Mesh | null,
      frameId: 0,
    };
    sceneRef.current = state;

    // Mouse move for hover
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseScreenRef.current = { x: e.clientX, y: e.clientY };
    };
    container.addEventListener('mousemove', onMouseMove);

    // Resize
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // Animation loop
    const animate = () => {
      state.frameId = requestAnimationFrame(animate);
      controls.update();

      // Hover detection
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(markers);
      if (hits.length > 0) {
        const hit = hits[0].object as THREE.Mesh;
        if (state.hoveredMarker !== hit) {
          // Reset previous
          if (state.hoveredMarker) {
            (state.hoveredMarker.material as THREE.MeshBasicMaterial).color.setHex(COUNTRY_COLOR);
            (state.hoveredMarker.material as THREE.MeshBasicMaterial).opacity = 0.8;
          }
          state.hoveredMarker = hit;
          (hit.material as THREE.MeshBasicMaterial).color.setHex(COUNTRY_HOVER_COLOR);
          (hit.material as THREE.MeshBasicMaterial).opacity = 1;
          const idx = markers.indexOf(hit);
          setHoveredName(markerNames[idx]);
          container.style.cursor = 'pointer';
        }
      } else {
        if (state.hoveredMarker) {
          (state.hoveredMarker.material as THREE.MeshBasicMaterial).color.setHex(COUNTRY_COLOR);
          (state.hoveredMarker.material as THREE.MeshBasicMaterial).opacity = 0.8;
          state.hoveredMarker = null;
          setHoveredName(null);
          container.style.cursor = 'default';
        }
      }

      // Pulse markers slightly
      const time = Date.now() * 0.002;
      markers.forEach((m, i) => {
        const scale = 1 + Math.sin(time + i * 0.5) * 0.15;
        m.scale.setScalar(scale);
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(state.frameId);
      container.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Auto-rotate toggle
  useEffect(() => {
    const s = sceneRef.current;
    if (s) s.controls.autoRotate = !isPanelOpen;
  }, [isPanelOpen]);

  // Click handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [handleClick]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full">
      {hoveredName && (
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            left: mouseScreenRef.current.x + 14,
            top: mouseScreenRef.current.y - 10,
            background: 'rgba(10,10,20,0.85)',
            backdropFilter: 'blur(8px)',
            color: '#e0e0e0',
            border: '1px solid rgba(100,100,180,0.2)',
            fontFamily: 'DM Sans, system-ui',
          }}
        >
          {hoveredName}
        </div>
      )}
    </div>
  );
}
