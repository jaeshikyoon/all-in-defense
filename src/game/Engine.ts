import {
  BUILDINGS,
  CRYO_SLOWED_SPEED_MULTIPLIER,
  ENEMIES,
  ENEMY_PHASE_INFO,
  getMapAssetFootprint,
  getStrongDamageMultiplier,
  getUnitDamage,
  GROUPS,
  LOOT_MILESTONES,
  PATH,
  PAYOUT,
  UNITS,
  WHEEL,
  type EnemyKind,
  type FloorKind,
  type MapAssetKind,
  type UnitKind,
} from "./data";
import {
  evaluateHand,
  shuffledDeck,
  type Card,
  type PokerResult,
} from "./poker";

export type RunState =
  "ready" | "builder" | "poker" | "deploy" | "running" | "wheel" | "defeat";
export type Unit = {
  id: number;
  kind: UnitKind;
  tier: number;
  x: number;
  y: number;
  cooldown: number;
  damageDone: number;
  moving?: { x: number; y: number };
  facing?: -1 | 1;
  attackUntil?: number;
};
type Enemy = {
  id: number;
  kind: EnemyKind;
  group: string;
  hp: number;
  maxHp: number;
  progress: number;
  slowUntil: number;
  route: number;
  lane: -1 | 0 | 1;
};
type EnemyQueueEntry = {
  kind: EnemyKind;
  group: string;
  squad?: number;
};
export type Shot = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
  life: number;
  kind: UnitKind;
  facing: -1 | 1;
};
export type BattleEffect = {
  id: number;
  kind: "hit" | "death" | "blast" | "freeze" | "reward";
  x: number;
  y: number;
  life: number;
  color: number;
  value?: number;
};
export type AudioEvent = {
  id: number;
  kind:
    | "shot"
    | "heavy"
    | "freeze"
    | "tesla"
    | "kill"
    | "boss"
    | "win"
    | "lose"
    | "buy"
    | "merge"
    | "wheel";
};
export type LootOpportunity = {
  pot: number;
  safe: number;
  expires: number;
  protected: boolean;
  milestone: number;
};
export type MapObject = {
  id: number;
  kind: MapAssetKind;
  x: number;
  y: number;
};
export type MapData = {
  width: number;
  height: number;
  seed: number;
  objects: { kind: MapAssetKind; x: number; y: number }[];
  routes: [number, number][][];
  routeStartPhases: number[];
};

export type Snapshot = {
  state: RunState;
  points: number;
  gate: number;
  remaining: number;
  active: number;
  kills: number;
  units: number;
  selected: number | null;
  selectedCount: number;
  selectedUnit?: Unit;
  placing: UnitKind | null;
  currentGroup: string;
  nextGroup: string | null;
  groupEta: number;
  bossActive: boolean;
  elapsed: number;
  paused: boolean;
  message?: string;
  loot: LootOpportunity | null;
  wheelMode: "points" | "loot";
  tutorial: string;
  totalDamage: number;
  spins: number;
  wheelWins: number;
  buildMode: boolean;
  buildTool: MapAssetKind | "erase" | "path" | "exit" | null;
  buildCount: number;
  pathPoints: [number, number][];
  routes: [number, number][][];
  routeStartPhases: number[];
  activeRoute: number;
  pathEditing: boolean;
  mapWidth: number;
  mapHeight: number;
  mapSeed: number;
  phase: number;
  bestKills: number;
  phaseSpawned: number;
  phaseTotal: number;
  phaseTimeRemaining: number;
  timeScale: 1 | 2 | 4;
  hand: Card[];
  discarded: number[];
  pokerResult: PokerResult | null;
  pendingUnits: { kind: UnitKind; tier: 1 | 2 | 3 | 4 }[];
};

export const PHASE_COMBAT_SECONDS = 30;
export const PHASE_ENEMY_COUNT = 72;
const PHASE_FIRST_SPAWN_DELAY_SECONDS = 0.15;
const MIDGAME_PRESSURE_START_PHASE = 10;
const MAX_COMPOSITION_PROMOTION_RATE = 0.65;
const LATE_HEALTH_ACCELERATION = 0.006;
const PROMOTABLE_ENEMY_KINDS = new Set<EnemyKind>([
  "grunt",
  "runner",
  "drone",
  "sapper",
  "phantom",
]);
const ENEMY_SPAWN_PROFILE: Record<
  EnemyKind,
  { groupSize: number; memberInterval: number; rest: number }
> = {
  grunt: { groupSize: 12, memberInterval: 0.16, rest: 1.7 },
  runner: { groupSize: 8, memberInterval: 0.11, rest: 1.35 },
  drone: { groupSize: 6, memberInterval: 0.15, rest: 1.45 },
  sapper: { groupSize: 5, memberInterval: 0.18, rest: 1.65 },
  phantom: { groupSize: 6, memberInterval: 0.13, rest: 1.5 },
  armored: { groupSize: 4, memberInterval: 0.26, rest: 1.9 },
  brute: { groupSize: 3, memberInterval: 0.3, rest: 2.05 },
  phase_tracker: { groupSize: 4, memberInterval: 0.18, rest: 1.75 },
  elite: { groupSize: 3, memberInterval: 0.3, rest: 2.1 },
  juggernaut: { groupSize: 2, memberInterval: 0.4, rest: 2.3 },
  warden: { groupSize: 2, memberInterval: 0.44, rest: 2.45 },
  boss: { groupSize: 1, memberInterval: 0, rest: 2.8 },
};

const tierRange = [1, 1, 1.05, 1.1, 1.15];
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const pointOnPolyline = (
  route: [number, number][],
  lengths: number[],
  distanceAlongRoute: number,
) => {
  const total = lengths.at(-1) ?? 0,
    d = Math.max(0, Math.min(total, distanceAlongRoute));
  let segment = 1;
  while (segment < lengths.length && lengths[segment] < d) segment++;
  const a = route[Math.max(0, segment - 1)],
    b = route[Math.min(segment, route.length - 1)],
    start = lengths[Math.max(0, segment - 1)],
    length = Math.max(0.001, (lengths[segment] ?? total) - start),
    t = Math.max(0, Math.min(1, (d - start) / length));
  return {
    x: a[0] + (b[0] - a[0]) * t,
    y: a[1] + (b[1] - a[1]) * t,
  };
};
export const ENEMY_WORLD_SPEED_SCALE = 0.26496;
const NORMAL_TRAVEL_SECONDS = 48,
  BOSS_TRAVEL_SECONDS = 84,
  REFERENCE_ROUTE_LENGTH = PATH.slice(1).reduce(
    (total, point, index) =>
      total +
      Math.hypot(point[0] - PATH[index][0], point[1] - PATH[index][1]),
    0,
  ),
  NORMAL_WORLD_SPEED =
    (REFERENCE_ROUTE_LENGTH / NORMAL_TRAVEL_SECONDS) * ENEMY_WORLD_SPEED_SCALE,
  BOSS_WORLD_SPEED =
    (REFERENCE_ROUTE_LENGTH / BOSS_TRAVEL_SECONDS) * ENEMY_WORLD_SPEED_SCALE;
const UNIT_PLACEMENT_SPACING = 1.4,
  GROUP_FORMATION_SPACING = 2.1;
const MIN_MAP_WIDTH = 24,
  MIN_MAP_HEIGHT = 20,
  MAX_MAP_WIDTH = 200,
  MAX_MAP_HEIGHT = 160;

export class GameEngine {
  units: Unit[] = [];
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  effects: BattleEffect[] = [];
  audioEvents: AudioEvent[] = [];
  listeners = new Set<() => void>();
  mapListeners = new Set<(map: MapData) => void>();
  state: RunState = "ready";
  points = 0;
  gate = 0;
  kills = 0;
  elapsed = 0;
  totalDamage = 0;
  selected: number | null = null;
  selectedIds: number[] = [];
  placing: UnitKind | null = null;
  nextId = 1;
  queue: EnemyQueueEntry[] = [];
  phaseSpawnTimes: number[] = [];
  spawned = 0;
  bossSpawned = false;
  bossDefeated = false;
  lastSnapshot = 0;
  lastAttackAudioAt = new Map<AudioEvent["kind"], number>();
  message = "";
  messageUntil = 0;
  routes: [number, number][][] = [PATH.map((p) => [p[0], p[1]])];
  routeStartPhases: number[] = [1];
  activeRoute = 0;
  routeLengths: number[][] = [];
  routeTotals: number[] = [];
  mapWidth = 52;
  mapHeight = 46;
  mapSeed = 0xa11def;
  lastSpawnedGroup = "선봉";
  groupBreak = 0;
  previewedGroups = new Set<string>();
  lootIndex = 0;
  lootOpportunity: LootOpportunity | null = null;
  wheelMode: "points" | "loot" = "points";
  spins = 0;
  wheelWins = 0;
  overdriveUntil = 0;
  mapObjects: MapObject[] = [];
  buildMode = false;
  buildTool: MapAssetKind | "erase" | "path" | "exit" | null = null;
  nextMapId = 10000;
  pathEditing = false;
  pathBackup: [number, number][] = [];
  pathWasNew = false;
  lastPaintKey = "";
  mapDirty = false;
  floorCells = new Map<string, MapObject>();
  assetCells = new Map<string, MapObject>();
  mapById = new Map<number, MapObject>();
  mapRevision = 1;
  mapResetPending = true;
  changedMapIds = new Set<number>();
  removedMapIds = new Set<number>();
  phase = 0;
  bestKills = 0;
  phaseSpawned = 0;
  phaseTotal = 0;
  phaseEnding = 0;
  phaseElapsed = 0;
  timeScale: 1 | 2 | 4 = 1;
  uiPaused = false;
  deck: Card[] = [];
  hand: Card[] = [];
  discarded = new Set<number>();
  pokerResult: PokerResult | null = null;
  pendingUnits: { kind: UnitKind; tier: 1 | 2 | 3 | 4 }[] = [];

  get pathPoints() {
    return this.routes[this.activeRoute] ?? [];
  }
  set pathPoints(points: [number, number][]) {
    this.routes[this.activeRoute] = points;
  }
  constructor() {
    this.loadMap();
    try {
      if (typeof localStorage !== "undefined")
        this.bestKills =
          Number(localStorage.getItem("all-in-defense-best-kills")) || 0;
    } catch {
      /* 저장소 없이도 플레이 가능 */
    }
    this.normalizeMapObjects();
    this.syncRouteStartPhases();
    this.computePath();
    this.reset();
  }
  computePath() {
    this.routeLengths = [];
    this.routeTotals = [];
    for (const route of this.routes) {
      let total = 0;
      const lengths = [0];
      for (let i = 1; i < route.length; i++) {
        total += Math.hypot(
          route[i][0] - route[i - 1][0],
          route[i][1] - route[i - 1][1],
        );
        lengths.push(total);
      }
      this.routeLengths.push(lengths);
      this.routeTotals.push(total);
    }
  }
  syncRouteStartPhases() {
    this.routeStartPhases = this.routes.map((_, index) =>
      Math.max(1, Math.min(999, Math.round(this.routeStartPhases[index] ?? 1))),
    );
    if (
      this.routeStartPhases.length &&
      this.routeStartPhases.every((phase) => phase > 1)
    )
      this.routeStartPhases[0] = 1;
  }
  reset() {
    this.uiPaused = false;
    this.state = "ready";
    this.points = 0;
    this.gate = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.totalDamage = 0;
    this.selected = null;
    this.selectedIds = [];
    this.placing = null;
    this.buildMode = false;
    this.buildTool = null;
    this.pathEditing = false;
    this.pathBackup = [];
    this.pathWasNew = false;
    this.lastPaintKey = "";
    this.enemies = [];
    this.shots = [];
    this.effects = [];
    this.audioEvents = [];
    this.lastAttackAudioAt.clear();
    this.units = [];
    this.queue = [];
    this.phaseSpawnTimes = [];
    this.phase = 0;
    this.phaseSpawned = 0;
    this.phaseTotal = 0;
    this.phaseEnding = 0;
    this.phaseElapsed = 0;
    this.timeScale = 1;
    this.deck = [];
    this.hand = [];
    this.discarded.clear();
    this.pokerResult = null;
    this.pendingUnits = [];
    this.spawned = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.message = "";
    this.messageUntil = 0;
    this.lastSpawnedGroup = "선봉";
    this.groupBreak = 0;
    this.previewedGroups = new Set();
    this.lootIndex = 0;
    this.lootOpportunity = null;
    this.wheelMode = "points";
    this.spins = 0;
    this.wheelWins = 0;
    this.overdriveUntil = 0;
    this.emit(true);
  }
  loadMap() {
    const defaults: [MapAssetKind, number, number][] = [
      ["command_tent", 5, 39],
      ["watchtower", 15, 39],
      ["sandbags", 23, 42],
      ["radar", 36, 41],
      ["generator", 47, 4],
      ["medic_station", 3, 18],
      ["antenna", 31, 4],
      ["lamp_post", 46, 28],
      ["rock_outcrop", 10, 2],
      ["grass_patch", 25, 3],
      ["dirt_mound", 40, 4],
      ["crater", 18, 29],
      ["mud_puddle", 43, 32],
      ["ruin_slab", 12, 34],
      ["shrubs", 35, 44],
      ["road_plate", 27, 20],
    ];
    try {
      if (typeof localStorage !== "undefined") {
        const raw3 = localStorage.getItem("all-in-defense-map-v3"),
          rawOld =
            localStorage.getItem("all-in-defense-map-v2") ??
            localStorage.getItem("all-in-defense-map-v1"),
          saved = JSON.parse(raw3 ?? rawOld ?? "null"),
          objects = Array.isArray(saved) ? saved : saved?.objects;
        if (saved && Array.isArray(objects)) {
          this.mapWidth = Math.max(
            MIN_MAP_WIDTH,
            Math.min(MAX_MAP_WIDTH, Math.round((saved.width ?? 52) / 2) * 2),
          );
          this.mapHeight = Math.max(
            MIN_MAP_HEIGHT,
            Math.min(MAX_MAP_HEIGHT, Math.round((saved.height ?? 46) / 2) * 2),
          );
          this.mapSeed = Number.isFinite(saved.seed)
            ? Number(saved.seed) >>> 0
            : 0xa11def;
          this.mapObjects = objects
            .filter(
              (o) =>
                o &&
                BUILDINGS[o.kind as MapAssetKind] &&
                Number.isFinite(o.x) &&
                Number.isFinite(o.y),
            )
            .map((o) => ({
              id: this.nextMapId++,
              kind: o.kind as MapAssetKind,
              x: o.x,
              y: o.y,
            }));
          const savedRoutes = Array.isArray(saved.routes)
            ? saved.routes
            : Array.isArray(saved.path)
              ? [saved.path]
              : null;
          if (savedRoutes?.length)
            this.routes = savedRoutes
              .map((route: number[][]) =>
                route
                  .filter((p) => Array.isArray(p) && p.length >= 2)
                  .map((p) => [Number(p[0]), Number(p[1])]),
              )
              .filter((r: [number, number][]) => r.length >= 2);
          if (Array.isArray(saved.routeStartPhases))
            this.routeStartPhases = saved.routeStartPhases.map((phase: unknown) =>
              Number.isFinite(Number(phase)) ? Number(phase) : 1,
            );
          if (!raw3) this.ensureFloorCoverage("floor_grass");
          return;
        }
      }
    } catch {
      /* 손상된 저장 데이터는 기본 배치로 복구 */
    }
    this.mapObjects = defaults.map(([kind, x, y]) => ({
      id: this.nextMapId++,
      kind,
      x,
      y,
    }));
    this.ensureFloorCoverage("floor_grass");
  }
  saveMap() {
    this.mapDirty = false;
    const map = this.exportMapData();
    try {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(
          "all-in-defense-map-v3",
          JSON.stringify(map),
        );
    } catch {
      /* 저장소를 사용할 수 없어도 플레이는 계속 */
    }
    this.mapListeners.forEach((listener) => listener(map));
  }
  exportMapData(): MapData {
    return {
      width: this.mapWidth,
      height: this.mapHeight,
      seed: this.mapSeed,
      objects: this.mapObjects.map(({ kind, x, y }) => ({ kind, x, y })),
      routes: this.routes.map((route) => route.map(([x, y]) => [x, y])),
      routeStartPhases: [...this.routeStartPhases],
    };
  }
  applyMapData(map: MapData) {
    this.mapWidth = Math.max(
      MIN_MAP_WIDTH,
      Math.min(MAX_MAP_WIDTH, Math.round(Number(map.width) / 2) * 2),
    );
    this.mapHeight = Math.max(
      MIN_MAP_HEIGHT,
      Math.min(MAX_MAP_HEIGHT, Math.round(Number(map.height) / 2) * 2),
    );
    this.mapSeed = Number.isFinite(map.seed) ? Number(map.seed) >>> 0 : 0xa11def;
    this.mapObjects = (Array.isArray(map.objects) ? map.objects : [])
      .filter(
        (object) =>
          object &&
          BUILDINGS[object.kind] &&
          Number.isFinite(object.x) &&
          Number.isFinite(object.y),
      )
      .map(({ kind, x, y }) => ({ id: this.nextMapId++, kind, x, y }));
    const routes = (Array.isArray(map.routes) ? map.routes : [])
      .map((route) =>
        route
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .map(([x, y]) => [Number(x), Number(y)] as [number, number]),
      )
      .filter((route) => route.length >= 2);
    if (routes.length)
      this.routes = routes.map((route) => this.normalizeRoutePoints(route));
    this.routeStartPhases = Array.isArray(map.routeStartPhases)
      ? map.routeStartPhases.map((phase) => Number(phase) || 1)
      : this.routes.map(() => 1);
    this.normalizeMapObjects();
    this.syncRouteStartPhases();
    this.computePath();
    this.selected = null;
    this.selectedIds = [];
    this.emit(true);
  }
  subscribeMap(listener: (map: MapData) => void) {
    this.mapListeners.add(listener);
    return () => {
      this.mapListeners.delete(listener);
    };
  }
  setBestKills(value: number) {
    this.bestKills = Math.max(0, Math.round(value));
    this.emit(true);
  }
  cellKey(x: number, y: number) {
    return `${x}:${y}`;
  }
  assetFootprintCells(x: number, y: number, kind: MapAssetKind) {
    const [width, height] = getMapAssetFootprint(kind),
      left = x - width,
      top = y - height,
      cells: { x: number; y: number }[] = [];
    for (let column = 0; column < width; column++)
      for (let row = 0; row < height; row++)
        cells.push({ x: left + column * 2, y: top + row * 2 });
    return cells;
  }
  normalizeMapObjects() {
    const floors = new Map<string, MapObject>(),
      assets = new Map<string, MapObject>(),
      acceptedAssets: MapObject[] = [];
    for (const object of this.mapObjects) {
      const p = this.snapAssetPoint(object.x, object.y, object.kind);
      object.x = p.x;
      object.y = p.y;
      if (BUILDINGS[object.kind].category === "floor") {
        floors.set(this.cellKey(p.x, p.y), object);
        continue;
      }
      const cells = this.assetFootprintCells(p.x, p.y, object.kind);
      if (cells.some((cell) => assets.has(this.cellKey(cell.x, cell.y))))
        continue;
      for (const cell of cells) assets.set(this.cellKey(cell.x, cell.y), object);
      acceptedAssets.push(object);
    }
    this.floorCells = floors;
    this.assetCells = assets;
    this.mapObjects = [...floors.values(), ...acceptedAssets];
    this.mapById = new Map(this.mapObjects.map((o) => [o.id, o]));
    this.markMapReset();
  }
  rebuildMapIndexes() {
    this.floorCells.clear();
    this.assetCells.clear();
    this.mapById.clear();
    for (const object of this.mapObjects) {
      if (BUILDINGS[object.kind].category === "floor")
        this.floorCells.set(this.cellKey(object.x, object.y), object);
      else
        for (const cell of this.assetFootprintCells(
          object.x,
          object.y,
          object.kind,
        ))
          this.assetCells.set(this.cellKey(cell.x, cell.y), object);
      this.mapById.set(object.id, object);
    }
  }
  markMapReset() {
    this.mapRevision++;
    this.mapResetPending = true;
    this.changedMapIds.clear();
    this.removedMapIds.clear();
  }
  markMapChanged(object: MapObject) {
    this.mapRevision++;
    this.changedMapIds.add(object.id);
  }
  markMapRemoved(id: number) {
    this.mapRevision++;
    this.removedMapIds.add(id);
    this.changedMapIds.delete(id);
  }
  consumeMapChanges() {
    if (this.mapResetPending) {
      this.mapResetPending = false;
      this.changedMapIds.clear();
      this.removedMapIds.clear();
      return { reset: true, changed: this.mapObjects, removed: [] as number[] };
    }
    const changed = [...this.changedMapIds]
        .map((id) => this.mapById.get(id))
        .filter((o): o is MapObject => !!o),
      removed = [...this.removedMapIds];
    this.changedMapIds.clear();
    this.removedMapIds.clear();
    return { reset: false, changed, removed };
  }
  ensureFloorCoverage(kind: FloorKind) {
    const occupied = new Set(
      this.mapObjects
        .filter((o) => BUILDINGS[o.kind].category === "floor")
        .map((o) => `${o.x}:${o.y}`),
    );
    for (let x = 0; x < this.mapWidth; x += 2)
      for (let y = 0; y < this.mapHeight; y += 2)
        if (!occupied.has(`${x}:${y}`))
          this.mapObjects.push({ id: this.nextMapId++, kind, x, y });
  }
  fillFloor(kind: FloorKind) {
    if (this.state !== "builder") return;
    this.mapObjects = this.mapObjects.filter(
      (o) => BUILDINGS[o.kind].category !== "floor",
    );
    for (let x = 0; x < this.mapWidth; x += 2)
      for (let y = 0; y < this.mapHeight; y += 2)
        this.mapObjects.push({ id: this.nextMapId++, kind, x, y });
    this.rebuildMapIndexes();
    this.markMapReset();
    this.saveMap();
    this.setMessage(`${BUILDINGS[kind].name} 재질로 전체 바닥 채우기 완료`);
    this.emit(true);
  }
  clearFloor() {
    if (this.state !== "builder") return;
    this.mapObjects = this.mapObjects.filter(
      (o) => BUILDINGS[o.kind].category !== "floor",
    );
    this.rebuildMapIndexes();
    this.markMapReset();
    this.saveMap();
    this.emit(true);
  }
  resizeMap(width: number, height: number) {
    if (this.state !== "builder") return;
    const currentFloor = (this.mapObjects.find(
      (o) => BUILDINGS[o.kind].category === "floor",
    )?.kind ?? "floor_grass") as FloorKind;
    this.mapWidth = Math.max(
      MIN_MAP_WIDTH,
      Math.min(MAX_MAP_WIDTH, Math.round(width / 2) * 2),
    );
    this.mapHeight = Math.max(
      MIN_MAP_HEIGHT,
      Math.min(MAX_MAP_HEIGHT, Math.round(height / 2) * 2),
    );
    this.mapObjects = this.mapObjects.filter(
      (o) =>
        o.x >= 0 && o.y >= 0 && o.x < this.mapWidth && o.y < this.mapHeight,
    );
    this.routes = this.routes.map((route) =>
      this.normalizeRoutePoints(
        route.map(
          ([x, y]) =>
            [
              Math.max(1, Math.min(this.mapWidth - 1, x)),
              Math.max(1, Math.min(this.mapHeight - 1, y)),
            ] as [number, number],
        ),
      ),
    );
    this.ensureFloorCoverage(currentFloor);
    this.normalizeMapObjects();
    this.computePath();
    this.saveMap();
    this.setMessage(`맵 크기 ${this.mapWidth} × ${this.mapHeight}`);
    this.emit(true);
  }
  enterBuilder() {
    if (this.state !== "ready") return;
    this.state = "builder";
    this.buildMode = true;
    this.buildTool = "command_tent";
    this.setMessage("건물·지형을 배치하거나 적 이동 경로를 다시 그리세요");
    this.emit(true);
  }
  exitBuilder() {
    if (this.state !== "builder") return;
    if (this.pathEditing) this.cancelPathEdit();
    this.endPaintStroke();
    this.state = "ready";
    this.buildMode = false;
    this.buildTool = null;
    this.emit(true);
  }
  chooseBuildTool(tool: MapAssetKind | "erase") {
    if (this.state !== "builder") return;
    this.endPaintStroke();
    if (this.pathEditing) this.cancelPathEdit();
    this.buildTool = tool;
    this.lastPaintKey = "";
    this.setMessage(
      tool === "erase"
        ? "철거할 에셋을 클릭하거나 드래그하세요"
        : `${BUILDINGS[tool].name} · 클릭 또는 드래그로 연속 배치`,
    );
    this.emit(true);
  }
  beginPaintStroke() {
    this.lastPaintKey = "";
  }
  endPaintStroke() {
    if (this.mapDirty) this.saveMap();
  }
  selectRoute(index: number) {
    if (this.state !== "builder" || this.pathEditing || !this.routes[index])
      return;
    this.activeRoute = index;
    this.buildTool = null;
    this.emit(true);
  }
  beginPathEdit(newRoute = false) {
    if (this.state !== "builder" || this.pathEditing) return;
    this.pathWasNew = newRoute;
    if (newRoute) {
      this.routes.push([]);
      this.routeStartPhases.push(1);
      this.activeRoute = this.routes.length - 1;
      this.pathBackup = [];
    } else this.pathBackup = this.pathPoints.map((p) => [p[0], p[1]]);
    this.pathPoints = [];
    this.pathEditing = true;
    this.buildTool = "path";
    this.setMessage(
      newRoute
        ? "새 입구를 찍고 기존 길 가까이를 클릭해 합류시키세요"
        : "입구부터 원하는 출구까지 경유점을 차례대로 그리세요",
    );
    this.emit(true);
  }
  beginExitMove() {
    if (this.state !== "builder" || this.pathEditing) return;
    this.buildTool = "exit";
    this.setMessage("전장에서 공통 출구를 둘 위치를 클릭하세요");
    this.emit(true);
  }
  setRouteStartPhase(index: number, phase: number) {
    if (
      this.state !== "builder" ||
      this.pathEditing ||
      !this.routes[index]
    )
      return;
    this.syncRouteStartPhases();
    const nextPhase = Math.max(
      1,
      Math.min(999, Math.round(phase)),
    );
    if (
      nextPhase > 1 &&
      this.routeStartPhases.every(
        (startPhase, routeIndex) => routeIndex === index || startPhase > 1,
      )
    ) {
      this.setMessage("PHASE 1에 열리는 입구가 최소 하나는 필요합니다");
      this.emit(true);
      return;
    }
    this.routeStartPhases[index] = nextPhase;
    this.saveMap();
    this.setMessage(
      `입구 ${index + 1} · PHASE ${this.routeStartPhases[index]}부터 적 투입`,
    );
    this.emit(true);
  }
  deleteRoute(index: number) {
    if (this.state !== "builder" || this.pathEditing || this.routes.length <= 1)
      return;
    this.routes.splice(index, 1);
    this.routeStartPhases.splice(index, 1);
    this.activeRoute = Math.max(
      0,
      Math.min(this.activeRoute, this.routes.length - 1),
    );
    this.computePath();
    this.saveMap();
    this.emit(true);
  }
  undoPathPoint() {
    if (this.pathEditing && this.pathPoints.length) {
      this.pathPoints.pop();
      this.emit(true);
    }
  }
  snapPathPoint(x: number, y: number): [number, number] {
    return [
      Math.max(1, Math.min(this.mapWidth - 1, Math.floor(x / 2) * 2 + 1)),
      Math.max(1, Math.min(this.mapHeight - 1, Math.floor(y / 2) * 2 + 1)),
    ];
  }
  normalizeRoutePoints(points: [number, number][]) {
    const normalized: [number, number][] = [];
    for (const [x, y] of points) {
      const point = this.snapPathPoint(x, y),
        previous = normalized.at(-1);
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1])
        normalized.push(point);
    }
    return normalized;
  }
  finishPathEdit() {
    if (!this.pathEditing) return;
    this.pathPoints = this.normalizeRoutePoints(this.pathPoints);
    if (!this.pathPoints.length) {
      this.setMessage("이동 경로에는 입구 지점이 필요합니다");
      return;
    }
    if (this.pathPoints.length < 2) {
      this.setMessage("이동 경로에는 최소 2개의 지점이 필요합니다");
      return;
    }
    if (this.pathWasNew) {
      const exit = this.pathPoints.at(-1),
        sharesExit = this.routes.some(
          (route, index) =>
            index !== this.activeRoute &&
            route.length >= 2 &&
            exit &&
            distance(
              { x: exit[0], y: exit[1] },
              { x: route.at(-1)![0], y: route.at(-1)![1] },
            ) < 0.05,
        );
      if (!sharesExit) {
        this.setMessage(
          "추가 입구 경로는 기존 길에 스냅해 공통 출구로 합류시켜야 합니다",
        );
        return;
      }
    }
    this.pathEditing = false;
    this.pathBackup = [];
    this.pathWasNew = false;
    this.buildTool = null;
    this.computePath();
    this.saveMap();
    this.setMessage(
      `경로 ${this.activeRoute + 1} · ${this.pathPoints.length}개 지점 저장 완료`,
    );
    this.emit(true);
  }
  findPathSnap(x: number, y: number, maxDistance = 2.4) {
    if (!this.pathEditing || !this.pathPoints.length) return null;
    const [cellX, cellY] = this.snapPathPoint(x, y);
    let best: {
      x: number;
      y: number;
      routeIndex: number;
      segmentIndex: number;
      t: number;
      distance: number;
    } | null = null;
    for (let routeIndex = 0; routeIndex < this.routes.length; routeIndex++) {
      if (routeIndex === this.activeRoute) continue;
      const route = this.routes[routeIndex];
      for (let segmentIndex = 0; segmentIndex < route.length - 1; segmentIndex++) {
        const a = route[segmentIndex],
          b = route[segmentIndex + 1],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          lengthSquared = dx * dx + dy * dy,
          t =
            lengthSquared > 0
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    ((cellX - a[0]) * dx + (cellY - a[1]) * dy) /
                      lengthSquared,
                  ),
                )
              : 0,
          px = a[0] + dx * t,
          py = a[1] + dy * t,
          snapDistance = Math.hypot(cellX - px, cellY - py);
        if (
          snapDistance <= maxDistance &&
          (!best || snapDistance < best.distance)
        )
          best = {
            x: cellX,
            y: cellY,
            routeIndex,
            segmentIndex,
            t,
            distance: snapDistance,
          };
      }
    }
    return best;
  }
  connectPathToSnap(snap: NonNullable<ReturnType<GameEngine["findPathSnap"]>>) {
    const source = this.routes[snap.routeIndex],
      junction: [number, number] = [snap.x, snap.y],
      last = this.pathPoints.at(-1);
    if (!last || distance({ x: last[0], y: last[1] }, { x: snap.x, y: snap.y }) > 0.05)
      this.pathPoints.push(junction);
    const segmentStart = source[snap.segmentIndex],
      segmentEnd = source[snap.segmentIndex + 1];
    let tailIndex = snap.segmentIndex + 1;
    if (
      junction[0] !== segmentStart[0] ||
      junction[1] !== segmentStart[1]
    ) {
      if (junction[0] !== segmentEnd[0] || junction[1] !== segmentEnd[1])
        source.splice(tailIndex, 0, [junction[0], junction[1]]);
    } else tailIndex = snap.segmentIndex;
    for (const point of source.slice(tailIndex)) {
      const tail = this.pathPoints.at(-1)!;
      if (distance({ x: tail[0], y: tail[1] }, { x: point[0], y: point[1] }) > 0.05)
        this.pathPoints.push([point[0], point[1]]);
    }
    const mergedRoute = snap.routeIndex + 1;
    this.finishPathEdit();
    if (!this.pathEditing) {
      this.setMessage(`기존 경로 ${mergedRoute}에 합류해 공통 출구까지 연결했습니다`);
      this.emit(true);
    }
  }
  cancelPathEdit() {
    if (!this.pathEditing) return;
    if (this.pathWasNew) {
      this.routes.splice(this.activeRoute, 1);
      this.routeStartPhases.splice(this.activeRoute, 1);
      this.activeRoute = Math.max(0, this.routes.length - 1);
    } else this.pathPoints = this.pathBackup.map((p) => [p[0], p[1]]);
    this.pathBackup = [];
    this.pathEditing = false;
    this.pathWasNew = false;
    this.buildTool = null;
    this.computePath();
    this.emit(true);
  }
  snapAssetPoint(x: number, y: number, kind: MapAssetKind) {
    const floor = BUILDINGS[kind].category === "floor",
      [width, height] = getMapAssetFootprint(kind);
    return floor
      ? {
          x: Math.max(0, Math.min(this.mapWidth - 2, Math.floor(x / 2) * 2)),
          y: Math.max(0, Math.min(this.mapHeight - 2, Math.floor(y / 2) * 2)),
        }
      : {
          x: Math.max(
            width,
            Math.min(
              this.mapWidth - width,
              Math.floor(x / 2) * 2 + (width % 2),
            ),
          ),
          y: Math.max(
            height,
            Math.min(
              this.mapHeight - height,
              Math.floor(y / 2) * 2 + (height % 2),
            ),
          ),
        };
  }
  validBuildCell(
    x: number,
    y: number,
    kind: MapAssetKind,
    ignoredAssetId?: number,
  ) {
    const spec = BUILDINGS[kind],
      radius = spec.radius;
    if (spec.category === "floor")
      return (
        x >= 0 && y >= 0 && x <= this.mapWidth - 2 && y <= this.mapHeight - 2
      );
    if (
      x < 1 ||
      y < 1 ||
      x >= this.mapWidth ||
      y >= this.mapHeight ||
      this.assetFootprintCells(x, y, kind).some((cell) => {
        const occupant = this.assetCells.get(this.cellKey(cell.x, cell.y));
        return Boolean(occupant && occupant.id !== ignoredAssetId);
      })
    )
      return false;
    if (
      spec.category === "structure" &&
      this.units.some((u) => distance(u, { x, y }) < radius + 1)
    )
      return false;
    if (spec.category === "structure")
      for (let r = 0; r < this.routes.length; r++)
        for (let i = 0; i < 240; i++)
          if (distance(this.pointAt(i / 239, r, 0), { x, y }) < radius + 2.5)
            return false;
    return true;
  }
  nearestValidBuildCell(x: number, y: number, kind: MapAssetKind) {
    const base = this.snapAssetPoint(x, y, kind),
      spec = BUILDINGS[kind];
    if (spec.category === "floor")
      return this.validBuildCell(base.x, base.y, kind) ? base : null;
    const clickedCellX = Math.max(
        0,
        Math.min(this.mapWidth - 2, Math.floor(x / 2) * 2),
      ),
      clickedCellY = Math.max(
        0,
        Math.min(this.mapHeight - 2, Math.floor(y / 2) * 2),
      ),
      replacedAsset = this.assetCells.get(
        this.cellKey(clickedCellX, clickedCellY),
      );
    if (this.validBuildCell(base.x, base.y, kind, replacedAsset?.id))
      return base;
    if (replacedAsset) return null;

    // A multi-cell asset can be clicked one cell beside an occupied footprint.
    // Search nearby grid anchors so an adjacent placement snaps to the next
    // complete footprint instead of appearing unavailable.
    const candidates: { x: number; y: number; distance: number }[] = [];
    for (let offsetX = -3; offsetX <= 3; offsetX++)
      for (let offsetY = -3; offsetY <= 3; offsetY++) {
        if (offsetX === 0 && offsetY === 0) continue;
        const candidate = this.snapAssetPoint(
          base.x + offsetX * 2,
          base.y + offsetY * 2,
          kind,
        );
        if (
          (candidate.x === base.x && candidate.y === base.y) ||
          !this.validBuildCell(candidate.x, candidate.y, kind)
        )
          continue;
        const distance = Math.hypot(
          candidate.x - base.x,
          candidate.y - base.y,
        );
        if (
          !candidates.some(
            (entry) => entry.x === candidate.x && entry.y === candidate.y,
          )
        )
          candidates.push({ ...candidate, distance });
      }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]
      ? { x: candidates[0].x, y: candidates[0].y }
      : null;
  }
  mapObjectAt(x: number, y: number) {
    const floorX = Math.max(
        0,
        Math.min(this.mapWidth - 2, Math.floor(x / 2) * 2),
      ),
      floorY = Math.max(0, Math.min(this.mapHeight - 2, Math.floor(y / 2) * 2));
    return (
      this.assetCells.get(this.cellKey(floorX, floorY)) ??
      this.floorCells.get(this.cellKey(floorX, floorY))
    );
  }
  paintMapAsset(x: number, y: number) {
    if (
      this.state !== "builder" ||
      !this.buildTool ||
      this.buildTool === "path" ||
      this.buildTool === "exit"
    )
      return;
    if (this.buildTool === "erase") {
      const floorX = Math.max(
          0,
          Math.min(this.mapWidth - 2, Math.floor(x / 2) * 2),
        ),
        floorY = Math.max(
          0,
          Math.min(this.mapHeight - 2, Math.floor(y / 2) * 2),
        ),
        key = `erase:${floorX}:${floorY}`;
      if (key === this.lastPaintKey) return;
      this.lastPaintKey = key;
      const target = this.mapObjectAt(x, y);
      if (target) {
        this.mapObjects = this.mapObjects.filter((o) => o.id !== target.id);
        const cells =
          BUILDINGS[target.kind].category === "floor"
            ? this.floorCells
            : this.assetCells;
        if (BUILDINGS[target.kind].category === "floor")
          cells.delete(this.cellKey(target.x, target.y));
        else
          for (const cell of this.assetFootprintCells(
            target.x,
            target.y,
            target.kind,
          ))
            cells.delete(this.cellKey(cell.x, cell.y));
        this.mapById.delete(target.id);
        this.mapDirty = true;
        this.markMapRemoved(target.id);
        this.emit(true);
      }
      return;
    }
    const kind = this.buildTool,
      target = this.nearestValidBuildCell(x, y, kind);
    if (!target) return;
    const key = `${kind}:${target.x}:${target.y}`;
    if (key === this.lastPaintKey) return;
    this.lastPaintKey = key;
    if (BUILDINGS[kind].category === "floor") {
      const cell = this.cellKey(target.x, target.y),
        existing = this.floorCells.get(cell);
      if (existing) {
        if (existing.kind === kind) return;
        existing.kind = kind;
        this.markMapChanged(existing);
      } else {
        const object = { id: this.nextMapId++, kind, x: target.x, y: target.y };
        this.mapObjects.push(object);
        this.floorCells.set(cell, object);
        this.mapById.set(object.id, object);
        this.markMapChanged(object);
      }
      this.mapDirty = true;
      this.emit(true);
      return;
    }
    const clickedCellX = Math.max(
        0,
        Math.min(this.mapWidth - 2, Math.floor(x / 2) * 2),
      ),
      clickedCellY = Math.max(
        0,
        Math.min(this.mapHeight - 2, Math.floor(y / 2) * 2),
      ),
      existing = this.assetCells.get(
        this.cellKey(clickedCellX, clickedCellY),
      ),
      targetCells = this.assetFootprintCells(target.x, target.y, kind);
    if (existing) {
      if (
        existing.kind === kind &&
        existing.x === target.x &&
        existing.y === target.y
      )
        return;
      if (this.validBuildCell(target.x, target.y, kind, existing.id)) {
        for (const cell of this.assetFootprintCells(
          existing.x,
          existing.y,
          existing.kind,
        ))
          this.assetCells.delete(this.cellKey(cell.x, cell.y));
        existing.kind = kind;
        existing.x = target.x;
        existing.y = target.y;
        for (const cell of targetCells)
          this.assetCells.set(this.cellKey(cell.x, cell.y), existing);
        this.mapDirty = true;
        this.markMapChanged(existing);
        this.pushAudio("buy");
        this.emit(true);
        return;
      }
      return;
    }
    if (this.validBuildCell(target.x, target.y, kind)) {
      const object = { id: this.nextMapId++, kind, x: target.x, y: target.y };
      this.mapObjects.push(object);
      for (const cell of this.assetFootprintCells(target.x, target.y, kind))
        this.assetCells.set(this.cellKey(cell.x, cell.y), object);
      this.mapById.set(object.id, object);
      this.mapDirty = true;
      this.markMapChanged(object);
      this.pushAudio("buy");
      this.emit(true);
    }
  }
  start() {
    if (this.state === "ready") this.beginPoker();
  }
  beginPoker() {
    this.state = "poker";
    this.placing = null;
    this.selected = null;
    this.selectedIds = [];
    this.deck = shuffledDeck();
    this.hand = this.deck.splice(0, 5);
    this.discarded.clear();
    this.pokerResult = null;
    this.pendingUnits = [];
    this.setMessage(`PHASE ${this.phase + 1} 투입 전 포커 드로우`, 3);
    this.pushAudio("wheel");
    this.emit(true);
  }
  toggleDiscard(index: number) {
    if (this.state !== "poker" || this.pokerResult || index < 0 || index >= 5)
      return;
    if (this.discarded.has(index)) this.discarded.delete(index);
    else if (this.discarded.size < 3) this.discarded.add(index);
    this.emit(true);
  }
  resolvePoker() {
    if (this.state !== "poker" || this.pokerResult) return;
    for (const index of this.discarded) this.hand[index] = this.deck.shift()!;
    this.discarded.clear();
    this.pokerResult = evaluateHand(this.hand);
    this.pendingUnits = this.pokerResult.rewards.map(({ kind, tier }) => ({
      kind,
      tier,
    }));
    this.pushAudio(this.pokerResult.score >= 4 ? "win" : "wheel");
    this.emit(true);
  }
  acceptPokerReward() {
    if (this.state !== "poker" || !this.pokerResult) return;
    this.state = "deploy";
    this.placing = this.pendingUnits[0]?.kind ?? null;
    this.setMessage("획득한 유닛을 전장에 배치하세요", 4);
    this.emit(true);
  }
  phasePlan(phase: number) {
    const add = (
        kind: EnemyKind,
        count: number,
        out: { kind: EnemyKind; group: string }[],
      ) => {
        for (let i = 0; i < count; i++)
          out.push({ kind, group: `PHASE ${phase}` });
      },
      out: { kind: EnemyKind; group: string }[] = [];
    add("grunt", 10 + Math.min(phase * 3, 60), out);
    if (phase >= 2) add("runner", 3 + Math.min(phase * 2, 24), out);
    if (phase >= 2) add("drone", Math.min(phase + 1, 14), out);
    if (phase >= 3) add("armored", Math.min(phase * 2, 24), out);
    if (phase >= 4) add("brute", Math.min(phase, 14), out);
    if (phase >= 4) add("sapper", Math.min(Math.floor(phase / 2) + 1, 8), out);
    if (phase >= 5) add("phantom", Math.min(phase + 2, 18), out);
    if (phase >= 6) add("elite", Math.min(Math.floor(phase / 2), 10), out);
    if (phase >= 7)
      add("phase_tracker", Math.min(Math.floor((phase - 5) / 2), 6), out);
    if (phase >= 8) add("juggernaut", Math.min(phase - 6, 8), out);
    if (phase >= 9)
      add("warden", Math.min(Math.floor((phase - 7) / 3), 4), out);
    if (phase % 10 === 0) add("boss", 1 + Math.floor(phase / 30), out);

    // Keep a stable composition budget. Deployment timing later converts this
    // pool into differently sized squads for each enemy type.
    const phaseLimit = PHASE_ENEMY_COUNT;
    const bosses = out.filter((entry) => entry.kind === "boss"),
      regular = out.filter((entry) => entry.kind !== "boss"),
      regularSlots = Math.max(0, phaseLimit - bosses.length),
      selectedIndices: number[] = [];
    if (regular.length >= regularSlots) {
      let cursor = -1;
      for (let i = 0; i < regularSlots; i++) {
        const progress = regularSlots <= 1 ? 1 : i / (regularSlots - 1),
          desired = Math.round(Math.pow(progress, 0.72) * (regular.length - 1)),
          minIndex = cursor + 1,
          maxIndex = regular.length - (regularSlots - i),
          index = Math.max(minIndex, Math.min(maxIndex, desired));
        selectedIndices.push(index);
        cursor = index;
      }
    } else if (regular.length) {
      for (let i = 0; i < regularSlots; i++)
        selectedIndices.push(
          Math.min(
            regular.length - 1,
            Math.floor(((i + 0.5) * regular.length) / regularSlots),
          ),
        );
    }
    const includedKinds = new Set(
      selectedIndices.map((index) => regular[index].kind),
    );
    for (const kind of new Set(regular.map((entry) => entry.kind))) {
      if (includedKinds.has(kind)) continue;
      let requiredIndex = regular.length - 1;
      while (requiredIndex > 0 && regular[requiredIndex].kind !== kind)
        requiredIndex--;
      const counts = new Map<EnemyKind, number>();
      for (const index of selectedIndices)
        counts.set(regular[index].kind, (counts.get(regular[index].kind) ?? 0) + 1);
      const replaceAt = selectedIndices.findIndex(
        (index) => (counts.get(regular[index].kind) ?? 0) > 1,
      );
      if (replaceAt >= 0) selectedIndices[replaceAt] = requiredIndex;
      includedKinds.add(kind);
    }
    selectedIndices.sort((a, b) => a - b);
    const selectedRegulars = selectedIndices.map((index) => regular[index]);
    return [...this.escalatePhaseComposition(selectedRegulars, phase), ...bosses];
  }
  escalatePhaseComposition(plan: EnemyQueueEntry[], phase: number) {
    if (phase <= MIDGAME_PRESSURE_START_PHASE) return plan;

    const result = plan.map((entry) => ({ ...entry })),
      candidates = result
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => PROMOTABLE_ENEMY_KINDS.has(entry.kind)),
      promotionRate = Math.min(
        MAX_COMPOSITION_PROMOTION_RATE,
        (phase - MIDGAME_PRESSURE_START_PHASE) * 0.025,
      ),
      promotionCount = Math.min(
        candidates.length,
        Math.floor(result.length * promotionRate),
      ),
      promotedKinds: EnemyKind[] =
        phase < 20
          ? ["armored", "brute", "elite"]
          : phase < 30
            ? ["elite", "juggernaut", "warden"]
            : ["juggernaut", "warden", "elite"];

    for (let i = 0; i < promotionCount; i++) {
      const candidateIndex = Math.min(
        candidates.length - 1,
        Math.floor(((i + 0.5) * candidates.length) / promotionCount),
      );
      result[candidates[candidateIndex].index].kind =
        promotedKinds[(i + phase) % promotedKinds.length];
    }
    return result;
  }
  buildPhaseDeployment(plan: EnemyQueueEntry[]) {
    const buckets = new Map<EnemyKind, EnemyQueueEntry[]>();
    for (const entry of plan) {
      const bucket = buckets.get(entry.kind) ?? [];
      bucket.push(entry);
      buckets.set(entry.kind, bucket);
    }
    const kinds = [...buckets.keys()],
      squads: EnemyQueueEntry[][] = [];
    let squadId = 0;
    while ([...buckets.values()].some((bucket) => bucket.length)) {
      for (const kind of kinds) {
        const bucket = buckets.get(kind);
        if (!bucket?.length) continue;
        const size = Math.min(ENEMY_SPAWN_PROFILE[kind].groupSize, bucket.length);
        squads.push(
          bucket.splice(0, size).map((entry) => ({
            ...entry,
            squad: squadId,
          })),
        );
        squadId++;
      }
    }

    const queue = squads.flat(),
      rawTimes: number[] = [];
    let cursor = 0;
    for (const squad of squads) {
      const profile = ENEMY_SPAWN_PROFILE[squad[0].kind];
      for (let index = 0; index < squad.length; index++)
        rawTimes.push(cursor + index * profile.memberInterval);
      cursor +=
        Math.max(0, squad.length - 1) * profile.memberInterval + profile.rest;
    }
    const lastRawTime = rawTimes.at(-1) ?? 0,
      availableTime = PHASE_COMBAT_SECONDS - PHASE_FIRST_SPAWN_DELAY_SECONDS - 0.2,
      scale = lastRawTime > 0 ? availableTime / lastRawTime : 1,
      times = rawTimes.map(
        (time) => PHASE_FIRST_SPAWN_DELAY_SECONDS + time * scale,
      );
    return { queue, times };
  }
  startPhase() {
    if (this.state !== "deploy" || this.pendingUnits.length) return;
    this.phase++;
    const deployment = this.buildPhaseDeployment(this.phasePlan(this.phase));
    this.queue = deployment.queue;
    this.phaseSpawnTimes = deployment.times;
    this.phaseTotal = this.queue.length;
    this.phaseSpawned = 0;
    this.phaseEnding = 0;
    this.phaseElapsed = 0;
    this.state = "running";
    this.placing = null;
    this.lastSpawnedGroup = `PHASE ${this.phase}`;
    this.setMessage(`PHASE ${this.phase} · 30초 전투 시작`, 4);
    this.pushAudio("boss");
    this.emit(true);
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  emit(force = false) {
    if (force || performance.now() - this.lastSnapshot > 90) {
      this.lastSnapshot = performance.now();
      this.listeners.forEach((f) => f());
    }
  }
  setPaused(paused: boolean) {
    this.uiPaused = paused;
    this.emit(true);
  }
  setTimeScale(scale: 1 | 2 | 4) {
    this.timeScale = scale === 2 || scale === 4 ? scale : 1;
    this.emit(true);
  }
  toggleTimeScale() {
    this.setTimeScale(this.timeScale === 1 ? 2 : this.timeScale === 2 ? 4 : 1);
  }
  advance(realDt: number) {
    const scaledDt = realDt * (this.state === "running" ? this.timeScale : 1),
      fixedStep = 1 / 60;
    let remaining = Math.max(0, scaledDt);
    while (remaining > 0) {
      const step = Math.min(fixedStep, remaining);
      this.update(step);
      remaining -= step;
    }
  }
  setMessage(text: string, seconds = 2.5) {
    this.message = text;
    this.messageUntil = this.elapsed + seconds;
  }
  pushAudio(kind: AudioEvent["kind"]) {
    this.audioEvents.push({ id: this.nextId++, kind });
    if (this.audioEvents.length > 80)
      this.audioEvents.splice(0, this.audioEvents.length - 80);
  }
  pushAttackAudio(kind: AudioEvent["kind"]) {
    const interval = kind === "shot" ? 0.055 : 0.09;
    if (this.elapsed - (this.lastAttackAudioAt.get(kind) ?? -Infinity) < interval)
      return;
    this.lastAttackAudioAt.set(kind, this.elapsed);
    this.pushAudio(kind);
  }
  getPrice(kind: UnitKind) {
    return UNITS[kind].price;
  }
  getUnitRange(unit: Pick<Unit, "kind" | "tier">) {
    return UNITS[unit.kind].range * tierRange[unit.tier];
  }
  getEnemyHealthScale(kind: EnemyKind, phase = this.phase) {
    const safePhase = Math.max(1, phase),
      firstPhase = ENEMY_PHASE_INFO[kind].firstPhase,
      growthAt = (elapsedPhases: number) =>
        elapsedPhases * 0.12 + Math.floor(elapsedPhases / 10) * 0.25,
      phase30Scale = 1 + growthAt(29);
    if (safePhase <= firstPhase) return 1;
    if (safePhase >= 30) {
      const latePhases = Math.max(0, safePhase - 30);
      return (
        phase30Scale +
        growthAt(latePhases) +
        latePhases * latePhases * LATE_HEALTH_ACCELERATION
      );
    }

    const activePhases = safePhase - firstPhase,
      activePhasesAt30 = 30 - firstPhase,
      growthAt30 = growthAt(activePhasesAt30);
    return 1 + growthAt(activePhases) * ((phase30Scale - 1) / growthAt30);
  }
  getEnemyMaxHp(kind: EnemyKind, phase = this.phase) {
    return Math.round(
      ENEMIES[kind].hp * this.getEnemyHealthScale(kind, phase),
    );
  }
  tutorial() {
    if (this.phase === 1 && this.kills === 0)
      return "적 투입이 끝나면 생존 적이 남아 있어도 다음 포커 드로우가 시작됩니다.";
    if (this.enemies.length > this.units.length * 8)
      return "전선이 밀리고 있습니다. 다음 드로우의 강한 족보로 복구할 기회를 만드세요.";
    if (this.kills < 20)
      return "클릭은 단일 선택, 드래그는 다중 선택입니다. 선택 후 지면을 클릭해 재배치하세요.";
    return "";
  }
  getSnapshot = (): Snapshot => {
    const selectedUnit =
      this.selectedIds.length <= 1
        ? this.units.find((u) => u.id === this.selected)
        : undefined;
    const next = null;
    return {
      state: this.state,
      points: this.points,
      gate: this.gate,
      remaining: this.queue.length,
      active: this.enemies.length,
      kills: this.kills,
      units: this.units.length,
      selected: this.selected,
      selectedCount: this.selectedIds.length,
      selectedUnit,
      placing: this.placing,
      currentGroup: this.bossSpawned ? "지휘관" : this.lastSpawnedGroup,
      nextGroup: next ?? null,
      groupEta: this.groupBreak,
      bossActive: this.enemies.some((e) => e.kind === "boss"),
      elapsed: this.elapsed,
      paused: this.uiPaused,
      message: this.message,
      loot: this.lootOpportunity ? { ...this.lootOpportunity } : null,
      wheelMode: this.wheelMode,
      tutorial: this.tutorial(),
      totalDamage: this.totalDamage,
      spins: this.spins,
      wheelWins: this.wheelWins,
      buildMode: this.buildMode,
      buildTool: this.buildTool,
      buildCount: this.mapObjects.length,
      pathPoints: this.pathPoints.map((p) => [p[0], p[1]]),
      routes: this.routes.map((route) => route.map((p) => [p[0], p[1]])),
      routeStartPhases: [...this.routeStartPhases],
      activeRoute: this.activeRoute,
      pathEditing: this.pathEditing,
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight,
      mapSeed: this.mapSeed,
      phase: this.phase,
      bestKills: this.bestKills,
      phaseSpawned: this.phaseSpawned,
      phaseTotal: this.phaseTotal,
      phaseTimeRemaining:
        this.state === "running"
          ? Math.max(0, PHASE_COMBAT_SECONDS - this.phaseElapsed)
          : PHASE_COMBAT_SECONDS,
      timeScale: this.timeScale,
      hand: this.hand.map((c) => ({ ...c })),
      discarded: [...this.discarded],
      pokerResult: this.pokerResult
        ? {
            ...this.pokerResult,
            rewards: this.pokerResult.rewards.map((r) => ({ ...r })),
          }
        : null,
      pendingUnits: this.pendingUnits.map((u) => ({ ...u })),
    };
  };
  spawnEnemy(progress = 0) {
    const q = this.queue.shift();
    if (!q) return;
    const availableRoutes = this.routes
        .map((route, index) => ({ route, index }))
        .filter(
          ({ route, index }) =>
            route.length >= 2 &&
            (this.routeStartPhases[index] ?? 1) <= Math.max(1, this.phase),
        )
        .map(({ index }) => index),
      activeRoutes = availableRoutes.length ? availableRoutes : [0],
      hp = this.getEnemyMaxHp(q.kind),
      route = activeRoutes[this.spawned % activeRoutes.length],
      lane = [0, -1, 1][Math.floor(this.spawned / activeRoutes.length) % 3] as
        -1 | 0 | 1;
    this.enemies.push({
      id: this.nextId++,
      kind: q.kind,
      group: q.group,
      hp,
      maxHp: hp,
      progress,
      slowUntil: 0,
      route,
      lane,
    });
    this.spawned++;
    this.phaseSpawned++;
    this.lastSpawnedGroup = q.group;
  }
  pointAt(progress: number, routeIndex = 0, lane = 0) {
    const safeRouteIndex = Math.max(
        0,
        Math.min(this.routes.length - 1, routeIndex),
      ),
      route = this.routes[safeRouteIndex] ?? this.routes[0],
      lengths = this.routeLengths[safeRouteIndex] ?? this.routeLengths[0],
      total = this.routeTotals[safeRouteIndex] ?? this.routeTotals[0] ?? 0;
    if (!route || route.length < 2)
      return { x: route?.[0]?.[0] ?? 3, y: route?.[0]?.[1] ?? 6 };
    const d = Math.max(0, Math.min(1, progress)) * total,
      center = pointOnPolyline(route, lengths, d);
    if (!lane) return center;
    const tangentWindow = Math.min(1.25, Math.max(0.35, total * 0.02)),
      before = pointOnPolyline(route, lengths, d - tangentWindow),
      after = pointOnPolyline(route, lengths, d + tangentWindow),
      dx = after.x - before.x,
      dy = after.y - before.y,
      mag = Math.max(0.001, Math.hypot(dx, dy)),
      offset = lane * 1.15;
    return {
      x: center.x - (dy / mag) * offset,
      y: center.y + (dx / mag) * offset,
    };
  }

  update(dt: number) {
    if (this.uiPaused) return;
    if (this.state === "deploy") {
      for (const u of this.units) {
        if (!u.moving) continue;
        const d = distance(u, u.moving),
          step = 6 * dt;
        if (d <= step) {
          u.x = u.moving.x;
          u.y = u.moving.y;
          delete u.moving;
        } else {
          u.x += ((u.moving.x - u.x) / d) * step;
          u.y += ((u.moving.y - u.y) / d) * step;
        }
      }
      this.emit();
      return;
    }
    if (this.state !== "running") return;
    this.elapsed += dt;
    this.phaseElapsed += dt;
    if (this.message && this.elapsed >= this.messageUntil) this.message = "";
    if (this.phaseSpawnTimes.length !== this.phaseTotal) {
      const deployment = this.buildPhaseDeployment(this.queue);
      this.queue = deployment.queue;
      this.phaseSpawnTimes = deployment.times;
    }
    while (
      this.queue.length &&
      this.phaseElapsed >= (this.phaseSpawnTimes[this.phaseSpawned] ?? Infinity)
    ) {
      this.spawnEnemy();
    }
    if (
      this.phaseElapsed >= PHASE_COMBAT_SECONDS &&
      !this.queue.length &&
      this.phaseSpawned === this.phaseTotal
    ) {
      this.beginPoker();
      return;
    }
    for (const e of this.enemies) {
      const slow =
        e.slowUntil > this.elapsed ? CRYO_SLOWED_SPEED_MULTIPLIER : 1;
      const routeLength = Math.max(
          0.001,
          this.routeTotals[e.route] ?? this.routeTotals[0] ?? 0,
        ),
        worldSpeed =
          e.kind === "boss"
            ? BOSS_WORLD_SPEED
            : NORMAL_WORLD_SPEED * ENEMIES[e.kind].speed;
      e.progress += (dt * slow * worldSpeed) / routeLength;
    }
    const escaped = this.enemies.filter((e) => e.progress >= 1);
    if (escaped.length) {
      for (const e of escaped) this.gate += e.kind === "boss" ? 20 : 1;
      this.enemies = this.enemies.filter((e) => e.progress < 1);
      this.pushAudio("lose");
    }
    for (const u of this.units) {
      if (u.moving) {
        const d = distance(u, u.moving),
          step = 6 * dt;
        if (d <= step) {
          u.x = u.moving.x;
          u.y = u.moving.y;
          delete u.moving;
        } else {
          u.x += ((u.moving.x - u.x) / d) * step;
          u.y += ((u.moving.y - u.y) / d) * step;
        }
        continue;
      }
      u.cooldown -= dt;
      if (u.cooldown <= 0) this.attack(u);
    }
    for (const s of this.shots) s.life -= dt;
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((e) => e.life > 0);
    const dead = this.enemies.filter((e) => e.hp <= 0);
    for (const e of dead) {
      const reward = ENEMIES[e.kind].reward,
        pos = this.pointAt(e.progress, e.route, e.lane);
      this.points = Math.min(999999, this.points + reward);
      this.kills++;
      this.effects.push(
        {
          id: this.nextId++,
          kind: "death",
          x: pos.x,
          y: pos.y,
          life: 0.42,
          color: ENEMIES[e.kind].color,
        },
        {
          id: this.nextId++,
          kind: "reward",
          x: pos.x,
          y: pos.y,
          life: 0.7,
          color: 0xffd166,
          value: reward,
        },
      );
      this.pushAudio(e.kind === "boss" ? "win" : "kill");
      if (e.kind === "boss") {
        this.bossDefeated = true;
        this.setMessage(`PHASE ${this.phase} 보스 격파 — 끝까지 버티세요`, 6);
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    if (this.gate >= 20) {
      this.state = "defeat";
      if (this.kills > this.bestKills) {
        this.bestKills = this.kills;
        try {
          if (typeof localStorage !== "undefined")
            localStorage.setItem(
              "all-in-defense-best-kills",
              String(this.bestKills),
            );
        } catch {
          /* 저장소 없이도 종료 가능 */
        }
      }
      this.pushAudio("lose");
    }
    this.emit();
  }
  dealDamage(
    target: Enemy,
    amount: number,
    u: Unit,
    kind: BattleEffect["kind"] = "hit",
  ) {
    const dealt = Math.min(Math.max(0, target.hp), amount);
    target.hp -= amount;
    u.damageDone += dealt;
    this.totalDamage += dealt;
    const p = this.pointAt(target.progress, target.route, target.lane);
    this.effects.push({
      id: this.nextId++,
      kind,
      x: p.x,
      y: p.y,
      life: kind === "blast" ? 0.35 : 0.16,
      color: UNITS[u.kind].color,
    });
  }
  attack(u: Unit) {
    const spec = UNITS[u.kind],
      range = this.getUnitRange(u),
      candidates = this.enemies.filter(
        (e) => distance(u, this.pointAt(e.progress, e.route, e.lane)) <= range,
      );
    if (!candidates.length) return;
    const effect = spec.effect;
    let target = candidates[0];
    if (effect === "rifle" || effect === "gunner")
      target = [...candidates].sort(
        (a, b) => a.hp - b.hp || b.progress - a.progress,
      )[0];
    else if (effect === "cryo")
      target = [...candidates].sort(
        (a, b) => ENEMIES[b.kind].speed - ENEMIES[a.kind].speed,
      )[0];
    else if (effect === "sniper")
      target = [...candidates].sort((a, b) => b.hp - a.hp)[0];
    else target = [...candidates].sort((a, b) => b.progress - a.progress)[0];
    let damage = getUnitDamage(u.kind, u.tier);
    if (this.elapsed < this.overdriveUntil) damage *= 1.35;
    const tp = this.pointAt(target.progress, target.route, target.lane),
      facing = tp.x - tp.y >= u.x - u.y ? 1 : -1,
      bonus = getStrongDamageMultiplier(u.kind, target.kind);
    u.facing = facing;
    u.attackUntil = this.elapsed + (effect === "sniper" ? 0.28 : 0.18);
    this.dealDamage(target, damage * bonus, u);
    if (effect === "cryo") {
      const radius = [0, 2.8, 3.2, 3.6, 4][u.tier],
        duration = [0, 3, 3.4, 3.8, 4.2][u.tier];
      for (const enemy of this.enemies) {
        if (
          distance(tp, this.pointAt(enemy.progress, enemy.route, enemy.lane)) >
          radius
        )
          continue;
        enemy.slowUntil = Math.max(enemy.slowUntil, this.elapsed + duration);
        if (enemy !== target)
          this.dealDamage(enemy, damage * 0.55, u, "freeze");
      }
      this.effects.push({
        id: this.nextId++,
        kind: "freeze",
        x: tp.x,
        y: tp.y,
        life: 0.7,
        color: 0xa5f3fc,
      });
    }
    if (effect === "bomber") {
      const baseRadius =
          u.kind === "cataclysm" ? 3.2 : u.kind === "mortar" ? 2.6 : 2.2,
        radius = baseRadius + (u.tier - 1) * 0.3;
      for (const e of candidates)
        if (
          e !== target &&
          distance(tp, this.pointAt(e.progress, e.route, e.lane)) <= radius
        )
          this.dealDamage(e, damage, u, "blast");
      this.effects.push({
        id: this.nextId++,
        kind: "blast",
        x: tp.x,
        y: tp.y,
        life: 0.5,
        color: 0xffb86b,
      });
    }
    if (effect === "tesla") {
      let last = target;
      const max = [0, 4, 4, 5, 6][u.tier];
      for (let i = 1; i < max; i++) {
        const lp = this.pointAt(last.progress, last.route, last.lane),
          n = candidates
            .filter(
              (e) =>
                e !== last &&
                e.hp > 0 &&
                distance(lp, this.pointAt(e.progress, e.route, e.lane)) <= 2.5,
            )
            .sort(
              (a, b) =>
                distance(lp, this.pointAt(a.progress, a.route, a.lane)) -
                distance(lp, this.pointAt(b.progress, b.route, b.lane)),
            )[0];
        if (!n) break;
        this.dealDamage(n, damage * [1, 0.75, 0.55, 0.4, 0.3, 0.25, 0.2][i], u);
        last = n;
      }
    }
    this.shots.push({
      x1: u.x,
      y1: u.y,
      x2: tp.x,
      y2: tp.y,
      color: spec.color,
      life: effect === "sniper" ? 0.2 : 0.12,
      kind: u.kind,
      facing,
    });
    const rate = spec.rate * (this.elapsed < this.overdriveUntil ? 1.25 : 1);
    u.cooldown = 1 / rate;
    this.pushAttackAudio(
      effect === "bomber" || effect === "sniper"
        ? "heavy"
        : effect === "cryo"
          ? "freeze"
          : effect === "tesla"
            ? "tesla"
            : "shot",
    );
  }

  maybeOfferLoot() {
    if (this.lootOpportunity || this.lootIndex >= LOOT_MILESTONES.length)
      return;
    const milestone = LOOT_MILESTONES[this.lootIndex];
    if (this.kills >= milestone.kills) {
      this.lootOpportunity = {
        pot: milestone.pot,
        safe: Math.ceil(milestone.pot * 0.75),
        expires: 12,
        protected: this.lootIndex === 0,
        milestone: milestone.kills,
      };
      this.setMessage(
        `미확보 전리품 ${milestone.pot}칩 — 안전 회수 또는 Big Six`,
        12,
      );
      this.emit(true);
    }
  }
  secureLoot(auto = false) {
    if (!this.lootOpportunity) return;
    const amount = this.lootOpportunity.safe;
    this.points = Math.min(999999, this.points + amount);
    this.lootOpportunity = null;
    this.lootIndex++;
    this.setMessage(`${auto ? "자동 " : ""}안전 회수 +${amount} P`);
    this.pushAudio("buy");
    this.emit(true);
  }
  openWheel() {
    if (this.state !== "running") return;
    if (this.lootOpportunity) {
      this.wheelMode = "loot";
      this.state = "wheel";
      this.pushAudio("wheel");
      this.emit(true);
    } else if (this.points >= 10) {
      this.wheelMode = "points";
      this.state = "wheel";
      this.pushAudio("wheel");
      this.emit(true);
    }
  }
  closeWheel() {
    if (this.state === "wheel") {
      this.state = "running";
      this.emit(true);
    }
  }
  spin(choice: string, bet: number) {
    if (this.state !== "wheel") return null;
    const loot = this.wheelMode === "loot" ? this.lootOpportunity : null;
    const wager = loot ? loot.pot : bet;
    if (wager < 10 || (!loot && wager > this.points)) return null;
    if (!loot) this.points -= wager;
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const result = WHEEL[n[0] % WHEEL.length],
      matched = result === choice;
    let win = matched ? wager * PAYOUT[result] : 0;
    if (loot) {
      if (!matched && loot.protected) win = loot.safe;
      this.lootOpportunity = null;
      this.lootIndex++;
    }
    this.points = Math.min(999999, this.points + win);
    this.spins++;
    if (matched) this.wheelWins++;
    if (
      matched &&
      (result === "20" || result === "Joker" || result === "Crest")
    )
      this.overdriveUntil = this.elapsed + 15;
    if (matched && result === "Crest") this.gate = Math.max(0, this.gate - 5);
    this.pushAudio(matched ? "win" : "lose");
    this.emit(true);
    return { result, win, matched, protected: !!loot?.protected && !matched };
  }

  chooseBuy(kind: UnitKind) {
    const price = this.getPrice(kind);
    if (
      this.state === "running" &&
      this.points >= price &&
      this.units.length < 24
    ) {
      this.buildMode = false;
      this.buildTool = null;
      this.placing = this.placing === kind ? null : kind;
      this.selected = null;
      this.selectedIds = [];
      this.setMessage(
        this.placing
          ? "전장을 클릭하면 가장 가까운 위치에 자동 배치됩니다"
          : "",
      );
      this.emit(true);
    }
  }
  cancelPlacement() {
    if (this.state === "deploy" && this.pendingUnits.length) {
      this.placing = this.pendingUnits[0].kind;
      this.setMessage("포커 보상 유닛을 먼저 배치하세요");
      this.emit(true);
      return;
    }
    if (this.placing) {
      this.placing = null;
      this.setMessage("배치를 취소했습니다");
      this.emit(true);
    }
  }
  selectUnits(ids: number[]) {
    if (this.state === "deploy" && this.pendingUnits.length) {
      this.selected = null;
      this.selectedIds = [];
      this.placing = this.pendingUnits[0].kind;
      this.emit(true);
      return;
    }
    this.placing = null;
    this.selectedIds = [...new Set(ids)].filter((id) =>
      this.units.some((u) => u.id === id),
    );
    this.selected = this.selectedIds[0] ?? null;
    if (this.selectedIds.length > 1)
      this.setMessage(
        `${this.selectedIds.length}기 선택 · 이동할 지점을 클릭하세요`,
      );
    this.emit(true);
  }
  clickWorld(x: number, y: number) {
    if (this.state === "builder") {
      if (this.buildTool === "exit") {
        const exit = this.snapPathPoint(x, y);
        this.routes = this.routes.map((route) => [
          ...route.slice(0, -1),
          [exit[0], exit[1]],
        ]);
        this.buildTool = null;
        this.computePath();
        this.saveMap();
        this.setMessage(`공통 출구를 ${exit[0]}, ${exit[1]} 위치로 이동했습니다`);
        this.emit(true);
        return;
      }
      if (this.buildTool === "path" && this.pathEditing) {
        const snap = this.findPathSnap(x, y);
        if (snap) {
          this.connectPathToSnap(snap);
          return;
        }
        const point = this.snapPathPoint(x, y),
          last = this.pathPoints.at(-1);
        if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= 2)
          this.pathPoints.push(point);
        this.emit(true);
        return;
      }
      this.paintMapAsset(x, y);
      return;
    }
    if (this.state === "deploy" && this.placing) {
      const reward = this.pendingUnits[0],
        target = this.nearestValidCell(x, y);
      if (reward && target) {
        this.units.push({
          id: this.nextId++,
          kind: reward.kind,
          tier: reward.tier,
          x: target.x,
          y: target.y,
          cooldown: 0,
          damageDone: 0,
        });
        this.pendingUnits.shift();
        this.placing = this.pendingUnits[0]?.kind ?? null;
        this.setMessage(`${UNITS[reward.kind].name} T${reward.tier} 배치 완료`);
        this.pushAudio("buy");
      } else if (reward) {
        this.placing = reward.kind;
        this.setMessage("배치할 수 없는 위치입니다 · 빈 지형을 다시 선택하세요");
      }
      this.emit(true);
      return;
    }
    if (this.state !== "running" && this.state !== "deploy") return;
    if (this.placing) {
      const kind = this.placing,
        price = this.getPrice(kind),
        target = this.nearestValidCell(x, y);
      if (this.points >= price && target) {
        this.points -= price;
        this.units.push({
          id: this.nextId++,
          kind,
          tier: 1,
          x: target.x,
          y: target.y,
          cooldown: 0,
          damageDone: 0,
        });
        this.setMessage(`${UNITS[kind].name} 배치 완료`);
        this.pushAudio("buy");
        this.placing = null;
      }
      this.emit(true);
      return;
    }
    const hit = this.units
      .filter((u) => distance(u, { x, y }) < 1.25)
      .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }))[0];
    if (hit) {
      this.selectUnits([hit.id]);
      return;
    }
    if (this.selectedIds.length || this.selected) {
      const ids = this.selectedIds.length ? this.selectedIds : [this.selected!],
        movers = this.units.filter((u) => ids.includes(u.id)),
        movingIds = new Set(movers.map((u) => u.id)),
        center = movers.reduce(
          (a, u) => ({
            x: a.x + u.x / movers.length,
            y: a.y + u.y / movers.length,
          }),
          { x: 0, y: 0 },
        ),
        pairDistances = movers.flatMap((unit, index) =>
          movers
            .slice(index + 1)
            .map((other) => distance(unit, other))
            .filter((value) => value > 0.01),
        ),
        closestPair = pairDistances.length
          ? Math.min(...pairDistances)
          : GROUP_FORMATION_SPACING,
        formationScale =
          movers.length > 1
            ? Math.max(1, GROUP_FORMATION_SPACING / closestPair)
            : 0,
        reservedTargets: { x: number; y: number }[] = [];
      for (const u of movers) {
        const target = this.nearestValidCell(
          x + (u.x - center.x) * formationScale,
          y + (u.y - center.y) * formationScale,
          movingIds,
          reservedTargets,
        );
        if (target) {
          u.moving = target;
          reservedTargets.push(target);
        }
      }
      this.selected = null;
      this.selectedIds = [];
    } else {
      this.selected = null;
      this.selectedIds = [];
    }
    this.emit(true);
  }
  validCell(
    x: number,
    y: number,
    ignoredUnitIds: ReadonlySet<number> = new Set(),
    reservedTargets: readonly { x: number; y: number }[] = [],
  ) {
    if (
      x < 0.5 ||
      y < 0.5 ||
      x > this.mapWidth - 0.5 ||
      y > this.mapHeight - 0.5
    )
      return false;
    if (
      this.units.some(
        (u) =>
          !ignoredUnitIds.has(u.id) &&
          distance(u, { x, y }) < UNIT_PLACEMENT_SPACING,
      ) ||
      reservedTargets.some(
        (target) => distance(target, { x, y }) < GROUP_FORMATION_SPACING,
      )
    )
      return false;
    for (const o of this.assetCells.values())
      if (
        BUILDINGS[o.kind].category === "structure" &&
        distance(o, { x, y }) < BUILDINGS[o.kind].radius + 0.8
      )
        return false;
    for (let r = 0; r < this.routes.length; r++)
      for (let i = 0; i < 220; i++)
        if (distance(this.pointAt(i / 219, r, 0), { x, y }) < 2.45)
          return false;
    return true;
  }
  nearestValidCell(
    x: number,
    y: number,
    ignoredUnitIds: ReadonlySet<number> = new Set(),
    reservedTargets: readonly { x: number; y: number }[] = [],
  ) {
    const base = {
      x: Math.max(0.5, Math.min(this.mapWidth - 0.5, x)),
      y: Math.max(0.5, Math.min(this.mapHeight - 0.5, y)),
    };
    if (this.validCell(base.x, base.y, ignoredUnitIds, reservedTargets))
      return base;
    for (let r = 0.75; r <= 10; r += 0.75)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const c = {
          x: Math.max(
            0.5,
            Math.min(this.mapWidth - 0.5, base.x + Math.cos(a) * r),
          ),
          y: Math.max(
            0.5,
            Math.min(this.mapHeight - 0.5, base.y + Math.sin(a) * r),
          ),
        };
        if (this.validCell(c.x, c.y, ignoredUnitIds, reservedTargets)) return c;
      }
    return null;
  }
  mergeSelected() {
    const a = this.units.find((u) => u.id === this.selected);
    if (this.selectedIds.length > 1 || !a || a.tier >= 4 || a.moving) return;
    const b = this.units.find(
      (u) =>
        u.id !== a.id && u.kind === a.kind && u.tier === a.tier && !u.moving,
    );
    if (!b) {
      this.setMessage("같은 병종·티어의 유닛이 필요합니다");
      this.emit(true);
      return;
    }
    a.tier++;
    this.units = this.units.filter((u) => u.id !== b.id);
    this.setMessage(`${UNITS[a.kind].name} T${a.tier} 합성!`);
    this.pushAudio("merge");
    this.emit(true);
  }
  sellSelected() {
    const u = this.units.find((v) => v.id === this.selected);
    if (this.selectedIds.length > 1 || !u || u.moving) return;
    this.points += Math.floor(
      this.getPrice(u.kind) * Math.pow(2, u.tier - 1) * 0.5,
    );
    this.units = this.units.filter((v) => v.id !== u.id);
    this.selected = null;
    this.selectedIds = [];
    this.emit(true);
  }
}
