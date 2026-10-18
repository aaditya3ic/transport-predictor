"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Types & data                                                       */
/* ------------------------------------------------------------------ */

type Mode = "train" | "flight";

type Route = {
  id: string;
  label: string; // shown in the dropdown
  from: string;
  to: string;
  fromCode: string;
  toCode: string;
  carrier: string; // train name or airline
  number: string; // train no. or flight no.
  dep: string;
  arr: string;
  duration: string;
  from3d: [number, number]; // lat, lon
  to3d: [number, number];
};

const ROUTES: Record<Mode, Route[]> = {
  train: [
    { id: "t1", label: "New Delhi → Mumbai Central", from: "New Delhi", to: "Mumbai Central", fromCode: "NDLS", toCode: "BCT", carrier: "Mumbai Rajdhani", number: "12951", dep: "16:55", arr: "08:35", duration: "15h 40m", from3d: [28.64, 77.22], to3d: [18.97, 72.82] },
    { id: "t2", label: "Howrah → New Delhi", from: "Howrah", to: "New Delhi", fromCode: "HWH", toCode: "NDLS", carrier: "Howrah Rajdhani", number: "12301", dep: "16:50", arr: "10:00", duration: "17h 10m", from3d: [22.58, 88.34], to3d: [28.64, 77.22] },
    { id: "t3", label: "Chennai → Bengaluru", from: "Chennai Central", to: "Bengaluru City", fromCode: "MAS", toCode: "SBC", carrier: "Chennai Shatabdi", number: "12007", dep: "06:00", arr: "11:00", duration: "5h 00m", from3d: [13.08, 80.27], to3d: [12.97, 77.59] },
    { id: "t4", label: "Ahmedabad → Pune", from: "Ahmedabad", to: "Pune Jn", fromCode: "ADI", toCode: "PUNE", carrier: "Duronto Express", number: "12297", dep: "21:10", arr: "10:45", duration: "13h 35m", from3d: [23.03, 72.58], to3d: [18.52, 73.86] },
  ],
  flight: [
    { id: "f1", label: "Delhi → Mumbai", from: "Delhi", to: "Mumbai", fromCode: "DEL", toCode: "BOM", carrier: "IndiGo", number: "6E 2041", dep: "07:15", arr: "09:25", duration: "2h 10m", from3d: [28.56, 77.1], to3d: [19.09, 72.87] },
    { id: "f2", label: "Bengaluru → Hyderabad", from: "Bengaluru", to: "Hyderabad", fromCode: "BLR", toCode: "HYD", carrier: "Air India", number: "AI 542", dep: "09:40", arr: "11:00", duration: "1h 20m", from3d: [13.2, 77.7], to3d: [17.24, 78.43] },
    { id: "f3", label: "Kolkata → Delhi", from: "Kolkata", to: "Delhi", fromCode: "CCU", toCode: "DEL", carrier: "Vistara", number: "UK 706", dep: "13:05", arr: "15:30", duration: "2h 25m", from3d: [22.65, 88.45], to3d: [28.56, 77.1] },
    { id: "f4", label: "Chennai → Kochi", from: "Chennai", to: "Kochi", fromCode: "MAA", toCode: "COK", carrier: "Akasa Air", number: "QP 1331", dep: "18:20", arr: "19:35", duration: "1h 15m", from3d: [12.99, 80.17], to3d: [10.15, 76.4] },
  ],
};

/* Slider labels differ per mode, but the API gets the same 4 keys. */
const SLIDERS: Record<Mode, { key: string; label: string; min: number; max: number; unit: string; def: number }[]> = {
  train: [
    { key: "weather", label: "Weather severity", min: 0, max: 10, unit: "/10", def: 3 },
    { key: "congestion", label: "Track congestion", min: 0, max: 10, unit: "/10", def: 5 },
    { key: "hour", label: "Departure hour", min: 0, max: 23, unit: ":00", def: 16 },
    { key: "season", label: "Fog / monsoon index", min: 0, max: 10, unit: "/10", def: 2 },
  ],
  flight: [
    { key: "weather", label: "Weather severity", min: 0, max: 10, unit: "/10", def: 3 },
    { key: "congestion", label: "Airport congestion", min: 0, max: 10, unit: "/10", def: 5 },
    { key: "hour", label: "Departure hour", min: 0, max: 23, unit: ":00", def: 9 },
    { key: "season", label: "Seasonal load", min: 0, max: 10, unit: "/10", def: 4 },
  ],
};

type Prediction = { delayMinutes: number; probability: number };

/* ------------------------------------------------------------------ */
/*  3D showcase (bottom-right card): glass globe + jet / sketch train   */
/* ------------------------------------------------------------------ */

/* ---- Flight: blue glass globe with an airliner circling it ---- */

function earthTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const sea = ctx.createLinearGradient(0, 0, 0, 512);
  sea.addColorStop(0, "#58b7f0");
  sea.addColorStop(1, "#2f8fe0");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, 1024, 512);
  const land: [number, number][][] = [
    [[-17,21],[-5,35],[10,37],[32,31],[43,12],[51,12],[40,-5],[40,-15],[33,-27],[20,-35],[13,-22],[9,-1],[8,4],[-8,4],[-17,14]], // Africa
    [[-10,36],[-9,43],[0,50],[5,58],[20,70],[60,72],[110,76],[160,68],[180,66],[140,45],[122,30],[110,20],[105,10],[98,16],[92,22],[80,8],[72,20],[60,25],[50,30],[35,36],[28,41],[10,44]], // Eurasia
    [[-168,66],[-140,70],[-95,72],[-60,60],[-55,47],[-80,25],[-97,17],[-118,32],[-125,48],[-165,58]], // N. America
    [[-80,10],[-60,10],[-35,-6],[-40,-22],[-58,-38],[-68,-55],[-75,-45],[-72,-18],[-81,-5]], // S. America
    [[114,-22],[130,-12],[142,-11],[153,-27],[146,-39],[130,-32],[115,-34]], // Australia
  ];
  ctx.fillStyle = "#1c5fb4";
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 3;
  land.forEach((poly) => {
    ctx.beginPath();
    poly.forEach(([lon, lat], i) => {
      const x = ((lon + 180) / 360) * 1024;
      const y = ((90 - lat) / 180) * 512;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function buildPlane() {
  const white = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90, side: THREE.DoubleSide });
  const grey = new THREE.MeshPhongMaterial({ color: 0xdfe6f0, shininess: 60, side: THREE.DoubleSide });
  const dark = new THREE.MeshPhongMaterial({ color: 0x1b2a44 });
  const plane = new THREE.Group(); // nose points +x

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 2.4, 28), white);
  fus.rotation.z = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 16), white);
  nose.scale.set(2.2, 1, 1);
  nose.position.x = 1.2;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.0, 28), white);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -1.7;
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.2), dark);
  cockpit.position.set(1.38, 0.1, 0);
  plane.add(fus, nose, tail, cockpit);

  // swept wings
  const ws = new THREE.Shape();
  ws.moveTo(0.4, 0.1); ws.lineTo(-0.35, 1.7); ws.lineTo(-0.7, 1.7); ws.lineTo(-0.35, 0.1); ws.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(ws, { depth: 0.05, bevelEnabled: false });
  wingGeo.rotateX(-Math.PI / 2);
  [1, -1].forEach((s) => {
    const wing = new THREE.Mesh(wingGeo, grey);
    wing.scale.z = s;
    wing.position.y = -0.1;
    plane.add(wing);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.5, 16), white);
    eng.rotation.z = Math.PI / 2;
    eng.position.set(0.22, -0.28, s * 0.7);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16), dark);
    intake.rotation.z = Math.PI / 2;
    intake.position.set(0.47, -0.28, s * 0.7);
    plane.add(eng, intake);
  });

  // tail fin + stabilizers
  const fs = new THREE.Shape();
  fs.moveTo(-1.5, 0.1); fs.lineTo(-2.05, 0.9); fs.lineTo(-2.28, 0.9); fs.lineTo(-2.0, 0.1); fs.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fs, { depth: 0.04, bevelEnabled: false });
  finGeo.translate(0, 0, -0.02);
  plane.add(new THREE.Mesh(finGeo, white));
  const ss = new THREE.Shape();
  ss.moveTo(-1.7, 0); ss.lineTo(-2.15, 0.65); ss.lineTo(-2.3, 0.65); ss.lineTo(-2.05, 0); ss.closePath();
  const stabGeo = new THREE.ExtrudeGeometry(ss, { depth: 0.03, bevelEnabled: false });
  stabGeo.rotateX(-Math.PI / 2);
  [1, -1].forEach((s) => {
    const st = new THREE.Mesh(stabGeo, grey);
    st.scale.z = s;
    plane.add(st);
  });

  // cabin windows
  const winGeo = new THREE.BoxGeometry(0.07, 0.06, 0.02);
  for (let i = 0; i < 15; i++) {
    [1, -1].forEach((s) => {
      const w = new THREE.Mesh(winGeo, dark);
      w.position.set(-0.9 + i * 0.12, 0.05, s * 0.168);
      plane.add(w);
    });
  }
  return plane;
}

function buildFlightScene(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 5, 6);
  const rim = new THREE.PointLight(0x9fd8ff, 0.9, 30);
  rim.position.set(-4, 2, 3);
  scene.add(sun, rim);

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 64, 64),
    new THREE.MeshPhysicalMaterial({
      map: earthTexture(), roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
      transparent: true, opacity: 0.93,
    })
  );
  globe.position.y = -0.35;
  scene.add(globe);

  const pivot = new THREE.Group();
  pivot.position.y = -0.35;
  pivot.rotation.z = 0.28; // tilted orbit
  const holder = new THREE.Group();
  holder.position.set(2.6, 0.65, 0);
  holder.rotation.y = Math.PI / 2; // face along the orbit
  const bank = new THREE.Group();
  bank.rotation.x = 0.28;
  const plane = buildPlane();
  plane.scale.setScalar(0.85);
  bank.add(plane);
  holder.add(bank);
  pivot.add(holder);
  scene.add(pivot);

  return (t: number, dt: number) => {
    globe.rotation.y += dt * 0.25;
    pivot.rotation.y = t * 0.45;
    holder.position.y = 0.65 + Math.sin(t * 1.4) * 0.08;
  };
}

/* ---- Train: black-and-white sketch bullet train on a moving track ---- */

const INK = 0x111111;
function sketch(geo: THREE.BufferGeometry, angle = 25) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, angle), new THREE.LineBasicMaterial({ color: INK })));
  return g;
}
function inkLine(pts: number[][], color = INK) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
    new THREE.LineBasicMaterial({ color })
  );
}

function buildTrainScene(scene: THREE.Scene) {
  scene.fog = new THREE.Fog(0xffffff, 18, 48);

  // --- train ---
  const train = new THREE.Group();
  const L = 4.2, GAP = 0.12, NOSE = 2.2;
  const prof = new THREE.Shape();
  const w = 0.9, h = 0.95, r = 0.3;
  prof.moveTo(-w / 2, 0); prof.lineTo(w / 2, 0); prof.lineTo(w / 2, h - r);
  prof.quadraticCurveTo(w / 2, h, w / 2 - r, h); prof.lineTo(-w / 2 + r, h);
  prof.quadraticCurveTo(-w / 2, h, -w / 2, h - r); prof.lineTo(-w / 2, 0);
  const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: L, bevelEnabled: false, curveSegments: 6 });
  bodyGeo.rotateY(-Math.PI / 2); // spans x: -L..0
  const stripGeo = new THREE.BoxGeometry(L * 0.94, 0.2, 0.93);
  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14);
  wheelGeo.rotateX(Math.PI / 2);
  const black = new THREE.MeshBasicMaterial({ color: INK });

  const CARS = 5;
  for (let i = 0; i < CARS; i++) {
    const x0 = -i * (L + GAP) - 0.05;
    const body = sketch(bodyGeo);
    body.position.set(x0, 0.3, 0);
    train.add(body);
    const strip = new THREE.Mesh(stripGeo, black);
    strip.position.set(x0 - L / 2, 0.3 + 0.6, 0);
    train.add(strip);
    // door lines
    [0.12, 0.88].forEach((f) => train.add(inkLine([[x0 - L * f, 0.35, 0.46], [x0 - L * f, 1.1, 0.46]])));
    // bogies
    [0.9, L - 0.9].forEach((d) => {
      [1, -1].forEach((s) => {
        const wheel = sketch(wheelGeo, 20);
        wheel.position.set(x0 - d, 0.22, s * 0.38);
        train.add(wheel);
        wheel.position.x += 0.0;
      });
    });
  }
  // nose
  const noseGeo = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  noseGeo.rotateZ(-Math.PI / 2);
  noseGeo.scale(NOSE, 0.475, 0.45);
  const nose = sketch(noseGeo, 8);
  nose.position.set(0, 0.3 + 0.475, 0);
  train.add(nose);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.7), black);
  shield.position.set(0.95, 1.0, 0);
  shield.rotation.z = -0.35;
  train.add(shield);
  scene.add(train);

  // --- rails (static) ---
  [0.4, -0.4].forEach((z) => scene.add(inkLine([[-80, 0.04, z], [30, 0.04, z]])));
  [2.2, -2.2, 3.4, -3.4, 5, -5].forEach((z) => scene.add(inkLine([[-80, 0, z], [30, 0, z]], 0x888888)));

  // --- scrolling world: sleepers + gantry poles ---
  const world = new THREE.Group();
  const PERIOD = 8;
  const sleeperGeo = new THREE.BoxGeometry(0.16, 0.05, 1.5);
  const sleeperEdges = new THREE.EdgesGeometry(sleeperGeo);
  const sleeperMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const edgeMat = new THREE.LineBasicMaterial({ color: INK });
  for (let x = -72; x < 36; x += 0.8) {
    const m = new THREE.Mesh(sleeperGeo, sleeperMat);
    m.position.set(x, 0, 0);
    const e = new THREE.LineSegments(sleeperEdges, edgeMat);
    e.position.copy(m.position);
    world.add(m, e);
  }
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6);
  const beamGeo = new THREE.BoxGeometry(0.07, 0.07, 4.4);
  for (let x = -72; x < 36; x += PERIOD) {
    [2.2, -2.2].forEach((z) => {
      const p = sketch(poleGeo, 30);
      p.position.set(x, 1.8, z);
      world.add(p);
    });
    const b = sketch(beamGeo);
    b.position.set(x, 3.5, 0);
    world.add(b);
    // hanger to contact wire
    world.add(inkLine([[x, 3.5, 0], [x, 3.0, 0]]));
  }
  scene.add(world);

  // overhead wires + background speed lines (static)
  [3.0, 3.4].forEach((y) => scene.add(inkLine([[-80, y, 0], [30, y, 0]])));
  for (let i = 0; i < 26; i++) {
    const y = 0.4 + Math.random() * 4;
    const z = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 8);
    const x0 = -70 + Math.random() * 40;
    scene.add(inkLine([[x0, y, z], [x0 + 20 + Math.random() * 40, y, z]], 0xb5b5b5));
  }

  return (t: number, _dt: number, camera: THREE.PerspectiveCamera) => {
    world.position.x = -((t * 3) % PERIOD);
    const a = 0.65 + Math.sin(t * 0.3) * 0.45;
    camera.position.set(-6 + 15 * Math.sin(a), 2.6, 15 * Math.cos(a));
    camera.lookAt(-5, 1.1, 0);
    train.position.y = Math.sin(t * 22) * 0.004; // faint rattle
  };
}

function Showcase({ mode }: { mode: Mode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(mode === "train" ? 32 : 38, 1, 0.1, 200);
    camera.position.set(0, 1.4, 8.5);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const update = mode === "train" ? buildTrainScene(scene) : buildFlightScene(scene);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const clock = new THREE.Clock();
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = () => {
      const dt = clock.getDelta();
      (update as (t: number, dt: number, c: THREE.PerspectiveCamera) => void)(reduce ? 0 : clock.elapsedTime, reduce ? 0 : dt, camera);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [mode]);

  return <div className={`showcase ${mode}`} ref={ref} />;
}

/* ------------------------------------------------------------------ */
/*  Small components                                                    */
/* ------------------------------------------------------------------ */

function Slider(props: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  const { label, value, min, max, unit, onChange } = props;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <b>
          {unit === ":00" ? String(value).padStart(2, "0") : value}
          {unit}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Icon({ name }: { name: "train" | "plane" | "pin" | "clock" | "shield" }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "train":
      return (<svg {...p}><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14M9 21l2-4M15 21l-2-4" /><circle cx="9" cy="14" r=".6" /><circle cx="15" cy="14" r=".6" /></svg>);
    case "plane":
      return (<svg {...p}><path d="M2 16l20-6-3-2-6 1.5L8 4 6 5l3.5 6L5 12.5 3 11z" /><path d="M9 20l3-5" /></svg>);
    case "pin":
      return (<svg {...p}><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>);
    case "clock":
      return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
    case "shield":
      return (<svg {...p}><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>);
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function DelayAtlas() {
  const [mode, setMode] = useState<Mode>("train");
  const [routeId, setRouteId] = useState(ROUTES.train[0].id);
  const [vals, setVals] = useState<Record<string, number>>(() =>
    Object.fromEntries(SLIDERS.train.map((s) => [s.key, s.def]))
  );
  const [pred, setPred] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);

  const route = useMemo(() => ROUTES[mode].find((r) => r.id === routeId) ?? ROUTES[mode][0], [mode, routeId]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setRouteId(ROUTES[next][0].id);
    setVals(Object.fromEntries(SLIDERS[next].map((s) => [s.key, s.def])));
    setPred(null);
  }

  // Fetch prediction (debounced) whenever inputs change.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ mode, route: routeId, ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, String(v)])) });
        const res = await fetch(`/api/predict?${qs.toString()}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        setPred({ delayMinutes: Number(data.delayMinutes ?? data.delay ?? 0), probability: Number(data.probability ?? data.prob ?? 0) });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setPred(null);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [mode, routeId, vals]);

  const delay = pred?.delayMinutes ?? 0;
  const prob = Math.round(Math.min(Math.max(pred?.probability ?? 0, 0), 1) * 100);
  const status = !pred ? "idle" : delay <= 10 ? "ontime" : delay <= 40 ? "minor" : "major";
  const statusText = { idle: "Waiting for prediction", ontime: "Likely on time", minor: "Minor delay expected", major: "Significant delay expected" }[status];

  return (
    <div className="app" data-mode={mode}>
      <style>{CSS}</style>

      {/* ---------- Top bar ---------- */}
      <header className="top">
        <div className="brand">
          <span className="logo">
            <Icon name={mode === "train" ? "train" : "plane"} />
          </span>
          <span>Delay Atlas</span>
        </div>

        <div className="seg" role="tablist" aria-label="Travel mode">
          <button role="tab" aria-selected={mode === "train"} className={mode === "train" ? "on" : ""} onClick={() => switchMode("train")}>
            <Icon name="train" /> Indian Railways
          </button>
          <button role="tab" aria-selected={mode === "flight"} className={mode === "flight" ? "on" : ""} onClick={() => switchMode("flight")}>
            <Icon name="plane" /> Flight Network
          </button>
        </div>

        <div className="top-note">
          <Icon name="shield" /> Predictions update as you adjust conditions
        </div>
      </header>

      {/* ---------- Hero + search card ---------- */}
      <section className="hero">
        <div className="hero-copy">
          <h1>{mode === "train" ? "Will your train run on time?" : "Will your flight leave on time?"}</h1>
          <p>
            {mode === "train"
              ? "Pick a route, set the conditions along the line, and see the expected delay before you reach the platform."
              : "Pick a route, set the conditions at both airports, and see the expected delay before you reach the gate."}
          </p>
        </div>

        <div className="search card">
          <div className="search-row">
            <div className="field grow">
              <span className="field-label">
                <Icon name="pin" /> Route
              </span>
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                {ROUTES[mode].map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field-label">
                <Icon name="clock" /> Departs
              </span>
              <div className="field-static">{route.dep}</div>
            </div>
            <div className="field">
              <span className="field-label">{mode === "train" ? "Train" : "Flight"}</span>
              <div className="field-static">{route.number}</div>
            </div>
          </div>

          <div className="sliders">
            {SLIDERS[mode].map((s) => (
              <Slider
                key={s.key}
                label={s.label}
                min={s.min}
                max={s.max}
                unit={s.unit}
                value={vals[s.key] ?? s.def}
                onChange={(v) => setVals((o) => ({ ...o, [s.key]: v }))}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Results ---------- */}
      <main className="grid">
        <section className="card ticket">
          <div className="ticket-head">
            <div>
              <div className="carrier">{route.carrier}</div>
              <div className="sub">
                {route.number} · {mode === "train" ? "Daily service" : "Domestic"}
              </div>
            </div>
            <span className={`pill ${status}`}>{statusText}</span>
          </div>

          <div className="journey">
            <div className="stop">
              <b>{route.dep}</b>
              <span>{route.from}</span>
              <em>{route.fromCode}</em>
            </div>
            <div className="line">
              <span className="dur">{route.duration}</span>
              <div className="rail">
                <i />
                <span className="vehicle">
                  <Icon name={mode === "train" ? "train" : "plane"} />
                </span>
                <i />
              </div>
              <span className="dur">{mode === "train" ? "Non-stop express" : "Direct"}</span>
            </div>
            <div className="stop right">
              <b>{route.arr}</b>
              <span>{route.to}</span>
              <em>{route.toCode}</em>
            </div>
          </div>

          <div className="metrics">
            <div className="metric">
              <span>Predicted delay</span>
              <b className={loading ? "dim" : ""}>
                {pred ? delay : "–"}
                <small> min</small>
              </b>
            </div>
            <div className="metric">
              <span>Chance of delay</span>
              <b className={loading ? "dim" : ""}>
                {pred ? prob : "–"}
                <small>%</small>
              </b>
            </div>
            <div className="metric">
              <span>Est. arrival shift</span>
              <b className={loading ? "dim" : ""}>
                {pred ? `+${delay}` : "–"}
                <small> min</small>
              </b>
            </div>
          </div>

          <div className="bar" aria-label="Delay probability">
            <div className={`bar-fill ${status}`} style={{ width: `${pred ? prob : 0}%` }} />
          </div>
          {!pred && !loading && <p className="hint">No prediction yet. Check that /api/predict is running.</p>}
        </section>

        <aside className="card globe-card">
          <div className="globe-head">
            <b>{mode === "train" ? "Rail corridor" : "Flight path"}</b>
            <span>
              {route.fromCode} → {route.toCode}
            </span>
          </div>
          <Showcase mode={mode} />
        </aside>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.app{
  --ink:#14233b; --muted:#5f6f87; --line:#e3e8f1; --paper:#f4f6fb; --card:#ffffff;
  --accent:#f28c28; --accent-ink:#ffffff; --brand:#14325c; --brand-soft:#e8eef8;
  --ok:#1b9a6a; --warn:#d98a0b; --bad:#d6453d;
  --hero-from:#14325c; --hero-to:#1d4a87;
  min-height:100vh; background:var(--paper); color:var(--ink);
  font-family:'Plus Jakarta Sans',system-ui,sans-serif; transition:background .35s;
}
.app[data-mode="flight"]{
  --accent:#2f6bff; --brand:#0e1b3d; --brand-soft:#eaf0ff;
  --hero-from:#2f6bff; --hero-to:#6ea0ff; --paper:#f3f6fd;
}
.app *{box-sizing:border-box}
.card{background:var(--card); border:1px solid var(--line); border-radius:18px; box-shadow:0 10px 30px rgba(20,35,59,.06)}

/* top bar */
.top{display:flex; align-items:center; gap:24px; padding:14px 32px; background:var(--card); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:5}
.brand{display:flex; align-items:center; gap:10px; font-weight:800; font-size:18px; letter-spacing:-.01em}
.logo{display:grid; place-items:center; width:34px; height:34px; border-radius:10px; background:var(--accent); color:var(--accent-ink)}
.seg{display:flex; gap:4px; padding:4px; background:var(--brand-soft); border-radius:12px; margin-left:12px}
.seg button{display:flex; align-items:center; gap:8px; border:0; background:transparent; padding:9px 16px; border-radius:9px; font:inherit; font-weight:600; font-size:14px; color:var(--muted); cursor:pointer}
.seg button.on{background:var(--card); color:var(--ink); box-shadow:0 2px 8px rgba(20,35,59,.1)}
.seg button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent); outline-offset:2px}
.top-note{margin-left:auto; display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13px}

/* hero */
.hero{background:linear-gradient(135deg,var(--hero-from),var(--hero-to)); padding:48px 32px 120px; display:grid; grid-template-columns:minmax(0,1fr); gap:28px; justify-items:center; transition:background .35s}
.hero-copy{max-width:1100px; width:100%; color:#fff}
.hero-copy h1{font-size:clamp(28px,4vw,44px); line-height:1.1; margin:0 0 10px; font-weight:800; letter-spacing:-.02em}
.hero-copy p{margin:0; max-width:56ch; font-size:16px; line-height:1.6; opacity:.85}

.search{width:100%; max-width:1100px; padding:22px; position:relative; margin-bottom:-96px}
.search-row{display:grid; grid-template-columns:1fr 160px 160px; gap:14px}
.field{border:1px solid var(--line); border-radius:12px; padding:10px 14px; background:#fff}
.field-label{display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--muted); margin-bottom:4px}
.field select,.field-static{width:100%; border:0; background:transparent; font:inherit; font-size:16px; font-weight:700; color:var(--ink); padding:0}
.field select{cursor:pointer}
.sliders{display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:22px; margin-top:20px}
.slider{display:block}
.slider-top{display:flex; justify-content:space-between; font-size:13px; color:var(--muted); font-weight:500; margin-bottom:10px}
.slider-top b{color:var(--ink); font-weight:700}
.slider input{-webkit-appearance:none; appearance:none; width:100%; height:6px; border-radius:99px; cursor:pointer;
  background:linear-gradient(to right,var(--accent) var(--pct),var(--line) var(--pct))}
.slider input::-webkit-slider-thumb{-webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#fff; border:3px solid var(--accent); box-shadow:0 2px 6px rgba(0,0,0,.2)}
.slider input::-moz-range-thumb{width:14px; height:14px; border-radius:50%; background:#fff; border:3px solid var(--accent)}

/* results */
.grid{max-width:1100px; margin:0 auto; padding:120px 32px 56px; display:grid; grid-template-columns:minmax(0,1.6fr) minmax(0,1fr); gap:24px}
.ticket{padding:24px}
.ticket-head{display:flex; justify-content:space-between; align-items:flex-start; gap:12px}
.carrier{font-size:20px; font-weight:800; letter-spacing:-.01em}
.sub{color:var(--muted); font-size:13px; margin-top:2px}
.pill{padding:7px 13px; border-radius:99px; font-size:13px; font-weight:700; white-space:nowrap}
.pill.idle{background:var(--brand-soft); color:var(--muted)}
.pill.ontime{background:#e2f6ee; color:var(--ok)}
.pill.minor{background:#fdf1d8; color:var(--warn)}
.pill.major{background:#fde6e4; color:var(--bad)}

.journey{display:grid; grid-template-columns:auto 1fr auto; gap:20px; align-items:center; margin:28px 0 24px}
.stop b{display:block; font-size:28px; font-weight:800; letter-spacing:-.02em}
.stop span{display:block; font-size:14px; font-weight:600; margin-top:2px}
.stop em{font-style:normal; font-size:12px; color:var(--muted)}
.stop.right{text-align:right}
.line{text-align:center; color:var(--muted); font-size:12px}
.rail{display:flex; align-items:center; gap:8px; margin:6px 0}
.rail i{flex:1; border-top:2px dashed var(--line)}
.vehicle{display:grid; place-items:center; width:34px; height:34px; border-radius:50%; background:var(--brand-soft); color:var(--accent)}

.metrics{display:grid; grid-template-columns:repeat(3,1fr); border:1px solid var(--line); border-radius:14px; overflow:hidden}
.metric{padding:16px 18px; background:#fff}
.metric + .metric{border-left:1px solid var(--line)}
.metric span{display:block; font-size:12px; color:var(--muted); font-weight:600; margin-bottom:6px}
.metric b{font-size:30px; font-weight:800; letter-spacing:-.02em; transition:opacity .2s}
.metric b small{font-size:14px; font-weight:600; color:var(--muted)}
.metric b.dim{opacity:.4}

.bar{height:10px; border-radius:99px; background:var(--brand-soft); margin-top:20px; overflow:hidden}
.bar-fill{height:100%; border-radius:99px; background:var(--muted); transition:width .5s cubic-bezier(.2,.8,.2,1), background .3s}
.bar-fill.ontime{background:var(--ok)} .bar-fill.minor{background:var(--warn)} .bar-fill.major{background:var(--bad)}
.hint{margin:12px 0 0; font-size:13px; color:var(--muted)}

.globe-card{padding:18px; display:flex; flex-direction:column; min-height:420px}
.globe-head{display:flex; justify-content:space-between; align-items:center; font-size:14px}
.globe-head span{color:var(--accent); font-weight:700}
.showcase{flex:1; min-height:320px; margin-top:12px; border-radius:14px; overflow:hidden; position:relative}
.showcase canvas{display:block; width:100%; height:100%}
.showcase.flight{background:linear-gradient(165deg,#4fb6ec 0%,#8fdcf7 100%)}
.showcase.train{background:#fff; border:1px solid var(--line)}

@media (max-width:900px){
  .top{flex-wrap:wrap; padding:12px 16px} .top-note{display:none}
  .hero{padding:32px 16px 120px} .search-row{grid-template-columns:1fr 1fr} .search-row .grow{grid-column:1 / -1}
  .sliders{grid-template-columns:1fr 1fr}
  .grid{grid-template-columns:1fr; padding:200px 16px 40px}
  .journey{grid-template-columns:1fr; gap:12px} .stop.right{text-align:left}
}
@media (prefers-reduced-motion:reduce){ .app *{transition:none !important} }
`;
