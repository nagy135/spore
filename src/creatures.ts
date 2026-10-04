import { expressedGenes } from "./progression";
import * as THREE from "three";
import type { Genes, Species } from "./simulation";

const sphere = new THREE.SphereGeometry(1, 16, 12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const cone = new THREE.ConeGeometry(1, 1, 8);
export const sharedCreatureGeometries = new Set([sphere, cylinder, cone]);
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
export function creatureMaterial(color: string, roughness = 0.8) {
  const key = color + roughness;
  if (!materialCache.has(key))
    materialCache.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness }),
    );
  materialCache.get(key)!.userData.shared = true;
  return materialCache.get(key)!;
}
function part(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: string,
  position: number[],
  scale: number[],
  name = "",
) {
  const mesh = new THREE.Mesh(geometry, creatureMaterial(color));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
function stalk(
  parent: THREE.Group,
  a: THREE.Vector3,
  b: THREE.Vector3,
  width: number,
  color: string,
) {
  const mesh = part(
    parent,
    cylinder,
    color,
    [0, 0, 0],
    [width, a.distanceTo(b), width],
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  return mesh;
}
export function makeCreature(genes: Genes, species: Species = "mossling") {
  const group = new THREE.Group();
  const traits = expressedGenes(genes);
  traits.speed = Math.min(traits.speed, 160);
  traits.defense = Math.min(traits.defense, 150);
  traits.sense = Math.min(traits.sense, 150);
  const bodyColor = new THREE.Color(genes.color),
    light = "#d7e8b6",
    dark = bodyColor.clone().multiplyScalar(0.62).getStyle();
  const s = 0.76 + traits.size * 0.009;
  const isPredator = species === "razorback";
  part(group, sphere, genes.color, [0, 0.64, 0], [0.53, 0.46, 0.83], "body");
  part(
    group,
    sphere,
    isPredator ? "#e8b39b" : light,
    [0, 0.45, 0.11],
    [0.43, 0.22, 0.68],
  );
  part(group, sphere, genes.color, [0, 0.79, 0.72], [0.49, 0.41, 0.45], "head");
  part(
    group,
    sphere,
    isPredator ? "#e8a990" : "#c4dda0",
    [0, 0.62, 1],
    [0.34, 0.21, 0.23],
  );
  // Wide-set eyes give each little animal its own character.
  for (const sign of [-1, 1]) {
    part(group, sphere, "#f3f5dc", [sign * 0.29, 1.0, 0.99], [0.19, 0.2, 0.13]);
    part(
      group,
      sphere,
      "#26322b",
      [sign * 0.285, 1.01, 1.098],
      [0.105, 0.123, 0.045],
    );
    part(
      group,
      sphere,
      "#ffffff",
      [sign * 0.26, 1.055, 1.136],
      [0.029, 0.036, 0.014],
    );
    if (isPredator) {
      const brow = part(
        group,
        sphere,
        dark,
        [sign * 0.3, 1.15, 0.99],
        [0.22, 0.055, 0.095],
      );
      brow.rotation.z = sign * -0.28;
    }
  }
  const legLength = 0.26 + traits.speed * 0.0034;
  for (const sign of [-1, 1])
    for (const z of [-0.46, 0.43]) {
      const leg = new THREE.Group();
      leg.position.set(sign * 0.42, 0.4, z);
      group.add(leg);
      part(
        leg,
        sphere,
        dark,
        [sign * 0.12, -legLength * 0.45, 0],
        [0.12, legLength * 0.65, 0.13],
      );
      part(
        leg,
        sphere,
        genes.color,
        [sign * 0.17, -legLength * 0.83, 0.1],
        [0.2, 0.1, 0.24],
      );
      leg.name = "leg";
      leg.userData.phase = (sign === 1 ? 0 : Math.PI) + (z > 0 ? Math.PI : 0);
    }
  const tail = part(
    group,
    cone,
    genes.color,
    [0, 0.61, -0.95],
    [0.18, 0.8, 0.2],
    "tail",
  );
  tail.rotation.x = -Math.PI * 0.65;
  if (traits.defense > 8) {
    const shell = part(
      group,
      sphere,
      isPredator ? "#b57156" : dark,
      [0, 0.86, -0.12],
      [0.47 + traits.defense * 0.001, 0.14 + traits.defense * 0.0025, 0.65],
    );
    shell.name = "shell";
    for (let i = 0; i < 3; i++)
      part(
        group,
        sphere,
        isPredator ? "#ce9479" : "#bad583",
        [0, 0.98 + traits.defense * 0.0015, -0.52 + i * 0.32],
        [0.26, 0.04, 0.045],
      );
  }
  if (genes.adaptation === "antennae") {
    for (const sign of [-1, 1]) {
      const a = new THREE.Vector3(sign * 0.25, 1.07, 0.74),
        b = new THREE.Vector3(sign * 0.42, 1.56 + traits.sense * 0.002, 0.7);
      stalk(group, a, b, 0.035, dark);
      part(
        group,
        sphere,
        isPredator ? "#f5d19e" : "#e6efa9",
        b.toArray(),
        [0.085, 0.095, 0.085],
      );
    }
  }
  if (genes.adaptation === "spines") {
    for (let i = 0; i < 5; i++) {
      const spike = part(
        group,
        cone,
        isPredator ? "#efd5af" : "#d4e6ae",
        [0, 1.02, -0.58 + i * 0.29],
        [0.14, 0.4 + traits.defense * 0.002, 0.16],
      );
      spike.rotation.x = -0.22;
    }
    for (const sign of [-1, 1]) {
      const horn = part(
        group,
        cone,
        "#f2dfb6",
        [sign * 0.36, 1.18, 0.7],
        [0.12, 0.38, 0.12],
      );
      horn.rotation.z = sign * -0.4;
    }
  }
  if (genes.adaptation === "plumes") {
    for (const sign of [-1, 1]) {
      const plume = part(
        group,
        sphere,
        "#bdd9bd",
        [sign * 0.57, 0.93, -0.1],
        [0.12, 0.55, 0.48],
      );
      plume.rotation.z = sign * -0.7;
      for (let i = 0; i < 3; i++) {
        const feather = part(
          group,
          cone,
          light,
          [sign * (0.69 + i * 0.08), 1.08, -0.44 + i * 0.24],
          [0.09, 0.55, 0.1],
        );
        feather.rotation.z = sign * -0.9;
      }
    }
  }
  if (isPredator)
    for (const sign of [-1, 1]) {
      const fang = part(
        group,
        cone,
        "#fff1cb",
        [sign * 0.2, 0.5, 1.1],
        [0.055, 0.18, 0.06],
      );
      fang.rotation.x = Math.PI;
    }
  group.scale.setScalar(s);
  group.userData.genes = JSON.stringify(genes);
  return group;
}
export function animateCreature(group: THREE.Group, time: number, moving = 1) {
  for (const p of group.children) {
    if (p.name === "leg")
      p.rotation.x =
        Math.sin(time * 8 + (p.userData.phase as number)) * moving * 0.5;
    if (p.name === "tail") p.rotation.z = Math.sin(time * 3) * 0.13;
  }
}
