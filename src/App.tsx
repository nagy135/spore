import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Dna,
  Eye,
  Feather,
  Focus,
  Leaf,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Sprout,
  Target,
  Volume2,
  VolumeX,
  Wind,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import World, { CreaturePreview } from "./World";
import type { WorldHandle } from "./World";
import {
  DEFAULT_GENES,
  Simulation,
  geneKeys,
  mutationCost,
  speciesName,
} from "./simulation";
import type { Genes, Species, Biome, WorldEvent } from "./simulation";

type Modal = "lab" | "notes" | "help" | "new" | null;
const traitInfo: {
  key: (typeof geneKeys)[number];
  label: string;
  icon: LucideIcon;
  description: string;
}[] = [
  {
    key: "speed",
    label: "Movement",
    icon: Wind,
    description:
      "Longer legs help you escape predators. Moving faster uses more energy.",
  },
  {
    key: "size",
    label: "Body size",
    icon: Maximize2,
    description:
      "Bigger bodies need more food and space. Advanced levels improve resilience as growth slows.",
  },
  {
    key: "defense",
    label: "Defense",
    icon: Shield,
    description:
      "A thicker shell reduces damage from attacks, at the cost of movement speed.",
  },
  {
    key: "sense",
    label: "Perception",
    icon: Eye,
    description:
      "Spot food and danger sooner. With antennae, your detection range grows further.",
  },
  {
    key: "fertility",
    label: "Reproduction",
    icon: Sprout,
    description:
      "A well-fed adult reproduces more often. Each birth takes some of its energy.",
  },
];
const adaptations: {
  value: Genes["adaptation"];
  title: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    value: "antennae",
    title: "Antennae",
    detail: "+ detection range",
    icon: Eye,
  },
  { value: "spines", title: "Spines", detail: "+ protection", icon: Shield },
  {
    value: "plumes",
    title: "Plumes",
    detail: "a beautiful display",
    icon: Feather,
  },
];
const colors = ["#adcc79", "#8dbbbc", "#d8a58a", "#bb9ec9", "#d4c77e"];
function Logo() {
  return (
    <svg
      width="31"
      height="34"
      viewBox="0 0 38 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 36C3 30 9 15 3 8c12-1 17 9 16 18C21 11 29 6 36 4c1 14-5 26-17 32Z"
        fill="currentColor"
      />
      <path
        d="M19 36c1-10 6-16 12-23M18 32c-1-8-4-13-8-16"
        stroke="var(--ef-bg-dim)"
        strokeWidth="1.3"
      />
    </svg>
  );
}
function number(value: number) {
  return String(Math.floor(value)).padStart(2, "0");
}
function timestamp(time: number) {
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(time % 60)
    .toString()
    .padStart(2, "0")}`;
}

function PopulationChart({ simulation }: { simulation: Simulation }) {
  const h = simulation.history;
  const max = Math.max(
    40,
    ...h.map((p) => p.prey),
    ...h.map((p) => p.predators),
  );
  const path = (key: "prey" | "predators") =>
    h
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${((i / Math.max(h.length - 1, 1)) * 650).toFixed(2)},${(65 - (p[key] / max) * 55).toFixed(2)}`,
      )
      .join(" ");
  return (
    <div className="population-chart">
      <div className="chart-grid">
        <span>{max}</span>
        <span>{Math.floor(max / 2)}</span>
        <span>0</span>
      </div>
      <svg
        viewBox="0 0 650 70"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Population history. Currently ${simulation.population} Mosslings and ${simulation.predators} Razorbacks.`}
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ef-green)" stopOpacity=".2" />
            <stop offset="100%" stopColor="var(--ef-green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[10, 37, 65].map((y) => (
          <line
            key={y}
            x1="0"
            x2="650"
            y1={y}
            y2={y}
            stroke="var(--ef-grey1)"
            strokeOpacity=".055"
            strokeDasharray="3 5"
          />
        ))}
        {h.length > 1 && (
          <path d={`${path("prey")} L650,70 L0,70 Z`} fill="url(#chartFill)" />
        )}
        <path
          d={path("prey")}
          fill="none"
          stroke="var(--ef-green)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path("predators")}
          fill="none"
          stroke="var(--ef-red)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {h.length > 0 && (
          <>
            <circle
              cx="650"
              cy={65 - (h.at(-1)!.prey / max) * 55}
              r="3"
              fill="var(--ef-green)"
            />
            <circle
              cx="650"
              cy={65 - (h.at(-1)!.predators / max) * 55}
              r="3"
              fill="var(--ef-red)"
            />
          </>
        )}
      </svg>
      <div className="chart-times">
        <span>{timestamp(h[0]?.time || 0)}</span>
        <span>Population over time</span>
        <span>{timestamp(simulation.time)}</span>
      </div>
    </div>
  );
}
function MiniMap({ simulation }: { simulation: Simulation }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="minimap"
      aria-label="Live island minimap"
    >
      <path
        d="M50 9C71 7 86 27 88 45C94 63 78 75 66 87C48 96 25 83 15 71C2 56 13 43 11 33C16 17 34 11 50 9Z"
        fill="var(--ef-bg-green)"
        fillOpacity=".5"
        stroke="var(--ef-grey2)"
        strokeOpacity=".6"
        strokeWidth=".8"
      />
      {simulation.creatures.map((c) => (
        <circle
          key={c.id}
          cx={50 + c.x * 1.85}
          cy={50 + c.z * 1.85}
          r={c.species === "mossling" ? 1.2 : 1.7}
          fill={c.species === "mossling" ? "var(--ef-green)" : "var(--ef-red)"}
        />
      ))}
      <path d="M50 2L48 6H52Z" fill="var(--ef-fg)" />
      <text
        x="50"
        y="99"
        textAnchor="middle"
        fill="var(--ef-grey2)"
        fontSize="6"
      >
        S
      </text>
    </svg>
  );
}
function EventIcon({ event }: { event: WorldEvent }) {
  const Icon =
    event.kind === "birth"
      ? Sprout
      : event.kind === "evolution"
        ? Dna
        : event.kind === "danger"
          ? Target
          : Leaf;
  return (
    <span className={`event-icon ${event.kind}`}>
      <Icon size={15} />
    </span>
  );
}

export default function App() {
  const [simulation, setSimulation] = useState(() => {
    try {
      const saved = localStorage.getItem("verdant-world-v1");
      return saved ? Simulation.restore(saved) : new Simulation();
    } catch {
      return new Simulation();
    }
  });
  const [revision, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<number | null>(1);
  const [species, setSpecies] = useState<Species>("mossling");
  const [modal, setModal] = useState<Modal>(null);
  const [labels, setLabels] = useState(false);
  const [worldMenu, setWorldMenu] = useState(false);
  const [sound, setSound] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState<Genes>({ ...DEFAULT_GENES });
  const [newBiome, setNewBiome] = useState<Biome>("meadow");
  const [newSeed, setNewSeed] = useState(48291);
  const world = useRef<WorldHandle>(null);
  const compass = useRef<SVGSVGElement>(null);
  const updateBearing = useCallback((radians: number) => {
    if (compass.current)
      compass.current.style.transform = `rotate(${radians}rad)`;
  }, []);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem("verdant-world-v1", simulation.serialize());
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
    };
    save();
    const interval = setInterval(save, 2000);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      clearInterval(interval);
      window.removeEventListener("pagehide", save);
    };
  }, [simulation]);
  useEffect(() => {
    if (
      !simulation.creatures.some(
        (c) => c.id === selected && c.species === species,
      )
    ) {
      setSelected(
        simulation.creatures.find((c) => c.species === species)?.id ?? null,
      );
    }
  }, [revision, simulation, selected, species]);
  const tick = useCallback(() => setTick((t) => t + 1), []);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);
  const selectCreature = useCallback(
    (id: number) => {
      setSelected(id);
      const c = simulation.creatures.find((c) => c.id === id);
      if (c) setSpecies(c.species);
    },
    [simulation],
  );
  const openLab = () => {
    setDraft({ ...simulation.genes });
    setModal("lab");
    setWorldMenu(false);
  };
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Escape") {
        setModal(null);
        setWorldMenu(false);
      }
      if (e.code === "Space" && !modal) {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key.toLowerCase() === "m" && !modal) {
        setDraft({ ...simulation.genes });
        setModal("lab");
      }
      if (e.key.toLowerCase() === "r" && !modal) world.current?.reset();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal, simulation]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(
      () =>
        document.querySelector<HTMLElement>(".modal [data-autofocus]")?.focus(),
      20,
    );
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = [
        ...document.querySelectorAll<HTMLElement>(
          ".modal button:not(:disabled), .modal input:not(:disabled), .modal select",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable.at(-1)!;
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !document.querySelector(".modal")?.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      audio.current?.close();
    },
    [],
  );
  const toggleSound = () => {
    if (!audio.current) {
      const ctx = new AudioContext();
      audio.current = ctx;
      const g = ctx.createGain();
      g.gain.value = 0.018;
      g.connect(ctx.destination);
      gain.current = g;
      for (const frequency of [130.81, 196, 261.63]) {
        const oscillator = ctx.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(g);
        oscillator.start();
      }
    }
    audio.current.resume();
    const next = !sound;
    if (gain.current)
      gain.current.gain.setTargetAtTime(
        next ? 0.018 : 0,
        audio.current.currentTime,
        0.3,
      );
    setSound(next);
  };
  const active = simulation.creatures.find(
    (c) => c.id === selected && c.species === species,
  );
  const genes =
    species === "mossling" ? simulation.genes : simulation.predatorGenes;
  const cost = mutationCost(simulation.genes, draft);
  const traitCeiling = simulation.traitCeiling;
  const displayCeiling =
    species === "mossling"
      ? traitCeiling
      : Math.max(
          100,
          Math.ceil(Math.max(...geneKeys.map((key) => genes[key])) / 100) * 100,
        );
  const alive =
    species === "mossling" ? simulation.population : simulation.predators;
  const latest = simulation.events[0];
  const health = Math.round(
    species === "mossling"
      ? simulation.averageHealth
      : simulation.creatures
          .filter((c) => c.species === "razorback")
          .reduce((a, c) => a + c.health, 0) /
          Math.max(simulation.predators, 1),
  );
  function chooseSpecies(value: Species) {
    setSpecies(value);
    setSelected(
      simulation.creatures.find((c) => c.species === value)?.id ?? null,
    );
  }
  function newWorld() {
    const next = new Simulation(newSeed, newBiome);
    setSimulation(next);
    setSelected(1);
    setSpecies("mossling");
    setSpeed(1);
    setPaused(false);
    setReady(false);
    setModal(null);
    notify("A new world. A new beginning.");
  }
  function applyMutation() {
    if (simulation.mutate(draft)) {
      setModal(null);
      tick();
      notify("Genome updated. Watch your Mosslings adapt.");
    }
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setModal(null);
          }}
        >
          <Logo />
          <span>
            verdant<span className="brand-dot">.</span>
          </span>
          <span className="brand-sub">EVOLUTION SANDBOX</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={modal !== "lab" && modal !== "notes" ? "active" : ""}
            onClick={() => setModal(null)}
          >
            <Compass size={16} />
            Ecosystem
          </button>
          <button className={modal === "lab" ? "active" : ""} onClick={openLab}>
            <Dna size={16} />
            Creature lab
          </button>
          <button
            className={modal === "notes" ? "active" : ""}
            onClick={() => setModal("notes")}
          >
            <Leaf size={16} />
            Field notes
            <span className="notes-dot" />
          </button>
        </nav>
        <div className="header-actions">
          <span className="sandbox-tag">
            <span />
            SANDBOX MODE
          </span>
          <button
            className="icon-button"
            aria-label={sound ? "Mute ambient sound" : "Enable ambient sound"}
            onClick={toggleSound}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="icon-button"
            aria-label="How to play"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </header>
      <main className="app-main">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              A LITTLE CURIOSITY. A LOT OF POSSIBILITY.
            </div>
            <h1>
              A living world, shaped by you<span>.</span>
            </h1>
          </div>
          <button
            className="secondary-button new-world"
            onClick={() => {
              setNewBiome(simulation.biome);
              setNewSeed(10000 + Math.floor(Math.random() * 90000));
              setModal("new");
            }}
          >
            <Plus size={15} />
            New world
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="workspace">
          <div className="ecosystem-column">
            <section className="world-stage" aria-label="Ecosystem simulation">
              <World
                ref={world}
                simulation={simulation}
                paused={paused || modal === "lab" || modal === "new"}
                speed={speed}
                selected={selected}
                onSelect={selectCreature}
                onTick={tick}
                labels={labels}
                onReady={() => setReady(true)}
                onError={setError}
                onBearingChange={updateBearing}
              />
              <div className="stage-vignette" />
              <div className="stage-top">
                <div className="world-title">
                  <div className="eyebrow">
                    <span className="location-dot" />
                    THE VERDANT ISLES
                  </div>
                  <div className="world-subtitle">
                    Small beginnings. Wild possibilities.
                  </div>
                </div>
                <div className="biome-control">
                  <button
                    className="biome-button"
                    onClick={() => setWorldMenu(!worldMenu)}
                    aria-expanded={worldMenu}
                  >
                    <Leaf size={14} />
                    {simulation.biome === "drylands"
                      ? "Dry season"
                      : simulation.biome === "lush"
                        ? "Lush rainforest"
                        : "Temperate meadow"}
                    <ChevronDown size={13} />
                  </button>
                  {worldMenu && (
                    <div className="biome-menu">
                      <div className="eyebrow">CHANGE ENVIRONMENT</div>
                      {(
                        [
                          {
                            value: "meadow",
                            name: "Temperate meadow",
                            desc: "A balanced home for new life.",
                          },
                          {
                            value: "lush",
                            name: "Lush rainforest",
                            desc: "Abundant food. Faster growth.",
                          },
                          {
                            value: "drylands",
                            name: "Dry season",
                            desc: "Scarce food. A test of survival.",
                          },
                        ] as { value: Biome; name: string; desc: string }[]
                      ).map((b) => (
                        <button
                          key={b.value}
                          onClick={() => {
                            simulation.setBiome(b.value);
                            setWorldMenu(false);
                            tick();
                            notify(`Environment changed: ${b.name}`);
                          }}
                        >
                          <span>
                            {b.name}
                            <small>{b.desc}</small>
                          </span>
                          {simulation.biome === b.value && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="world-metrics">
                <div className="world-metric">
                  <span>
                    <Sprout size={13} />
                    Your population
                  </span>
                  <strong>
                    {number(simulation.population)}
                    <small className="positive">
                      <ArrowUpRight size={12} />
                      {simulation.preyBirths} born
                    </small>
                  </strong>
                  <div className="metric-bottom">
                    <span className="legend-dot green" />
                    Mosslings
                  </div>
                </div>
                <div className="world-metric">
                  <span>
                    <Target size={13} />
                    Predators
                  </span>
                  <strong>
                    {number(simulation.predators)}
                    <small>
                      {simulation.generation > 1 ? "adapting" : "watch closely"}
                    </small>
                  </strong>
                  <div className="metric-bottom">
                    <span className="legend-dot peach" />
                    Razorbacks
                  </div>
                </div>
                <div className="world-metric biodiversity-metric">
                  <span>
                    <Leaf size={13} />
                    Biodiversity
                  </span>
                  <strong>
                    {simulation.biodiversity.toFixed(1)}
                    <small className="positive">
                      {simulation.population > 12 ? "flourishing" : "fragile"}
                    </small>
                  </strong>
                  <div className="metric-bottom">
                    <span className="legend-dot soft" />
                    Ecosystem index
                  </div>
                </div>
              </div>
              <button
                className="compass"
                aria-label="Face north"
                title="Face north"
                onClick={() => world.current?.north()}
              >
                <span>N</span>
                <svg ref={compass} viewBox="0 0 40 40" aria-hidden="true">
                  <path d="M20 3L27 27L20 23L13 27Z" fill="var(--ef-fg)" />
                  <path d="M20 3V23L13 27Z" fill="var(--ef-green)" />
                </svg>
              </button>
              <div className="view-tools">
                <button
                  aria-label="Zoom in"
                  onClick={() => world.current?.zoom(1)}
                >
                  <Plus size={17} />
                </button>
                <button
                  aria-label="Zoom out"
                  onClick={() => world.current?.zoom(-1)}
                >
                  <Minus size={17} />
                </button>
                <span />
                <button
                  aria-label="Reset camera"
                  onClick={() => world.current?.reset()}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  aria-label="Top view"
                  onClick={() => world.current?.overhead()}
                >
                  <ArrowDownLeft size={17} />
                </button>
                <button
                  aria-label="Toggle creature labels"
                  className={labels ? "active" : ""}
                  onClick={() => setLabels(!labels)}
                  aria-pressed={labels}
                >
                  <Eye size={17} />
                </button>
              </div>
              <div className="stage-bottom">
                <div className="simulation-controls">
                  <button
                    className="play-button"
                    onClick={() => setPaused(!paused)}
                    aria-label={
                      paused ? "Resume simulation" : "Pause simulation"
                    }
                  >
                    {paused ? (
                      <Play size={15} fill="currentColor" />
                    ) : (
                      <Pause size={15} fill="currentColor" />
                    )}
                  </button>
                  <div className="speed-controls" aria-label="Simulation speed">
                    {[1, 2, 4].map((s) => (
                      <button
                        key={s}
                        className={speed === s ? "active" : ""}
                        onClick={() => setSpeed(s)}
                        aria-pressed={speed === s}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                  <span className="control-divider" />
                  <div className="generation">
                    <span>GENERATION</span>
                    <strong>{number(simulation.generation)}</strong>
                  </div>
                  <div className="time-display">
                    {timestamp(simulation.time)}
                  </div>
                </div>
              </div>
              <div className="map-card">
                <MiniMap simulation={simulation} />
                <span>ISLAND 01</span>
              </div>
              <div className="world-hint">
                <span className="live-dot" />
                {paused ? "Simulation paused" : "Life is unfolding"}
                <span className="hint-divider">·</span>
                <span>Drag to orbit. Scroll to explore.</span>
              </div>
              {!ready && !error && (
                <div className="world-loading">
                  <Logo />
                  <span>Growing your world…</span>
                </div>
              )}
              {error && (
                <div className="world-loading">
                  <CircleHelp size={32} />
                  <span>{error}</span>
                </div>
              )}
              {simulation.population === 0 && (
                <div className="extinction-message">
                  <Sprout size={25} />
                  <h3>Every ending is a beginning.</h3>
                  <p>
                    Your Mosslings went extinct. Try a different genome and give
                    life another chance.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => {
                      simulation.rescue();
                      tick();
                      notify("12 Mosslings reintroduced.");
                    }}
                  >
                    Reintroduce species
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
            <section className="ecosystem-bottom">
              <div className="population-panel">
                <div className="panel-heading">
                  <h2>
                    <Activity size={15} />
                    The pulse of your world
                  </h2>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-dot green" />
                      Mosslings
                    </span>
                    <span>
                      <i className="legend-dot peach" />
                      Razorbacks
                    </span>
                  </div>
                </div>
                <PopulationChart simulation={simulation} />
              </div>
              <div className="latest-event">
                <div className="panel-heading">
                  <h2>Life, lately</h2>
                  <button
                    className="text-icon-button"
                    aria-label="Open field notes"
                    onClick={() => setModal("notes")}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                {latest && (
                  <div className="event-preview">
                    <EventIcon event={latest} />
                    <div>
                      <span className="event-time">
                        {timestamp(latest.time)}
                      </span>
                      <p>{latest.title}</p>
                    </div>
                  </div>
                )}
                <button className="text-link" onClick={() => setModal("notes")}>
                  Explore field notes
                  <ArrowRight size={12} />
                </button>
              </div>
            </section>
          </div>
          <aside className="inspector">
            <div className="inspector-top">
              <span className="eyebrow">SPECIES OVERVIEW</span>
              <span className="specimen-number">{number(active?.id ?? 1)}</span>
            </div>
            <div className="species-switch">
              <button
                className={species === "mossling" ? "active" : ""}
                onClick={() => chooseSpecies("mossling")}
              >
                <span className="legend-dot green" />
                Your species
              </button>
              <button
                className={species === "razorback" ? "active" : ""}
                onClick={() => chooseSpecies("razorback")}
              >
                <span className="legend-dot peach" />
                Predator
              </button>
            </div>
            <div className="specimen-display">
              <div className="specimen-grid" />
              <CreaturePreview genes={genes} species={species} />
              <span className="specimen-tag">
                <span />
                LIVE SPECIMEN
              </span>
              <button
                className="specimen-focus"
                aria-label="Follow selected creature"
                onClick={() => {
                  if (selected) world.current?.focus(selected);
                  else notify("Select a creature on the island first.");
                }}
              >
                <Focus size={16} />
              </button>
            </div>
            <div className="species-name">
              <div>
                <h2>
                  {speciesName(species)}
                  <span>{species === "mossling" ? "01" : "02"}</span>
                </h2>
                <p>
                  {species === "mossling"
                    ? "Viridifera curiosa"
                    : "Venator spinosa"}
                </p>
              </div>
              <span
                className={`diet-badge ${species === "razorback" ? "predator" : ""}`}
              >
                {species === "mossling" ? "HERBIVORE" : "CARNIVORE"}
              </span>
            </div>
            <div className="species-stats">
              <div>
                <span>Population</span>
                <strong>
                  {number(alive)}
                  <small>creatures</small>
                </strong>
              </div>
              <div>
                <span>Vitality</span>
                <strong>
                  {health}
                  <small>% healthy</small>
                </strong>
              </div>
            </div>
            <div className="traits-heading">
              <span className="eyebrow">EVOLVED TRAITS</span>
              <span>
                {species === "mossling"
                  ? `TIER ${number(simulation.evolutionTier)}`
                  : `GEN ${number(simulation.generation)}`}
              </span>
            </div>
            <div className="trait-list">
              {traitInfo.map(({ key, label, icon: Icon, description }) => (
                <div className="trait-row" key={key} title={description}>
                  <Icon size={15} />
                  <span>{label}</span>
                  <div className="trait-bars">
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                      <i
                        key={i}
                        className={
                          (genes[key] / displayCeiling) * 7 > i ? "filled" : ""
                        }
                      />
                    ))}
                  </div>
                  <span className="trait-number">{genes[key]}</span>
                </div>
              ))}
            </div>
            <div className="adaptation-line">
              <Sparkles size={13} />
              <span>
                {genes.adaptation === "antennae"
                  ? "Sensitive antennae"
                  : genes.adaptation === "spines"
                    ? "Protective dorsal spines"
                    : "Decorative display plumes"}
              </span>
              <span className="adaptation-status">ACTIVE</span>
            </div>
            {active && (
              <div className="behavior-line">
                <span className="live-dot" />
                <span>Currently {active.state}</span>
                <span>{active.age < 20 ? "Juvenile" : "Adult"}</span>
              </div>
            )}
            <div className="inspector-footer">
              <div className="dna-balance">
                <span>
                  <Dna size={15} />
                  Evolution points
                </span>
                <strong>
                  {Math.floor(simulation.dna)}
                  <small>DNA</small>
                </strong>
              </div>
              <button className="primary-button" onClick={openLab}>
                <Dna size={17} />
                Mutate your species
                <ArrowUpRight size={17} />
              </button>
              <p>Little changes can make a world of difference.</p>
            </div>
          </aside>
        </div>
        <footer className="app-footer">
          <span>
            <span className="status-dot" />
            Your little world is saved in this browser.
          </span>
          <span>
            YOUR WORLD. YOUR EVOLUTION.
            <span className="footer-leaf">
              <Leaf size={12} />
            </span>
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          {modal === "lab" && (
            <section
              className="modal lab-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lab-title"
            >
              <div className="modal-header">
                <div>
                  <div className="eyebrow">
                    <Dna size={13} />
                    THE CREATURE LAB
                  </div>
                  <h2 id="lab-title">
                    A small change. A new possibility<span>.</span>
                  </h2>
                </div>
                <button
                  className="icon-button close-modal"
                  data-autofocus
                  aria-label="Close creature lab"
                  onClick={() => setModal(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="lab-body">
                <div className="lab-preview">
                  <div className="lab-preview-title">
                    <span className="eyebrow">YOUR NEXT MOSSLING</span>
                    <span className="lab-generation">
                      GEN {number(simulation.generation)}
                    </span>
                  </div>
                  <CreaturePreview genes={draft} large />
                  <div className="preview-caption">
                    <RotateCcw size={12} />
                    Drag to turn your creature
                  </div>
                  <div className="color-selector">
                    <span>Skin pigment</span>
                    <div>
                      {colors.map((color) => (
                        <button
                          key={color}
                          style={{ background: color }}
                          aria-label={`Set pigment ${color}`}
                          className={draft.color === color ? "selected" : ""}
                          onClick={() => setDraft({ ...draft, color })}
                        >
                          {draft.color === color && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="lab-note">
                    <Leaf size={17} />
                    <p>
                      Every trait has a trade-off. Experiment, observe, and find
                      your species’ way to thrive.
                    </p>
                  </div>
                </div>
                <div className="lab-settings">
                  <div className="lab-settings-heading">
                    <h3>Shape your species</h3>
                    <span>01 — GENOME</span>
                  </div>
                  <div className="evolution-tier-card">
                    <div className="tier-card-heading">
                      <span>
                        <Sparkles size={14} /> Evolution tier{" "}
                        {simulation.evolutionTier}
                      </span>
                      <strong>Up to {traitCeiling}</strong>
                    </div>
                    <p>
                      {simulation.canUnlockTier
                        ? `A trait reached ${traitCeiling}. Unlock the next tier to keep evolving.`
                        : `Reach ${traitCeiling} in any one trait to unlock the next tier.`}
                    </p>
                    <div
                      className="tier-progress"
                      role="progressbar"
                      aria-label="Progress to the next evolution tier"
                      aria-valuemin={0}
                      aria-valuemax={traitCeiling}
                      aria-valuenow={Math.max(
                        ...geneKeys.map((key) => simulation.genes[key]),
                      )}
                    >
                      <i
                        style={{
                          width: `${Math.min(100, (Math.max(...geneKeys.map((key) => simulation.genes[key])) / traitCeiling) * 100)}%`,
                        }}
                      />
                    </div>
                    <button
                      className="tier-unlock-button"
                      disabled={
                        !simulation.canUnlockTier ||
                        simulation.dna < simulation.nextTierCost
                      }
                      onClick={() => {
                        if (simulation.unlockTier()) {
                          tick();
                          notify(
                            `Tier ${simulation.evolutionTier} unlocked. Traits can now reach ${simulation.traitCeiling}.`,
                          );
                        }
                      }}
                    >
                      <span>
                        Unlock tier {simulation.evolutionTier + 1}{" "}
                        <ArrowUpRight size={13} />
                      </span>
                      <strong>
                        {simulation.nextTierCost.toLocaleString()} DNA
                      </strong>
                    </button>
                    <small>
                      Next limit: {traitCeiling + 100} · Each generation earns{" "}
                      {simulation.generationReward} DNA
                    </small>
                  </div>
                  {traitInfo.map(({ key, label, icon: Icon, description }) => (
                    <div className="gene-control" key={key}>
                      <label htmlFor={`gene-${key}`}>
                        <Icon size={15} />
                        {label}
                        <span>
                          {draft[key]}
                          <small>
                            {draft[key] !== simulation.genes[key] &&
                              `${draft[key] > simulation.genes[key] ? "+" : ""}${draft[key] - simulation.genes[key]}`}
                          </small>
                        </span>
                      </label>
                      <input
                        id={`gene-${key}`}
                        type="range"
                        min="10"
                        max={traitCeiling}
                        step="1"
                        value={draft[key]}
                        style={
                          {
                            "--range-value": `${((draft[key] - 10) / (traitCeiling - 10)) * 100}%`,
                          } as React.CSSProperties
                        }
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: Number(e.target.value) })
                        }
                      />
                      <p>{description}</p>
                    </div>
                  ))}
                  <div className="adaptation-heading">
                    <h3>A little something extra</h3>
                    <span>02 — ADAPTATION</span>
                  </div>
                  <div className="adaptation-options">
                    {adaptations.map(({ value, title, detail, icon: Icon }) => (
                      <button
                        key={value}
                        className={draft.adaptation === value ? "selected" : ""}
                        onClick={() =>
                          setDraft({ ...draft, adaptation: value })
                        }
                      >
                        <Icon size={20} />
                        <strong>{title}</strong>
                        <small>{detail}</small>
                        {draft.adaptation === value && (
                          <Check className="option-check" size={12} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="text-link"
                  onClick={() => setDraft({ ...simulation.genes })}
                >
                  <RotateCcw size={14} />
                  Reset changes
                </button>
                <div className="mutation-total">
                  <span>
                    {cost > 0 ? "Mutation cost" : "Ready to experiment"}
                    <strong>{cost.toLocaleString()} DNA</strong>
                  </span>
                  <span className={cost > simulation.dna ? "not-enough" : ""}>
                    {Math.floor(simulation.dna)} available
                  </span>
                  <button
                    className="primary-button"
                    disabled={cost === 0 || cost > simulation.dna}
                    onClick={applyMutation}
                  >
                    Apply mutation
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="lab-footnote">
                  {cost > simulation.dna
                    ? `You need more DNA. Feeding earns DNA and each generation grants ${simulation.generationReward} points.`
                    : "Higher levels cost more DNA and give gradual gains. The island pauses while you edit."}
                </div>
              </div>
            </section>
          )}
          {modal === "notes" && (
            <section
              className="modal notes-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="notes-title"
            >
              <div className="modal-header">
                <div>
                  <div className="eyebrow">
                    <Leaf size={13} />
                    OBSERVATIONS FROM THE ISLAND
                  </div>
                  <h2 id="notes-title">
                    Life leaves a little story<span>.</span>
                  </h2>
                </div>
                <button
                  className="icon-button"
                  data-autofocus
                  aria-label="Close field notes"
                  onClick={() => setModal(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="notes-summary">
                <div>
                  <strong>{number(simulation.generation)}</strong>
                  <span>Generations</span>
                </div>
                <div>
                  <strong>{number(simulation.births)}</strong>
                  <span>New lives</span>
                </div>
                <div>
                  <strong>{number(simulation.deaths)}</strong>
                  <span>Lives lost</span>
                </div>
                <div>
                  <strong>{timestamp(simulation.time)}</strong>
                  <span>World age</span>
                </div>
              </div>
              <div className="notes-list">
                {simulation.events.map((event) => (
                  <article className="note-event" key={event.id}>
                    <EventIcon event={event} />
                    <div>
                      <div>
                        <h3>{event.title}</h3>
                        <time>{timestamp(event.time)}</time>
                      </div>
                      <p>{event.description}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="notes-footer">
                <span className="live-dot" />
                Your field notes grow as your world does.
              </div>
            </section>
          )}
          {modal === "help" && (
            <section
              className="modal help-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-title"
            >
              <div className="modal-header">
                <div>
                  <div className="eyebrow">WELCOME TO VERDANT</div>
                  <h2 id="help-title">
                    Let’s see what life can become<span>.</span>
                  </h2>
                </div>
                <button
                  className="icon-button"
                  data-autofocus
                  aria-label="Close help"
                  onClick={() => setModal(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="help-steps">
                {[
                  {
                    icon: Compass,
                    title: "Watch a world come alive",
                    text: "Mosslings forage for berries, grow from juveniles into adults, and reproduce. Razorbacks hunt them and evolve every 45 world seconds.",
                  },
                  {
                    icon: Dna,
                    title: "Give evolution a little nudge",
                    text: "Change your traits in the creature lab. Reach a tier's trait limit, then spend DNA to open another 100 points per trait. Higher upgrades cost more, and new tiers improve DNA earnings. Your genome applies to every Mossling and their offspring.",
                  },
                  {
                    icon: Leaf,
                    title: "Follow your curiosity",
                    text: "Trade speed for armor, sense danger sooner, or try a dry season. Collect DNA from feeding and new generations, then experiment again.",
                  },
                ].map(({ icon: Icon, title, text }, i) => (
                  <div key={title}>
                    <span className="help-step-icon">
                      <Icon size={23} />
                    </span>
                    <div>
                      <small>0{i + 1}</small>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="keyboard-hints">
                <span>
                  <kbd>SPACE</kbd>Pause / play
                </span>
                <span>
                  <kbd>M</kbd>Creature lab
                </span>
                <span>
                  <kbd>R</kbd>Reset view
                </span>
              </div>
              <button className="primary-button" onClick={() => setModal(null)}>
                Let life unfold
                <ArrowRight size={17} />
              </button>
            </section>
          )}
          {modal === "new" && (
            <section
              className="modal new-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-title"
            >
              <div className="modal-header">
                <div>
                  <div className="eyebrow">ANOTHER LITTLE UNIVERSE</div>
                  <h2 id="new-title">
                    Start with possibility<span>.</span>
                  </h2>
                </div>
                <button
                  className="icon-button"
                  data-autofocus
                  aria-label="Close new world"
                  onClick={() => setModal(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <p className="new-description">
                A fresh island, 24 curious Mosslings, and 5 hungry Razorbacks.
                Your current experiment will be replaced.
              </p>
              <label className="world-seed">
                World seed
                <input
                  type="number"
                  min="1"
                  max="2147483647"
                  value={newSeed}
                  onChange={(e) =>
                    setNewSeed(
                      Math.max(1, Math.min(2147483647, Number(e.target.value))),
                    )
                  }
                />
                <button
                  className="icon-button"
                  aria-label="Randomize world seed"
                  onClick={() =>
                    setNewSeed(10000 + Math.floor(Math.random() * 90000))
                  }
                >
                  <RotateCcw size={16} />
                </button>
              </label>
              <div className="new-biomes">
                {(
                  [
                    {
                      value: "meadow",
                      name: "The meadow",
                      description: "Balanced and welcoming.",
                      icon: Sprout,
                    },
                    {
                      value: "lush",
                      name: "The rainforest",
                      description: "Food grows in abundance.",
                      icon: Leaf,
                    },
                    {
                      value: "drylands",
                      name: "The drylands",
                      description: "Survival takes a little more.",
                      icon: Wind,
                    },
                  ] as {
                    value: Biome;
                    name: string;
                    description: string;
                    icon: LucideIcon;
                  }[]
                ).map(({ value, name, description, icon: Icon }) => (
                  <button
                    key={value}
                    className={newBiome === value ? "selected" : ""}
                    onClick={() => setNewBiome(value)}
                  >
                    <Icon size={21} />
                    <span>
                      <strong>{name}</strong>
                      <small>{description}</small>
                    </span>
                    {newBiome === value && <Check size={17} />}
                  </button>
                ))}
              </div>
              <button className="primary-button" onClick={newWorld}>
                Grow a new world
                <ArrowRight size={17} />
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
