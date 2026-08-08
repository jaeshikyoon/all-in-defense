export type BorderSide = "north" | "east" | "south" | "west";
export type GridPoint = { x: number; y: number };

export type BorderDecorationKind =
  | "antenna"
  | "generator"
  | "radar"
  | "watchtower"
  | "sandbags"
  | "lamp_post"
  | "rock_outcrop"
  | "ruin_slab"
  | "shrubs";

export type WallPieceLayout = {
  side: BorderSide;
  from: GridPoint;
  to: GridPoint;
  front: boolean;
};

export type BorderDecorationLayout = {
  kind: BorderDecorationKind;
  x: number;
  y: number;
  mirror: boolean;
  scale: number;
  cluster: number;
};

export type BattlefieldBorderLayout = {
  boundary: GridPoint[];
  wallPieces: WallPieceLayout[];
  towers: (GridPoint & {
    front: boolean;
    kind: "control" | "corner";
    sockets: [GridPoint, GridPoint];
  })[];
  maintenanceLines: { side: BorderSide; from: GridPoint; to: GridPoint }[];
  lights: (GridPoint & { side: BorderSide; front: boolean })[];
  decorations: BorderDecorationLayout[];
};

export type BattlefieldBorderOptions = {
  width: number;
  height: number;
  seed: number;
  routes?: [number, number][][];
};

const WALL_OFFSET = 1.15;
const TOWER_SOCKET_INSET = 1.72;
const WALL_TARGET_SPAN = 7.5;
export const WALL_OVERLAP_TILES = 0;

export const WALL_IMAGE_SOCKETS = {
  left: { x: 220, y: 669 },
  right: { x: 1320, y: 335 },
} as const;

export type WallSpriteTransform = {
  position: GridPoint;
  anchor: GridPoint;
  scaleX: number;
  scaleY: number;
  rotation: number;
  endSocket: GridPoint;
};

export function computeWallSpriteTransform(
  from: GridPoint,
  to: GridPoint,
): WallSpriteTransform {
  let start = from,
    end = to;
  if (end.x < start.x) [start, end] = [end, start];
  const targetX = end.x - start.x,
    targetY = end.y - start.y,
    positiveSlope = targetY > 0,
    anchor = positiveSlope ? WALL_IMAGE_SOCKETS.right : WALL_IMAGE_SOCKETS.left,
    endSocket = positiveSlope ? WALL_IMAGE_SOCKETS.left : WALL_IMAGE_SOCKETS.right,
    sourceX = positiveSlope
      ? -(endSocket.x - anchor.x)
      : endSocket.x - anchor.x,
    sourceY = endSocket.y - anchor.y,
    sourceLength = Math.hypot(sourceX, sourceY),
    scale = Math.hypot(targetX, targetY) / sourceLength;
  return {
    position: start,
    anchor,
    scaleX: positiveSlope ? -scale : scale,
    scaleY: scale,
    rotation: Math.atan2(targetY, targetX) - Math.atan2(sourceY, sourceX),
    endSocket,
  };
}

const hash32 = (value: number) => {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
};

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const borderSeedForMap = (seed: number, width: number, height: number) =>
  hash32(seed ^ Math.imul(width, 73856093) ^ Math.imul(height, 19349663));

export const computeBattlefieldBoundary = (width: number, height: number) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
];

const interpolate = (from: GridPoint, to: GridPoint, distance: number) => {
  const length = Math.hypot(to.x - from.x, to.y - from.y),
    ratio = length ? distance / length : 0;
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
};

const createWallRun = (
  side: BorderSide,
  from: GridPoint,
  to: GridPoint,
  front: boolean,
) => {
  const length = Math.hypot(to.x - from.x, to.y - from.y),
    count = Math.max(1, Math.round(length / WALL_TARGET_SPAN)),
    pieceSpan = (length + WALL_OVERLAP_TILES * (count - 1)) / count,
    advance = pieceSpan - WALL_OVERLAP_TILES,
    pieces: WallPieceLayout[] = [];
  for (let i = 0; i < count; i++)
    pieces.push({
      side,
      from: interpolate(from, to, i * advance),
      to: interpolate(from, to, i * advance + pieceSpan),
      front,
    });
  return pieces;
};

const sidePoint = (
  side: BorderSide,
  along: number,
  distance: number,
  width: number,
  height: number,
) => {
  switch (side) {
    case "north":
      return { x: along, y: -distance };
    case "east":
      return { x: width + distance, y: along };
    case "south":
      return { x: along, y: height + distance };
    case "west":
      return { x: -distance, y: along };
  }
};

const distance = (a: GridPoint, b: GridPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function createBattlefieldBorderLayout({
  width,
  height,
  seed,
  routes = [],
}: BattlefieldBorderOptions): BattlefieldBorderLayout {
  const random = seededRandom(borderSeedForMap(seed, width, height)),
    northStart = { x: -WALL_OFFSET + TOWER_SOCKET_INSET, y: -WALL_OFFSET },
    northEnd = {
      x: width + WALL_OFFSET - TOWER_SOCKET_INSET,
      y: -WALL_OFFSET,
    },
    eastStart = {
      x: width + WALL_OFFSET,
      y: -WALL_OFFSET + TOWER_SOCKET_INSET,
    },
    eastEnd = {
      x: width + WALL_OFFSET,
      y: height + WALL_OFFSET - TOWER_SOCKET_INSET,
    },
    southStart = {
      x: -WALL_OFFSET + TOWER_SOCKET_INSET,
      y: height + WALL_OFFSET,
    },
    southEnd = {
      x: width + WALL_OFFSET - TOWER_SOCKET_INSET,
      y: height + WALL_OFFSET,
    },
    westStart = { x: -WALL_OFFSET, y: -WALL_OFFSET + TOWER_SOCKET_INSET },
    westEnd = {
      x: -WALL_OFFSET,
      y: height + WALL_OFFSET - TOWER_SOCKET_INSET,
    },
    wallPieces = [
      ...createWallRun("north", northStart, northEnd, false),
      ...createWallRun("east", eastStart, eastEnd, false),
      ...createWallRun("south", southStart, southEnd, true),
      ...createWallRun("west", westStart, westEnd, true),
    ],
    towers: BattlefieldBorderLayout["towers"] = [
      {
        x: -WALL_OFFSET,
        y: -WALL_OFFSET,
        front: false,
        kind: "control",
        sockets: [westStart, northStart],
      },
      {
        x: width + WALL_OFFSET,
        y: -WALL_OFFSET,
        front: false,
        kind: "corner",
        sockets: [northEnd, eastStart],
      },
      {
        x: width + WALL_OFFSET,
        y: height + WALL_OFFSET,
        front: true,
        kind: "corner",
        sockets: [eastEnd, southEnd],
      },
      {
        x: -WALL_OFFSET,
        y: height + WALL_OFFSET,
        front: true,
        kind: "corner",
        sockets: [southStart, westEnd],
      },
    ],
    maintenanceOffset = 2.75,
    maintenanceLines = [
      {
        side: "north" as const,
        from: { x: -maintenanceOffset, y: -maintenanceOffset },
        to: { x: width + maintenanceOffset, y: -maintenanceOffset },
      },
      {
        side: "east" as const,
        from: { x: width + maintenanceOffset, y: -maintenanceOffset },
        to: { x: width + maintenanceOffset, y: height + maintenanceOffset },
      },
      {
        side: "south" as const,
        from: { x: -maintenanceOffset, y: height + maintenanceOffset },
        to: { x: width + maintenanceOffset, y: height + maintenanceOffset },
      },
      {
        side: "west" as const,
        from: { x: -maintenanceOffset, y: -maintenanceOffset },
        to: { x: -maintenanceOffset, y: height + maintenanceOffset },
      },
    ],
    lights: BattlefieldBorderLayout["lights"] = [],
    decorations: BorderDecorationLayout[] = [],
    blocked = routes.flatMap((route) => {
      if (!route.length) return [];
      return [route[0], route.at(-1)!].map(([x, y]) => ({ x, y }));
    }),
    occupied: GridPoint[] = [];

  const sides: { side: BorderSide; length: number; front: boolean }[] = [
    { side: "north", length: width, front: false },
    { side: "east", length: height, front: false },
    { side: "south", length: width, front: true },
    { side: "west", length: height, front: true },
  ];
  for (const { side, length, front } of sides)
    for (let along = 4; along < length - 4; along += 6)
      lights.push({
        ...sidePoint(side, along, 1.48, width, height),
        side,
        front,
      });

  const primaryKinds: BorderDecorationKind[] = [
      "generator",
      "antenna",
      "radar",
      "watchtower",
    ],
    satelliteKinds: BorderDecorationKind[] = [
      "sandbags",
      "lamp_post",
      "rock_outcrop",
      "ruin_slab",
      "shrubs",
    ];
  let cluster = 1;
  const tryPlace = (
    kind: BorderDecorationKind,
    point: GridPoint,
    clusterId: number,
    scale: number,
  ) => {
    if (
      (point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height) ||
      blocked.some((entry) => distance(entry, point) < 5.5) ||
      occupied.some((entry) => distance(entry, point) < 1.15)
    )
      return false;
    occupied.push(point);
    decorations.push({
      kind,
      x: point.x,
      y: point.y,
      mirror: random() > 0.5,
      scale,
      cluster: clusterId,
    });
    return true;
  };

  for (const { side, length } of sides) {
    let along = 5 + random() * 3;
    while (along < length - 5) {
      const clusterId = cluster++,
        outward = 5.1 + random() * 1.7,
        primary = sidePoint(side, along, outward, width, height);
      tryPlace(
        primaryKinds[Math.floor(random() * primaryKinds.length)],
        primary,
        clusterId,
        0.78 + random() * 0.12,
      );
      const satellites = 2 + Math.floor(random() * 3);
      for (let i = 0; i < satellites; i++) {
        const alongOffset = (i % 2 ? 1 : -1) * (1.35 + random() * 1.2),
          distanceOffset = (i > 1 ? 1 : -1) * (0.65 + random() * 0.55);
        tryPlace(
          satelliteKinds[Math.floor(random() * satelliteKinds.length)],
          sidePoint(
            side,
            along + alongOffset,
            outward + distanceOffset,
            width,
            height,
          ),
          clusterId,
          0.62 + random() * 0.16,
        );
      }
      along += 8 + random() * 4;
    }

    along = 3.5 + random() * 2;
    while (along < length - 3.5) {
      const clusterId = cluster++,
        outward = 4.4 + random() * 2.8,
        first = sidePoint(side, along, outward, width, height);
      tryPlace(
        satelliteKinds[Math.floor(random() * satelliteKinds.length)],
        first,
        clusterId,
        0.56 + random() * 0.16,
      );
      if (random() > 0.45)
        tryPlace(
          satelliteKinds[Math.floor(random() * satelliteKinds.length)],
          sidePoint(
            side,
            along + (random() - 0.5) * 2.2,
            outward + 1.2 + random(),
            width,
            height,
          ),
          clusterId,
          0.5 + random() * 0.12,
        );
      along += 3.5 + random() * 2;
    }
  }

  return {
    boundary: computeBattlefieldBoundary(width, height),
    wallPieces,
    towers,
    maintenanceLines,
    lights,
    decorations,
  };
}
