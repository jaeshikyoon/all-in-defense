export type UnitKind =
  | "militia"
  | "rifle"
  | "gunner"
  | "cryo"
  | "bomber"
  | "sniper"
  | "tesla"
  | "mortar"
  | "railgun"
  | "cataclysm";
export type EnemyKind =
  | "grunt"
  | "runner"
  | "drone"
  | "sapper"
  | "armored"
  | "elite"
  | "brute"
  | "phantom"
  | "phase_tracker"
  | "juggernaut"
  | "warden"
  | "boss";
export type BuildKind =
  | "command_tent"
  | "watchtower"
  | "sandbags"
  | "radar"
  | "generator"
  | "medic_station"
  | "antenna"
  | "lamp_post";
export type TerrainKind =
  | "rock_outcrop"
  | "grass_patch"
  | "dirt_mound"
  | "crater"
  | "mud_puddle"
  | "ruin_slab"
  | "shrubs"
  | "road_plate";
export type FloorKind =
  | "floor_grass"
  | "floor_earth"
  | "floor_concrete"
  | "floor_asphalt"
  | "floor_mud"
  | "floor_steel"
  | "floor_gravel"
  | "floor_stone";
export type MapAssetKind = BuildKind | TerrainKind | FloorKind;

export type UnitEffect =
  "rifle" | "gunner" | "cryo" | "bomber" | "sniper" | "tesla";
export const TIER_DAMAGE_MULTIPLIERS = [0, 1, 2.2, 4.8, 10.5] as const;
export const CRYO_SLOWED_SPEED_MULTIPLIER = 0.5;
export const STRONG_ENEMY_KINDS = new Set<EnemyKind>([
  "elite",
  "juggernaut",
  "boss",
]);
export const STRONG_DAMAGE_MULTIPLIERS: Partial<Record<UnitKind, number>> = {
  sniper: 2,
  railgun: 2,
};
export const ENEMY_ASSET_FILES: Record<EnemyKind, string> = {
  grunt: "enemy_grunt_v2",
  runner: "enemy_runner_v2",
  drone: "enemy_drone",
  sapper: "enemy_sapper",
  armored: "enemy_armored_v2",
  elite: "enemy_elite_v2",
  brute: "enemy_brute_v2",
  phantom: "enemy_phantom_v2",
  phase_tracker: "enemy_phase_tracker",
  juggernaut: "enemy_juggernaut_v2",
  warden: "enemy_warden",
  boss: "boss_commander_v2",
};
export const UNIT_ASSET_FILES: Record<UnitKind, string> = {
  militia: "unit_militia",
  rifle: "unit_rifleman",
  gunner: "unit_gunner",
  cryo: "unit_cryo",
  sniper: "unit_sniper",
  bomber: "unit_bomber",
  mortar: "unit_mortar",
  tesla: "unit_tesla",
  railgun: "unit_railgun",
  cataclysm: "unit_cataclysm",
};
export const UNITS: Record<
  UnitKind,
  {
    name: string;
    price: number;
    damage: number;
    rate: number;
    range: number;
    role: string;
    color: number;
    effect: UnitEffect;
  }
> = {
  militia: {
    name: "예비군",
    price: 20,
    damage: 12,
    rate: 1.05,
    range: 6,
    role: "하이 카드 최소 전력",
    color: 0x94a3b8,
    effect: "rifle",
  },
  rifle: {
    name: "소총병",
    price: 30,
    damage: 20,
    rate: 1.25,
    range: 6.5,
    role: "안정적인 단일 화력",
    color: 0x58b8ff,
    effect: "rifle",
  },
  gunner: {
    name: "기관총병",
    price: 45,
    damage: 8,
    rate: 4,
    range: 5.5,
    role: "보병과 돌격병을 빠르게 처리",
    color: 0x2de2e6,
    effect: "gunner",
  },
  cryo: {
    name: "빙결술사",
    price: 55,
    damage: 18,
    rate: 1,
    range: 7,
    role: "적 무리 광역 감속 제어",
    color: 0xa5f3fc,
    effect: "cryo",
  },
  bomber: {
    name: "폭파병",
    price: 60,
    damage: 40,
    rate: 0.55,
    range: 8,
    role: "밀집한 적 무리 제거",
    color: 0xffb86b,
    effect: "bomber",
  },
  sniper: {
    name: "저격수",
    price: 70,
    damage: 460,
    rate: 0.364,
    range: 10,
    role: "일반 적 처형 · 강적 피해 ×2.0",
    color: 0xc084fc,
    effect: "sniper",
  },
  tesla: {
    name: "테슬라 기사",
    price: 90,
    damage: 60,
    rate: 0.9,
    range: 7,
    role: "분산된 적 대상 강력한 연쇄 공격",
    color: 0xfde047,
    effect: "tesla",
  },
  mortar: {
    name: "클럽 박격포",
    price: 75,
    damage: 75,
    rate: 0.42,
    range: 9,
    role: "넓고 강한 장거리 광역 공격",
    color: 0xf59e0b,
    effect: "bomber",
  },
  railgun: {
    name: "스페이드 레일건",
    price: 105,
    damage: 1500,
    rate: 0.07,
    range: 12,
    role: "저거너트·지휘관 처형 · 강적 피해 ×2.0",
    color: 0xa78bfa,
    effect: "sniper",
  },
  cataclysm: {
    name: "클럽 대재앙포",
    price: 150,
    damage: 200,
    rate: 0.38,
    range: 10.5,
    role: "후반 경량 적 무리 제거",
    color: 0xfde68a,
    effect: "bomber",
  },
};

export function getUnitDamage(kind: UnitKind, tier: number) {
  const multiplier = TIER_DAMAGE_MULTIPLIERS[tier] ?? 1;
  return UNITS[kind].damage * multiplier;
}

export function getStrongDamageMultiplier(
  kind: UnitKind,
  enemyKind: EnemyKind,
) {
  return STRONG_ENEMY_KINDS.has(enemyKind)
    ? (STRONG_DAMAGE_MULTIPLIERS[kind] ?? 1)
    : 1;
}

export const ENEMIES: Record<
  EnemyKind,
  { name: string; hp: number; speed: number; reward: number; color: number }
> = {
  grunt: { name: "보병", hp: 40, speed: 1, reward: 2, color: 0x279f9c },
  runner: { name: "돌격병", hp: 28, speed: 1.55, reward: 2, color: 0xf59e0b },
  drone: { name: "정찰 드론", hp: 18, speed: 2.15, reward: 2, color: 0x14b8a6 },
  sapper: { name: "폭파공", hp: 130, speed: 0.9, reward: 5, color: 0xeab308 },
  armored: { name: "장갑병", hp: 180, speed: 0.65, reward: 6, color: 0x3b82f6 },
  elite: { name: "정예병", hp: 500, speed: 0.55, reward: 14, color: 0xa855f7 },
  brute: {
    name: "돌격 거한",
    hp: 340,
    speed: 0.72,
    reward: 8,
    color: 0x65a30d,
  },
  phantom: {
    name: "유령 척후병",
    hp: 90,
    speed: 1.85,
    reward: 5,
    color: 0x22d3ee,
  },
  phase_tracker: {
    name: "위상 추적자",
    hp: 260,
    speed: 1.15,
    reward: 9,
    color: 0x8b5cf6,
  },
  juggernaut: {
    name: "저거너트",
    hp: 1100,
    speed: 0.38,
    reward: 20,
    color: 0x334155,
  },
  warden: {
    name: "철벽 수호자",
    hp: 850,
    speed: 0.44,
    reward: 18,
    color: 0xd6c88f,
  },
  boss: { name: "지휘관", hp: 7000, speed: 0.25, reward: 0, color: 0xd4a72c },
};

export const ENEMY_PHASE_INFO: Record<
  EnemyKind,
  { firstPhase: number; cycle?: number; role: string }
> = {
  grunt: { firstPhase: 1, role: "기본 전선 압박" },
  runner: { firstPhase: 2, role: "고속 돌파" },
  drone: { firstPhase: 2, role: "초고속 정찰" },
  armored: { firstPhase: 3, role: "저속 장갑 전진" },
  brute: { firstPhase: 4, role: "중장 체력 압박" },
  sapper: { firstPhase: 4, role: "중속 특수 병력" },
  phantom: { firstPhase: 5, role: "고속 유령 척후" },
  elite: { firstPhase: 6, role: "정예 전선 강화" },
  phase_tracker: { firstPhase: 7, role: "위상 추적 돌파" },
  juggernaut: { firstPhase: 8, role: "초중장 방벽" },
  warden: { firstPhase: 9, role: "철벽 수호" },
  boss: { firstPhase: 10, cycle: 10, role: "지휘관 보스" },
};

export const BUILDINGS: Record<
  MapAssetKind,
  {
    name: string;
    scale: number;
    radius: number;
    category: "structure" | "terrain" | "floor";
  }
> = {
  command_tent: {
    name: "지휘 천막",
    scale: 0.34,
    radius: 2.8,
    category: "structure",
  },
  watchtower: {
    name: "감시탑",
    scale: 0.34,
    radius: 2.2,
    category: "structure",
  },
  sandbags: {
    name: "모래주머니",
    scale: 0.31,
    radius: 2.3,
    category: "structure",
  },
  radar: { name: "레이더", scale: 0.33, radius: 2.5, category: "structure" },
  generator: { name: "발전기", scale: 0.3, radius: 2.1, category: "structure" },
  medic_station: {
    name: "의무소",
    scale: 0.32,
    radius: 2.5,
    category: "structure",
  },
  antenna: { name: "통신탑", scale: 0.34, radius: 2.1, category: "structure" },
  lamp_post: {
    name: "조명탑",
    scale: 0.32,
    radius: 1.7,
    category: "structure",
  },
  rock_outcrop: {
    name: "바위 지대",
    scale: 0.34,
    radius: 2.5,
    category: "terrain",
  },
  grass_patch: {
    name: "잔디 지형",
    scale: 0.36,
    radius: 2.4,
    category: "terrain",
  },
  dirt_mound: { name: "흙더미", scale: 0.35, radius: 2.3, category: "terrain" },
  crater: {
    name: "포탄 구덩이",
    scale: 0.36,
    radius: 2.5,
    category: "terrain",
  },
  mud_puddle: {
    name: "진흙 웅덩이",
    scale: 0.36,
    radius: 2.4,
    category: "terrain",
  },
  ruin_slab: {
    name: "폐허 바닥",
    scale: 0.36,
    radius: 2.5,
    category: "terrain",
  },
  shrubs: { name: "관목 지대", scale: 0.34, radius: 2.4, category: "terrain" },
  road_plate: {
    name: "장갑 도로",
    scale: 0.35,
    radius: 2.5,
    category: "terrain",
  },
  floor_grass: {
    name: "군용 잔디",
    scale: 0.516,
    radius: 0,
    category: "floor",
  },
  floor_earth: { name: "다진 흙", scale: 0.516, radius: 0, category: "floor" },
  floor_concrete: {
    name: "회색 콘크리트",
    scale: 0.516,
    radius: 0,
    category: "floor",
  },
  floor_asphalt: {
    name: "균열 아스팔트",
    scale: 0.516,
    radius: 0,
    category: "floor",
  },
  floor_mud: { name: "진흙 바닥", scale: 0.516, radius: 0, category: "floor" },
  floor_steel: {
    name: "강철 갑판",
    scale: 0.516,
    radius: 0,
    category: "floor",
  },
  floor_gravel: {
    name: "사막 자갈",
    scale: 0.516,
    radius: 0,
    category: "floor",
  },
  floor_stone: {
    name: "이끼 석재",
    scale: 0.516,
    radius: 0,
    category: "floor",
  },
};

export const LOOT_MILESTONES = [
  { kills: 40, pot: 20 },
  { kills: 140, pot: 30 },
  { kills: 280, pot: 45 },
  { kills: 430, pot: 65 },
] as const;

export const PATH = [
  [3, 6],
  [21, 6],
  [21, 15],
  [8, 15],
  [8, 24],
  [39, 24],
  [39, 11],
  [49, 11],
  [49, 31],
  [25, 31],
  [25, 36],
  [50, 36],
] as const;
export const GROUPS = [
  {
    id: "vanguard",
    name: "선봉",
    entries: [
      ["grunt", 90],
      ["runner", 10],
    ],
  },
  {
    id: "main_force",
    name: "본대",
    entries: [
      ["grunt", 120],
      ["runner", 30],
    ],
  },
  {
    id: "armored",
    name: "중장갑",
    entries: [
      ["grunt", 80],
      ["runner", 20],
      ["armored", 50],
    ],
  },
  {
    id: "rear_guard",
    name: "정예 후위",
    entries: [
      ["grunt", 50],
      ["runner", 20],
      ["armored", 20],
      ["elite", 10],
    ],
  },
] as const;

export const WHEEL = [
  ...Array(23).fill("1"),
  ...Array(15).fill("2"),
  ...Array(8).fill("5"),
  ...Array(4).fill("10"),
  ...Array(2).fill("20"),
  "Joker",
  "Crest",
] as string[];
export const PAYOUT: Record<string, number> = {
  "1": 2,
  "2": 3,
  "5": 6,
  "10": 11,
  "20": 21,
  Joker: 46,
  Crest: 46,
};
