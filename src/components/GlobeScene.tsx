import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { feature } from 'topojson-client';

const GLOBE_RADIUS = 1;
const GLOBE_BG = '#0a0a0f';
const OCEAN_COLOR = 0x060612;
const BORDER_COLOR = 0x5858bb;
const DEFAULT_LAND_COLOR = 0x1e1e55;

// ID-to-name mapping for world-atlas numeric IDs (ISO 3166-1 numeric)
const ID_TO_NAME: Record<string, string> = {
  '004': 'Afghanistan', '008': 'Albania', '012': 'Algeria', '024': 'Angola',
  '032': 'Argentina', '036': 'Australia', '040': 'Austria', '050': 'Bangladesh',
  '056': 'Belgium', '068': 'Bolivia', '076': 'Brazil', '100': 'Bulgaria',
  '104': 'Myanmar', '116': 'Cambodia', '120': 'Cameroon', '124': 'Canada',
  '140': 'Central African Republic', '148': 'Chad', '152': 'Chile', '156': 'China',
  '170': 'Colombia', '180': 'Dem. Rep. Congo', '188': 'Costa Rica', '191': 'Croatia',
  '192': 'Cuba', '203': 'Czech Republic', '208': 'Denmark', '214': 'Dominican Republic',
  '218': 'Ecuador', '818': 'Egypt', '222': 'El Salvador', '231': 'Ethiopia',
  '246': 'Finland', '250': 'France', '276': 'Germany', '288': 'Ghana',
  '300': 'Greece', '320': 'Guatemala', '324': 'Guinea', '332': 'Haiti',
  '340': 'Honduras', '348': 'Hungary', '356': 'India', '360': 'Indonesia',
  '364': 'Iran', '368': 'Iraq', '372': 'Ireland', '376': 'Israel',
  '380': 'Italy', '384': 'Ivory Coast', '392': 'Japan', '400': 'Jordan',
  '404': 'Kenya', '408': 'North Korea', '410': 'South Korea', '414': 'Kuwait',
  '418': 'Laos', '422': 'Lebanon', '430': 'Liberia', '434': 'Libya',
  '440': 'Lithuania', '458': 'Malaysia', '466': 'Mali', '484': 'Mexico',
  '496': 'Mongolia', '504': 'Morocco', '508': 'Mozambique', '516': 'Namibia',
  '524': 'Nepal', '528': 'Netherlands', '554': 'New Zealand', '558': 'Nicaragua',
  '562': 'Niger', '566': 'Nigeria', '578': 'Norway', '586': 'Pakistan',
  '591': 'Panama', '598': 'Papua New Guinea', '600': 'Paraguay', '604': 'Peru',
  '608': 'Philippines', '616': 'Poland', '620': 'Portugal', '634': 'Qatar',
  '642': 'Romania', '643': 'Russia', '682': 'Saudi Arabia', '686': 'Senegal',
  '694': 'Sierra Leone', '702': 'Singapore', '703': 'Slovakia', '704': 'Vietnam',
  '706': 'Somalia', '710': 'South Africa', '716': 'Zimbabwe', '724': 'Spain',
  '736': 'Sudan', '740': 'Suriname', '752': 'Sweden', '756': 'Switzerland',
  '760': 'Syria', '764': 'Thailand', '788': 'Tunisia', '792': 'Turkey',
  '800': 'Uganda', '804': 'Ukraine', '784': 'United Arab Emirates',
  '826': 'United Kingdom', '840': 'United States of America',
  '858': 'Uruguay', '860': 'Uzbekistan', '862': 'Venezuela',
  '887': 'Yemen', '894': 'Zambia', '729': 'Sudan',
};

// Energy-based color palette — maps country name to a hue
const COUNTRY_HUES: Record<string, number> = {
  'United States of America': 15,  // warm orange-red (High Energy)
  'Brazil': 40,                     // golden yellow (Party)
  'Japan': 200,                     // cool blue (Melancholic)
  'Nigeria': 145,                   // teal-green (Afrobeats)
  'France': 270,                    // purple (Dreamy)
  'India': 330,                     // pink-magenta (Euphoric)
  'Germany': 0,                     // red (Techno)
  'Australia': 195,                 // ocean blue (Chill)
  'South Korea': 320,               // hot pink (K-Pop)
  'United Kingdom': 25,             // amber (Indie)
  'Mexico': 50,                     // yellow-gold
  'Canada': 210,                    // steel blue
  'Argentina': 180,                 // cyan
  'South Africa': 120,              // green
  'Egypt': 35,                      // sandy orange
  'China': 5,                       // red
  'Indonesia': 155,                 // sea green
  'Turkey': 10,                     // red-orange
  'Italy': 350,                     // crimson
  'Spain': 45,                      // warm yellow
  'Colombia': 55,                   // golden
  'Kenya': 130,                     // forest green
  'Thailand': 165,                  // aqua
  'Sweden': 220,                    // nordic blue
  'Russia': 240,                    // deep blue
  'Ukraine': 60,                    // wheat
  'Poland': 350,                    // soft red
  'Iran': 30,                       // amber
  'Saudi Arabia': 110,              // olive green
  'Peru': 170,                      // teal
  'Chile': 290,                     // violet
  'Venezuela': 55,                  // gold
  'Cuba': 15,                       // warm
  'Philippines': 305,               // orchid
  'Vietnam': 140,                   // green
  'Pakistan': 100,                  // lime
  'Bangladesh': 90,                 // yellow-green
  'Ethiopia': 75,                   // chartreuse
  'Ghana': 80,                      // grass green
};

function getCountryColor(name: string): THREE.Color {
  const hue = COUNTRY_HUES[name];
  if (hue !== undefined) {
    // Saturated, medium brightness — stands out from dark ocean
    return new THREE.Color().setHSL(hue / 360, 0.55, 0.28);
  }
  // Default muted land color with slight random hue variation
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const h = (hash * 137) % 360;
  return new THREE.Color().setHSL(h / 360, 0.3, 0.2);
}

function getCountryHoverColor(name: string): THREE.Color {
  const hue = COUNTRY_HUES[name];
  if (hue !== undefined) {
    return new THREE.Color().setHSL(hue / 360, 0.65, 0.45);
  }
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const h = (hash * 137) % 360;
  return new THREE.Color().setHSL(h / 360, 0.4, 0.35);
}

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function coordsToPoints(coords: number[][], radius: number): THREE.Vector3[] {
  return coords.map(([lng, lat]) => latLngToVec3(lat, lng, radius));
}

interface CountryMeshData {
  name: string;
  meshes: THREE.Mesh[];
  lines: THREE.Line[];
  baseColor: THREE.Color;
  hoverColor: THREE.Color;
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
    globe: THREE.Mesh;
    countryMeshes: THREE.Mesh[];
    countryDataMap: Map<THREE.Mesh, CountryMeshData>;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    hoveredCountry: CountryMeshData | null;
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
      const hits = s.raycaster.intersectObjects(s.countryMeshes);
      if (hits.length > 0) {
        const data = s.countryDataMap.get(hits[0].object as THREE.Mesh);
        if (data) onCountryClick(data.name);
      }
    },
    [onCountryClick]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(new THREE.Color(GLOBE_BG), 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
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
    scene.add(new THREE.AmbientLight(0x8888bb, 2.0));
    const dir = new THREE.DirectionalLight(0xaaaaee, 1.0);
    dir.position.set(5, 3, 5);
    scene.add(dir);
    const back = new THREE.DirectionalLight(0x6666aa, 0.5);
    back.position.set(-5, -2, -5);
    scene.add(back);

    // Ocean sphere
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({ color: OCEAN_COLOR, emissive: 0x030310, shininess: 8, specular: 0x181838 })
    );
    scene.add(globe);

    // Atmosphere
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vN; void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vN; void main(){float i=pow(0.5-dot(vN,vec3(0,0,1)),3.0);gl_FragColor=vec4(0.2,0.2,0.45,1.0)*i;}`,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 48, 48), atmosMat));

    // Stars
    const starsPos = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000 * 3; i++) starsPos[i] = (Math.random() - 0.5) * 80;
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0x7777aa, size: 0.06, sizeAttenuation: true })));

    const countryGroup = new THREE.Group();
    scene.add(countryGroup);

    const countryMeshes: THREE.Mesh[] = [];
    const countryDataMap = new Map<THREE.Mesh, CountryMeshData>();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const state = {
      renderer, scene, camera, controls, globe, countryMeshes, countryDataMap,
      raycaster, mouse,
      hoveredCountry: null as CountryMeshData | null,
      frameId: 0,
    };
    sceneRef.current = state;

    // Load countries — use 110m for perf, still looks good
    fetch('https://unpkg.com/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topoData => {
        const countries = feature(topoData, topoData.objects.countries) as any;

        const borderMat = new THREE.LineBasicMaterial({
          color: BORDER_COLOR,
          transparent: true,
          opacity: 0.6,
        });

        countries.features.forEach((feat: any) => {
          const id = feat.id?.toString();
          const name = feat.properties?.name || ID_TO_NAME[id] || `Country ${id}`;
          const baseColor = getCountryColor(name);
          const hoverColor = getCountryHoverColor(name);

          const geom = feat.geometry;
          const rings: number[][][] = [];
          if (geom.type === 'Polygon') rings.push(...geom.coordinates);
          else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((p: number[][][]) => rings.push(...p));

          const countryData: CountryMeshData = { name, meshes: [], lines: [], baseColor, hoverColor };

          // Batch all rings into one geometry per country
          const allVerts: number[] = [];
          rings.forEach(ring => {
            const pts = coordsToPoints(ring, GLOBE_RADIUS + 0.002);
            if (pts.length < 3) return;

            // Border line
            const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(lineGeo, borderMat);
            countryGroup.add(line);
            countryData.lines.push(line);

            // Fan triangulation into single buffer
            for (let i = 1; i < pts.length - 1; i++) {
              allVerts.push(
                pts[0].x, pts[0].y, pts[0].z,
                pts[i].x, pts[i].y, pts[i].z,
                pts[i + 1].x, pts[i + 1].y, pts[i + 1].z,
              );
            }
          });

          if (allVerts.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(allVerts, 3));
            geo.computeVertexNormals();
            const mat = new THREE.MeshBasicMaterial({
              color: baseColor,
              transparent: true,
              opacity: 0.7,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geo, mat);
            countryGroup.add(mesh);
            countryData.meshes.push(mesh);
            countryMeshes.push(mesh);
            countryDataMap.set(mesh, countryData);
          }
        });
      });

    // Events
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

    // Throttle raycasting — only every 3 frames
    let frameCount = 0;

    const animate = () => {
      state.frameId = requestAnimationFrame(animate);
      controls.update();
      frameCount++;

      // Raycast hover every 3 frames for perf
      if (frameCount % 3 === 0 && countryMeshes.length > 0) {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(countryMeshes);

        if (hits.length > 0) {
          const hitData = countryDataMap.get(hits[0].object as THREE.Mesh);
          if (hitData && hitData !== state.hoveredCountry) {
            // Reset previous
            if (state.hoveredCountry) {
              state.hoveredCountry.meshes.forEach(m => {
                (m.material as THREE.MeshBasicMaterial).color.copy(state.hoveredCountry!.baseColor);
                (m.material as THREE.MeshBasicMaterial).opacity = 0.7;
              });
            }
            state.hoveredCountry = hitData;
            hitData.meshes.forEach(m => {
              (m.material as THREE.MeshBasicMaterial).color.copy(hitData.hoverColor);
              (m.material as THREE.MeshBasicMaterial).opacity = 0.9;
            });
            setHoveredName(hitData.name);
            container.style.cursor = 'pointer';
          }
        } else if (state.hoveredCountry) {
          state.hoveredCountry.meshes.forEach(m => {
            (m.material as THREE.MeshBasicMaterial).color.copy(state.hoveredCountry!.baseColor);
            (m.material as THREE.MeshBasicMaterial).opacity = 0.7;
          });
          state.hoveredCountry = null;
          setHoveredName(null);
          container.style.cursor = 'default';
        }
      }

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

  useEffect(() => {
    const s = sceneRef.current;
    if (s) s.controls.autoRotate = !isPanelOpen;
  }, [isPanelOpen]);

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
