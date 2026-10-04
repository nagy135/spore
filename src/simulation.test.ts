import assert from "node:assert/strict";
import test from "node:test";
import { Simulation, DEFAULT_GENES, mutationCost, onLand } from "./simulation";
import {
  angleDifference,
  creatureContact,
  creatureExtent,
  obstacleContact,
} from "./locomotion";
import { createHabitat } from "./habitat";

function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / 0.1); i++) sim.update(0.1);
}

test("a seeded ecosystem grows, hunts, and keeps creatures on the island", () => {
  const a = new Simulation(48291),
    b = new Simulation(48291);
  advance(a, 180);
  advance(b, 180);
  assert.equal(a.population, b.population);
  assert.deepEqual(a.creatures, b.creatures);
  assert.ok(a.births > 5, "animals find mates and reproduce");
  assert.ok(a.deaths > 0, "predators hunt");
  assert.ok(
    a.population > 0,
    "the initial genome survives long enough to experiment",
  );
  assert.ok(
    a.creatures.every((c) => onLand(c.x, c.z, 0)),
    "all creatures stay on land",
  );
});
test("a mutation costs DNA, affects living creatures and is inherited by offspring", () => {
  const sim = new Simulation();
  const genes = {
    ...DEFAULT_GENES,
    speed: 80,
    defense: 65,
    adaptation: "spines" as const,
  };
  const cost = mutationCost(sim.genes, genes);
  assert.equal(sim.mutate(genes), true);
  assert.equal(sim.dna, 120 - cost);
  assert.ok(
    sim.creatures
      .filter((c) => c.species === "mossling")
      .every((c) => c.genes.speed === 80 && c.genes.adaptation === "spines"),
  );
  const child = sim.spawn("mossling", sim.creatures[0]);
  assert.deepEqual(child.genes, genes);
  assert.equal(child.age, 0);
});
test("unaffordable and unchanged mutations do not spend DNA or change the genome", () => {
  const sim = new Simulation();
  sim.dna = 2;
  assert.equal(sim.mutate({ ...DEFAULT_GENES, speed: 95 }), false);
  assert.deepEqual(sim.genes, DEFAULT_GENES);
  assert.equal(sim.dna, 2);
  assert.equal(sim.mutate({ ...sim.genes }), false);
  assert.equal(sim.dna, 2);
});
test("each generation rewards the player and evolves living predators", () => {
  const sim = new Simulation();
  sim.food = [];
  const initialSpeed = sim.predatorGenes.speed;
  const initialSense = sim.predatorGenes.sense;
  advance(sim, 46);
  assert.equal(sim.generation, 2);
  assert.equal(sim.predatorGenes.speed, initialSpeed + 3);
  assert.equal(sim.predatorGenes.sense, initialSense + 2);
  assert.ok(sim.dna >= 155);
  assert.ok(
    sim.creatures
      .filter((c) => c.species === "razorback")
      .every((c) => c.genes.speed === initialSpeed + 3),
  );
  assert.ok(sim.events.some((e) => e.kind === "evolution"));
});
test("armor reduces damage in an otherwise identical encounter", () => {
  function attack(defense: number) {
    const sim = new Simulation(32);
    sim.creatures = sim.creatures.slice(0, 1);
    const prey = sim.creatures[0];
    prey.x = 0;
    prey.z = 0;
    prey.heading = 0;
    prey.genes = { ...prey.genes, defense };
    const predator = sim.spawn("razorback");
    predator.x = 0;
    predator.z = creatureExtent(prey) + creatureExtent(predator) + 0.08;
    predator.heading = Math.PI;
    sim.update(0.1);
    return prey.health;
  }
  assert.ok(attack(90) > attack(10), "more armor protects prey during a bite");
});
test("extinction recovery restores a population with the latest genome", () => {
  const sim = new Simulation();
  sim.mutate({ ...DEFAULT_GENES, color: "#8dbbbc", sense: 80 });
  sim.creatures = sim.creatures.filter((c) => c.species === "razorback");
  sim.rescue();
  assert.equal(sim.population, 12);
  assert.ok(
    sim.creatures
      .filter((c) => c.species === "mossling")
      .every((c) => c.genes.color === "#8dbbbc"),
  );
});
test("food grows back and different climates affect its regrowth", () => {
  const dry = new Simulation(123, "drylands"),
    lush = new Simulation(123, "lush");
  for (const sim of [dry, lush]) {
    sim.creatures = [sim.creatures[0]];
    const c = sim.creatures[0];
    c.x = 0;
    c.z = 0;
    c.energy = 60;
    sim.food = [{ id: 0, x: 0, z: 0, available: true, regrow: 0 }];
    sim.update(0.1);
  }
  assert.equal(dry.food[0].available, false);
  assert.equal(lush.food[0].available, false);
  assert.ok(dry.food[0].regrow > lush.food[0].regrow);
  dry.creatures = [];
  lush.creatures = [];
  advance(dry, 20);
  advance(lush, 20);
  assert.equal(dry.food[0].available, false);
  assert.equal(lush.food[0].available, true);
});
test("a saved world resumes with the same creatures, genome, and random sequence", () => {
  const original = new Simulation(12345);
  advance(original, 75);
  original.mutate({ ...DEFAULT_GENES, defense: 65 });
  const restored = Simulation.restore(original.serialize());
  assert.equal(restored.serialize(), original.serialize());
  advance(original, 20);
  advance(restored, 20);
  assert.deepEqual(original.creatures, restored.creatures);
  assert.equal(original.dna, restored.dna);
});
test("unsupported or corrupt saves are rejected", () => {
  assert.throws(() => Simulation.restore("{bad json}"));
  assert.throws(() => Simulation.restore('{"version":99,"state":{}}'));
});

function assertClear(sim: Simulation) {
  for (let i = 0; i < sim.creatures.length; i++) {
    const c = sim.creatures[i];
    assert.ok(
      onLand(c.x, c.z, creatureExtent(c) + 0.14),
      `creature ${c.id} stays clear of the shore`,
    );
    for (const o of sim.obstacles)
      assert.ok(
        obstacleContact(c, o).gap >= -0.0001,
        `creature ${c.id} overlaps ${o.id}`,
      );
    for (const other of sim.creatures.slice(i + 1))
      assert.ok(
        creatureContact(c, other).gap >= -0.0001,
        `creatures ${c.id} and ${other.id} overlap`,
      );
  }
}

test("head-on animals pass each other without overlap or a stationary spin", () => {
  const sim = new Simulation();
  sim.creatures = sim.creatures.slice(0, 2);
  sim.food = [];
  const [a, b] = sim.creatures;
  for (const [c, direction] of [
    [a, 1],
    [b, -1],
  ] as const) {
    Object.assign(c, {
      x: -5 * direction,
      z: 0,
      heading: (Math.PI / 2) * direction,
      targetX: 10 * direction,
      targetZ: 0,
      age: 30,
      energy: 80,
      cooldown: 999,
    });
  }
  for (let i = 0; i < 80; i++) {
    sim.update(0.1);
    assertClear(sim);
  }
  assert.ok(
    a.x > 2 && b.x < -2,
    "both animals make forward progress past the encounter",
  );
});

test("crowded legacy saves separate animals and preserve the player's genome", () => {
  const original = new Simulation();
  original.creatures = original.creatures.filter(
    (c) => c.species === "mossling",
  );
  const saved = JSON.parse(original.serialize());
  for (const c of saved.state.creatures) {
    Object.assign(c, { x: 0, z: 0, heading: Math.PI * 24, age: 30 });
    delete c.velocityX;
    delete c.velocityZ;
  }
  const restored = Simulation.restore(JSON.stringify(saved));
  assertClear(restored);
  assert.deepEqual(restored.genes, original.genes);
  assert.equal(restored.population, original.population);
  assert.ok(
    restored.creatures.every(
      (c) =>
        Math.abs(c.heading) <= Math.PI &&
        c.velocityX === 0 &&
        c.velocityZ === 0,
    ),
  );
  assert.ok(Math.abs(angleDifference(0.2, Math.PI * 24)) - 0.2 < 1e-10);
});

test("growing, mutated and newborn bodies remain clear of animals, rocks and trees", () => {
  const sim = new Simulation(123);
  assert.ok(sim.mutate({ ...sim.genes, size: 90 }));
  for (let i = 0; i < 4; i++) sim.spawn("mossling", sim.creatures[0]);
  assertClear(sim);
  for (let i = 0; i < 250; i++) {
    sim.update(0.08);
    assertClear(sim);
  }
});

test("animals navigate around an actual rendered tree instead of running through its trunk", () => {
  const sim = new Simulation();
  assert.deepEqual(sim.obstacles, createHabitat(sim.initialSeed).obstacles);
  const tree = sim.obstacles.find((o) => o.id === "tree-16")!;
  sim.creatures = sim.creatures.slice(0, 1);
  sim.food = [];
  const c = sim.creatures[0];
  Object.assign(c, {
    x: tree.x - 4,
    z: tree.z,
    heading: Math.PI / 2,
    targetX: tree.x + 4,
    targetZ: tree.z,
    age: 30,
    energy: 65,
    cooldown: 999,
  });
  let passed = false;
  for (let i = 0; i < 120; i++) {
    sim.update(0.1);
    assertClear(sim);
    if (c.x > tree.x + 2) {
      passed = true;
      break;
    }
  }
  assert.ok(passed, "the animal passes the trunk and reaches the other side");
});

test("a fleeing animal follows the shore without spinning or leaving land", () => {
  const sim = new Simulation();
  sim.creatures = sim.creatures.slice(0, 1);
  sim.food = [];
  const c = sim.creatures[0];
  Object.assign(c, {
    x: 17,
    z: 0,
    heading: Math.PI / 2,
    age: 30,
    energy: 90,
    cooldown: 999,
  });
  c.genes.speed = 90;
  const predator = sim.spawn("razorback");
  Object.assign(predator, { x: 13, z: 0, heading: Math.PI / 2, cooldown: 999 });
  sim.resolveCollisions();
  const start = { x: c.x, z: c.z };
  let totalTurn = 0;
  for (let i = 0; i < 80; i++) {
    const previous = c.heading;
    sim.update(0.1);
    const turn = Math.abs(angleDifference(c.heading, previous));
    assert.ok(turn <= 0.301, "turn rate is bounded");
    totalTurn += turn;
    assertClear(sim);
  }
  assert.ok(
    Math.hypot(c.x - start.x, c.z - start.z) > 4,
    "the animal escapes the edge",
  );
  assert.ok(totalTurn < Math.PI * 3, "the animal does not repeatedly spin");
});

test("predators run out of energy and die when they cannot catch food", () => {
  const sim = new Simulation();
  sim.creatures = sim.creatures.filter((c) => c.species === "razorback");
  advance(sim, 120);
  assert.equal(sim.predators, 0);
  assert.equal(sim.deaths, 5);
  assert.ok(sim.events.some((e) => e.title === "A hunter ran out of food."));
});

test("a successful bite flashes on both animals and feeds the predator after a kill", () => {
  const sim = new Simulation(32);
  sim.creatures = sim.creatures.slice(0, 1);
  sim.food = [];
  const prey = sim.creatures[0];
  Object.assign(prey, { x: 0, z: 0, heading: 0, health: 1, cooldown: 999 });
  const predator = sim.spawn("razorback");
  Object.assign(predator, {
    x: 0,
    z: creatureExtent(prey) + creatureExtent(predator) + 0.08,
    heading: Math.PI,
    energy: 15,
    cooldown: 999,
  });
  sim.update(0.1);
  assert.ok(predator.attackFlash! > 0);
  assert.ok(prey.damageFlash! > 0);
  assert.equal(sim.population, 0);
  assert.ok(predator.energy > 60, "a successful hunt restores energy");
});

test("reproduction requires two adults and shows a mating activity", () => {
  const sim = new Simulation(32);
  sim.creatures = sim.creatures.slice(0, 2);
  sim.food = [];
  const [a, b] = sim.creatures;
  for (const [c, direction] of [
    [a, -1],
    [b, 1],
  ] as const) {
    Object.assign(c, {
      x: direction * (creatureExtent(c) + 0.1),
      z: 0,
      heading: (-direction * Math.PI) / 2,
      age: 30,
      energy: 90,
      cooldown: 0,
    });
    c.genes.fertility = 100;
  }
  for (let i = 0; i < 100 && !sim.births; i++) sim.update(0.1);
  assert.equal(sim.births, 1);
  assert.ok(
    a.matingTime! > 0 && b.matingTime! > 0,
    "both parents show mating hearts",
  );
  assert.ok(
    a.cooldown > 0 && b.cooldown > 0,
    "both parents wait before breeding again",
  );
  assertClear(sim);
});

test("the starting budget cannot max out all traits, and advanced upgrades cost progressively more", () => {
  const sim = new Simulation();
  const maximum = {
    ...sim.genes,
    speed: 100,
    size: 100,
    defense: 100,
    sense: 100,
    fertility: 100,
  };
  assert.ok(mutationCost(sim.genes, maximum) > sim.dna * 3);
  assert.equal(sim.mutate(maximum), false);
  const at = (speed: number) => ({ ...DEFAULT_GENES, speed });
  assert.ok(mutationCost(at(200), at(210)) > mutationCost(at(100), at(110)));
  assert.ok(
    mutationCost(at(100), at(150)) + mutationCost(at(150), at(200)) >=
      mutationCost(at(100), at(200)),
    "splitting an upgrade offers no discount",
  );
});

test("tiers require an applied milestone and DNA, then continue opening new trait ranges", () => {
  const sim = new Simulation();
  sim.dna = 1_000_000;
  assert.equal(sim.unlockTier(), false, "DNA alone cannot skip the milestone");
  assert.equal(
    sim.mutate({ ...sim.genes, speed: 101 }),
    false,
    "locked levels cannot be bought",
  );
  for (let tier = 1; tier <= 10; tier++) {
    assert.equal(sim.mutate({ ...sim.genes, speed: tier * 100 }), true);
    const cost = sim.nextTierCost;
    sim.dna = cost - 1;
    assert.equal(
      sim.unlockTier(),
      false,
      "the full breakthrough cost is required",
    );
    sim.dna = cost;
    assert.equal(sim.unlockTier(), true);
    assert.equal(sim.dna, 0);
    assert.equal(sim.evolutionTier, tier + 1);
    assert.equal(sim.traitCeiling, (tier + 1) * 100);
    sim.dna = 1_000_000;
  }
  assert.equal(sim.genes.speed, 1_000);
  assert.equal(
    sim.traitCeiling,
    1_100,
    "there is another tier beyond level one thousand",
  );
  sim.creatures = [];
  sim.food = [];
  sim.time = 44.95;
  const balance = sim.dna;
  sim.update(0.1);
  assert.equal(
    sim.dna - balance,
    sim.generationReward,
    "higher tiers also increase generation earnings",
  );
});

test("invalid or locked mutations never spend DNA", () => {
  const sim = new Simulation();
  sim.dna = 10_000;
  for (const speed of [-1, NaN, Infinity, 101]) {
    assert.equal(sim.mutate({ ...sim.genes, speed }), false);
    assert.equal(sim.dna, 10_000);
  }
  assert.deepEqual(sim.genes, DEFAULT_GENES);
});

test("advanced genomes grow, move, breed and restore without breaking collision boundaries", () => {
  const sim = new Simulation(123);
  sim.evolutionTier = 10;
  sim.dna = 1_000_000;
  const genes = {
    ...sim.genes,
    speed: 1_000,
    size: 1_000,
    defense: 1_000,
    sense: 1_000,
    fertility: 1_000,
  };
  assert.equal(sim.mutate(genes), true);
  const child = sim.spawn("mossling", sim.creatures[0]);
  assert.deepEqual(child.genes, genes);
  for (let i = 0; i < 250; i++) {
    sim.update(0.08);
    assertClear(sim);
  }
  assert.ok(
    sim.creatures.every((c) =>
      [c.x, c.z, c.velocityX, c.velocityZ, c.heading, c.health].every(
        Number.isFinite,
      ),
    ),
  );
  const restored = Simulation.restore(sim.serialize());
  assert.equal(restored.serialize(), sim.serialize());
  assert.equal(restored.evolutionTier, 10);
  advance(sim, 2);
  advance(restored, 2);
  assert.deepEqual(restored.creatures, sim.creatures);
});

test("old saves retain genomes and accumulated DNA, and feeding never caps the bank", () => {
  const original = new Simulation();
  original.creatures = original.creatures.slice(0, 1);
  original.dna = 10_000;
  const saved = JSON.parse(original.serialize());
  saved.version = 1;
  delete saved.state.evolutionTier;
  const sim = Simulation.restore(JSON.stringify(saved));
  assert.equal(sim.evolutionTier, 1);
  assert.equal(sim.dna, 10_000);
  assert.deepEqual(sim.genes, original.genes);
  const c = sim.creatures[0];
  c.x = 0;
  c.z = 0;
  c.energy = 60;
  sim.food = [{ id: 0, x: 0, z: 0, available: true, regrow: 0 }];
  sim.update(0.1);
  assert.ok(
    sim.dna > 10_000,
    "feeding adds to the bank instead of reducing it to 999",
  );
  const corrupt = JSON.parse(sim.serialize());
  corrupt.state.evolutionTier = 0;
  assert.throws(() => Simulation.restore(JSON.stringify(corrupt)));
});

test("predators continue evolving after the old 95 point ceiling", () => {
  const sim = new Simulation();
  sim.predatorGenes.speed = 95;
  sim.predatorGenes.sense = 100;
  sim.predatorGenes.size = 90;
  sim.time = 44.95;
  sim.update(0.1);
  assert.equal(sim.predatorGenes.speed, 98);
  assert.equal(sim.predatorGenes.sense, 102);
  assert.equal(sim.predatorGenes.size, 91);
  assert.ok(
    sim.creatures
      .filter((c) => c.species === "razorback")
      .every((c) => c.genes.speed === 98 && Number.isFinite(c.x)),
  );
});

test("advanced body levels keep improving resilience after physical growth slows", () => {
  function encounter(size: number) {
    const sim = new Simulation(32);
    sim.evolutionTier = 5;
    sim.creatures = sim.creatures.slice(0, 1);
    sim.food = [];
    const prey = sim.creatures[0];
    prey.genes.size = size;
    Object.assign(prey, { x: 0, z: 0, heading: 0, cooldown: 999 });
    const predator = sim.spawn("razorback");
    Object.assign(predator, {
      x: 0,
      z: creatureExtent(prey) + creatureExtent(predator) + 0.08,
      heading: Math.PI,
      cooldown: 999,
    });
    sim.update(0.1);
    return prey.health;
  }
  assert.ok(
    encounter(500) > encounter(100),
    "higher body levels still protect against bites",
  );
});
