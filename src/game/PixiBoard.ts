import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";
import {
  BUILDINGS,
  ENEMIES,
  ENEMY_ASSET_FILES,
  getBuilderAssetScale,
  getMapAssetFootprint,
  UNIT_ASSET_FILES,
  UNITS,
  type EnemyKind,
  type MapAssetKind,
  type UnitKind,
} from "./data";
import {
  computeWallSpriteTransform,
  createBattlefieldBorderLayout,
  type BorderDecorationKind,
  type WallPieceLayout,
} from "./battlefieldBorder";
import { gameAudio } from "./AudioManager";
import { publicAssetUrl } from "./assets";
import type { GameEngine, MapObject, Snapshot } from "./Engine";

const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

const drawDashedRoute = (
  graphics: Graphics,
  points: { x: number; y: number }[],
  color: number,
  width: number,
  dashLength = 24,
  gapLength = 18,
) => {
  let draw = true,
    remaining = dashLength;
  for (let index = 1; index < points.length; index++) {
    let x = points[index - 1].x,
      y = points[index - 1].y;
    const end = points[index],
      dx = end.x - x,
      dy = end.y - y,
      length = Math.hypot(dx, dy);
    if (!length) continue;
    const ux = dx / length,
      uy = dy / length;
    let traveled = 0;
    while (traveled < length) {
      const step = Math.min(remaining, length - traveled),
        nextX = x + ux * step,
        nextY = y + uy * step;
      if (draw)
        graphics
          .moveTo(x, y)
          .lineTo(nextX, nextY)
          .stroke({ color, width, cap: "round", alpha: 0.72 });
      x = nextX;
      y = nextY;
      traveled += step;
      remaining -= step;
      if (remaining <= 0.001) {
        draw = !draw;
        remaining = draw ? dashLength : gapLength;
      }
    }
  }
};

const drawRouteArrows = (
  graphics: Graphics,
  points: { x: number; y: number }[],
  color: number,
) => {
  let distanceUntilArrow = 125;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1],
      end = points[index],
      dx = end.x - start.x,
      dy = end.y - start.y,
      length = Math.hypot(dx, dy);
    if (!length) continue;
    const ux = dx / length,
      uy = dy / length,
      px = -uy,
      py = ux;
    let traveled = distanceUntilArrow;
    while (traveled < length) {
      const x = start.x + ux * traveled,
        y = start.y + uy * traveled;
      graphics
        .poly([
          x + ux * 13,
          y + uy * 13,
          x - ux * 9 + px * 10,
          y - uy * 9 + py * 10,
          x - ux * 3,
          y - uy * 3,
          x - ux * 9 - px * 10,
          y - uy * 9 - py * 10,
        ])
        .fill({ color, alpha: 0.46 });
      traveled += 210;
    }
    distanceUntilArrow = traveled - length;
  }
};

function drawEnemy(
  g: Graphics,
  p: { x: number; y: number },
  kind: EnemyKind,
  scale = 1,
) {
  const color = ENEMIES[kind].color,
    outline = 0x210b0e;
  g.ellipse(p.x, p.y + 6 * scale, 17 * scale, 7 * scale).fill({
    color: 0x000000,
    alpha: 0.38,
  });
  // 다리와 장화
  g.roundRect(
    p.x - 8 * scale,
    p.y - 4 * scale,
    6 * scale,
    13 * scale,
    2 * scale,
  )
    .fill(0x35151a)
    .stroke({ color: outline, width: 2 });
  g.roundRect(
    p.x + 2 * scale,
    p.y - 4 * scale,
    6 * scale,
    13 * scale,
    2 * scale,
  )
    .fill(0x35151a)
    .stroke({ color: outline, width: 2 });
  // 몸통과 어깨 갑옷
  g.poly([
    p.x - 12 * scale,
    p.y - 18 * scale,
    p.x - 7 * scale,
    p.y - 26 * scale,
    p.x + 8 * scale,
    p.y - 26 * scale,
    p.x + 12 * scale,
    p.y - 7 * scale,
    p.x - 10 * scale,
    p.y - 7 * scale,
  ])
    .fill(color)
    .stroke({ color: outline, width: 3 });
  g.rect(p.x - 14 * scale, p.y - 22 * scale, 5 * scale, 12 * scale)
    .fill(kind === "armored" ? 0x6e7380 : color)
    .stroke({ color: outline, width: 2 });
  // 얼굴과 헬멧
  g.circle(p.x, p.y - 32 * scale, 9 * scale)
    .fill(kind === "boss" ? 0x9e5f50 : 0xd79572)
    .stroke({ color: outline, width: 3 });
  g.roundRect(
    p.x - 10 * scale,
    p.y - 43 * scale,
    20 * scale,
    10 * scale,
    6 * scale,
  )
    .fill(kind === "elite" || kind === "boss" ? 0x181318 : 0x44242a)
    .stroke({ color: outline, width: 2 });
  g.rect(p.x - 10 * scale, p.y - 37 * scale, 20 * scale, 4 * scale).fill(
    kind === "elite" || kind === "boss" ? 0x181318 : 0x44242a,
  );
  g.circle(p.x + 4 * scale, p.y - 32 * scale, 1.4 * scale).fill(0xffd36c);
  if (kind === "runner")
    g.poly([
      p.x - 9 * scale,
      p.y - 38 * scale,
      p.x - 15 * scale,
      p.y - 34 * scale,
      p.x - 8 * scale,
      p.y - 32 * scale,
    ]).fill(0xff9f43);
  if (kind === "armored")
    g.roundRect(
      p.x + 8 * scale,
      p.y - 25 * scale,
      10 * scale,
      21 * scale,
      3 * scale,
    )
      .fill(0x59616e)
      .stroke({ color: outline, width: 3 });
  if (kind === "elite")
    g.poly([
      p.x - 11 * scale,
      p.y - 39 * scale,
      p.x,
      p.y - 46 * scale,
      p.x + 11 * scale,
      p.y - 39 * scale,
    ])
      .fill(0xb82143)
      .stroke({ color: outline, width: 2 });
  if (kind === "boss") {
    g.poly([
      p.x - 12 * scale,
      p.y - 40 * scale,
      p.x - 7 * scale,
      p.y - 51 * scale,
      p.x,
      p.y - 43 * scale,
      p.x + 8 * scale,
      p.y - 52 * scale,
      p.x + 12 * scale,
      p.y - 39 * scale,
    ])
      .fill(0xe0a84f)
      .stroke({ color: outline, width: 2 });
    g.roundRect(
      p.x - 22 * scale,
      p.y - 25 * scale,
      10 * scale,
      30 * scale,
      3 * scale,
    )
      .fill(0x7c2636)
      .stroke({ color: outline, width: 3 });
  }
}

function drawAlly(
  g: Graphics,
  p: { x: number; y: number },
  kind: UnitKind,
  tier: number,
) {
  const color = UNITS[kind].color,
    outline = 0x061521,
    tierColor = [0, 0xdcecff, 0x4d9cff, 0xc084fc, 0xfacc15][tier];
  g.ellipse(p.x, p.y + 7, 18, 8).fill({ color: 0x000000, alpha: 0.42 });
  g.roundRect(p.x - 8, p.y - 5, 6, 14, 2)
    .fill(0x12324a)
    .stroke({ color: outline, width: 2 });
  g.roundRect(p.x + 2, p.y - 5, 6, 14, 2)
    .fill(0x12324a)
    .stroke({ color: outline, width: 2 });
  g.poly([
    p.x - 12,
    p.y - 22,
    p.x - 7,
    p.y - 29,
    p.x + 8,
    p.y - 27,
    p.x + 12,
    p.y - 7,
    p.x - 10,
    p.y - 7,
  ])
    .fill(color)
    .stroke({ color: outline, width: 3 });
  g.rect(p.x - 13, p.y - 23, 5, 14)
    .fill(0x285b77)
    .stroke({ color: outline, width: 2 });
  g.circle(p.x, p.y - 35, 10)
    .fill(0xe5b18d)
    .stroke({ color: outline, width: 3 });
  g.roundRect(p.x - 11, p.y - 47, 22, 11, 7)
    .fill(tierColor)
    .stroke({ color: outline, width: 2 });
  g.rect(p.x - 11, p.y - 40, 22, 4).fill(tierColor);
  g.circle(p.x + 4, p.y - 34, 1.4).fill(0x071019);
  // 병종별 장비 실루엣
  if (kind === "rifle")
    g.roundRect(p.x + 5, p.y - 24, 25, 5, 2)
      .fill(0x172733)
      .stroke({ color: outline, width: 2 });
  if (kind === "gunner") {
    g.roundRect(p.x + 4, p.y - 25, 27, 8, 2)
      .fill(0x253846)
      .stroke({ color: outline, width: 2 });
    g.rect(p.x + 27, p.y - 26, 9, 2).fill(0x172733);
    g.rect(p.x + 27, p.y - 20, 9, 2).fill(0x172733);
  }
  if (kind === "cryo") {
    g.circle(p.x - 11, p.y - 17, 7)
      .fill(0xbff7ff)
      .stroke({ color: outline, width: 2 });
    g.roundRect(p.x + 5, p.y - 24, 22, 7, 3)
      .fill(0x6ee7f2)
      .stroke({ color: outline, width: 2 });
  }
  if (kind === "bomber") {
    g.roundRect(p.x + 2, p.y - 29, 25, 11, 5)
      .fill(0x5d3927)
      .stroke({ color: outline, width: 3 });
    g.circle(p.x + 25, p.y - 23, 5).fill(0xffc06b);
  }
  if (kind === "sniper") {
    g.roundRect(p.x + 1, p.y - 24, 36, 4, 1)
      .fill(0x251b31)
      .stroke({ color: outline, width: 2 });
    g.circle(p.x + 13, p.y - 26, 4).stroke({ color: 0xd8b4fe, width: 2 });
  }
  if (kind === "tesla") {
    g.circle(p.x - 10, p.y - 18, 8).stroke({ color: 0xfde047, width: 3 });
    g.circle(p.x - 10, p.y - 18, 3).fill(0xfde047);
    g.moveTo(p.x + 4, p.y - 22)
      .lineTo(p.x + 12, p.y - 28)
      .lineTo(p.x + 18, p.y - 20)
      .lineTo(p.x + 27, p.y - 25)
      .stroke({ color: 0xfde047, width: 3 });
  }
  if (tier > 1) {
    g.circle(p.x, p.y + 6, 7)
      .fill(tierColor)
      .stroke({ color: outline, width: 2 });
    g.circle(p.x, p.y + 6, 2).fill(0xffffff);
  }
}
export async function mountBoard(host: HTMLElement, engine: GameEngine) {
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundColor: 0x071019,
    antialias: true,
    resolution: Math.min(devicePixelRatio, 2),
    autoDensity: true,
  });
  host.appendChild(app.canvas);
  const allyFiles = UNIT_ASSET_FILES;
  const enemyFiles = ENEMY_ASSET_FILES;
  const allyTint: Record<UnitKind, number> = {
    militia: 0xb8c0cc,
    rifle: 0xffffff,
    gunner: 0xffffff,
    cryo: 0xffffff,
    bomber: 0xffffff,
    sniper: 0xffffff,
    tesla: 0xffffff,
    mortar: 0xf8c36c,
    railgun: 0xc4b5fd,
    cataclysm: 0xffe7a3,
  };
  const muzzleOffset: Record<UnitKind, { x: number; y: number }> = {
    militia: { x: 31, y: -34 },
    rifle: { x: 34, y: -36 },
    gunner: { x: 34, y: -35 },
    cryo: { x: 31, y: -38 },
    sniper: { x: 36, y: -39 },
    bomber: { x: 30, y: -32 },
    mortar: { x: 29, y: -35 },
    tesla: { x: 33, y: -39 },
    railgun: { x: 38, y: -39 },
    cataclysm: { x: 32, y: -36 },
  };
  const buildFiles = Object.keys(BUILDINGS) as MapAssetKind[];
  const allyTextures = {} as Record<UnitKind, Texture>,
    enemyTextures = {} as Record<EnemyKind, Texture>,
    buildTextures = {} as Record<MapAssetKind, Texture>;
  await Promise.all(
    (Object.keys(allyFiles) as UnitKind[]).map(async (kind) => {
      allyTextures[kind] = await Assets.load(
        publicAssetUrl(`assets/units/${allyFiles[kind]}.png`),
      );
    }),
  );
  await Promise.all(
    (Object.keys(enemyFiles) as EnemyKind[]).map(async (kind) => {
      enemyTextures[kind] = await Assets.load(
        publicAssetUrl(`assets/units/${enemyFiles[kind]}.png`),
      );
    }),
  );
  await Promise.all(
    buildFiles.map(async (name) => {
      const category = BUILDINGS[name].category,
        folder =
          category === "floor"
            ? "floor"
            : category === "terrain"
              ? "terrain"
              : "build";
      buildTextures[name] = await Assets.load(
        publicAssetUrl(`assets/${folder}/${name}.png`),
      );
    }),
  );
  const [
    borderWallTexture,
    borderBastionTexture,
    spawnCaveTexture,
    defenseCoreTexture,
  ] = await Promise.all([
    Assets.load(publicAssetUrl("assets/backgrounds/border-wall.webp")),
    Assets.load(publicAssetUrl("assets/backgrounds/border-bastion.webp")),
    Assets.load(publicAssetUrl("assets/routes/spawn-cave.webp")),
    Assets.load(publicAssetUrl("assets/routes/defense-core.webp")),
  ]);
  const world = new Container();
  app.stage.addChild(world);
  const farBorderGround = new Graphics(),
    outerTerrain = new Graphics(),
    facilityLayer = new Container(),
    maintenanceGround = new Graphics(),
    maintenanceDetails = new Graphics(),
    backBorderLayer = new Container(),
    ground = new Graphics(),
    worldEdge = new Graphics(),
    path = new Graphics(),
    routeMarkerLayer = new Container(),
    routeStatusLayer = new Container(),
    terrainLayer = new Container(),
    gridLines = new Graphics(),
    actors = new Graphics(),
    spriteLayer = new Container(),
    frontBorderLayer = new Container(),
    wallLightFx = new Graphics(),
    fx = new Graphics(),
    healthBars = new Graphics(),
    overlay = new Graphics();
  terrainLayer.sortableChildren = true;
  spriteLayer.sortableChildren = true;
  routeMarkerLayer.sortableChildren = true;
  facilityLayer.sortableChildren = true;
  backBorderLayer.sortableChildren = true;
  frontBorderLayer.sortableChildren = true;
  world.addChild(
    farBorderGround,
    outerTerrain,
    facilityLayer,
    maintenanceGround,
    maintenanceDetails,
    backBorderLayer,
    ground,
    worldEdge,
    terrainLayer,
    path,
    routeMarkerLayer,
    gridLines,
    actors,
    spriteLayer,
    frontBorderLayer,
    wallLightFx,
    fx,
    healthBars,
    routeStatusLayer,
  );
  app.stage.addChild(overlay);
  const allySprites = new Map<number, Sprite>(),
    enemySprites = new Map<number, Sprite>(),
    buildSprites = new Map<number, Sprite>(),
    routeMarkerSprites = new Map<string, Sprite>(),
    routeStatusMarkers = new Map<
      string,
      { container: Container; background: Graphics; label: Text }
    >();
  let placementGhost: Sprite | null = null,
    buildGhost: Sprite | null = null,
    eraseHighlighted: Sprite | null = null;
  let lastProjection = engine.state === "builder" ? "ortho" : "iso",
    lastMapSize = "",
    lastGridKey = "",
    lastMapRevision = -1,
    lastScreenSize = `${app.screen.width}:${app.screen.height}`,
    viewWidth = app.screen.width,
    viewHeight = app.screen.height,
    zoomLevel = 1,
    focusedFirstEntrance = false;
  const project = (x: number, y: number) =>
    engine.state === "builder" ? { x: x * 32, y: y * 32 } : iso(x, y);
  const viewScale = (mode = lastProjection) =>
    mode === "ortho"
      ? Math.min(
          (app.screen.width - 30) / (52 * 32),
          (app.screen.height - 90) / (46 * 32),
        ) * 0.96
      : Math.min(
          (app.screen.width - 30) / (98 * 32),
          (app.screen.height - 90) / (98 * 16),
        ) * 1.32;
  const initialScale = viewScale() * zoomLevel,
    initialCenter = project(engine.mapWidth / 2, engine.mapHeight / 2);
  world.scale.set(initialScale);
  world.position.set(app.screen.width / 2 - initialCenter.x * initialScale, 58);
  let down: {
      x: number;
      y: number;
      wx: number;
      wy: number;
      button: number;
    } | null = null,
    hover: { x: number; y: number } | null = null,
    dragEnd: { x: number; y: number } | null = null;
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinching = false,
    lastPinchDistance = 0,
    lastPinchCenter = { x: 0, y: 0 };
  let lastAudioId = 0;
  const toGrid = (cx: number, cy: number) => {
    const sx = (cx - world.x) / world.scale.x,
      sy = (cy - world.y) / world.scale.y;
    return engine.state === "builder"
      ? { x: sx / 32, y: sy / 32 }
      : { x: sx / 64 + sy / 32, y: sy / 32 - sx / 64 };
  };
  const zoomAt = (factor: number, screenX: number, screenY: number) => {
    const oldScale = world.scale.x,
      baseScale = viewScale(),
      nextScale = Math.max(
        baseScale * 0.62,
        Math.min(baseScale * 2.3, oldScale * factor),
      ),
      focusX = (screenX - world.x) / oldScale,
      focusY = (screenY - world.y) / oldScale;
    zoomLevel = nextScale / baseScale;
    world.scale.set(nextScale);
    world.position.set(
      screenX - focusX * nextScale,
      screenY - focusY * nextScale,
    );
  };
  const focusFirstActiveEntrance = (snap: Snapshot) => {
    const mobileViewport =
      window.matchMedia("(pointer: coarse)").matches ||
      (app.screen.width <= 1100 && app.screen.height <= 500);
    if (!mobileViewport || focusedFirstEntrance || snap.state !== "deploy")
      return;
    const routeIndex = snap.routes.findIndex(
        (_, index) => (snap.routeStartPhases[index] ?? 1) <= snap.phase + 1,
      ),
      entrance = snap.routes[Math.max(0, routeIndex)]?.[0];
    if (!entrance) return;

    const baseScale = viewScale("iso"),
      scale = Math.min(baseScale * 2.3, baseScale * 1.6),
      point = iso(entrance[0], entrance[1]),
      screenX = app.screen.width * 0.5,
      screenY = Math.max(76, app.screen.height * 0.5);
    zoomLevel = scale / baseScale;
    world.scale.set(scale);
    world.position.set(screenX - point.x * scale, screenY - point.y * scale);
    focusedFirstEntrance = true;
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = app.canvas.getBoundingClientRect();
    zoomAt(
      event.deltaY < 0 ? 1.12 : 1 / 1.12,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  };
  const onZoomCommand = (event: Event) => {
    const command = (event as CustomEvent<-1 | 0 | 1>).detail;
    if (command === 0) {
      const centerX = app.screen.width / 2,
        centerY = app.screen.height / 2,
        factor = 1 / zoomLevel;
      zoomAt(factor, centerX, centerY);
    } else
      zoomAt(
        command > 0 ? 1.18 : 1 / 1.18,
        app.screen.width / 2,
        app.screen.height / 2,
      );
  };
  const layoutBuildSprite = (
    sprite: Sprite,
    kind: MapAssetKind,
    p: { x: number; y: number },
    ortho: boolean,
  ) => {
    const spec = BUILDINGS[kind],
      floor = spec.category === "floor";
    if (floor) {
      sprite.anchor.set(0.5);
      sprite.position.set(p.x, p.y);
      sprite.rotation = ortho ? Math.PI / 4 : 0;
      if (ortho)
        sprite.scale.set(spec.scale / Math.sqrt(2), spec.scale * Math.sqrt(2));
      else sprite.scale.set(spec.scale);
      return;
    }
    if (ortho) {
      const [, footprintHeight] = getMapAssetFootprint(kind);
      if (spec.category === "terrain") {
        sprite.anchor.set(0.5, 0.6);
        sprite.position.set(p.x, p.y);
      } else {
        sprite.anchor.set(0.5, 0.97);
        sprite.position.set(p.x, p.y + footprintHeight * 32 - 4);
      }
      sprite.rotation = 0;
      sprite.scale.set(getBuilderAssetScale(kind));
      return;
    }
    sprite.anchor.set(0.5, 0.97);
    sprite.position.set(p.x, p.y + 8);
    sprite.rotation = 0;
    sprite.scale.set(spec.scale);
  };
  const syncBuildObject = (object: MapObject) => {
    const spec = BUILDINGS[object.kind],
      floor = spec.category === "floor",
      ortho = engine.state === "builder",
      p = floor
        ? project(object.x + 1, object.y + 1)
        : project(object.x, object.y);
    let sprite = buildSprites.get(object.id);
    if (!sprite) {
      sprite = new Sprite(buildTextures[object.kind]);
      sprite.cullable = true;
      (spec.category === "structure" ? spriteLayer : terrainLayer).addChild(
        sprite,
      );
      buildSprites.set(object.id, sprite);
    } else sprite.texture = buildTextures[object.kind];
    layoutBuildSprite(sprite, object.kind, p, ortho);
    sprite.zIndex = floor ? -100000 + p.y : p.y;
    sprite.tint = 0xffffff;
  };
  const CONTROL_TOWER_SOCKETS = {
    left: { x: 240, y: 847 },
    right: { x: 1014, y: 847 },
  } as const;
  const clearBattlefieldBorder = () => {
    farBorderGround.clear();
    outerTerrain.clear();
    maintenanceGround.clear();
    maintenanceDetails.clear();
    wallLightFx.clear();
    for (const child of facilityLayer.removeChildren()) child.destroy();
    for (const child of backBorderLayer.removeChildren()) child.destroy();
    for (const child of frontBorderLayer.removeChildren()) child.destroy();
  };
  const drawGridQuad = (
    graphics: Graphics,
    x: number,
    y: number,
    color: number,
    alpha: number,
    strokeAlpha = 0,
  ) => {
    const p = project(x, y),
      p1 = project(x + 2, y),
      p2 = project(x + 2, y + 2),
      p3 = project(x, y + 2);
    const quad = graphics
      .poly([p.x, p.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y])
      .fill({ color, alpha });
    if (strokeAlpha)
      quad.stroke({ color: 0x415150, width: 1, alpha: strokeAlpha });
  };
  const placeWallPiece = (piece: WallPieceLayout) => {
    const start = project(piece.from.x, piece.from.y),
      end = project(piece.to.x, piece.to.y),
      transform = computeWallSpriteTransform(start, end),
      wall = new Sprite(borderWallTexture);
    wall.anchor.set(
      transform.anchor.x / borderWallTexture.width,
      transform.anchor.y / borderWallTexture.height,
    );
    wall.position.set(transform.position.x, transform.position.y);
    wall.scale.set(transform.scaleX, transform.scaleY);
    wall.rotation = transform.rotation;
    wall.zIndex = Math.max(start.y, end.y);
    (piece.front ? frontBorderLayer : backBorderLayer).addChild(wall);
  };
  const rebuildBattlefieldBorder = (
    mapWidth: number,
    mapHeight: number,
    mapSeed: number,
    routes: [number, number][][],
  ) => {
    clearBattlefieldBorder();
    const layout = createBattlefieldBorderLayout({
        width: mapWidth,
        height: mapHeight,
        seed: mapSeed,
        routes,
      }),
      outerPadding = 12;

    const drawExteriorCell = (x: number, y: number) => {
      const distanceFromMap = Math.max(
        0,
        -x,
        x + 2 - mapWidth,
        -y,
        y + 2 - mapHeight,
      );
      if (distanceFromMap <= 4)
        drawGridQuad(maintenanceGround, x, y, 0x151f22, 0.98, 0.12);
      else if (distanceFromMap <= 9)
        drawGridQuad(
          outerTerrain,
          x,
          y,
          0x17201c,
          0.78 - (distanceFromMap - 4) * 0.055,
        );
      else
        drawGridQuad(
          farBorderGround,
          x,
          y,
          0x091315,
          Math.max(0.12, 0.42 - (distanceFromMap - 9) * 0.11),
        );
    };
    for (let x = -outerPadding; x < mapWidth + outerPadding; x += 2) {
      for (let y = -outerPadding; y < 0; y += 2) drawExteriorCell(x, y);
      for (let y = mapHeight; y < mapHeight + outerPadding; y += 2)
        drawExteriorCell(x, y);
    }
    for (let y = 0; y < mapHeight; y += 2) {
      for (let x = -outerPadding; x < 0; x += 2) drawExteriorCell(x, y);
      for (let x = mapWidth; x < mapWidth + outerPadding; x += 2)
        drawExteriorCell(x, y);
    }

    for (const line of layout.maintenanceLines) {
      const from = project(line.from.x, line.from.y),
        to = project(line.to.x, line.to.y);
      maintenanceDetails
        .moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ color: 0x060b0d, width: 8, alpha: 0.72 });
      maintenanceDetails
        .moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ color: 0x31575b, width: 2, alpha: 0.52 });
    }
    for (const piece of layout.wallPieces) {
      const from = project(piece.from.x, piece.from.y),
        to = project(piece.to.x, piece.to.y);
      maintenanceDetails
        .moveTo(from.x, from.y + 12)
        .lineTo(to.x, to.y + 12)
        .stroke({ color: 0x010405, width: 22, alpha: 0.34 });
    }
    for (const tower of layout.towers) {
      const towerPoint = project(tower.x, tower.y),
        outwardPoint = project(
          tower.x < mapWidth / 2 ? tower.x - 1.55 : tower.x + 1.55,
          tower.y < mapHeight / 2 ? tower.y - 1.55 : tower.y + 1.55,
        );
      maintenanceDetails
        .moveTo(towerPoint.x, towerPoint.y)
        .lineTo(outwardPoint.x, outwardPoint.y)
        .stroke({ color: 0x26383b, width: 34, alpha: 0.9 });
      maintenanceDetails
        .moveTo(towerPoint.x, towerPoint.y)
        .lineTo(outwardPoint.x, outwardPoint.y)
        .stroke({ color: 0x497177, width: 2, alpha: 0.46 });
    }

    const clusters = new Map<number, typeof layout.decorations>();
    for (const decoration of layout.decorations) {
      const list = clusters.get(decoration.cluster) ?? [];
      list.push(decoration);
      clusters.set(decoration.cluster, list);
    }
    for (const entries of clusters.values()) {
      const points = entries.map((entry) => project(entry.x, entry.y)),
        center = points.reduce(
          (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
          { x: 0, y: 0 },
        );
      center.x /= points.length;
      center.y /= points.length;
      outerTerrain
        .ellipse(center.x, center.y + 8, 36 + points.length * 6, 14 + points.length * 2)
        .fill({ color: 0x0a1112, alpha: 0.4 });
      for (const point of points.slice(1))
        outerTerrain
          .moveTo(center.x, center.y)
          .lineTo(point.x, point.y)
          .stroke({ color: 0x253337, width: 3, alpha: 0.44 });
    }
    for (const decoration of layout.decorations) {
      const kind = decoration.kind as BorderDecorationKind,
        p = project(decoration.x, decoration.y),
        sprite = new Sprite(buildTextures[kind]),
        scale = BUILDINGS[kind].scale * decoration.scale;
      sprite.anchor.set(0.5, 0.94);
      sprite.position.set(p.x, p.y + 8);
      sprite.scale.set(decoration.mirror ? -scale : scale, scale);
      sprite.alpha = 0.7;
      sprite.zIndex = p.y;
      facilityLayer.addChild(sprite);
    }

    for (const piece of layout.wallPieces) placeWallPiece(piece);
    for (const tower of layout.towers) {
      const junction = project(tower.x, tower.y),
        socketPoints = tower.sockets
          .map((socket) => project(socket.x, socket.y))
          .sort((a, b) => a.x - b.x);
      if (tower.kind === "control") {
        const [targetLeft, targetRight] = socketPoints,
          sourceWidth =
            CONTROL_TOWER_SOCKETS.right.x - CONTROL_TOWER_SOCKETS.left.x,
          targetX = targetRight.x - targetLeft.x,
          targetY = targetRight.y - targetLeft.y,
          scale = Math.hypot(targetX, targetY) / sourceWidth,
          bastion = new Sprite(borderBastionTexture);
        bastion.anchor.set(
          CONTROL_TOWER_SOCKETS.left.x / borderBastionTexture.width,
          CONTROL_TOWER_SOCKETS.left.y / borderBastionTexture.height,
        );
        bastion.position.set(targetLeft.x, targetLeft.y);
        bastion.scale.set(scale);
        bastion.rotation = Math.atan2(targetY, targetX);
        bastion.zIndex = Math.max(targetLeft.y, targetRight.y) + 24;
        backBorderLayer.addChild(bastion);
      } else {
        const [firstSocket, secondSocket] = socketPoints;
        wallLightFx
          .moveTo(firstSocket.x, firstSocket.y)
          .lineTo(secondSocket.x, secondSocket.y)
          .stroke({ color: 0x111b20, width: 54, cap: "round" });
        wallLightFx
          .moveTo(firstSocket.x, firstSocket.y)
          .lineTo(secondSocket.x, secondSocket.y)
          .stroke({ color: 0x52636a, width: 4, cap: "round" });
        wallLightFx
          .circle(junction.x, junction.y, 20)
          .fill(0x202c32)
          .stroke({ color: 0x71828a, width: 3 });
        wallLightFx.circle(junction.x, junction.y - 2, 4).fill(0x62e7e3);
      }
    }
    for (const light of layout.lights) {
      const p = project(light.x, light.y);
      wallLightFx
        .circle(p.x, p.y - 15, 13)
        .fill({ color: 0x51e6e1, alpha: 0.055 });
      wallLightFx.circle(p.x, p.y - 15, 2.4).fill({
        color: 0x75fff6,
        alpha: 0.68,
      });
    }
  };
  app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("game-camera-zoom", onZoomCommand);
  app.canvas.addEventListener("pointerdown", (e) => {
    app.canvas.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      const [a, b] = [...activePointers.values()];
      pinching = true;
      lastPinchDistance = Math.hypot(b.x - a.x, b.y - a.y);
      lastPinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      down = null;
      dragEnd = null;
      overlay.clear();
      return;
    }
    if (e.button === 0 && engine.state === "builder") engine.beginPaintStroke();
    down = {
      x: e.clientX,
      y: e.clientY,
      wx: world.x,
      wy: world.y,
      button: e.button,
    };
    dragEnd = { x: e.clientX, y: e.clientY };
  });
  app.canvas.addEventListener("pointermove", (e) => {
    const r = app.canvas.getBoundingClientRect();
    if (activePointers.has(e.pointerId))
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      const [a, b] = [...activePointers.values()],
        distance = Math.hypot(b.x - a.x, b.y - a.y),
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        localX = center.x - r.left,
        localY = center.y - r.top;
      if (lastPinchDistance > 0)
        zoomAt(distance / lastPinchDistance, localX, localY);
      world.x += center.x - lastPinchCenter.x;
      world.y += center.y - lastPinchCenter.y;
      lastPinchDistance = distance;
      lastPinchCenter = center;
      hover = null;
      return;
    }
    hover = toGrid(e.clientX - r.left, e.clientY - r.top);
    if (down) {
      dragEnd = { x: e.clientX, y: e.clientY };
      if (down.button === 1 || down.button === 2 || e.shiftKey) {
        world.x = down.wx + e.clientX - down.x;
        world.y = down.wy + e.clientY - down.y;
      } else if (
        down.button === 0 &&
        engine.state === "builder" &&
        engine.buildTool !== "path" &&
        engine.buildTool !== "exit" &&
        hover
      )
        engine.paintMapAsset(hover.x, hover.y);
    }
  });
  app.canvas.addEventListener("pointerleave", () => {
    hover = null;
  });
  app.canvas.addEventListener("pointerup", (e) => {
    activePointers.delete(e.pointerId);
    if (pinching) {
      if (activePointers.size < 2) {
        pinching = false;
        lastPinchDistance = 0;
        engine.endPaintStroke();
      }
      down = null;
      dragEnd = null;
      overlay.clear();
      return;
    }
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y),
      r = app.canvas.getBoundingClientRect();
    if (moved < 12 && down.button === 0) {
      const g = toGrid(e.clientX - r.left, e.clientY - r.top);
      engine.clickWorld(g.x, g.y);
    } else if (
      moved >= 16 &&
      down.button === 0 &&
      !e.shiftKey &&
      !engine.buildMode &&
      !engine.placing
    ) {
      const left = Math.min(down.x, e.clientX) - r.left,
        right = Math.max(down.x, e.clientX) - r.left,
        top = Math.min(down.y, e.clientY) - r.top,
        bottom = Math.max(down.y, e.clientY) - r.top;
      const ids = engine.units
        .filter((u) => {
          const p = project(u.x, u.y),
            sx = world.x + p.x * world.scale.x,
            sy = world.y + p.y * world.scale.y;
          return sx >= left && sx <= right && sy >= top && sy <= bottom;
        })
        .map((u) => u.id);
      engine.selectUnits(ids);
    }
    engine.endPaintStroke();
    down = null;
    dragEnd = null;
    overlay.clear();
  });
  app.canvas.addEventListener("pointercancel", (e) => {
    activePointers.delete(e.pointerId);
    pinching = false;
    lastPinchDistance = 0;
    down = null;
    dragEnd = null;
    engine.endPaintStroke();
    overlay.clear();
  });
  const render = () => {
    actors.clear();
    fx.clear();
    healthBars.clear();
    overlay.clear();
    path.clear();
    const snap = engine.getSnapshot(),
      now = performance.now() / 1000,
      mapSize = `${snap.mapWidth}:${snap.mapHeight}`,
      screenSize = `${app.screen.width}:${app.screen.height}`,
      projection = snap.state === "builder" ? "ortho" : "iso";
    focusFirstActiveEntrance(snap);
    if (projection !== lastProjection) {
      lastProjection = projection;
      zoomLevel = 1;
      const scale = viewScale(projection),
        center = project(snap.mapWidth / 2, snap.mapHeight / 2);
      world.scale.set(scale);
      world.position.set(
        app.screen.width / 2 - center.x * scale,
        projection === "ortho" ? 75 : 58,
      );
      for (const object of engine.mapObjects) syncBuildObject(object);
    }
    const groundKey = `${mapSize}:${projection}:${snap.mapSeed}`;
    if (groundKey !== lastMapSize) {
      lastMapSize = groundKey;
      ground.clear();
      worldEdge.clear();
      const corners = [
          project(0, 0),
          project(snap.mapWidth, 0),
          project(snap.mapWidth, snap.mapHeight),
          project(0, snap.mapHeight),
        ];
      backBorderLayer.visible = projection === "iso";
      frontBorderLayer.visible = projection === "iso";
      if (projection === "iso")
        rebuildBattlefieldBorder(
          snap.mapWidth,
          snap.mapHeight,
          snap.mapSeed,
          snap.routes,
        );
      else clearBattlefieldBorder();
      for (let x = 0; x < snap.mapWidth; x += 2)
        for (let y = 0; y < snap.mapHeight; y += 2) {
          const p = project(x, y),
            p1 = project(x + 2, y),
            p2 = project(x + 2, y + 2),
            p3 = project(x, y + 2);
          ground
            .poly([p.x, p.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y])
            .fill((x + y) % 4 ? 0x0a242b : 0x0d3035)
            .stroke({ color: 0x2b5a5e, width: projection === "ortho" ? 2 : 1 });
        }
      if (projection === "iso") {
        const drop = 22;
        worldEdge
          .poly([
            corners[1].x,
            corners[1].y,
            corners[2].x,
            corners[2].y,
            corners[2].x,
            corners[2].y + drop,
            corners[1].x,
            corners[1].y + drop,
          ])
          .fill(0x20201c)
          .stroke({ color: 0x39433d, width: 2 });
        worldEdge
          .poly([
            corners[2].x,
            corners[2].y,
            corners[3].x,
            corners[3].y,
            corners[3].x,
            corners[3].y + drop,
            corners[2].x,
            corners[2].y + drop,
          ])
          .fill(0x171b19)
          .stroke({ color: 0x34413d, width: 2 });
      }
      worldEdge
        .poly(corners.flatMap((p) => [p.x, p.y]))
        .stroke({
          color: projection === "ortho" ? 0x70a0a0 : 0x53665f,
          width: projection === "ortho" ? 3 : 7,
          alpha: projection === "ortho" ? 0.44 : 0.82,
          join: "round",
        });
    }
    if (screenSize !== lastScreenSize) {
      const focusX = (viewWidth / 2 - world.x) / world.scale.x,
        focusY = (viewHeight / 2 - world.y) / world.scale.y,
        newScale = viewScale() * zoomLevel;
      lastScreenSize = screenSize;
      viewWidth = app.screen.width;
      viewHeight = app.screen.height;
      world.scale.set(newScale);
      world.position.set(
        viewWidth / 2 - focusX * newScale,
        viewHeight / 2 - focusY * newScale,
      );
    }
    const liveRouteMarkers = new Set<string>(),
      liveRouteStatuses = new Set<string>(),
      renderedGatePoints = new Set<string>(),
      projectedRoutes = snap.routes.map((route) =>
        route.map((point) => project(point[0], point[1])),
      ),
      roadLayers = [
        { color: 0x060b0f, width: 122, alpha: 0.92 },
        { color: 0x171f24, width: 108, alpha: 1 },
        { color: 0x655d55, width: 98, alpha: 1 },
        { color: 0x353a3e, width: 84, alpha: 1 },
        { color: 0x2c3034, width: 70, alpha: 0.86 },
      ];
    // Layer every route together so branch junctions form one road surface.
    // Drawing a complete bordered road per route leaves later borders across
    // earlier roads and makes a valid merge look closed.
    for (const layer of roadLayers)
      for (const projected of projectedRoutes) {
        if (projected.length < 2) continue;
        path.moveTo(projected[0].x, projected[0].y);
        for (const point of projected.slice(1)) path.lineTo(point.x, point.y);
        path.stroke({
          color: layer.color,
          width: layer.width,
          cap: "round",
          join: "round",
          alpha: layer.alpha,
        });
      }
    snap.routes.forEach((route, routeIndex) => {
      const projected = projectedRoutes[routeIndex];
      if (projected.length >= 2) {
        const active =
            snap.state === "builder" && routeIndex === snap.activeRoute,
          lineColor = active ? 0x71e7ff : 0xd7aa6c,
          traceRoute = () => {
            path.moveTo(projected[0].x, projected[0].y);
            for (const point of projected.slice(1))
              path.lineTo(point.x, point.y);
          };
        drawDashedRoute(path, projected, lineColor, active ? 4 : 3);
        drawRouteArrows(path, projected, lineColor);
        if (active) {
          traceRoute();
          path.stroke({ color: 0x7cecff, width: 3, alpha: 0.36 });
        }
        const spawn = projected[0],
          gate = projected.at(-1)!,
          gatePoint = route.at(-1)!,
          gateKey = `${gatePoint[0].toFixed(2)}:${gatePoint[1].toFixed(2)}`,
          showGate = !renderedGatePoints.has(gateKey);
        renderedGatePoints.add(gateKey);
        path
          .ellipse(spawn.x, spawn.y + 5, 49, 23)
          .fill({ color: 0xb51e55, alpha: 0.13 })
          .stroke({ color: 0xff557e, width: 3, alpha: 0.42 });
        if (showGate)
          path
            .ellipse(gate.x, gate.y + 5, 50, 23)
            .fill({ color: 0x2e9fbd, alpha: 0.12 })
            .stroke({ color: 0x66e7ff, width: 3, alpha: 0.42 });

        if (projection === "iso") {
          const markerSpecs = [
            {
              key: `spawn:${routeIndex}`,
              texture: spawnCaveTexture,
              point: spawn,
              scale: 0.13,
              anchorY: 0.5,
            },
          ];
          if (showGate)
            markerSpecs.push({
              key: `gate:${routeIndex}`,
              texture: defenseCoreTexture,
              point: gate,
              scale: 0.13,
              anchorY: 0.5,
            });
          for (const spec of markerSpecs) {
            liveRouteMarkers.add(spec.key);
            let marker = routeMarkerSprites.get(spec.key);
            if (!marker) {
              marker = new Sprite(spec.texture);
              marker.anchor.set(0.5, spec.anchorY);
              routeMarkerLayer.addChild(marker);
              routeMarkerSprites.set(spec.key, marker);
            }
            marker.texture = spec.texture;
            marker.anchor.set(0.5, spec.anchorY);
            marker.position.set(spec.point.x, spec.point.y);
            marker.scale.set(spec.scale);
            marker.zIndex = spec.point.y + (spec.key.startsWith("gate") ? 8 : 4);
          }
          const statusKey = `entrance-status:${routeIndex}`,
            startPhase = snap.routeStartPhases[routeIndex] ?? 1,
            phasesRemaining = Math.max(0, startPhase - snap.phase),
            active = phasesRemaining === 0 && snap.phase > 0,
            statusText = active
              ? "활성"
              : `${phasesRemaining || 1} PHASE 후`;
          liveRouteStatuses.add(statusKey);
          let status = routeStatusMarkers.get(statusKey);
          if (!status) {
            const container = new Container(),
              background = new Graphics(),
              label = new Text({
                text: statusText,
                style: {
                  fontFamily:
                    'Inter, "Noto Sans KR", "Malgun Gothic", sans-serif',
                  fontSize: 18,
                  fontWeight: "800",
                  fill: 0xffffff,
                  align: "center",
                },
              });
            label.anchor.set(0.5);
            container.addChild(background, label);
            routeStatusLayer.addChild(container);
            status = { container, background, label };
            routeStatusMarkers.set(statusKey, status);
          }
          status.label.text = statusText;
          status.label.tint = active ? 0x8affdc : 0xffd27a;
          status.background
            .clear()
            .roundRect(
              -status.label.width / 2 - 11,
              -status.label.height / 2 - 6,
              status.label.width + 22,
              status.label.height + 12,
              8,
            )
            .fill({ color: 0x06141c, alpha: 0.92 })
            .stroke({
              color: active ? 0x55e8bf : 0xd9a24e,
              width: 2,
              alpha: 0.86,
            });
          status.container.position.set(spawn.x, spawn.y - 104);
        }
      }
      if (snap.state === "builder" && routeIndex === snap.activeRoute)
        for (let i = 0; i < projected.length; i++) {
          const p = projected[i];
          actors
            .circle(p.x, p.y, 11)
            .fill(
              i === 0
                ? 0xb84fff
                : i === projected.length - 1
                  ? 0xff4567
                  : 0x55dfff,
            )
            .stroke({ color: 0xffffff, width: 2 });
          actors.circle(p.x, p.y, 3).fill(0x071019);
        }
    });
    if (
      snap.state === "builder" &&
      snap.pathEditing &&
      hover
    ) {
      const [cellX, cellY] = engine.snapPathPoint(hover.x, hover.y),
        cellCorner = project(cellX - 1, cellY - 1),
        cellCenter = project(cellX, cellY),
        candidate = engine.findPathSnap(cellX, cellY),
        color = candidate ? 0x63ffd2 : 0x55dfff;
      actors
        .rect(cellCorner.x, cellCorner.y, 64, 64)
        .fill({ color, alpha: 0.2 })
        .stroke({ color, width: 4, alpha: 0.95 });
      actors
        .circle(cellCenter.x, cellCenter.y, candidate ? 10 : 7)
        .fill({ color: candidate ? 0xffffff : color, alpha: 0.95 });
      const tail = snap.pathPoints.at(-1);
      if (tail) {
        const tailPoint = project(tail[0], tail[1]);
        path
          .moveTo(tailPoint.x, tailPoint.y)
          .lineTo(cellCenter.x, cellCenter.y)
          .stroke({ color, width: candidate ? 7 : 5, alpha: 0.82 });
      }
    }
    if (snap.state === "builder" && snap.buildTool === "exit" && hover) {
      const [exitX, exitY] = engine.snapPathPoint(hover.x, hover.y),
        exitCorner = project(exitX - 1, exitY - 1),
        exitPoint = project(exitX, exitY);
      actors
        .rect(exitCorner.x, exitCorner.y, 64, 64)
        .fill({ color: 0x36d7ff, alpha: 0.18 })
        .stroke({ color: 0xb8f5ff, width: 4 })
        .circle(exitPoint.x, exitPoint.y, 24)
        .fill({ color: 0x36d7ff, alpha: 0.22 })
        .stroke({ color: 0xb8f5ff, width: 4 });
      actors.circle(exitPoint.x, exitPoint.y, 7).fill(0xffffff);
    }
    for (const [key, marker] of routeMarkerSprites)
      if (!liveRouteMarkers.has(key)) {
        marker.destroy();
        routeMarkerSprites.delete(key);
      }
    for (const [key, status] of routeStatusMarkers)
      if (!liveRouteStatuses.has(key)) {
        status.container.destroy({ children: true });
        routeStatusMarkers.delete(key);
      }
    const gridKey =
      snap.state === "builder" ? `${mapSize}:${projection}` : "off";
    if (gridKey !== lastGridKey) {
      lastGridKey = gridKey;
      gridLines.clear();
      if (snap.state === "builder")
        for (let x = 0; x < snap.mapWidth; x += 2)
          for (let y = 0; y < snap.mapHeight; y += 2) {
            const p = project(x, y),
              p1 = project(x + 2, y),
              p2 = project(x + 2, y + 2),
              p3 = project(x, y + 2);
            gridLines
              .poly([p.x, p.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y])
              .stroke({ color: 0x9eeaff, width: 2, alpha: 0.48 });
          }
    }
    if (
      !snap.buildMode &&
      down &&
      dragEnd &&
      down.button === 0 &&
      Math.hypot(dragEnd.x - down.x, dragEnd.y - down.y) >= 16
    ) {
      const r = app.canvas.getBoundingClientRect(),
        x = Math.min(down.x, dragEnd.x) - r.left,
        y = Math.min(down.y, dragEnd.y) - r.top,
        w = Math.abs(dragEnd.x - down.x),
        h = Math.abs(dragEnd.y - down.y);
      overlay
        .rect(x, y, w, h)
        .fill({ color: 0x57e8c2, alpha: 0.1 })
        .stroke({ color: 0x57e8c2, width: 2 });
    }
    if (snap.placing) {
      const target = hover && engine.nearestValidCell(hover.x, hover.y);
      if (target) {
        const p = project(target.x, target.y);
        actors
          .ellipse(p.x, p.y + 3, 25, 12)
          .fill({ color: 0x31e6a1, alpha: 0.2 })
          .stroke({ color: 0x57e8c2, width: 3 });
        if (
          !placementGhost ||
          placementGhost.texture !== allyTextures[snap.placing]
        ) {
          placementGhost?.destroy();
          placementGhost = new Sprite(allyTextures[snap.placing]);
          placementGhost.anchor.set(0.5, 0.97);
          placementGhost.alpha = 0.58;
          spriteLayer.addChild(placementGhost);
        }
        placementGhost.visible = true;
        placementGhost.position.set(p.x, p.y + 8);
        placementGhost.scale.set(0.31);
        placementGhost.zIndex = p.y + 1;
      } else if (placementGhost) placementGhost.visible = false;
    }
    if (!snap.placing && placementGhost) placementGhost.visible = false;
    if (
      snap.buildMode &&
      snap.buildTool &&
      snap.buildTool !== "erase" &&
      snap.buildTool !== "path" &&
      snap.buildTool !== "exit"
    ) {
      const kind = snap.buildTool,
        spec = BUILDINGS[kind];
      const target =
        hover && engine.nearestValidBuildCell(hover.x, hover.y, kind);
      if (target) {
        const floor = spec.category === "floor",
          [footprintWidth, footprintHeight] = getMapAssetFootprint(kind),
          p = floor
            ? project(target.x + 1, target.y + 1)
            : project(target.x, target.y);
        if (floor)
          actors
            .rect(p.x - 32, p.y - 32, 64, 64)
            .fill({ color: 0x47c9ff, alpha: 0.13 })
            .stroke({ color: 0x7ce7ff, width: 3 });
        else {
          const footprintCorner = project(
            target.x - footprintWidth,
            target.y - footprintHeight,
          );
          actors
            .rect(
              footprintCorner.x,
              footprintCorner.y,
              footprintWidth * 64,
              footprintHeight * 64,
            )
            .fill({ color: 0x47c9ff, alpha: 0.18 })
            .stroke({ color: 0x7ce7ff, width: 3 });
        }
        if (!buildGhost || buildGhost.texture !== buildTextures[kind]) {
          buildGhost?.destroy();
          buildGhost = new Sprite(buildTextures[kind]);
          buildGhost.alpha = 0.7;
          (floor ? terrainLayer : spriteLayer).addChild(buildGhost);
        }
        buildGhost.visible = true;
        layoutBuildSprite(buildGhost, kind, p, true);
        buildGhost.zIndex = floor ? -99999 : p.y + 1;
      }
    }
    if (
      (!snap.buildMode ||
        snap.buildTool === "erase" ||
        snap.buildTool === "path" ||
        snap.buildTool === "exit" ||
        !snap.buildTool) &&
      buildGhost
    )
      buildGhost.visible = false;
    if (lastMapRevision !== engine.mapRevision) {
      lastMapRevision = engine.mapRevision;
      const changes = engine.consumeMapChanges();
      if (changes.reset) {
        for (const sprite of buildSprites.values()) sprite.destroy();
        buildSprites.clear();
      }
      for (const id of changes.removed) {
        buildSprites.get(id)?.destroy();
        buildSprites.delete(id);
      }
      for (const object of changes.changed) syncBuildObject(object);
    }
    if (eraseHighlighted) {
      eraseHighlighted.tint = 0xffffff;
      eraseHighlighted = null;
    }
    if (snap.buildMode && snap.buildTool === "erase" && hover) {
      const object = engine.mapObjectAt(hover.x, hover.y);
      if (object) {
        const floor = BUILDINGS[object.kind].category === "floor",
          [footprintWidth, footprintHeight] = getMapAssetFootprint(object.kind),
          p = floor
            ? project(object.x + 1, object.y + 1)
            : project(object.x, object.y),
          sprite = buildSprites.get(object.id);
        if (sprite) {
          eraseHighlighted = sprite;
          sprite.tint = 0xff7070;
        }
        const footprintCorner = floor
          ? { x: p.x - 32, y: p.y - 32 }
          : project(
              object.x - footprintWidth,
              object.y - footprintHeight,
            );
        actors
          .rect(
            footprintCorner.x,
            footprintCorner.y,
            footprintWidth * 64,
            footprintHeight * 64,
          )
          .fill({ color: 0xff405c, alpha: 0.18 })
          .stroke({ color: 0xff7080, width: 3 });
      }
    }
    const liveEnemies = new Set<number>();
    for (const e of engine.enemies) {
      const pos = engine.pointAt(e.progress, e.route, e.lane),
        p = project(pos.x, pos.y),
        s =
          e.kind === "boss"
            ? 0.38
            : e.kind === "warden" ||
                e.kind === "juggernaut" ||
                e.kind === "brute"
              ? 0.32
              : e.kind === "elite" ||
                  e.kind === "armored" ||
                  e.kind === "sapper"
                ? 0.29
                : e.kind === "drone"
                  ? 0.22
                  : 0.255,
        slowed = e.slowUntil > engine.elapsed,
        fastMover =
          e.kind === "runner" ||
          e.kind === "phantom" ||
          e.kind === "drone" ||
          e.kind === "phase_tracker",
        motionCadence = (fastMover ? 11 : 7) * (slowed ? 0.175 : 0.31),
        bob =
          Math.sin(now * motionCadence + e.id) * (slowed ? 0.75 : 1.15),
        color = ENEMIES[e.kind].color;
      liveEnemies.add(e.id);
      let sprite = enemySprites.get(e.id);
      if (!sprite) {
        sprite = new Sprite(enemyTextures[e.kind]);
        sprite.anchor.set(0.5, 0.97);
        spriteLayer.addChild(sprite);
        enemySprites.set(e.id, sprite);
      }
      sprite.position.set(p.x, p.y + 8 + bob);
      sprite.rotation =
        Math.sin(now * (slowed ? 0.9 : 1.6) + e.id) *
        (slowed ? 0.006 : 0.01);
      sprite.scale.set(-s, s);
      sprite.zIndex = p.y;
      sprite.tint = slowed ? 0x9eefff : 0xffffff;
      actors
        .ellipse(
          p.x,
          p.y + 7,
          20 * (e.kind === "boss" ? 1.7 : 1),
          8 * (e.kind === "boss" ? 1.7 : 1),
        )
        .fill({ color, alpha: 0.25 })
        .stroke({ color, width: e.kind === "boss" ? 4 : 2, alpha: 0.8 });
      if (slowed)
        actors
          .ellipse(p.x, p.y + 5, 23, 10)
          .fill({ color: 0x67e8f9, alpha: 0.16 })
          .stroke({ color: 0xa5f3fc, width: 2, alpha: 0.9 });
      const screenX = world.x + p.x * world.scale.x,
        screenY = world.y + p.y * world.scale.y,
        onScreen =
          screenX > -80 &&
          screenX < app.screen.width + 80 &&
          screenY > -100 &&
          screenY < app.screen.height + 80;
      if (onScreen) {
        const strong = e.kind === "boss" || ENEMIES[e.kind].hp >= 500,
          boss = e.kind === "boss",
          barWidth = boss ? 68 : strong ? 46 : 30,
          barHeight = boss ? 6 : strong ? 5 : 3,
          barY = p.y - (boss ? 82 : strong ? 66 : 55),
          ratio = Math.max(0, Math.min(1, e.hp / e.maxHp)),
          hpColor =
            ratio > 0.55 ? 0x55e68a : ratio > 0.25 ? 0xffcb57 : 0xff5368,
          alpha = ratio < 1 || strong ? 0.95 : 0.68;
        healthBars
          .rect(p.x - barWidth / 2 - 1, barY - 1, barWidth + 2, barHeight + 2)
          .fill({ color: 0x050b10, alpha });
        healthBars
          .rect(p.x - barWidth / 2, barY, barWidth * ratio, barHeight)
          .fill({ color: hpColor, alpha });
      }
    }
    for (const [id, sprite] of enemySprites)
      if (!liveEnemies.has(id)) {
        sprite.destroy();
        enemySprites.delete(id);
      }
    const liveAllies = new Set<number>();
    for (const u of engine.units) {
      const p = project(u.x, u.y),
        spec = UNITS[u.kind],
        actualRange = engine.getUnitRange(u),
        selected =
          engine.selectedIds.includes(u.id) || u.id === engine.selected,
        bob =
          Math.sin(now * (u.moving ? 9 : 2.6) + u.id) * (u.moving ? 1.6 : 0.45);
      liveAllies.add(u.id);
      if (selected) {
        actors
          .ellipse(p.x, p.y + 3, 25, 12)
          .fill({ color: 0x6cf5ff, alpha: 0.18 })
          .stroke({ color: 0x6cf5ff, width: 3 });
        if (engine.selectedIds.length <= 1)
          actors
            .poly(
              Array.from({ length: 49 }, (_, index) => {
                const angle = (index / 48) * Math.PI * 2,
                  edge = project(
                    u.x + Math.cos(angle) * actualRange,
                    u.y + Math.sin(angle) * actualRange,
                  );
                return [edge.x, edge.y];
              }).flat(),
              true,
            )
            .fill({ color: spec.color, alpha: 0.035 })
            .stroke({ color: spec.color, width: 2, alpha: 0.42 });
      }
      actors
        .ellipse(p.x, p.y + 7, 18, 7)
        .fill({ color: 0x000000, alpha: 0.36 });
      let sprite = allySprites.get(u.id);
      if (!sprite) {
        sprite = new Sprite(allyTextures[u.kind]);
        sprite.anchor.set(0.5, 0.97);
        spriteLayer.addChild(sprite);
        allySprites.set(u.id, sprite);
      }
      const facing = u.facing ?? 1,
        attacking = (u.attackUntil ?? 0) > engine.elapsed,
        recoil = attacking
          ? 3 *
            Math.min(1, Math.max(0, (u.attackUntil! - engine.elapsed) / 0.18))
          : 0;
      sprite.position.set(p.x - facing * recoil, p.y + 8 + bob);
      sprite.rotation = u.moving
        ? Math.sin(now * 7 + u.id) * 0.018
        : attacking
          ? -facing * 0.035
          : 0;
      sprite.scale.set(facing * 0.31, 0.31);
      sprite.zIndex = p.y + 2;
      sprite.tint = allyTint[u.kind];
      if (u.tier >= 3) {
        const auraColor = u.tier === 4 ? 0xffd166 : 0xa78bfa;
        actors
          .ellipse(p.x, p.y + 6, u.tier === 4 ? 25 : 22, u.tier === 4 ? 11 : 9)
          .stroke({
            color: auraColor,
            width: u.tier === 4 ? 3 : 2,
            alpha: 0.82,
          });
      }
      if (u.tier > 1) {
        const tierColor = [0, 0xdcecff, 0x4d9cff, 0xc084fc, 0xfacc15][u.tier];
        actors
          .circle(p.x, p.y + 7, 7)
          .fill(tierColor)
          .stroke({ color: 0x061521, width: 2 });
      }
    }
    for (const [id, sprite] of allySprites)
      if (!liveAllies.has(id)) {
        sprite.destroy();
        allySprites.delete(id);
      }
    for (const s of engine.shots) {
      const a = project(s.x1, s.y1),
        b = project(s.x2, s.y2),
        muzzle = muzzleOffset[s.kind],
        muzzleX = a.x + muzzle.x * s.facing,
        muzzleY = a.y + muzzle.y,
        powerShot = s.kind === "sniper" || s.kind === "railgun";
      fx.moveTo(muzzleX, muzzleY)
        .lineTo(b.x, b.y - 8)
        .stroke({
          color: s.color,
          width: s.kind === "railgun" ? 8 : powerShot ? 5 : 3,
          alpha: Math.min(1, s.life * 10),
        });
      fx.circle(
        muzzleX,
        muzzleY,
        (powerShot ? 6 : 3) + s.life * (powerShot ? 32 : 22),
      )
        .fill({ color: 0xfff2b0, alpha: Math.min(1, s.life * 8) })
        .stroke({
          color: s.color,
          width: 2,
          alpha: Math.min(1, s.life * 8),
        });
    }
    for (const effect of engine.effects) {
      const p = project(effect.x, effect.y),
        fade = Math.min(1, effect.life * 5);
      if (effect.kind === "hit") {
        fx.circle(p.x, p.y - 10, 7 + 6 * (1 - fade)).stroke({
          color: 0xffffff,
          width: 3,
          alpha: fade,
        });
      } else if (effect.kind === "blast") {
        fx.circle(p.x, p.y, 18 + 32 * (1 - fade))
          .fill({ color: effect.color, alpha: 0.12 * fade })
          .stroke({ color: effect.color, width: 5, alpha: fade });
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          fx.moveTo(p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 6)
            .lineTo(p.x + Math.cos(a) * 42, p.y + Math.sin(a) * 21)
            .stroke({ color: 0xffe0a3, width: 3, alpha: fade });
        }
      } else if (effect.kind === "freeze") {
        fx.circle(p.x, p.y, 12 + 18 * (1 - fade)).stroke({
          color: 0xbff8ff,
          width: 4,
          alpha: fade,
        });
        fx.moveTo(p.x - 16, p.y)
          .lineTo(p.x + 16, p.y)
          .moveTo(p.x, p.y - 12)
          .lineTo(p.x, p.y + 12)
          .stroke({ color: 0xe8feff, width: 2, alpha: fade });
      } else if (effect.kind === "death") {
        for (let i = 0; i < 5; i++) {
          const a = (i * 1.7 + effect.id) * 0.8,
            r = 28 * (1 - fade);
          fx.rect(
            p.x + Math.cos(a) * r - 3,
            p.y - 10 + Math.sin(a) * r * 0.5 - 3,
            6,
            6,
          ).fill({ color: effect.color, alpha: fade });
        }
      } else if (effect.kind === "reward") {
        fx.circle(p.x, p.y - 28 - (1 - fade) * 24, 5)
          .fill({ color: 0xffd166, alpha: fade })
          .stroke({ color: 0xffffff, width: 1, alpha: fade });
      }
    }
    for (const event of engine.audioEvents)
      if (event.id > lastAudioId) {
        gameAudio.play(event.kind);
        lastAudioId = event.id;
      }
  };
  app.ticker.add((t) => {
    engine.advance(Math.min(t.deltaMS / 1000, 0.1));
    render();
  });
  return () => {
    window.removeEventListener("game-camera-zoom", onZoomCommand);
    app.canvas.removeEventListener("wheel", onWheel);
    app.destroy(true, { children: true });
  };
}
