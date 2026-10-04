import {
  CONTACT_GAP,
  angleDifference,
  creatureContact,
  creatureExtent,
  creatureScale,
  obstacleContact,
  clearPath,
  normalizedHeading,
  resolveCreatureContacts,
  steerAroundCreatures,
  steerAroundObstacles,
} from "./locomotion";
import type { MovementIntent } from "./locomotion";
import { createHabitat, islandRadius, onLand } from "./habitat";
import type { Obstacle } from "./habitat";
import {
  TRAIT_KEYS,
  TIER_RANGE,
  expressedGenes,
  bodyResilience,
  mutationCost,
  tierUnlockCost,
  validGenes,
} from "./progression";
export { terrainHeight, islandRadius, onLand } from "./habitat";
export { mutationCost } from "./progression";

export type Species = "mossling" | "razorback";
export type Biome = "meadow" | "drylands" | "lush";
export interface Genes {
  speed: number;
  size: number;
  defense: number;
  sense: number;
  fertility: number;
  color: string;
  adaptation: "antennae" | "spines" | "plumes";
}
export interface Creature {
  id: number;
  species: Species;
  x: number;
  z: number;
  heading: number;
  age: number;
  energy: number;
  health: number;
  genes: Genes;
  cooldown: number;
  attackCooldown: number;
  targetX: number;
  targetZ: number;
  state:
    "wandering" | "foraging" | "fleeing" | "hunting" | "resting" | "mating";
  phase: number;
  velocityX: number;
  velocityZ: number;
  targetFoodId?: number;
  targetCreatureId?: number;
  restTime?: number;
  matingTime?: number;
  attackFlash?: number;
  damageFlash?: number;
}
export interface Food {
  id: number;
  x: number;
  z: number;
  available: boolean;
  regrow: number;
}
export interface WorldEvent {
  id: number;
  time: number;
  title: string;
  description: string;
  kind: "birth" | "evolution" | "danger" | "world";
}
export interface HistoryPoint {
  time: number;
  prey: number;
  predators: number;
}
export const DEFAULT_GENES: Genes = {
  speed: 52,
  size: 45,
  defense: 30,
  sense: 58,
  fertility: 55,
  color: "#adcc79",
  adaptation: "antennae",
};
export const PREDATOR_GENES: Genes = {
  speed: 48,
  size: 66,
  defense: 50,
  sense: 70,
  fertility: 32,
  color: "#d88a6e",
  adaptation: "spines",
};
export const geneKeys = TRAIT_KEYS;
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const speciesName = (s: Species) =>
  s === "mossling" ? "Mossling" : "Razorback";

export class Simulation {
  creatures: Creature[] = [];
  food: Food[] = [];
  events: WorldEvent[] = [];
  history: HistoryPoint[] = [];
  genes: Genes = { ...DEFAULT_GENES };
  predatorGenes: Genes = { ...PREDATOR_GENES };
  time = 0;
  generation = 1;
  dna = 120;
  evolutionTier = 1;
  births = 0;
  preyBirths = 0;
  deaths = 0;
  biome: Biome = "meadow";
  seed: number;
  initialSeed: number;
  readonly obstacles: readonly Obstacle[];
  private id = 0;
  private lastRecord = -1;
  constructor(seed = 48291, biome: Biome = "meadow") {
    this.seed = seed;
    this.initialSeed = seed;
    this.biome = biome;
    this.obstacles = createHabitat(seed).obstacles;
    for (let i = 0; i < 24; i++) this.spawn("mossling");
    for (let i = 0; i < 5; i++) this.spawn("razorback");
    for (let i = 0; i < 60; i++) {
      const p = this.randomPoint();
      this.food.push({ id: i, ...p, available: true, regrow: 0 });
    }
    this.event(
      "world",
      "A little life. A lot of possibility.",
      "24 Mosslings and 5 Razorbacks have made this island their home.",
    );
    this.record();
  }
  serialize() {
    const { obstacles: _obstacles, ...state } = this;
    return JSON.stringify({ version: 2, state });
  }
  static restore(serialized: string) {
    const saved = JSON.parse(serialized);
    const state = saved?.state;
    if (
      ![1, 2].includes(saved?.version) ||
      !state ||
      !Array.isArray(state.creatures) ||
      state.creatures.length > 100 ||
      !Array.isArray(state.food) ||
      state.food.length > 100 ||
      !Array.isArray(state.history) ||
      state.history.length > 90 ||
      !Array.isArray(state.events) ||
      state.events.length > 40
    )
      throw new Error("Invalid world save");
    for (const key of [
      "seed",
      "initialSeed",
      "time",
      "generation",
      "dna",
      "births",
      "deaths",
      "id",
      "lastRecord",
    ])
      if (!Number.isFinite(state[key]))
        throw new Error("Invalid simulation state");
    const evolutionTier =
      state.evolutionTier ?? (saved.version === 1 ? 1 : undefined);
    if (
      !Number.isSafeInteger(evolutionTier) ||
      evolutionTier < 1 ||
      !Number.isSafeInteger(evolutionTier * TIER_RANGE)
    )
      throw new Error("Invalid evolution tier");
    if (
      !validGenes(state.genes, evolutionTier * TIER_RANGE) ||
      !validGenes(state.predatorGenes) ||
      !["meadow", "lush", "drylands"].includes(state.biome)
    )
      throw new Error("Invalid genome");
    for (const c of state.creatures)
      if (
        !validGenes(
          c.genes,
          c.species === "mossling" ? evolutionTier * TIER_RANGE : undefined,
        ) ||
        !["mossling", "razorback"].includes(c.species) ||
        ![
          "x",
          "z",
          "heading",
          "age",
          "energy",
          "health",
          "cooldown",
          "attackCooldown",
          "targetX",
          "targetZ",
          "phase",
          "id",
        ].every((key) => Number.isFinite(c[key]))
      )
        throw new Error("Invalid creature");
    const sim = new Simulation(state.initialSeed, state.biome);
    Object.assign(sim, state);
    sim.evolutionTier = evolutionTier;
    const needsMigration = sim.creatures.some(
      (c) => !Number.isFinite(c.velocityX) || !Number.isFinite(c.velocityZ),
    );
    const insideScenery = sim.creatures.some((c) =>
      sim.obstacles.some((o) => obstacleContact(c, o).gap < 0),
    );
    if (needsMigration || insideScenery) {
      for (const c of sim.creatures) {
        c.velocityX = 0;
        c.velocityZ = 0;
        c.heading = normalizedHeading(c.heading);
      }
      sim.resolveCollisions();
    }
    for (const food of sim.food) {
      if (
        sim.obstacles.some(
          (o) => Math.hypot(food.x - o.x, food.z - o.z) < o.radius + 0.35,
        )
      )
        Object.assign(food, sim.randomPoint());
    }
    return sim;
  }
  random() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }
  randomPoint(margin = 0.4) {
    for (let attempt = 0; attempt < 256; attempt++) {
      const angle = this.random() * Math.PI * 2,
        r =
          Math.sqrt(this.random()) *
          (islandRadius(angle) - Math.max(2, margin));
      const x = Math.cos(angle) * r,
        z = Math.sin(angle) * r;
      if (
        this.obstacles.every(
          (o) => Math.hypot(x - o.x, z - o.z) > o.radius + margin,
        )
      )
        return { x, z };
    }
    return { x: 0, z: 0 };
  }
  get population() {
    return this.creatures.filter((c) => c.species === "mossling").length;
  }
  get traitCeiling() {
    return this.evolutionTier * TIER_RANGE;
  }
  get nextTierCost() {
    return tierUnlockCost(this.evolutionTier);
  }
  get canUnlockTier() {
    return geneKeys.some((key) => this.genes[key] >= this.traitCeiling);
  }
  get generationReward() {
    return 35 + (this.evolutionTier - 1) * 15;
  }
  unlockTier() {
    if (
      !this.canUnlockTier ||
      this.dna < this.nextTierCost ||
      !Number.isSafeInteger((this.evolutionTier + 1) * TIER_RANGE)
    )
      return false;
    this.dna -= this.nextTierCost;
    this.evolutionTier++;
    this.event(
      "evolution",
      `Evolution tier ${this.evolutionTier} unlocked.`,
      `Your traits can now reach ${this.traitCeiling}. Each generation earns ${this.generationReward} DNA.`,
    );
    return true;
  }
  get predators() {
    return this.creatures.filter((c) => c.species === "razorback").length;
  }
  get availableFood() {
    return this.food.filter((f) => f.available).length;
  }
  get averageHealth() {
    const c = this.creatures.filter((c) => c.species === "mossling");
    return c.length ? c.reduce((s, v) => s + v.health, 0) / c.length : 0;
  }
  get biodiversity() {
    return Math.min(
      3.9,
      1 +
        (this.population > 0 ? 0.45 : 0) +
        (this.predators > 0 ? 0.4 : 0) +
        this.availableFood / 100 +
        this.generation * 0.035,
    );
  }
  spawn(species: Species, parent?: Creature) {
    const p = this.randomPoint();
    const target = this.randomPoint(1.6);
    const creature: Creature = {
      id: ++this.id,
      species,
      ...p,
      heading: normalizedHeading(this.random() * Math.PI * 2),
      age: parent ? 0 : 18 + this.random() * 35,
      energy: parent ? 75 : 70 + this.random() * 30,
      health: 100,
      genes: { ...(species === "mossling" ? this.genes : this.predatorGenes) },
      cooldown: parent ? 23 : 8 + this.random() * 25,
      attackCooldown: 0,
      targetX: target.x,
      targetZ: target.z,
      state: "wandering",
      phase: this.random() * 10,
      velocityX: 0,
      velocityZ: 0,
    };
    // Births and initial arrivals need a clear body-sized space, too.
    let best = { x: creature.x, z: creature.z, clearance: -Infinity };
    for (let attempt = 0; attempt < 96; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const distance = parent
        ? creatureExtent(parent) +
          creatureExtent(creature) +
          0.3 +
          this.random()
        : 0;
      const candidate =
        parent && attempt < 24
          ? {
              x: parent.x + Math.sin(angle) * distance,
              z: parent.z + Math.cos(angle) * distance,
            }
          : this.randomPoint();
      creature.x = candidate.x;
      creature.z = candidate.z;
      this.constrainCreature(creature);
      let clearance = Infinity;
      for (const other of this.creatures) {
        const distance = Math.hypot(creature.x - other.x, creature.z - other.z);
        const extent = creatureExtent(creature) + creatureExtent(other);
        const gap =
          distance > extent + 0.15
            ? distance - extent
            : creatureContact(creature, other).gap;
        clearance = Math.min(clearance, gap);
      }
      for (const obstacle of this.obstacles)
        clearance = Math.min(
          clearance,
          obstacleContact(creature, obstacle).gap,
        );
      if (clearance > best.clearance)
        best = { x: creature.x, z: creature.z, clearance };
      if (clearance >= CONTACT_GAP + 0.12) break;
    }
    creature.x = best.x;
    creature.z = best.z;
    this.creatures.push(creature);
    if (best.clearance < CONTACT_GAP) this.resolveCollisions();
    return creature;
  }
  private constrainCreature = (c: Creature) => {
    const distance = Math.hypot(c.x, c.z);
    const radius =
      islandRadius(Math.atan2(c.z, c.x)) - creatureExtent(c) - 0.15;
    if (distance > radius) {
      c.x *= radius / distance;
      c.z *= radius / distance;
    }
  };
  resolveCollisions() {
    resolveCreatureContacts(
      this.creatures,
      this.constrainCreature,
      this.obstacles,
    );
    // A legacy save can place an animal inside an overlapping group of rocks.
    // If local projection cannot escape, find the nearest clear patch once.
    for (const c of this.creatures) {
      if (this.hasClearSpace(c, 0)) continue;
      const origin = { x: c.x, z: c.z };
      let found = false;
      for (let ring = 1; ring <= 200 && !found; ring++) {
        const radius = ring * 0.15;
        const rays = Math.max(32, Math.ceil((Math.PI * 2 * radius) / 0.15));
        for (let ray = 0; ray < rays; ray++) {
          const angle = (ray / rays) * Math.PI * 2;
          c.x = origin.x + Math.sin(angle) * radius;
          c.z = origin.z + Math.cos(angle) * radius;
          if (this.hasClearSpace(c)) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        c.x = origin.x;
        c.z = origin.z;
      }
    }
  }
  private hasClearSpace(c: Creature, gap = CONTACT_GAP - 0.002) {
    const extent = creatureExtent(c);
    if (!onLand(c.x, c.z, extent + 0.149)) return false;
    for (const o of this.obstacles) {
      const range = extent + o.radius + gap;
      if (
        (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < range * range &&
        obstacleContact(c, o).gap < gap
      )
        return false;
    }
    for (const other of this.creatures) {
      if (other.id === c.id) continue;
      const range = extent + creatureExtent(other) + gap;
      if (
        (other.x - c.x) ** 2 + (other.z - c.z) ** 2 < range * range &&
        creatureContact(c, other).gap < gap
      )
        return false;
    }
    return true;
  }
  private moveCreatures(intents: MovementIntent[], dt: number) {
    this.resolveCollisions();
    const starts = new Map(
      this.creatures.map((c) => [c.id, { x: c.x, z: c.z }]),
    );
    const plans = intents
      .filter((intent) => starts.has(intent.creature.id))
      .map((intent) => {
        const c = intent.creature;
        let { x, z } = steerAroundObstacles(
          intent,
          steerAroundCreatures(intent, this.creatures),
          this.obstacles,
        );
        const distance = Math.hypot(c.x, c.z);
        if (intent.speed > 0 && distance > 0.0001) {
          const outwardX = c.x / distance,
            outwardZ = c.z / distance;
          const clearance =
            islandRadius(Math.atan2(c.z, c.x)) -
            distance -
            creatureExtent(c) -
            0.15;
          const strength = clamp((2.8 - clearance) / 2.8, 0, 1);
          const outward = Math.max(0, x * outwardX + z * outwardZ);
          if (outward > 0 && strength > 0) {
            const tangentX = outwardZ,
              tangentZ = -outwardX;
            const tangent = x * tangentX + z * tangentZ;
            const side =
              Math.abs(tangent) > 0.1
                ? Math.sign(tangent)
                : c.id % 2 === 0
                  ? 1
                  : -1;
            // Shed the outward component and follow the shore; never randomly
            // reverse the target or rotate the animal after a blocked step.
            x +=
              strength *
              (tangentX * side * outward * 0.9 - outwardX * (outward + 0.25));
            z +=
              strength *
              (tangentZ * side * outward * 0.9 - outwardZ * (outward + 0.25));
          }
        }
        if (intent.speed <= 0 || Math.hypot(x, z) < 0.0001)
          return { c, heading: c.heading, x: c.x, z: c.z };
        const desired = Math.atan2(x, z);
        const difference = angleDifference(desired, c.heading);
        const maxTurn = dt * (c.state === "fleeing" ? 3 : 2.4);
        const heading = normalizedHeading(
          c.heading + clamp(difference, -maxTurn, maxTurn),
        );
        const alignment =
          0.25 +
          0.75 * Math.max(0, Math.cos(angleDifference(desired, heading)));
        const travel = intent.speed * alignment * dt;
        return {
          c,
          heading,
          x: c.x + Math.sin(heading) * travel,
          z: c.z + Math.cos(heading) * travel,
        };
      });
    // Plans share a snapshot. Sweep both translation and rotation against the
    // bodies already in the world, stopping at the first solid contact.
    for (const plan of plans) {
      const c = plan.c;
      const origin = { x: c.x, z: c.z, heading: c.heading };
      const turn = angleDifference(plan.heading, origin.heading);
      const distance =
        Math.hypot(plan.x - origin.x, plan.z - origin.z) +
        Math.abs(turn) * creatureExtent(c);
      const steps = Math.max(1, Math.ceil(distance / 0.12));
      const setFraction = (fraction: number) => {
        c.x = origin.x + (plan.x - origin.x) * fraction;
        c.z = origin.z + (plan.z - origin.z) * fraction;
        c.heading = normalizedHeading(origin.heading + turn * fraction);
      };
      let safe = 0;
      for (let step = 1; step <= steps; step++) {
        const fraction = step / steps;
        setFraction(fraction);
        if (this.hasClearSpace(c)) {
          safe = fraction;
          continue;
        }
        let blocked = fraction;
        for (let iteration = 0; iteration < 8; iteration++) {
          const middle = (safe + blocked) / 2;
          setFraction(middle);
          if (this.hasClearSpace(c)) safe = middle;
          else blocked = middle;
        }
        setFraction(safe);
        break;
      }
    }
    for (const c of this.creatures) {
      const start = starts.get(c.id)!;
      c.velocityX = (c.x - start.x) / dt;
      c.velocityZ = (c.z - start.z) / dt;
    }
  }
  event(kind: WorldEvent["kind"], title: string, description: string) {
    this.events.unshift({
      id: ++this.id,
      time: this.time,
      title,
      description,
      kind,
    });
    this.events = this.events.slice(0, 40);
  }
  record() {
    this.history.push({
      time: this.time,
      prey: this.population,
      predators: this.predators,
    });
    if (this.history.length > 90) this.history.shift();
  }
  mutate(genes: Genes) {
    if (!validGenes(genes, this.traitCeiling)) return false;
    const cost = mutationCost(this.genes, genes);
    if (cost === 0 || cost > this.dna) return false;
    this.dna -= cost;
    this.genes = { ...genes };
    for (const c of this.creatures)
      if (c.species === "mossling") c.genes = { ...genes };
    this.resolveCollisions();
    this.event(
      "evolution",
      "A new chapter in your DNA.",
      `Your Mosslings now have ${genes.adaptation}. New traits are active across the population.`,
    );
    return true;
  }
  rescue() {
    if (this.population > 0) return;
    for (let i = 0; i < 12; i++) this.spawn("mossling");
    this.dna = Math.max(this.dna, 60);
    this.event(
      "birth",
      "Life gets another chance.",
      "12 Mosslings have been reintroduced with your latest genome.",
    );
  }
  setBiome(biome: Biome) {
    this.biome = biome;
    this.event(
      "world",
      "The environment is changing.",
      biome === "drylands"
        ? "A dry season slows plant growth. Adapt to scarce food."
        : biome === "lush"
          ? "Rain brings abundant food, and new opportunities to grow."
          : "Mild weather returns to the meadow.",
    );
  }
  update(delta: number) {
    const dt = Math.min(delta, 0.12);
    if (dt <= 0) return;
    this.time += dt;
    const nextGeneration = Math.floor(this.time / 45) + 1;
    if (nextGeneration > this.generation) {
      this.generation = nextGeneration;
      this.dna += this.generationReward;
      this.predatorGenes = {
        ...this.predatorGenes,
        speed: this.predatorGenes.speed + 3,
        sense: this.predatorGenes.sense + 2,
        size: this.predatorGenes.size + (this.genes.defense > 55 ? 3 : 1),
      };
      for (const c of this.creatures)
        if (c.species === "razorback") c.genes = { ...this.predatorGenes };
      this.event(
        "evolution",
        `Generation ${this.generation}: predators adapt.`,
        `Razorbacks evolved faster legs and sharper senses. You gained ${this.generationReward} DNA.`,
      );
    }
    const foodRegrow =
      this.biome === "drylands" ? 48 : this.biome === "lush" ? 16 : 29;
    for (const f of this.food)
      if (!f.available) {
        f.regrow -= dt;
        if (f.regrow <= 0) f.available = true;
      }
    const born: Creature[] = [];
    const dead = new Set<number>();
    const intents: MovementIntent[] = [];
    const prey = this.creatures.filter((c) => c.species === "mossling"),
      predators = this.creatures.filter((c) => c.species === "razorback");
    const foodClaims = new Map<number, number>();
    for (const c of prey)
      if (c.targetFoodId !== undefined && !foodClaims.has(c.targetFoodId))
        foodClaims.set(c.targetFoodId, c.id);
    for (const c of this.creatures) {
      const traits = expressedGenes(c.genes);
      c.heading = normalizedHeading(c.heading);
      c.age += dt;
      c.restTime = Math.max(0, (c.restTime ?? 0) - dt);
      c.matingTime = Math.max(0, (c.matingTime ?? 0) - dt);
      c.attackFlash = Math.max(0, (c.attackFlash ?? 0) - dt);
      c.damageFlash = Math.max(0, (c.damageFlash ?? 0) - dt);
      c.cooldown -= dt;
      c.attackCooldown -= dt;
      c.energy -=
        dt *
        (c.species === "mossling"
          ? 0.38 +
            traits.size * 0.004 +
            traits.speed * 0.002 +
            (c.genes.adaptation === "spines" ? 0.07 : 0)
          : 0.85 + traits.speed * 0.004 + traits.size * 0.002);
      let tx = c.targetX,
        tz = c.targetZ;
      let moving = 1;
      const vision =
        3 + traits.sense * 0.1 + (c.genes.adaptation === "antennae" ? 1.8 : 0);
      if (c.species === "mossling") {
        let danger: Creature | undefined;
        let dangerDist = Infinity;
        for (const p of predators) {
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          if (d < dangerDist) {
            danger = p;
            dangerDist = d;
          }
        }
        if (danger && dangerDist < vision) {
          c.state = "fleeing";
          c.matingTime = 0;
          c.restTime = 0;
          tx =
            c.x +
            (dangerDist > 0.0001
              ? (c.x - danger.x) / dangerDist
              : Math.sin(c.heading)) *
              6;
          tz =
            c.z +
            (dangerDist > 0.0001
              ? (c.z - danger.z) / dangerDist
              : Math.cos(c.heading)) *
              6;
          moving = 1.32;
          if (
            c.targetFoodId !== undefined &&
            foodClaims.get(c.targetFoodId) === c.id
          )
            foodClaims.delete(c.targetFoodId);
          c.targetFoodId = undefined;
        } else if (c.energy < 90) {
          let nearest = this.food.find(
            (f) =>
              f.id === c.targetFoodId &&
              f.available &&
              foodClaims.get(f.id) === c.id,
          );
          let dist = nearest
            ? Math.hypot(nearest.x - c.x, nearest.z - c.z)
            : Infinity;
          if (!nearest) {
            c.targetFoodId = undefined;
            for (const f of this.food) {
              if (!f.available || foodClaims.has(f.id)) continue;
              const d = Math.hypot(f.x - c.x, f.z - c.z);
              if (d < dist) {
                dist = d;
                nearest = f;
              }
            }
          }
          if (nearest && dist < vision * 1.9) {
            c.targetFoodId = nearest.id;
            foodClaims.set(nearest.id, c.id);
            tx = nearest.x;
            tz = nearest.z;
            c.state = "foraging";
            if (dist < creatureScale(c) * 1.2 + 0.2) {
              nearest.available = false;
              nearest.regrow = foodRegrow;
              foodClaims.delete(nearest.id);
              c.targetFoodId = undefined;
              c.energy = Math.min(100, c.energy + 34);
              c.health = Math.min(100, c.health + 10);
              this.dna += 0.32 + (this.evolutionTier - 1) * 0.08;
              c.restTime = 0.65;
              moving = 0;
            }
          } else c.state = "wandering";
        } else {
          if (
            c.targetFoodId !== undefined &&
            foodClaims.get(c.targetFoodId) === c.id
          )
            foodClaims.delete(c.targetFoodId);
          c.targetFoodId = undefined;
          c.state = "wandering";
          moving = 0.65;
        }
      } else {
        let nearest = prey.find(
          (p) => p.id === c.targetCreatureId && !dead.has(p.id),
        );
        let dist = nearest
          ? Math.hypot(nearest.x - c.x, nearest.z - c.z)
          : Infinity;
        if (!nearest || dist > vision + 2) {
          nearest = undefined;
          dist = Infinity;
          for (const p of prey) {
            if (dead.has(p.id)) continue;
            const d = Math.hypot(p.x - c.x, p.z - c.z);
            if (d < dist) {
              dist = d;
              nearest = p;
            }
          }
        }
        if (nearest && dist < vision + 2) {
          c.targetCreatureId = nearest.id;
          tx = nearest.x;
          tz = nearest.z;
          c.state = "hunting";
          moving = 1.12;
          const contact = creatureContact(c, nearest);
          const facing =
            dist > 0.0001
              ? (Math.sin(c.heading) * (nearest.x - c.x) +
                  Math.cos(c.heading) * (nearest.z - c.z)) /
                dist
              : 1;
          if (contact.gap <= 0.25) moving = 0;
          if (
            contact.gap <= 0.25 &&
            facing > 0.15 &&
            c.attackCooldown <= 0 &&
            clearPath(c.x, c.z, nearest.x, nearest.z, this.obstacles)
          ) {
            const armor =
              1 +
              expressedGenes(nearest.genes).defense * 0.028 +
              bodyResilience(nearest.genes.size) +
              (nearest.genes.adaptation === "spines" ? 0.55 : 0);
            c.attackFlash = 0.42;
            nearest.damageFlash = 0.5;
            nearest.health -= 28 / armor;
            nearest.energy -= 2;
            c.attackCooldown = 0.75;
            if (nearest.genes.adaptation === "spines") c.energy -= 2;
            if (nearest.health <= 0) {
              dead.add(nearest.id);
              c.energy = Math.min(100, c.energy + 48);
              this.deaths++;
              if (this.deaths % 3 === 1)
                this.event(
                  "danger",
                  "The food chain turns.",
                  `A Razorback caught a Mossling. Speed, perception and armor help your species survive.`,
                );
            }
          }
        } else {
          c.targetCreatureId = undefined;
          c.state = "wandering";
        }
      }
      const isPrey = c.species === "mossling";
      const eligible = isPrey ? prey : predators;
      const baseScale =
        0.76 + (isPrey ? DEFAULT_GENES.size : PREDATOR_GENES.size) * 0.009;
      const currentScale = 0.76 + traits.size * 0.009;
      const populationLimit = Math.floor(
        (isPrey ? 64 : 14) * Math.min(1, (baseScale / currentScale) ** 2),
      );
      if (
        c.state !== "fleeing" &&
        c.cooldown <= 0 &&
        c.energy > (isPrey ? 72 : 85) &&
        c.age > 15 &&
        eligible.length + born.filter((b) => b.species === c.species).length <
          populationLimit &&
        (isPrey || prey.length > 8)
      ) {
        let mate: Creature | undefined;
        let distance = vision;
        for (const other of eligible) {
          if (
            other.id === c.id ||
            other.cooldown > 0 ||
            other.energy <= (isPrey ? 72 : 85) ||
            other.age <= 15 ||
            other.state === "fleeing" ||
            dead.has(other.id)
          )
            continue;
          const d = Math.hypot(other.x - c.x, other.z - c.z);
          if (d < distance) {
            mate = other;
            distance = d;
          }
        }
        if (mate) {
          c.state = "mating";
          tx = mate.x;
          tz = mate.z;
          moving = creatureContact(c, mate).gap < 0.6 ? 0 : 0.8;
          if (
            !moving &&
            this.random() <
              dt *
                (0.2 + traits.fertility * 0.005) *
                (this.biome === "drylands" ? 0.55 : 1)
          ) {
            born.push(c);
            for (const partner of [c, mate]) {
              partner.energy -= isPrey ? 12 : 15;
              partner.cooldown = isPrey ? 23 : 35;
              partner.matingTime = 2;
              partner.restTime = 2;
              partner.state = "mating";
            }
          }
        }
      }
      if (c.energy < 5) c.health -= dt * (c.species === "razorback" ? 6 : 4);
      if (c.energy > 60) c.health = Math.min(100, c.health + dt * 0.6);
      if (c.age > 210) c.health -= dt * 0.65;
      if (c.health <= 0 && !dead.has(c.id)) {
        dead.add(c.id);
        this.deaths++;
        if (c.species === "razorback" && c.energy < 5)
          this.event(
            "danger",
            "A hunter ran out of food.",
            "A Razorback died of hunger. Predators need successful hunts to survive.",
          );
      }
      if (
        c.state === "wandering" &&
        (Math.hypot(tx - c.x, tz - c.z) < 1.2 ||
          !onLand(tx, tz, creatureExtent(c) + 0.3))
      ) {
        const p = this.randomPoint(creatureExtent(c) + 0.15);
        c.targetX = p.x;
        c.targetZ = p.z;
        tx = p.x;
        tz = p.z;
      }
      if (c.restTime > 0 && c.state !== "fleeing") {
        moving = 0;
        c.state = c.matingTime > 0 ? "mating" : "resting";
      }
      const speed =
        (0.5 + traits.speed * 0.024) *
        (c.species === "razorback" ? 1.03 : 1) *
        Math.max(0.3, 1 - traits.defense * 0.0022) *
        moving *
        (c.age < 15 ? 0.7 : 1) *
        (c.energy < 18 ? 0.65 : 1);
      if (!dead.has(c.id))
        intents.push({
          creature: c,
          x: tx - c.x,
          z: tz - c.z,
          speed,
          targetCreature:
            c.state === "hunting" ? c.targetCreatureId : undefined,
        });
    }
    this.creatures = this.creatures.filter((c) => !dead.has(c.id));
    this.moveCreatures(intents, dt);
    for (const parent of born)
      if (!dead.has(parent.id)) {
        this.spawn(parent.species, parent);
        this.births++;
        if (parent.species === "mossling") this.preyBirths++;
        if (parent.species === "mossling" && this.births % 4 === 1)
          this.event(
            "birth",
            "A new Mossling is born.",
            `Your population is growing. The new arrival inherits your current traits.`,
          );
      }
    this.resolveCollisions();
    if (prey.length > 0 && this.population === 0)
      this.event(
        "danger",
        "Your species has gone extinct.",
        "Reintroduce your Mosslings or try a new genome. Every experiment teaches you something.",
      );
    if (Math.floor(this.time / 2) > this.lastRecord) {
      this.lastRecord = Math.floor(this.time / 2);
      this.record();
    }
  }
}
