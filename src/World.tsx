import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  makeCreature,
  animateCreature,
  sharedCreatureGeometries,
} from "./creatures";
import { terrainHeight, islandRadius } from "./simulation";
import type { Simulation, Creature } from "./simulation";
import { creatureScale } from "./locomotion";
import { createHabitat, TERRAIN_RINGS, TERRAIN_SEGMENTS } from "./habitat";

export interface WorldHandle {
  zoom: (direction: number) => void;
  reset: () => void;
  focus: (id: number) => void;
  overhead: () => void;
  north: () => void;
}
interface Props {
  simulation: Simulation;
  paused: boolean;
  speed: number;
  selected: number | null;
  onSelect: (id: number) => void;
  onTick: () => void;
  labels: boolean;
  onReady: () => void;
  onError: (message: string) => void;
  onBearingChange: (radians: number) => void;
}
const plantMat = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string) {
  if (!plantMat.has(color))
    plantMat.set(
      color,
      new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 1,
      }),
    );
  plantMat.get(color)!.userData.shared = true;
  return plantMat.get(color)!;
}
let randSeed = 31;
function rand() {
  randSeed = (randSeed * 16807) % 2147483647;
  return (randSeed - 1) / 2147483646;
}
function meshPart(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: string,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const mesh = new THREE.Mesh(geometry, mat(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const ico = new THREE.IcosahedronGeometry(1, 0),
  ball = new THREE.IcosahedronGeometry(1, 1),
  cone = new THREE.ConeGeometry(1, 1, 7),
  cylinder = new THREE.CylinderGeometry(0.13, 0.2, 1, 7);
function makeTree(kind: number, scale: number, darkShade: boolean) {
  const group = new THREE.Group();
  meshPart(group, cylinder, "#776a49", 0, 1, 0, 1, 2, 1);
  if (kind < 0.56) {
    const shade = darkShade ? "#617e58" : "#718f60";
    meshPart(group, cone, shade, 0, 2.3, 0, 1.05, 1.7, 1.05);
    meshPart(group, cone, "#86a774", 0, 3.04, 0, 0.85, 1.6, 0.85);
    meshPart(group, cone, "#9ab983", 0, 3.65, 0, 0.58, 1.42, 0.58);
  } else {
    meshPart(group, ball, "#749768", 0, 2.6, 0, 1.3, 1.04, 1.18);
    meshPart(group, ball, "#9cba7e", -0.65, 2.56, 0.22, 0.7, 0.68, 0.7);
    meshPart(group, ball, "#8eac74", 0.53, 3.03, -0.2, 0.9, 0.79, 0.83);
    meshPart(group, ball, "#adbf86", -0.2, 3.28, 0.3, 0.7, 0.56, 0.66);
  }
  group.scale.setScalar(scale);
  return group;
}
function makeFern() {
  const group = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = meshPart(
      group,
      ball,
      i % 2 ? "#92b079" : "#729363",
      Math.cos(a) * 0.27,
      0.29,
      Math.sin(a) * 0.27,
      0.15,
      0.52,
      0.16,
    );
    leaf.rotation.z = -Math.cos(a) * 0.75;
    leaf.rotation.x = Math.sin(a) * 0.75;
  }
  return group;
}
function makeTerrain() {
  const segments = TERRAIN_SEGMENTS,
    rings = TERRAIN_RINGS;
  const positions: number[] = [],
    colors: number[] = [];
  const centerColor = new THREE.Color();
  function point(r: number, i: number) {
    const a = (i / segments) * Math.PI * 2,
      rad = (r / rings) * islandRadius(a);
    const x = Math.cos(a) * rad,
      z = Math.sin(a) * rad;
    const y = terrainHeight(x, z);
    return new THREE.Vector3(x, y, z);
  }
  function tri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    r: number,
  ) {
    const noise = rand();
    let color =
      r > 0.91
        ? "#c9c099"
        : r > 0.82
          ? "#bac68c"
          : noise > 0.85
            ? "#a6b885"
            : noise > 0.4
              ? "#96ac77"
              : "#8ca570";
    centerColor.set(color);
    centerColor.multiplyScalar(0.94 + noise * 0.13);
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(centerColor.r, centerColor.g, centerColor.b);
    }
  }
  for (let r = 1; r <= rings; r++)
    for (let i = 0; i < segments; i++) {
      const a = point(r - 1, i),
        b = point(r, i),
        c = point(r, i + 1),
        d = point(r - 1, i + 1);
      tri(a, c, b, r / rings);
      if (r > 1) tri(a, d, c, r / rings);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
    }),
  );
  terrain.receiveShadow = true;
  return terrain;
}
function batchScenery(world: THREE.Group) {
  const batches = new Map<string, THREE.Mesh[]>();
  world.updateMatrixWorld(true);
  world.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      !(obj instanceof THREE.InstancedMesh) &&
      [ico, ball, cone, cylinder].includes(obj.geometry) &&
      !Array.isArray(obj.material)
    ) {
      const key = obj.geometry.uuid + obj.material.uuid;
      const batch = batches.get(key) ?? [];
      batch.push(obj);
      batches.set(key, batch);
    }
  });
  for (const meshes of batches.values()) {
    if (meshes.length < 3) continue;
    const first = meshes[0];
    const batch = new THREE.InstancedMesh(
      first.geometry,
      first.material,
      meshes.length,
    );
    batch.castShadow = true;
    batch.receiveShadow = true;
    meshes.forEach((mesh, i) => {
      batch.setMatrixAt(i, mesh.matrixWorld);
      mesh.parent?.remove(mesh);
    });
    batch.computeBoundingSphere();
    world.add(batch);
  }
}
function disposeLabels(group: THREE.Object3D) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Sprite) {
      obj.material.map?.dispose();
      obj.material.dispose();
    }
  });
}
function makeLabel(text: string, color = "#a7c080") {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 80;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(35,42,46,.9)";
  context.beginPath();
  context.roundRect(3, 3, 378, 74, 25);
  context.fill();
  context.font = "500 29px Inter, sans-serif";
  context.fillStyle = color;
  context.textAlign = "center";
  context.fillText(text, 192, 49);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    }),
  );
  sprite.scale.set(3.5, 0.73, 1);
  sprite.position.y = 2.9;
  return sprite;
}

const World = forwardRef<WorldHandle, Props>(function World(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const internals = useRef<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    groups: Map<number, THREE.Group>;
    following: number | null;
    render: () => void;
  } | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      zoom(direction) {
        const v = internals.current;
        if (v) {
          const d = v.camera.position.clone().sub(v.controls.target);
          d.multiplyScalar(direction > 0 ? 0.82 : 1.22);
          v.camera.position.copy(v.controls.target).add(d);
          v.controls.update();
          v.render();
        }
      },
      reset() {
        const v = internals.current;
        if (v) {
          v.following = null;
          v.camera.position.set(28, 32, 36);
          v.controls.target.set(0, 0, 0);
          v.controls.update();
          v.render();
        }
      },
      focus(id) {
        const v = internals.current;
        const c = current.current.simulation.creatures.find((c) => c.id === id);
        if (v && c) {
          v.following = id;
          const target = new THREE.Vector3(c.x, terrainHeight(c.x, c.z), c.z);
          v.controls.target.copy(target);
          v.camera.position.copy(target).add(new THREE.Vector3(7, 7, 9));
          v.controls.update();
          v.render();
        }
      },
      overhead() {
        const v = internals.current;
        if (v) {
          v.following = null;
          v.camera.position.set(0, 52, 0.01);
          v.controls.target.set(0, 0, 0);
          v.controls.update();
          v.render();
        }
      },
      north() {
        const v = internals.current;
        if (!v) return;
        v.following = null;
        const damping = v.controls.enableDamping;
        v.controls.enableDamping = false;
        v.controls.update();
        const offset = v.camera.position.clone().sub(v.controls.target);
        v.camera.position.set(
          v.controls.target.x,
          v.controls.target.y + offset.y,
          v.controls.target.z + Math.max(0.01, Math.hypot(offset.x, offset.z)),
        );
        v.controls.update();
        v.controls.enableDamping = damping;
        v.render();
      },
    }),
    [],
  );
  useEffect(() => {
    const el = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      current.current.onError(
        "WebGL is unavailable. Enable hardware acceleration in your browser to explore this world.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#365c53");
    scene.fog = new THREE.Fog("#365c53", 70, 145);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 180);
    camera.position.set(28, 32, 36);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 7;
    controls.maxDistance = 85;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(0, 0, 0);
    controls.enablePan = true;
    const syncBearing = () => {
      const bearing = controls.getAzimuthalAngle();
      el.dataset.bearing = String(bearing);
      el.dataset.cameraDistance = String(
        camera.position.distanceTo(controls.target),
      );
      current.current.onBearingChange(bearing);
    };
    controls.addEventListener("change", syncBearing);
    syncBearing();
    scene.add(new THREE.HemisphereLight("#ecf2d0", "#3f5b47", 1.65));
    const sun = new THREE.DirectionalLight("#fff1ca", 2.5);
    sun.position.set(-22, 38, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -29,
      right: 29,
      top: 29,
      bottom: -29,
      near: 1,
      far: 100,
    });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    const world = new THREE.Group();
    scene.add(world);
    randSeed =
      (Math.abs(current.current.simulation.initialSeed) % 2147483646) + 1;
    world.add(makeTerrain());
    const habitat = createHabitat(current.current.simulation.initialSeed);
    function addRocks(rocks: typeof habitat.shoreRocks) {
      for (const r of rocks) {
        const rock = meshPart(
          world,
          ico,
          r.color,
          r.x,
          r.y,
          r.z,
          r.sx,
          r.sy,
          r.sz,
        );
        rock.rotation.set(r.rx, r.ry, r.rz);
      }
    }
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader:
        "varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec3 vPosition;uniform float uTime; void main(){float wave=sin(vPosition.x*.56+uTime*.32)*sin(vPosition.y*.61+uTime*.23);float small=sin(vPosition.x*2.7+vPosition.y*.9+uTime*.5)*.5;vec3 color=mix(vec3(.18,.33,.29),vec3(.26,.43,.37),(wave*.5+.5)*.26+small*.022);gl_FragColor=vec4(color,1.);}",
      side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      waterMaterial,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.8;
    world.add(water);
    // Rocky shoreline and gentle rings in the shallows.
    addRocks(habitat.shoreRocks);
    for (let ring = 0; ring < 3; ring++) {
      const points = [];
      for (let i = 0; i <= 180; i++) {
        const a = (i / 180) * Math.PI * 2,
          r = islandRadius(a) + 0.55 + ring * 0.82;
        points.push(new THREE.Vector3(Math.cos(a) * r, -0.77, Math.sin(a) * r));
      }
      const g = new THREE.BufferGeometry().setFromPoints(points);
      world.add(
        new THREE.Line(
          g,
          new THREE.LineBasicMaterial({
            color: ring === 0 ? "#819d83" : "#5e8473",
            transparent: true,
            opacity: ring === 0 ? 0.48 : 0.21,
          }),
        ),
      );
    }
    // Tall groves are concentrated around the edges to keep life in the meadow visible.
    for (const t of habitat.trees) {
      const tree = makeTree(t.kind, t.scale, t.shade);
      tree.position.set(t.x, terrainHeight(t.x, t.z) - 0.04, t.z);
      tree.rotation.y = t.rotation;
      world.add(tree);
    }
    for (const f of habitat.ferns) {
      const fern = makeFern();
      fern.position.set(f.x, terrainHeight(f.x, f.z), f.z);
      fern.scale.setScalar(f.scale);
      world.add(fern);
    }
    // An outcrop, a pond and bright little wildflowers break up the open grassland.
    addRocks(habitat.outcrop);
    const pondGroup = new THREE.Group();
    pondGroup.position.set(4, terrainHeight(4, -4) + 0.03, -4);
    pondGroup.rotation.x = -Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.CircleGeometry(2.58, 15),
      mat("#adb89b"),
    );
    rim.scale.set(1.3, 0.73, 1);
    pondGroup.add(rim);
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 32),
      new THREE.MeshStandardMaterial({
        color: "#6aafa5",
        roughness: 0.21,
        metalness: 0.15,
      }),
    );
    pond.scale.set(1.3, 0.73, 1);
    pond.position.z = 0.025;
    pondGroup.add(pond);
    world.add(pondGroup);
    addRocks(habitat.pondRocks);
    const grassGeometry = new THREE.ConeGeometry(0.055, 0.43, 3);
    const grass = new THREE.InstancedMesh(grassGeometry, mat("#a2bc80"), 700);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 700; i++) {
      const a = rand() * Math.PI * 2,
        r = Math.sqrt(rand()) * 17,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      dummy.position.set(x, terrainHeight(x, z) + 0.16, z);
      dummy.rotation.set(rand() * 0.4, rand() * 6, rand() * 0.3);
      dummy.scale.setScalar(0.5 + rand());
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
    }
    world.add(grass);
    for (let i = 0; i < 35; i++) {
      const a = rand() * Math.PI * 2,
        r = Math.sqrt(rand()) * 16,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      const group = new THREE.Group();
      meshPart(group, cylinder, "#6d8056", 0, 0.2, 0, 0.14, 0.4, 0.14);
      meshPart(
        group,
        ball,
        i % 3 ? "#eec598" : "#dfb4ba",
        0,
        0.45,
        0,
        0.14,
        0.11,
        0.14,
      );
      group.position.set(x, terrainHeight(x, z), z);
      world.add(group);
    }
    batchScenery(world);
    const foods = new Map<number, THREE.Group>();
    const groups = new Map<number, THREE.Group>();
    internals.current = {
      camera,
      controls,
      groups,
      following: null,
      render: () => renderer.render(scene, camera),
    };
    const selection = new THREE.Group();
    const circle = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1.025, 48),
      new THREE.MeshBasicMaterial({
        color: "#a7c080",
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    circle.rotation.x = -Math.PI / 2;
    selection.add(circle);
    let label = makeLabel("MOSSLING");
    let labelSpecies = "mossling";
    selection.add(label);
    selection.visible = false;
    scene.add(selection);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0,
      downY = 0;
    function pointerDown(event: PointerEvent) {
      downX = event.clientX;
      downY = event.clientY;
    }
    function pointerUp(event: PointerEvent) {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;
      const box = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        (-(event.clientY - box.top) / box.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects([...groups.values()], true);
      if (hits.length) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.creatureId) obj = obj.parent;
        if (obj) current.current.onSelect(obj.userData.creatureId as number);
      }
    }
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    let animation = 0,
      last = performance.now(),
      lastUi = 0,
      elapsed = 0,
      biome = "";
    let running = true;
    function frame(now: number) {
      if (!running) return;
      animation = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 1);
      last = now;
      elapsed += dt;
      const p = current.current;
      const sim = p.simulation;
      if (!p.paused) {
        let remaining = dt * p.speed;
        while (remaining > 0) {
          const step = Math.min(remaining, 0.08);
          sim.update(step);
          remaining -= step;
        }
      }
      if (biome !== sim.biome) {
        biome = sim.biome;
        sun.color.set(
          biome === "drylands"
            ? "#ffdfad"
            : biome === "lush"
              ? "#e3ffe4"
              : "#fff1ca",
        );
        scene.fog!.color.set(
          biome === "drylands"
            ? "#62644a"
            : biome === "lush"
              ? "#31554f"
              : "#365c53",
        );
      }
      const livingIds = new Set(sim.creatures.map((c) => c.id));
      for (const [id, group] of groups)
        if (!livingIds.has(id)) {
          disposeLabels(group);
          scene.remove(group);
          groups.delete(id);
        }
      for (const c of sim.creatures) {
        let group = groups.get(c.id);
        if (!group || group.userData.genes !== JSON.stringify(c.genes)) {
          if (group) {
            disposeLabels(group);
            scene.remove(group);
          }
          group = makeCreature(c.genes, c.species);
          group.userData.creatureId = c.id;
          groups.set(c.id, group);
          scene.add(group);
          if (p.labels) {
            const sprite = makeLabel(
              c.species === "mossling" ? "Mossling" : "Razorback",
              c.species === "mossling" ? "#a7c080" : "#e67e80",
            );
            sprite.name = "creatureLabel";
            group.add(sprite);
          }
        }
        const movement = Math.min(
          1,
          Math.hypot(c.velocityX ?? 0, c.velocityZ ?? 0) / 1.6,
        );
        group.position.set(
          c.x,
          terrainHeight(c.x, c.z) +
            Math.sin(sim.time * 5 + c.phase) * 0.035 * movement,
          c.z,
        );
        group.rotation.y = c.heading;
        group.scale.setScalar(creatureScale(c));
        animateCreature(group, sim.time + c.phase, movement * 0.6);
        const existing = group.getObjectByName("creatureLabel");
        if (p.labels && !existing) {
          const sprite = makeLabel(
            c.species === "mossling" ? "Mossling" : "Razorback",
            c.species === "mossling" ? "#a7c080" : "#e67e80",
          );
          sprite.name = "creatureLabel";
          group.add(sprite);
        } else if (!p.labels && existing) {
          disposeLabels(existing);
          group.remove(existing);
        }
        const activity =
          (c.attackFlash ?? 0) > 0
            ? "ATTACK"
            : (c.damageFlash ?? 0) > 0
              ? "HIT"
              : c.state === "mating" || (c.matingTime ?? 0) > 0
                ? "♥ MATING"
                : "";
        let badge = group.getObjectByName("activityLabel");
        if (badge && badge.userData.activity !== activity) {
          disposeLabels(badge);
          group.remove(badge);
          badge = undefined;
        }
        if (activity && !badge) {
          badge = makeLabel(
            activity,
            activity.includes("MATING") ? "#d699b6" : "#e67e80",
          );
          badge.name = "activityLabel";
          badge.userData.activity = activity;
          badge.scale.set(2.7, 0.56, 1);
          group.add(badge);
        }
        if (badge) {
          badge.position.y =
            (p.labels ? 3.8 : 2.9) + Math.sin(sim.time * 7 + c.phase) * 0.08;
          const pulse = 1 + Math.sin(sim.time * 10) * 0.08;
          badge.scale.set(2.7 * pulse, 0.56 * pulse, 1);
        }
      }
      for (const f of sim.food) {
        let group = foods.get(f.id);
        if (!group) {
          group = new THREE.Group();
          meshPart(group, ball, "#739653", 0, 0.16, 0, 0.33, 0.26, 0.3);
          for (let i = 0; i < 3; i++)
            meshPart(
              group,
              ball,
              "#e7af7e",
              Math.sin(i * 2.1) * 0.22,
              0.32,
              Math.cos(i * 2.1) * 0.2,
              0.095,
              0.1,
              0.095,
            );
          group.position.set(f.x, terrainHeight(f.x, f.z), f.z);
          foods.set(f.id, group);
          scene.add(group);
        }
        group.visible = f.available;
      }
      const selected = sim.creatures.find((c) => c.id === p.selected);
      selection.visible = !!selected;
      if (selected) {
        selection.position.set(
          selected.x,
          terrainHeight(selected.x, selected.z) + 0.06,
          selected.z,
        );
        circle.rotation.z = elapsed * 0.15;
        if (labelSpecies !== selected.species) {
          selection.remove(label);
          label.material.map?.dispose();
          label.material.dispose();
          labelSpecies = selected.species;
          label = makeLabel(
            selected.species === "mossling" ? "MOSSLING" : "RAZORBACK",
            selected.species === "mossling" ? "#a7c080" : "#e67e80",
          );
          selection.add(label);
        }
      }
      const follow = sim.creatures.find(
        (c) => c.id === internals.current?.following,
      );
      if (follow) {
        const next = new THREE.Vector3(
          follow.x,
          terrainHeight(follow.x, follow.z),
          follow.z,
        );
        camera.position.add(next.clone().sub(controls.target));
        controls.target.copy(next);
      }
      waterMaterial.uniforms.uTime.value = elapsed;
      controls.update();
      renderer.render(scene, camera);
      el.dataset.drawCalls = String(renderer.info.render.calls);
      if (now - lastUi > 400) {
        lastUi = now;
        p.onTick();
      }
    }
    frame(performance.now());
    current.current.onReady();
    return () => {
      running = false;
      cancelAnimationFrame(animation);
      resize.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          if (
            ![ico, ball, cone, cylinder].includes(obj.geometry) &&
            !sharedCreatureGeometries.has(obj.geometry)
          )
            geometries.add(obj.geometry);
          for (const m of Array.isArray(obj.material)
            ? obj.material
            : [obj.material])
            if (!m.userData.shared) materials.add(m);
        }
        if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          materials.add(obj.material);
        }
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      sun.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      internals.current = null;
    };
  }, [props.simulation]);
  return (
    <div
      ref={container}
      className="world-canvas"
      aria-label="Interactive 3D island. Drag to orbit, scroll to zoom, and click a creature to inspect it."
    />
  );
});
export default World;

export function CreaturePreview({
  genes,
  species = "mossling",
  large = false,
}: {
  genes: Creature["genes"];
  species?: Creature["species"];
  large?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const geneRef = useRef(genes);
  geneRef.current = genes;
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#708465", 3));
    const sun = new THREE.DirectionalLight("#ffefc2", 4);
    sun.position.set(-4, 6, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 50);
    camera.position.set(3, 2.2, 4.5);
    camera.lookAt(0, 0.78, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.minPolarAngle = 0.7;
    controls.maxPolarAngle = 1.7;
    let creature = makeCreature(geneRef.current, species);
    scene.add(creature);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.17, 64),
      new THREE.MeshBasicMaterial({
        color: "#a7c080",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.025;
    scene.add(ring);
    const grid = new THREE.GridHelper(4, 12, "#56635f", "#475258");
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    grid.position.y = -0.05;
    scene.add(grid);
    const resize = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    let frame = 0;
    const start = performance.now();
    let running = true;
    function render() {
      if (!running) return;
      frame = requestAnimationFrame(render);
      if (creature.userData.genes !== JSON.stringify(geneRef.current)) {
        scene.remove(creature);
        creature = makeCreature(geneRef.current, species);
        scene.add(creature);
      }
      const t = (performance.now() - start) / 1000;
      creature.position.y = Math.sin(t * 1.5) * 0.035;
      animateCreature(creature, t, 0.1);
      controls.update();
      renderer.render(scene, camera);
    }
    render();
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      ring.geometry.dispose();
      ring.material.dispose();
      grid.geometry.dispose();
      if (Array.isArray(grid.material))
        grid.material.forEach((m) => m.dispose());
      else grid.material.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [species]);
  return (
    <div
      ref={host}
      className={`creature-preview ${large ? "large" : ""}`}
      aria-label={`3D ${species} preview. Drag to rotate.`}
    />
  );
}
