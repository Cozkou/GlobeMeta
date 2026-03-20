import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { feature } from 'topojson-client';

const GLOBE_RADIUS = 1;
const ATMOSPHERE_RADIUS = 1.08;
const GLOBE_BG = '#0a0a0f';
const OCEAN_COLOR = 0x080818;
const LAND_COLOR = 0x2a2a6a;
const BORDER_COLOR = 0x6060cc;
const BORDER_HOVER_COLOR = 0x8888ff;
const MARKER_COLOR = 0x7a7aff;
const MARKER_HOVER_COLOR = 0xbbbbff;

// Country center positions for markers
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

// Convert a GeoJSON coordinate ring to 3D points on the globe
function coordsToPoints(coords: number[][], radius: number): THREE.Vector3[] {
  return coords.map(([lng, lat]) => latLngToVec3(lat, lng, radius));
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
    countryGroup: THREE.Group;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    hoveredMarker: THREE.Mesh | null;
    frameId: number;
  } | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const mouseScreenRef = useRef({ x: 0, y: 0 });

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const s = sceneRef.current;
      if (!s || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      s.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      s.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      s.raycaster.setFromCamera(s.mouse, s.camera);
      // Check markers first
      const markerHits = s.raycaster.intersectObjects(s.markers);
      if (markerHits.length > 0) {
        const idx = s.markers.indexOf(markerHits[0].object as THREE.Mesh);
        if (idx >= 0) onCountryClick(s.markerNames[idx]);
        return;
      }
      // Check globe surface → find nearest country marker
      const globeHits = s.raycaster.intersectObject(s.globe);
      if (globeHits.length > 0) {
        const point = globeHits[0].point.clone().normalize();
        let closestIdx = -1;
        let closestDist = Infinity;
        s.markers.forEach((m, i) => {
          const d = point.distanceTo(m.position.clone().normalize());
          if (d < closestDist) {
            closestDist = d;
            closestIdx = i;
          }
        });
        // Only trigger if close enough (within ~15 degrees)
        if (closestIdx >= 0 && closestDist < 0.25) {
          onCountryClick(s.markerNames[closestIdx]);
        }
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

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 3.2);

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

    // Ocean sphere
    const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96);
    const globeMat = new THREE.MeshPhongMaterial({
      color: OCEAN_COLOR,
      emissive: 0x040410,
      shininess: 10,
      specular: 0x222244,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // Country outlines group (populated async)
    const countryGroup = new THREE.Group();
    scene.add(countryGroup);

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
          float intensity = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(0.22, 0.22, 0.5, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    scene.add(new THREE.Mesh(atmosGeo, atmosMat));

    // Country markers
    const markers: THREE.Mesh[] = [];
    const markerNames: string[] = [];
    const markerGeo = new THREE.SphereGeometry(0.018, 16, 16);

    COUNTRY_MARKERS.forEach(({ name, lat, lng }) => {
      const pos = latLngToVec3(lat, lng, GLOBE_RADIUS + 0.012);
      const mat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.9 });
      const marker = new THREE.Mesh(markerGeo, mat);
      marker.position.copy(pos);
      scene.add(marker);
      markers.push(marker);
      markerNames.push(name);

      // Glow ring
      const ringGeo = new THREE.RingGeometry(0.022, 0.035, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: MARKER_COLOR,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      scene.add(ring);
    });

    // Stars
    const starsGeo = new THREE.BufferGeometry();
    const starsPositions = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000 * 3; i++) {
      starsPositions[i] = (Math.random() - 0.5) * 80;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0x8888bb, size: 0.08, sizeAttenuation: true })));

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const state = {
      renderer, scene, camera, controls, markers, markerNames, globe, countryGroup,
      raycaster, mouse,
      hoveredMarker: null as THREE.Mesh | null,
      frameId: 0,
    };
    sceneRef.current = state;

    // Load country borders
    fetch('https://unpkg.com/world-atlas@2/countries-10m.json')
      .then(r => r.json())
      .then(topoData => {
        const countries = feature(topoData, topoData.objects.countries) as any;

        const borderMat = new THREE.LineBasicMaterial({
          color: BORDER_COLOR,
          transparent: true,
          opacity: 0.7,
          linewidth: 1,
        });

        const landMat = new THREE.MeshBasicMaterial({
          color: LAND_COLOR,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
        });

        countries.features.forEach((feat: any) => {
          const geom = feat.geometry;
          const rings: number[][][] = [];

          if (geom.type === 'Polygon') {
            rings.push(...geom.coordinates);
          } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach((poly: number[][][]) => {
              rings.push(...poly);
            });
          }

          rings.forEach(ring => {
            // Border outline
            const points = coordsToPoints(ring, GLOBE_RADIUS + 0.003);
            if (points.length < 3) return;
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(lineGeo, borderMat);
            countryGroup.add(line);

            // Land fill — use triangulation from fan for simple polygons
            if (points.length > 3) {
              const landPoints = coordsToPoints(ring, GLOBE_RADIUS + 0.001);
              const vertices: number[] = [];
              for (let i = 1; i < landPoints.length - 1; i++) {
                vertices.push(
                  landPoints[0].x, landPoints[0].y, landPoints[0].z,
                  landPoints[i].x, landPoints[i].y, landPoints[i].z,
                  landPoints[i + 1].x, landPoints[i + 1].y, landPoints[i + 1].z,
                );
              }
              const fillGeo = new THREE.BufferGeometry();
              fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
              fillGeo.computeVertexNormals();
              const fillMesh = new THREE.Mesh(fillGeo, landMat);
              countryGroup.add(fillMesh);
            }
          });
        });
      });

    // Mouse move
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseScreenRef.current = { x: e.clientX, y: e.clientY };
    };
    container.addEventListener('mousemove', onMouseMove);

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

      // Hover markers
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(markers);
      if (hits.length > 0) {
        const hit = hits[0].object as THREE.Mesh;
        if (state.hoveredMarker !== hit) {
          if (state.hoveredMarker) {
            (state.hoveredMarker.material as THREE.MeshBasicMaterial).color.setHex(MARKER_COLOR);
            (state.hoveredMarker.material as THREE.MeshBasicMaterial).opacity = 0.9;
          }
          state.hoveredMarker = hit;
          (hit.material as THREE.MeshBasicMaterial).color.setHex(MARKER_HOVER_COLOR);
          (hit.material as THREE.MeshBasicMaterial).opacity = 1;
          setHoveredName(markerNames[markers.indexOf(hit)]);
          container.style.cursor = 'pointer';
        }
      } else {
        if (state.hoveredMarker) {
          (state.hoveredMarker.material as THREE.MeshBasicMaterial).color.setHex(MARKER_COLOR);
          (state.hoveredMarker.material as THREE.MeshBasicMaterial).opacity = 0.9;
          state.hoveredMarker = null;
          setHoveredName(null);
          container.style.cursor = 'default';
        }
      }

      // Pulse markers
      const time = Date.now() * 0.002;
      markers.forEach((m, i) => {
        m.scale.setScalar(1 + Math.sin(time + i * 0.5) * 0.12);
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

  // Auto-rotate
  useEffect(() => {
    const s = sceneRef.current;
    if (s) s.controls.autoRotate = !isPanelOpen;
  }, [isPanelOpen]);

  // Click
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
          className="fixed z-50 pointer-events-none px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            left: mouseScreenRef.current.x + 14,
            top: mouseScreenRef.current.y - 10,
            background: 'rgba(10,10,20,0.9)',
            backdropFilter: 'blur(12px)',
            color: '#e0e0f0',
            border: '1px solid rgba(100,100,180,0.25)',
            fontFamily: 'DM Sans, system-ui',
          }}
        >
          {hoveredName}
        </div>
      )}
    </div>
  );
}
