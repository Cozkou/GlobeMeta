import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { feature } from 'topojson-client';
import { isoAlpha2FromWorldAtlasId } from '@/data/isoNumericToAlpha2';

const GLOBE_RADIUS = 1;
const GLOBE_BG = '#0a0a0f';
const OCEAN_COLOR = 0x040410;
const LAND_COLOR = new THREE.Color().setHSL(230 / 360, 0.35, 0.18);
const LAND_HOVER = new THREE.Color().setHSL(220 / 360, 0.5, 0.32);
const BORDER_COLOR = 0x4488cc;

const ID_TO_NAME: Record<string, string> = {
  '004': 'Afghanistan', '008': 'Albania', '012': 'Algeria', '024': 'Angola',
  '032': 'Argentina', '036': 'Australia', '040': 'Austria', '050': 'Bangladesh',
  '056': 'Belgium', '068': 'Bolivia', '076': 'Brazil', '100': 'Bulgaria',
  '104': 'Myanmar', '116': 'Cambodia', '120': 'Cameroon', '124': 'Canada',
  '140': 'Central African Republic', '148': 'Chad', '152': 'Chile', '156': 'China',
  '170': 'Colombia', '178': 'Congo', '180': 'Dem. Rep. Congo', '188': 'Costa Rica',
  '191': 'Croatia', '192': 'Cuba', '196': 'Cyprus', '203': 'Czech Republic',
  '208': 'Denmark', '214': 'Dominican Republic', '218': 'Ecuador', '818': 'Egypt',
  '222': 'El Salvador', '226': 'Equatorial Guinea', '231': 'Ethiopia', '232': 'Eritrea',
  '233': 'Estonia', '246': 'Finland', '250': 'France', '266': 'Gabon',
  '270': 'Gambia', '268': 'Georgia', '276': 'Germany', '288': 'Ghana',
  '300': 'Greece', '320': 'Guatemala', '324': 'Guinea', '328': 'Guyana',
  '332': 'Haiti', '340': 'Honduras', '348': 'Hungary', '352': 'Iceland',
  '356': 'India', '360': 'Indonesia', '364': 'Iran', '368': 'Iraq',
  '372': 'Ireland', '376': 'Israel', '380': 'Italy', '384': 'Ivory Coast',
  '388': 'Jamaica', '392': 'Japan', '400': 'Jordan', '398': 'Kazakhstan',
  '404': 'Kenya', '408': 'North Korea', '410': 'South Korea', '414': 'Kuwait',
  '417': 'Kyrgyzstan', '418': 'Laos', '422': 'Lebanon', '426': 'Lesotho',
  '428': 'Latvia', '430': 'Liberia', '434': 'Libya', '440': 'Lithuania',
  '442': 'Luxembourg', '450': 'Madagascar', '454': 'Malawi', '458': 'Malaysia',
  '466': 'Mali', '478': 'Mauritania', '484': 'Mexico', '496': 'Mongolia',
  '498': 'Moldova', '504': 'Morocco', '508': 'Mozambique', '512': 'Oman',
  '516': 'Namibia', '524': 'Nepal', '528': 'Netherlands', '554': 'New Zealand',
  '558': 'Nicaragua', '562': 'Niger', '566': 'Nigeria', '578': 'Norway',
  '586': 'Pakistan', '591': 'Panama', '598': 'Papua New Guinea', '600': 'Paraguay',
  '604': 'Peru', '608': 'Philippines', '616': 'Poland', '620': 'Portugal',
  '634': 'Qatar', '642': 'Romania', '643': 'Russia', '646': 'Rwanda',
  '682': 'Saudi Arabia', '686': 'Senegal', '688': 'Serbia', '694': 'Sierra Leone',
  '702': 'Singapore', '703': 'Slovakia', '705': 'Slovenia', '704': 'Vietnam',
  '706': 'Somalia', '710': 'South Africa', '716': 'Zimbabwe', '724': 'Spain',
  '728': 'South Sudan', '729': 'Sudan', '736': 'Sudan', '740': 'Suriname',
  '748': 'Eswatini', '752': 'Sweden', '756': 'Switzerland', '760': 'Syria',
  '762': 'Tajikistan', '764': 'Thailand', '768': 'Togo', '780': 'Trinidad and Tobago',
  '788': 'Tunisia', '792': 'Turkey', '795': 'Turkmenistan', '800': 'Uganda',
  '804': 'Ukraine', '784': 'United Arab Emirates', '826': 'United Kingdom',
  '840': 'United States of America', '858': 'Uruguay', '860': 'Uzbekistan',
  '862': 'Venezuela', '887': 'Yemen', '894': 'Zambia',
};

// Approximate centroids (lat, lng) for fly-to
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  'Afghanistan': [33, 65], 'Albania': [41, 20], 'Algeria': [28, 3], 'Angola': [-12, 18],
  'Argentina': [-34, -64], 'Australia': [-25, 134], 'Austria': [47, 14], 'Bangladesh': [24, 90],
  'Belgium': [51, 4], 'Bolivia': [-17, -65], 'Brazil': [-10, -55], 'Bulgaria': [43, 25],
  'Myanmar': [20, 97], 'Cambodia': [13, 105], 'Cameroon': [6, 12], 'Canada': [56, -96],
  'Central African Republic': [7, 21], 'Chad': [15, 19], 'Chile': [-34, -71], 'China': [35, 105],
  'Colombia': [4, -72], 'Congo': [-1, 15], 'Dem. Rep. Congo': [-3, 24], 'Costa Rica': [10, -84],
  'Croatia': [45, 16], 'Cuba': [22, -80], 'Czech Republic': [50, 15], 'Denmark': [56, 10],
  'Dominican Republic': [19, -70], 'Ecuador': [-2, -78], 'Egypt': [27, 30], 'El Salvador': [14, -89],
  'Ethiopia': [9, 40], 'Finland': [64, 26], 'France': [46, 2], 'Germany': [51, 10],
  'Ghana': [8, -2], 'Greece': [39, 22], 'Guatemala': [15, -90], 'Guinea': [11, -11],
  'Haiti': [19, -72], 'Honduras': [15, -87], 'Hungary': [47, 20], 'Iceland': [65, -18],
  'India': [22, 79], 'Indonesia': [-2, 118], 'Iran': [32, 53], 'Iraq': [33, 44],
  'Ireland': [53, -8], 'Israel': [31, 35], 'Italy': [42, 12], 'Ivory Coast': [7, -6],
  'Jamaica': [18, -77], 'Japan': [36, 138], 'Jordan': [31, 37], 'Kazakhstan': [48, 67],
  'Kenya': [1, 38], 'North Korea': [40, 127], 'South Korea': [36, 128], 'Kuwait': [29, 48],
  'Laos': [18, 105], 'Lebanon': [34, 36], 'Liberia': [6, -10], 'Libya': [27, 17],
  'Lithuania': [55, 24], 'Malaysia': [4, 109], 'Mali': [17, -4], 'Mexico': [23, -102],
  'Mongolia': [47, 104], 'Morocco': [32, -6], 'Mozambique': [-19, 35], 'Namibia': [-22, 17],
  'Nepal': [28, 84], 'Netherlands': [52, 5], 'New Zealand': [-42, 174], 'Nicaragua': [13, -85],
  'Niger': [18, 9], 'Nigeria': [10, 8], 'Norway': [64, 12], 'Pakistan': [30, 70],
  'Panama': [9, -80], 'Papua New Guinea': [-6, 147], 'Paraguay': [-23, -58], 'Peru': [-10, -76],
  'Philippines': [12, 122], 'Poland': [52, 20], 'Portugal': [39, -8], 'Qatar': [25, 51],
  'Romania': [46, 25], 'Russia': [60, 100], 'Saudi Arabia': [24, 45], 'Senegal': [14, -14],
  'Serbia': [44, 21], 'Sierra Leone': [9, -12], 'Slovakia': [49, 19], 'Somalia': [5, 46],
  'South Africa': [-29, 24], 'South Sudan': [7, 30], 'Spain': [40, -4], 'Sudan': [15, 30],
  'Suriname': [4, -56], 'Sweden': [62, 15], 'Switzerland': [47, 8], 'Syria': [35, 38],
  'Thailand': [15, 101], 'Tunisia': [34, 9], 'Turkey': [39, 35], 'Uganda': [1, 32],
  'Ukraine': [49, 32], 'United Arab Emirates': [24, 54], 'United Kingdom': [54, -2],
  'United States of America': [38, -97], 'Uruguay': [-33, -56], 'Uzbekistan': [41, 65],
  'Venezuela': [7, -66], 'Vietnam': [16, 108], 'Yemen': [15, 48], 'Zambia': [-14, 28],
  'Zimbabwe': [-20, 30],
};

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

export interface GlobeCountryPick {
  name: string;
  /** ISO 3166-1 alpha-2 from world-atlas numeric id; null if unmapped. */
  code: string | null;
}

interface CountryMeshData {
  name: string;
  isoCode: string | null;
  meshes: THREE.Mesh[];
  lines: THREE.Line[];
}

export interface GlobeHandle {
  flyTo: (countryName: string) => void;
  getCountryNames: () => string[];
}

interface GlobeProps {
  onCountryClick: (pick: GlobeCountryPick) => void;
  isPanelOpen: boolean;
  crystalBallMode?: boolean;
}

const CAM_DEFAULT = new THREE.Vector3(0, 0.25, 3.2);
const CAM_CRYSTAL = new THREE.Vector3(0, 0.6, 4.2);

function createStand(): THREE.Group {
  const group = new THREE.Group();

  const woodMat = new THREE.MeshPhongMaterial({
    color: 0x3e2723,
    emissive: 0x1a0e08,
    shininess: 25,
    specular: 0x5d4037,
  });
  const darkWoodMat = new THREE.MeshPhongMaterial({
    color: 0x2c1a10,
    emissive: 0x100804,
    shininess: 15,
    specular: 0x3e2723,
  });
  const goldTrim = new THREE.MeshPhongMaterial({
    color: 0xc9a84c,
    emissive: 0x4a3a18,
    shininess: 80,
    specular: 0xffd700,
  });

  // Base plate
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 0.10, 6), darkWoodMat);
  base.position.y = -1.38;
  group.add(base);

  // Gold trim ring on base
  const baseTrim = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.025, 12, 6), goldTrim);
  baseTrim.rotation.x = Math.PI / 2;
  baseTrim.position.y = -1.33;
  group.add(baseTrim);

  // Tapered stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, 0.80, 6), woodMat);
  stem.position.y = -0.93;
  group.add(stem);

  // Cradle — three curved prongs that hold the ball
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.035, 8, 12, Math.PI * 0.6),
      goldTrim,
    );
    prong.rotation.set(Math.PI * 0.25, (i * Math.PI * 2) / 3, 0);
    prong.position.y = -0.38;
    group.add(prong);
  }

  // Rim ring where ball sits
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 12, 32), goldTrim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.52;
  group.add(rim);

  group.scale.setScalar(0);
  return group;
}

const GlobeScene = forwardRef<GlobeHandle, GlobeProps>(({ onCountryClick, isPanelOpen, crystalBallMode = false }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    globe: THREE.Mesh;
    stand: THREE.Group;
    countryGroup: THREE.Group;
    countryMeshes: THREE.Mesh[];
    countryDataMap: Map<THREE.Mesh, CountryMeshData>;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    hoveredCountry: CountryMeshData | null;
    frameId: number;
    countryNames: string[];
    flyTarget: THREE.Vector3 | null;
    flyProgress: number;
    crystalProgress: number;
    crystalTarget: number;
  } | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const mouseScreenRef = useRef({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    flyTo: (countryName: string) => {
      const s = sceneRef.current;
      if (!s) return;
      const centroid = COUNTRY_CENTROIDS[countryName];
      if (!centroid) return;
      const target = latLngToVec3(centroid[0], centroid[1], s.camera.position.length());
      s.flyTarget = target;
      s.flyProgress = 0;
      s.controls.autoRotate = false;
    },
    getCountryNames: () => sceneRef.current?.countryNames ?? [],
  }));

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const s = sceneRef.current;
      if (!s || !containerRef.current || s.crystalTarget > 0.5) return;
      const rect = containerRef.current.getBoundingClientRect();
      s.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      s.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      s.raycaster.setFromCamera(s.mouse, s.camera);
      const hits = s.raycaster.intersectObjects(s.countryMeshes);
      if (hits.length > 0) {
        const hit = hits[0];
        const surfaceNormal = hit.point.clone().normalize();
        const camDir = s.camera.position.clone().normalize();
        if (surfaceNormal.dot(camDir) < 0.05) return;
        const data = s.countryDataMap.get(hit.object as THREE.Mesh);
        if (data) onCountryClick({ name: data.name, code: data.isoCode });
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
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0.25, 3.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 6;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;

    // Lights
    scene.add(new THREE.AmbientLight(0x6688bb, 1.5));
    const dir = new THREE.DirectionalLight(0x88aadd, 0.8);
    dir.position.set(5, 3, 5);
    scene.add(dir);

    // Ocean sphere
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({
        color: OCEAN_COLOR,
        emissive: 0x020208,
        shininess: 5,
        specular: 0x111122,
      })
    );
    scene.add(globe);

    // Atmosphere glow — subtle rim
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vN; varying vec3 vPos; void main(){vN=normalize(normalMatrix*normal);vPos=(modelViewMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vN; varying vec3 vPos; void main(){float rim=1.0-abs(dot(vN,vec3(0,0,1)));float i=pow(rim,5.0)*0.25;vec3 col=mix(vec3(0.1,0.18,0.35),vec3(0.15,0.35,0.6),rim);gl_FragColor=vec4(col,i);}`,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 48, 48), atmosMat));

    // Stars — lots of them
    const STAR_COUNT = 8000;
    const starsPos = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      starsPos[i * 3] = (Math.random() - 0.5) * 120;
      starsPos[i * 3 + 1] = (Math.random() - 0.5) * 120;
      starsPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      // Slight color variation
      const t = Math.random();
      starColors[i * 3] = 0.5 + t * 0.3;
      starColors[i * 3 + 1] = 0.5 + t * 0.2;
      starColors[i * 3 + 2] = 0.7 + t * 0.3;
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
    starsGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({
      size: 0.05,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    })));

    // Second layer of dimmer tiny stars for depth
    const TINY_COUNT = 4000;
    const tinyPos = new Float32Array(TINY_COUNT * 3);
    for (let i = 0; i < TINY_COUNT * 3; i++) tinyPos[i] = (Math.random() - 0.5) * 200;
    const tinyGeo = new THREE.BufferGeometry();
    tinyGeo.setAttribute('position', new THREE.BufferAttribute(tinyPos, 3));
    scene.add(new THREE.Points(tinyGeo, new THREE.PointsMaterial({ color: 0x5566aa, size: 0.03, sizeAttenuation: true, transparent: true, opacity: 0.5 })));

    const stand = createStand();
    scene.add(stand);

    const countryGroup = new THREE.Group();
    scene.add(countryGroup);

    const countryMeshes: THREE.Mesh[] = [];
    const countryDataMap = new Map<THREE.Mesh, CountryMeshData>();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const state = {
      renderer, scene, camera, controls, globe, stand, countryGroup, countryMeshes, countryDataMap,
      raycaster, mouse,
      hoveredCountry: null as CountryMeshData | null,
      frameId: 0,
      countryNames: [] as string[],
      flyTarget: null as THREE.Vector3 | null,
      flyProgress: 0,
      crystalProgress: 0,
      crystalTarget: 0,
    };
    sceneRef.current = state;

    // Load countries
    fetch('https://unpkg.com/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topoData => {
        const countries = feature(topoData, topoData.objects.countries) as any;

        const borderMat = new THREE.LineBasicMaterial({
          color: BORDER_COLOR,
          transparent: true,
          opacity: 0.7,
          linewidth: 1,
        });

        const featureList = countries.features as any[];

        featureList.forEach((feat: any) => {
          const id = feat.id != null ? String(feat.id) : '';
          const isoCode = isoAlpha2FromWorldAtlasId(feat.id);
          const name = (id && ID_TO_NAME[id]) || feat.properties?.name || (id ? `Country ${id}` : 'Unknown');
          state.countryNames.push(name);

          const geom = feat.geometry;
          const polygons: number[][][][] = [];
          if (geom.type === 'Polygon') polygons.push(geom.coordinates);
          else if (geom.type === 'MultiPolygon') polygons.push(...geom.coordinates);

          const countryData: CountryMeshData = { name, isoCode, meshes: [], lines: [] };

          const allVerts: number[] = [];

          polygons.forEach(poly => {
            // Border for each ring
            poly.forEach((ring, ringIdx) => {
              const borderPts = coordsToPoints(ring, GLOBE_RADIUS + 0.003);
              if (borderPts.length >= 3) {
                const lineGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
                const line = new THREE.Line(lineGeo, borderMat);
                countryGroup.add(line);
                countryData.lines.push(line);
              }

              // Only triangulate outer ring (ringIdx 0) for fill
              if (ringIdx > 0) return;
              const pts = coordsToPoints(ring, GLOBE_RADIUS + 0.001);
              if (pts.length < 3) return;
              for (let i = 1; i < pts.length - 1; i++) {
                allVerts.push(
                  pts[0].x, pts[0].y, pts[0].z,
                  pts[i].x, pts[i].y, pts[i].z,
                  pts[i + 1].x, pts[i + 1].y, pts[i + 1].z,
                );
              }
            });
          });

          if (allVerts.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(allVerts, 3));
            geo.computeVertexNormals();
            const mat = new THREE.MeshBasicMaterial({
              color: LAND_COLOR,
              transparent: true,
              opacity: 0.55,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geo, mat);
            countryGroup.add(mesh);
            countryData.meshes.push(mesh);
            countryMeshes.push(mesh);
            countryDataMap.set(mesh, countryData);
          }

          // Holographic dots scattered along borders
          const dotPositions: number[] = [];
          polygons.forEach(poly => {
            const ring = poly[0];
            // Place dots along the border at intervals
            for (let i = 0; i < ring.length - 1; i += 2) {
              const pt = latLngToVec3(ring[i][1], ring[i][0], GLOBE_RADIUS + 0.005);
              dotPositions.push(pt.x, pt.y, pt.z);
            }
          });
          if (dotPositions.length > 0) {
            const dotGeo = new THREE.BufferGeometry();
            dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
            const dotMat = new THREE.PointsMaterial({
              color: 0x66aaff,
              size: 0.008,
              sizeAttenuation: true,
              transparent: true,
              opacity: 0.7,
            });
            countryGroup.add(new THREE.Points(dotGeo, dotMat));
          }
        });
      });

    // Grid lines on the globe for holographic feel
    const gridMat = new THREE.LineBasicMaterial({ color: 0x1a2a55, transparent: true, opacity: 0.15 });
    // Latitude lines
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts: THREE.Vector3[] = [];
      for (let lng = -180; lng <= 180; lng += 4) {
        pts.push(latLngToVec3(lat, lng, GLOBE_RADIUS + 0.0005));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(geo, gridMat));
    }
    // Longitude lines
    for (let lng = -180; lng < 180; lng += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 4) {
        pts.push(latLngToVec3(lat, lng, GLOBE_RADIUS + 0.0005));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(geo, gridMat));
    }

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

    let frameCount = 0;

    const animate = () => {
      state.frameId = requestAnimationFrame(animate);
      controls.update();
      frameCount++;

      // Crystal ball transition
      state.crystalProgress += (state.crystalTarget - state.crystalProgress) * 0.04;
      const c = state.crystalProgress;
      const cease = c * c * (3 - 2 * c);
      state.stand.scale.setScalar(cease);

      // Slower auto-rotate when in crystal mode
      controls.autoRotateSpeed = 0.4 - cease * 0.25;

      // Fly-to animation
      if (state.flyTarget) {
        state.flyProgress += 0.02;
        const t = Math.min(state.flyProgress, 1);
        const ease = t * (2 - t); // ease-out quad
        const currentPos = camera.position.clone();
        const dist = currentPos.length();
        const targetDir = state.flyTarget.clone().normalize().multiplyScalar(dist);
        camera.position.lerpVectors(currentPos, targetDir, ease * 0.06);
        camera.lookAt(0, 0, 0);
        if (t >= 1) {
          state.flyTarget = null;
          state.flyProgress = 0;
        }
      } else if (c > 0.005) {
        camera.position.lerpVectors(CAM_DEFAULT, CAM_CRYSTAL, cease);
        camera.lookAt(0, 0, 0);
      }

      // Raycast hover every 3 frames (skip in crystal mode)
      if (frameCount % 3 === 0 && countryMeshes.length > 0 && state.crystalTarget < 0.5) {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(countryMeshes);

        const camDir = camera.position.clone().normalize();
        const frontHit = hits.find(h => h.point.clone().normalize().dot(camDir) >= 0.05);

        if (frontHit) {
          const hitData = countryDataMap.get(frontHit.object as THREE.Mesh);
          if (hitData && hitData !== state.hoveredCountry) {
            if (state.hoveredCountry) {
              state.hoveredCountry.meshes.forEach(m => {
                (m.material as THREE.MeshBasicMaterial).color.copy(LAND_COLOR);
                (m.material as THREE.MeshBasicMaterial).opacity = 0.55;
              });
              state.hoveredCountry.lines.forEach(l => {
                (l.material as THREE.LineBasicMaterial).opacity = 0.7;
              });
            }
            state.hoveredCountry = hitData;
            hitData.meshes.forEach(m => {
              (m.material as THREE.MeshBasicMaterial).color.copy(LAND_HOVER);
              (m.material as THREE.MeshBasicMaterial).opacity = 0.75;
            });
            hitData.lines.forEach(l => {
              (l.material as THREE.LineBasicMaterial).opacity = 1;
            });
            setHoveredName(hitData.name);
            container.style.cursor = 'pointer';
          }
        } else if (state.hoveredCountry) {
          state.hoveredCountry.meshes.forEach(m => {
            (m.material as THREE.MeshBasicMaterial).color.copy(LAND_COLOR);
            (m.material as THREE.MeshBasicMaterial).opacity = 0.55;
          });
          state.hoveredCountry.lines.forEach(l => {
            (l.material as THREE.LineBasicMaterial).opacity = 0.7;
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
    if (!s) return;
    s.controls.autoRotate = crystalBallMode || !isPanelOpen;
    s.controls.enabled = true;
    s.controls.enableRotate = true;
  }, [isPanelOpen, crystalBallMode]);

  useEffect(() => {
    const s = sceneRef.current;
    if (s) s.crystalTarget = crystalBallMode ? 1 : 0;
  }, [crystalBallMode]);

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
            background: 'rgba(8,12,30,0.85)',
            backdropFilter: 'blur(12px)',
            color: '#a0c4f0',
            border: '1px solid rgba(70,130,200,0.3)',
            fontFamily: 'DM Sans, system-ui',
            boxShadow: '0 0 12px rgba(70,130,200,0.15)',
          }}
        >
          {hoveredName}
        </div>
      )}
    </div>
  );
});

GlobeScene.displayName = 'GlobeScene';
export default GlobeScene;
