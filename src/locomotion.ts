import type { Creature } from "./simulation";
import type { Obstacle } from "./habitat";

export const CONTACT_GAP = 0.04;
const EPSILON = 1e-8;

// The same size and juvenile growth factors are used by the Three.js model.
export function creatureScale(c: Creature) {
  return (
    (0.76 + c.genes.size * 0.009) * (0.58 + Math.min(c.age / 20, 1) * 0.42)
  );
}
export function creatureExtent(c: Creature) {
  return 1.32 * creatureScale(c);
}
export function angleDifference(target: number, heading: number) {
  return Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
}
export function normalizedHeading(heading: number) {
  return Math.atan2(Math.sin(heading), Math.cos(heading));
}
function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function obstacleContact(c: Creature, obstacle: Obstacle) {
  const x = obstacle.x - c.x,
    z = obstacle.z - c.z;
  const distance = Math.hypot(x, z);
  const fallback = c.id * 2.399963229728653;
  return {
    nx: distance > EPSILON ? x / distance : Math.sin(fallback),
    nz: distance > EPSILON ? z / distance : Math.cos(fallback),
    gap: distance - creatureExtent(c) - obstacle.radius,
  };
}

export function clearPath(
  x: number,
  z: number,
  tx: number,
  tz: number,
  obstacles: readonly Obstacle[],
) {
  const dx = tx - x,
    dz = tz - z,
    lengthSquared = dx * dx + dz * dz;
  return obstacles.every((o) => {
    const t =
      lengthSquared > EPSILON
        ? clampUnit(((o.x - x) * dx + (o.z - z) * dz) / lengthSquared)
        : 0;
    return (x + dx * t - o.x) ** 2 + (z + dz * t - o.z) ** 2 > o.radius ** 2;
  });
}

/** A circular footprint contains the whole animal in every orientation.
 * Turning never creates a collision or traps an animal against a neighbor. */
export function creatureContact(a: Creature, b: Creature) {
  const x = b.x - a.x,
    z = b.z - a.z;
  const distance = Math.hypot(x, z);
  const fallback =
    (Math.min(a.id, b.id) * 31 + Math.max(a.id, b.id)) * 2.399963229728653;
  const sign = a.id < b.id ? 1 : -1;
  return {
    nx: distance > EPSILON ? x / distance : Math.sin(fallback) * sign,
    nz: distance > EPSILON ? z / distance : Math.cos(fallback) * sign,
    gap: distance - creatureExtent(a) - creatureExtent(b),
  };
}

/** Positional constraints stop interpenetration without changing heading. */
export function resolveCreatureContacts(
  creatures: Creature[],
  constrain: (c: Creature) => void,
  obstacles: readonly Obstacle[] = [],
) {
  for (const c of creatures) constrain(c);
  for (let pass = 0; pass < 128; pass++) {
    let penetration = 0;
    for (let i = 0; i < creatures.length; i++) {
      const a = creatures[i];
      for (let j = i + 1; j < creatures.length; j++) {
        const b = creatures[j];
        const range = creatureExtent(a) + creatureExtent(b) + CONTACT_GAP;
        if ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 > range * range) continue;
        const contact = creatureContact(a, b);
        const overlap = CONTACT_GAP - contact.gap;
        if (overlap < 0.00001) continue;
        penetration = Math.max(penetration, overlap);
        const aMass = creatureScale(a) ** 2,
          bMass = creatureScale(b) ** 2;
        const aShare = bMass / (aMass + bMass),
          bShare = 1 - aShare;
        const correction = overlap + 0.00001;
        a.x -= contact.nx * correction * aShare;
        a.z -= contact.nz * correction * aShare;
        b.x += contact.nx * correction * bShare;
        b.z += contact.nz * correction * bShare;
        constrain(a);
        constrain(b);
      }
      for (const obstacle of obstacles) {
        const range = creatureExtent(a) + obstacle.radius + CONTACT_GAP;
        if ((obstacle.x - a.x) ** 2 + (obstacle.z - a.z) ** 2 > range * range)
          continue;
        const contact = obstacleContact(a, obstacle);
        const overlap = CONTACT_GAP - contact.gap;
        if (overlap < 0.00001) continue;
        penetration = Math.max(penetration, overlap);
        a.x -= contact.nx * (overlap + 0.00001);
        a.z -= contact.nz * (overlap + 0.00001);
        constrain(a);
      }
    }
    if (penetration < 0.001) break;
  }
}

export interface MovementIntent {
  creature: Creature;
  x: number;
  z: number;
  speed: number;
  targetCreature?: number;
}

/** Anticipate traffic and pass on a consistent side before hard contact. */
export function steerAroundCreatures(
  intent: MovementIntent,
  neighbors: Creature[],
) {
  const c = intent.creature;
  const length = Math.hypot(intent.x, intent.z);
  if (length < EPSILON || intent.speed <= 0) return { x: 0, z: 0 };
  const dx = intent.x / length,
    dz = intent.z / length;
  let avoidX = 0,
    avoidZ = 0;
  const lookahead = 0.7 + intent.speed * 0.6;
  for (const other of neighbors) {
    if (other.id === c.id || other.id === intent.targetCreature) continue;
    const rx = other.x - c.x,
      rz = other.z - c.z;
    const distance = Math.hypot(rx, rz);
    const range = creatureExtent(c) + creatureExtent(other) + lookahead;
    if (distance > range) continue;
    const contact = creatureContact(c, other);
    if (contact.gap >= lookahead) continue;
    const weight = clampUnit((lookahead - contact.gap) / lookahead);
    avoidX -= contact.nx * weight * 1.15;
    avoidZ -= contact.nz * weight * 1.15;
    const ahead = distance > EPSILON ? (dx * rx + dz * rz) / distance : 1;
    if (ahead > 0.15) {
      // A shared right-hand rule breaks the symmetry of a head-on encounter.
      const side = dx * rz - dz * rx < -0.08 ? -1 : 1;
      avoidX += dz * side * weight * 1.65;
      avoidZ -= dx * side * weight * 1.65;
    }
  }
  const magnitude = Math.hypot(avoidX, avoidZ);
  if (magnitude > 2) {
    avoidX *= 2 / magnitude;
    avoidZ *= 2 / magnitude;
  }
  return { x: dx + avoidX, z: dz + avoidZ };
}

export function steerAroundObstacles(
  intent: MovementIntent,
  direction: { x: number; z: number },
  obstacles: readonly Obstacle[],
) {
  const c = intent.creature;
  const length = Math.hypot(intent.x, intent.z);
  if (length < EPSILON || intent.speed <= 0) return direction;
  const dx = intent.x / length,
    dz = intent.z / length;
  const lookahead = 1.1 + intent.speed * 0.65;
  let avoidX = 0,
    avoidZ = 0;
  for (const obstacle of obstacles) {
    const rx = obstacle.x - c.x,
      rz = obstacle.z - c.z;
    const distance = Math.hypot(rx, rz);
    if (distance > creatureExtent(c) + obstacle.radius + lookahead) continue;
    const contact = obstacleContact(c, obstacle);
    if (contact.gap >= lookahead) continue;
    const weight = clampUnit((lookahead - contact.gap) / lookahead);
    avoidX -= contact.nx * weight * 1.15;
    avoidZ -= contact.nz * weight * 1.15;
    const ahead = distance > EPSILON ? (dx * rx + dz * rz) / distance : 1;
    if (ahead > 0.05) {
      const side = dx * rz - dz * rx < -0.08 ? -1 : 1;
      avoidX += dz * side * weight * 2;
      avoidZ -= dx * side * weight * 2;
    }
  }
  const magnitude = Math.hypot(avoidX, avoidZ);
  const factor = magnitude > 2.5 ? 2.5 / magnitude : 1;
  return { x: direction.x + avoidX * factor, z: direction.z + avoidZ * factor };
}
