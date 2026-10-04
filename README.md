# Verdant

A browser-only 3D evolution sandbox built with Three.js, React, and TypeScript. No backend or external art assets are required: the island, plants, water, and creatures are generated in code.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. For a production build, run `npm run build`; `npm run preview` serves that build. Requires Node.js 20.19+ or 22.12+.

## Play

Your Mosslings live on an island with evolving Razorback predators. Watch them search for berries, flee danger, hunt, mature, and reproduce. Open the creature lab to change movement, size, armor, senses, fertility, skin pigment, and antennae/spines/plumes. The live 3D preview shows your changes before you apply them. Updated genes apply to all Mosslings and their offspring.

- Drag the island to orbit, scroll to zoom, and click a creature to inspect it.
- Click the north compass to face north. The enlarged minimap shows live animal positions; camera controls sit alongside it.
- Red **ATTACK** and **HIT** labels mark bites. Purple **♥ MATING** labels mark courtship and breeding. Breeding requires two adult animals with enough energy; both parents recover before breeding again.
- **Space** pauses or resumes; **M** opens the creature lab; **R** resets the camera.
- Switch between 1×, 2× and 4× time. Each 45 world seconds begins a generation, rewards 35 DNA at tier 1, and evolves predator speed, senses, and size.
- Evolution tiers extend progression: tier 1 allows traits up to 100. Reach that limit in any one applied trait and spend DNA to unlock the next tier, adding another 100 points to every trait's range. There is always a further tier to unlock. Mutation prices grow with the level being purchased; splitting purchases does not make them cheaper. Downgrades do not refund DNA.
- Each new tier adds 15 DNA to generation rewards and 0.08 DNA to feeding rewards. DNA savings have no 999-point cap. Existing worlds retain their genomes and savings when upgrading.
- Advanced genetic levels give gradual biological gains. Physical size approaches a natural limit while body resilience keeps improving. Large animals have a lower population capacity, so high-level genomes preserve navigable bodies and collision boundaries.
- Feeding also earns DNA. Mutations spend DNA; speed costs energy, size costs food, and armor slows movement while reducing damage. Antennae extend perception, spines add defense, and plumes and pigment are cosmetic.
- Try a lush rainforest or a dry season to change food regrowth. Use **New world** to restart with a different simulation and scenery seed.
- The population graph and field notes show the consequences. Extinct Mosslings can be reintroduced using your latest genome.
- Animals keep solid, size-aware boundaries with one another, rocks, tree trunks and the shoreline. Juveniles grow into their collision footprints. Predators spend energy hunting and die of hunger without successful catches.

The entire world saves automatically in your browser's local storage and resumes on reload. Worlds are local to that browser; no account or network service is used. The simulation runs while the page is open and does not advance while it is closed.

## Checks

```sh
npm test
npm run build
```

The simulation tests cover seeded behavior, paired breeding and activity signals, hunger and hunting, inheritance, tier unlocks and escalating mutation costs, advanced-genome collisions and resilience, armor, predator evolution, food regrowth, extinction recovery, save migration, collision spacing, head-on passing and shoreline escape.

## Deployment

Production is served as static files by nixpi's Nginx at https://spore.infiniter.tech. Its HTTPS virtual host, release directories and dynamic DNS record are declared in the `nix-server` repository.

The server checkout is `/home/infiniter/services/spore`, with origin pointing to this repository. After committing and pushing `master`, deploy from the Mac:

```sh
ssh infiniter@nixpi.tail6650cb.ts.net 'cd ~/services/spore && ./scripts/deploy-nixpi.sh'
```

The script pulls origin, installs locked dependencies, runs tests and builds on nixpi. It publishes a release under `/var/www/spore/releases/<commit>` and atomically switches `/var/www/spore/current`. Previous releases remain available for rollback; no application server is needed.

## Structure

- `src/simulation.ts` — deterministic agent simulation and save state.
- `src/locomotion.ts` — body footprints, collision constraints and avoidance steering.
- `src/progression.ts` — evolution tiers, escalating mutation prices and trait expression.
- `src/habitat.ts` — seeded scenery shared by rendering and collision boundaries.
- `src/World.tsx` — Three.js island, instanced scenery, camera and creature interaction.
- `src/creatures.ts` — procedural, animated creatures derived from genes.
- `src/App.tsx` — game controls, mutation editor, species inspector, graphs, and field notes.
- `src/style.css` — responsive interface.
