import { describe, expect, it } from "vitest";
import {
  ENEMY_WORLD_SPEED_SCALE,
  GameEngine,
  PHASE_COMBAT_SECONDS,
  PHASE_ENEMY_COUNT,
  type Unit,
} from "./Engine";
import {
  ENEMIES,
  ENEMY_ASSET_FILES,
  ENEMY_PHASE_INFO,
  getStrongDamageMultiplier,
  getUnitDamage,
  STRONG_DAMAGE_MULTIPLIERS,
  TIER_DAMAGE_MULTIPLIERS,
  UNIT_ASSET_FILES,
  UNITS,
  type EnemyKind,
  type UnitKind,
} from "./data";

function enterDeploy(game: GameEngine) {
  game.start();
  game.resolvePoker();
  game.acceptPokerReward();
}

function skipDeployment(game: GameEngine) {
  enterDeploy(game);
  game.pendingUnits = [];
  game.placing = null;
}

describe("poker defense loop", () => {
  it("has a display asset for every unit in the reward catalog", () => {
    expect(Object.keys(UNIT_ASSET_FILES).sort()).toEqual(
      Object.keys(UNITS).sort(),
    );
  });

  it("has a display asset for every enemy in the enemy archive", () => {
    expect(Object.keys(ENEMY_ASSET_FILES).sort()).toEqual(
      Object.keys(ENEMIES).sort(),
    );
    expect(new Set(Object.values(ENEMY_ASSET_FILES)).size).toBe(12);
  });

  it("starts immediately with a unique five-card poker hand", () => {
    const game = new GameEngine();
    game.start();
    expect(game.state).toBe("poker");
    expect(game.hand).toHaveLength(5);
    expect(new Set(game.hand.map((card) => card.id)).size).toBe(5);
    expect(game.units).toHaveLength(0);
    expect(game.enemies).toHaveLength(0);
  });

  it("allows at most three cards to be marked for replacement", () => {
    const game = new GameEngine();
    game.start();
    [0, 1, 2, 3].forEach((index) => game.toggleDiscard(index));
    expect([...game.discarded]).toEqual([0, 1, 2]);
    const oldIds = game.hand.map((card) => card.id);
    game.resolvePoker();
    expect(game.pokerResult).not.toBeNull();
    expect(game.discarded.size).toBe(0);
    expect(
      game.hand.slice(0, 3).every((card, index) => card.id !== oldIds[index]),
    ).toBe(true);
    expect(game.hand[3].id).toBe(oldIds[3]);
  });

  it("turns the finished hand into one or more free deployable units", () => {
    const game = new GameEngine();
    enterDeploy(game);
    expect(game.state).toBe("deploy");
    expect(game.pendingUnits.length).toBeGreaterThan(0);
    const reward = game.pendingUnits[0];
    const target = game.nearestValidCell(30, 40)!;
    game.clickWorld(target.x, target.y);
    expect(game.units[0]).toMatchObject({
      kind: reward.kind,
      tier: reward.tier,
    });
    expect(game.pendingUnits.length).toBe(
      (game.pokerResult?.rewards.length ?? 0) - 1,
    );
  });

  it("keeps a poker reward ready after an invalid deployment tap", () => {
    const game = new GameEngine();
    enterDeploy(game);
    const pendingBefore = game.pendingUnits.map((unit) => ({ ...unit })),
      placingBefore = game.placing,
      nearestValidCell = game.nearestValidCell;
    game.nearestValidCell = () => null;

    game.clickWorld(-1000, -1000);

    expect(game.state).toBe("deploy");
    expect(game.pendingUnits).toEqual(pendingBefore);
    expect(game.placing).toBe(placingBefore);
    expect(game.getSnapshot().message).toContain("배치할 수 없는 위치");
    game.nearestValidCell = nearestValidCell;
  });

  it("does not let selection cancel mandatory poker reward deployment", () => {
    const game = new GameEngine();
    enterDeploy(game);
    const pendingBefore = game.pendingUnits.map((unit) => ({ ...unit })),
      placingBefore = game.placing;

    game.selectUnits([]);

    expect(game.pendingUnits).toEqual(pendingBefore);
    expect(game.placing).toBe(placingBefore);
  });

  it("starts a phase only after all poker rewards have been deployed", () => {
    const game = new GameEngine();
    enterDeploy(game);
    game.startPhase();
    expect(game.state).toBe("deploy");
    game.pendingUnits = [];
    game.placing = null;
    game.startPhase();
    expect(game.state).toBe("running");
    expect(game.phase).toBe(1);
    expect(game.phaseTotal).toBe(game.phasePlan(1).length);
  });

  it("pauses combat while a blocking game dialog is open", () => {
    const game = new GameEngine();
    game.state = "running";
    game.setPaused(true);
    game.update(2);
    expect(game.elapsed).toBe(0);
    expect(game.phaseElapsed).toBe(0);

    game.setPaused(false);
    game.update(1);
    expect(game.elapsed).toBe(1);
    expect(game.phaseElapsed).toBe(1);
  });

  it("cycles through 1x, 2x, and 4x only while combat is running", () => {
    const game = new GameEngine();
    game.state = "running";
    game.toggleTimeScale();
    expect(game.getSnapshot().timeScale).toBe(2);
    game.toggleTimeScale();
    expect(game.getSnapshot().timeScale).toBe(4);
    game.advance(1);
    expect(game.elapsed).toBe(4);
    expect(game.phaseElapsed).toBe(4);
    game.toggleTimeScale();
    expect(game.getSnapshot().timeScale).toBe(1);

    game.state = "poker";
    game.advance(1);
    expect(game.elapsed).toBe(4);
    expect(game.phaseElapsed).toBe(4);
  });

  it("opens the next poker draw after scheduled spawning ends while survivors remain", () => {
    const game = new GameEngine();
    skipDeployment(game);
    game.phase = 1;
    game.phaseTotal = 1;
    game.phaseSpawned = 0;
    game.queue = [{ kind: "juggernaut", group: "PHASE 1" }];
    game.state = "running";
    game.update(1.6);
    expect(game.enemies).toHaveLength(1);
    expect(game.state).toBe("running");
    game.phaseElapsed = PHASE_COMBAT_SECONDS - 0.5;
    game.update(1.6);
    expect(game.state).toBe("poker");
    expect(game.enemies).toHaveLength(1);
  });

  it("uses varied squad sizes and visible rests for different enemy types", () => {
    const game = new GameEngine();
    const entries = <T extends keyof typeof ENEMIES>(kind: T, count: number) =>
        Array.from({ length: count }, () => ({ kind, group: "PHASE 10" })),
      deployment = game.buildPhaseDeployment([
        ...entries("grunt", 12),
        ...entries("runner", 8),
        ...entries("armored", 4),
        ...entries("juggernaut", 2),
        ...entries("boss", 1),
      ]),
      squadSizes = new Map<number, number>();
    for (const enemy of deployment.queue) {
      const squad = enemy.squad ?? -1;
      squadSizes.set(squad, (squadSizes.get(squad) ?? 0) + 1);
    }
    expect([...squadSizes.values()]).toEqual([12, 8, 4, 2, 1]);
    expect(deployment.times[12] - deployment.times[11]).toBeGreaterThan(
      (deployment.times[1] - deployment.times[0]) * 3,
    );

    game.phase = 10;
    game.state = "running";
    game.queue = deployment.queue;
    game.phaseSpawnTimes = deployment.times;
    game.phaseTotal = game.queue.length;
    game.phaseSpawned = 0;

    game.update(deployment.times[11] + 0.001);
    expect(game.phaseSpawned).toBe(12);
    expect(new Set(game.enemies.map((enemy) => enemy.lane))).toEqual(
      new Set([0, -1, 1]),
    );
    const gap = deployment.times[12] - game.phaseElapsed;
    game.update(gap * 0.5);
    expect(game.phaseSpawned).toBe(12);
    game.update(gap * 0.5 + 0.001);
    expect(game.phaseSpawned).toBe(13);
    expect(game.state).toBe("running");

    game.phaseElapsed = PHASE_COMBAT_SECONDS - 0.1;
    game.update(0.1);
    expect(game.phaseSpawned).toBe(game.phaseTotal);
    expect(game.queue).toHaveLength(0);
    expect(game.state).toBe("poker");
  });

  it("pauses surviving enemies during poker and deploy intermissions", () => {
    const game = new GameEngine();
    skipDeployment(game);
    game.phase = 1;
    game.phaseTotal = 1;
    game.queue = [{ kind: "grunt", group: "PHASE 1" }];
    game.state = "running";
    game.update(1.6);
    game.phaseElapsed = PHASE_COMBAT_SECONDS - 0.5;
    game.update(0.6);
    const progress = game.enemies[0].progress;
    game.update(10);
    expect(game.enemies[0].progress).toBe(progress);
    game.resolvePoker();
    game.acceptPokerReward();
    game.update(10);
    expect(game.enemies[0].progress).toBe(progress);
  });

  it("uses all twelve enemy types and adds a boss every ten phases", () => {
    const game = new GameEngine();
    const kinds = new Set(game.phasePlan(10).map((entry) => entry.kind));
    expect(kinds).toEqual(new Set(Object.keys(ENEMIES)));
    expect(game.phasePlan(10).at(-1)?.kind).toBe("boss");
    expect(game.phasePlan(11).some((entry) => entry.kind === "boss")).toBe(
      false,
    );
    expect(game.phasePlan(20).at(-1)?.kind).toBe("boss");
  });

  it("caps endless phase duration while shifting the plan toward stronger enemies", () => {
    const game = new GameEngine(),
      phase2 = game.phasePlan(2),
      phase10 = game.phasePlan(10),
      phase30 = game.phasePlan(30),
      phase100 = game.phasePlan(100);

    expect(phase2).toHaveLength(PHASE_ENEMY_COUNT);
    expect(phase10).toHaveLength(PHASE_ENEMY_COUNT);
    expect(phase30).toHaveLength(PHASE_ENEMY_COUNT);
    expect(phase100).toHaveLength(PHASE_ENEMY_COUNT);
    expect(phase10.at(-1)?.kind).toBe("boss");
    expect(phase30.filter((enemy) => enemy.kind === "boss")).toHaveLength(2);
    expect(phase100.length).toBe(PHASE_ENEMY_COUNT);
    expect(
      phase30.filter((enemy) =>
        ["elite", "juggernaut", "warden", "boss"].includes(enemy.kind),
      ).length,
    ).toBeGreaterThan(5);
  });

  it("keeps the opening intact and progressively promotes midgame squads", () => {
    const game = new GameEngine(),
      basePlan = Array.from({ length: 40 }, () => ({
        kind: "grunt" as const,
        group: "test",
      })),
      opening = game.escalatePhaseComposition(basePlan, 10),
      midgame = game.escalatePhaseComposition(basePlan, 20),
      lateGame = game.escalatePhaseComposition(basePlan, 40),
      promotedCount = (plan: { kind: EnemyKind }[]) =>
        plan.filter((enemy) => enemy.kind !== "grunt").length;

    expect(promotedCount(opening)).toBe(0);
    expect(promotedCount(midgame)).toBe(10);
    expect(promotedCount(lateGame)).toBe(26);
    expect(game.phasePlan(20)).toHaveLength(PHASE_ENEMY_COUNT);
    expect(game.phasePlan(40)).toHaveLength(PHASE_ENEMY_COUNT);
  });

  it("continues to another poker draw after a boss phase instead of winning", () => {
    const game = new GameEngine();
    game.phase = 10;
    game.phaseTotal = 1;
    game.phaseSpawned = 1;
    game.queue = [];
    game.state = "running";
    game.enemies.push({
      id: 99,
      kind: "boss",
      group: "PHASE 10",
      hp: 1,
      maxHp: 1,
      progress: 0.5,
      slowUntil: 0,
      route: 0,
      lane: 0,
    });
    game.enemies[0].hp = 0;
    game.update(0.1);
    expect(game.state).toBe("running");
    game.phaseElapsed = PHASE_COMBAT_SECONDS - 0.5;
    game.update(1.2);
    expect(game.state).toBe("poker");
  });

  it("ends only on gate destruction and records kills as the ranking score", () => {
    const game = new GameEngine();
    game.state = "running";
    game.phase = 7;
    game.phaseTotal = 1;
    game.phaseSpawned = 0;
    game.queue = [{ kind: "grunt", group: "PHASE 7" }];
    game.kills = 321;
    game.gate = 20;
    game.update(0.01);
    expect(game.state).toBe("defeat");
    expect(game.bestKills).toBe(321);
    expect(game.getSnapshot().bestKills).toBe(321);
  });

  it("keeps three visual lanes across multiple map routes", () => {
    const game = new GameEngine();
    game.routes.push(game.routes[0].map(([x, y]) => [x, y + 2]));
    game.computePath();
    game.queue = Array.from({ length: 12 }, () => ({
      kind: "grunt" as const,
      group: "test",
    }));
    for (let i = 0; i < 12; i++) game.spawnEnemy();
    expect(new Set(game.enemies.map((e) => e.route))).toEqual(new Set([0, 1]));
    expect(new Set(game.enemies.map((e) => e.lane))).toEqual(
      new Set([0, -1, 1]),
    );
  });

  it("spawns enemies only from entrances unlocked for the current phase", () => {
    const game = new GameEngine();
    game.routes = [
      [[1, 1], [20, 20]],
      [[1, 10], [20, 20]],
      [[1, 19], [20, 20]],
    ];
    game.routeStartPhases = [1, 3, 5];
    game.phase = 3;
    game.queue = Array.from({ length: 8 }, () => ({
      kind: "grunt" as const,
      group: "phase gate",
    }));
    for (let i = 0; i < 8; i++) game.spawnEnemy();
    expect(new Set(game.enemies.map((enemy) => enemy.route))).toEqual(
      new Set([0, 1]),
    );

    game.phase = 5;
    game.queue = Array.from({ length: 6 }, () => ({
      kind: "grunt" as const,
      group: "phase gate",
    }));
    for (let i = 0; i < 6; i++) game.spawnEnemy();
    expect(new Set(game.enemies.map((enemy) => enemy.route))).toEqual(
      new Set([0, 1, 2]),
    );
  });

  it("keeps lane offsets continuous through a sharp corner", () => {
    const game = new GameEngine();
    game.routes = [[[0, 0], [10, 0], [10, 10]]];
    game.computePath();
    const before = game.pointAt(9.99 / 20, 0, 1),
      after = game.pointAt(10.01 / 20, 0, 1);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
      0.1,
    );
  });

  it("advances a normal enemy visibly during a short phase window", () => {
    const game = new GameEngine();
    game.state = "running";
    game.queue = [{ kind: "grunt", group: "pending" }];
    game.enemies.push({
      id: 991,
      kind: "grunt",
      group: "test",
      hp: 40,
      maxHp: 40,
      progress: 0,
      slowUntil: 0,
      route: 0,
      lane: 0,
    });
    game.update(5);
    expect(game.enemies[0].progress).toBeCloseTo(
      (5 * ENEMY_WORLD_SPEED_SCALE) / 48,
      6,
    );
  });

  it("keeps world movement speed constant when a map route gets longer", () => {
    const createGame = (routeLength: number) => {
      const game = new GameEngine();
      game.routes = [[[0, 0], [routeLength, 0]]];
      game.computePath();
      game.state = "running";
      game.phaseTotal = 1;
      game.enemies.push({
        id: routeLength,
        kind: "grunt",
        group: "route speed",
        hp: 40,
        maxHp: 40,
        progress: 0,
        slowUntil: 0,
        route: 0,
        lane: 0,
      });
      return game;
    };
    const shortRoute = createGame(20),
      longRoute = createGame(120);

    shortRoute.update(1);
    longRoute.update(1);

    expect(longRoute.enemies[0].progress).toBeLessThan(
      shortRoute.enemies[0].progress,
    );
    expect(shortRoute.enemies[0].progress * 20).toBeCloseTo(
      longRoute.enemies[0].progress * 120,
      6,
    );
  });

  it("provides ten hand-matched units and twelve visibly different enemies", () => {
    expect(Object.keys(UNITS)).toHaveLength(10);
    expect(Object.keys(ENEMIES)).toHaveLength(12);
    expect(
      new Set(Object.values(ENEMIES).map((enemy) => enemy.color)).size,
    ).toBe(12);
  });

  it("moves selected units during the deployment preparation stage", () => {
    const game = new GameEngine();
    game.state = "deploy";
    game.units.push({
      id: 777,
      kind: "rifle",
      tier: 1,
      x: 14,
      y: 9,
      cooldown: 0,
      damageDone: 0,
    });
    game.selectUnits([777]);
    game.clickWorld(30, 40);
    expect(game.units[0].moving).toBeDefined();
    const before = { x: game.units[0].x, y: game.units[0].y };
    game.update(0.5);
    expect({ x: game.units[0].x, y: game.units[0].y }).not.toEqual(before);
  });

  it("reserves separated destinations for a multi-unit move", () => {
    const game = new GameEngine();
    game.state = "deploy";
    game.units.push(
      ...[
        [14, 9],
        [16, 9],
        [14, 11],
        [16, 11],
      ].map(([x, y], index) => ({
        id: 800 + index,
        kind: "rifle" as const,
        tier: 1,
        x,
        y,
        cooldown: 0,
        damageDone: 0,
      })),
    );
    game.selectUnits(game.units.map((unit) => unit.id));
    game.clickWorld(30, 40);

    const targets = game.units.map((unit) => unit.moving!);
    expect(targets.every(Boolean)).toBe(true);
    for (let i = 0; i < targets.length; i++)
      for (let j = i + 1; j < targets.length; j++)
        expect(
          Math.hypot(targets[i].x - targets[j].x, targets[i].y - targets[j].y),
        ).toBeGreaterThanOrEqual(2.1 - 1e-8);

    game.update(20);
    for (let i = 0; i < game.units.length; i++)
      for (let j = i + 1; j < game.units.length; j++)
        expect(
          Math.hypot(
            game.units[i].x - game.units[j].x,
            game.units[i].y - game.units[j].y,
          ),
        ).toBeGreaterThanOrEqual(2.1 - 1e-8);
  });

  it("turns an attacking unit toward its target and records that shot direction", () => {
    const game = new GameEngine();
    const target = game.pointAt(0.2);
    const unit: Unit = {
      id: 778,
      kind: "rifle",
      tier: 1,
      x: target.x - 1,
      y: target.y,
      cooldown: 0,
      damageDone: 0,
    };
    game.units.push(unit);
    game.enemies.push({
      id: 779,
      kind: "grunt",
      group: "test",
      hp: 40,
      maxHp: 40,
      progress: 0.2,
      slowUntil: 0,
      route: 0,
      lane: 0,
    });
    game.attack(unit);
    expect(unit.facing).toBe(1);
    expect(unit.attackUntil).toBeGreaterThan(game.elapsed);
    expect(game.shots[0].facing).toBe(1);
  });

  it("applies a 50% area slow when the cryomancer attacks", () => {
    const game = new GameEngine();
    game.elapsed = 5;
    const target = game.pointAt(0.2),
      unit: Unit = {
        id: 880,
        kind: "cryo",
        tier: 1,
        x: target.x - 1,
        y: target.y,
        cooldown: 0,
        damageDone: 0,
      };
    game.units.push(unit);
    for (let i = 0; i < 3; i++)
      game.enemies.push({
        id: 881 + i,
        kind: "grunt",
        group: "test",
        hp: 40,
        maxHp: 40,
        progress: 0.2 + i * 0.001,
        slowUntil: 0,
        route: 0,
        lane: 0,
      });
    game.attack(unit);
    expect(game.enemies.every((enemy) => enemy.slowUntil >= 8)).toBe(true);
    expect(game.enemies.every((enemy) => enemy.hp < enemy.maxHp)).toBe(true);
    game.state = "running";
    const before = game.enemies[0].progress;
    game.update(1);
    expect(game.enemies[0].progress - before).toBeCloseTo(
      (0.5 * ENEMY_WORLD_SPEED_SCALE) / 48,
      5,
    );
  });

  it("starts each enemy health curve at its debut and preserves phase 30 balance", () => {
    const game = new GameEngine();
    for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
      const debut = ENEMY_PHASE_INFO[kind].firstPhase;
      expect(game.getEnemyHealthScale(kind, debut - 1)).toBe(1);
      expect(game.getEnemyHealthScale(kind, debut)).toBe(1);
      expect(game.getEnemyMaxHp(kind, debut)).toBe(ENEMIES[kind].hp);
      expect(game.getEnemyHealthScale(kind, 30)).toBeCloseTo(4.98, 8);
    }
    expect(game.getEnemyHealthScale("grunt", 10)).toBeCloseTo(2.08, 3);
    expect(game.getEnemyHealthScale("grunt", 20)).toBeCloseTo(3.53, 3);
    expect(game.getEnemyMaxHp("boss", 10)).toBe(7000);
    expect(game.getEnemyMaxHp("boss", 20)).toBe(20930);
    expect(game.getEnemyMaxHp("grunt", 20)).toBe(141);
    expect(game.getEnemyHealthScale("boss", 40)).toBeCloseTo(7.03, 8);
    expect(game.getEnemyHealthScale("grunt", 50)).toBeGreaterThan(
      game.getEnemyHealthScale("grunt", 40) * 1.3,
    );
  });

  it("makes a straight sniper stronger than a one-pair rifle against one target", () => {
    const rifleDps = UNITS.rifle.damage * UNITS.rifle.rate;
    const sniperDps = UNITS.sniper.damage * UNITS.sniper.rate;
    expect(sniperDps).toBeGreaterThan(rifleDps);
    expect(UNITS.sniper.damage).toBeGreaterThan(ENEMIES.armored.hp);
    expect(UNITS.sniper.rate).toBeCloseTo(0.14 * 1.3 * 2, 6);
  });

  it("uses the requested T1 damage and exact shared tier multipliers", () => {
    const t1Damage: Record<UnitKind, number> = {
      militia: 12,
      rifle: 20,
      gunner: 8,
      cryo: 18,
      sniper: 460,
      bomber: 40,
      mortar: 75,
      tesla: 60,
      railgun: 1500,
      cataclysm: 200,
    };
    expect(TIER_DAMAGE_MULTIPLIERS).toEqual([0, 1, 2.2, 4.8, 10.5]);
    for (const kind of Object.keys(t1Damage) as UnitKind[]) {
      expect(UNITS[kind].damage).toBe(t1Damage[kind]);
      expect(getUnitDamage(kind, 1)).toBe(t1Damage[kind]);
      expect(getUnitDamage(kind, 2)).toBeCloseTo(t1Damage[kind] * 2.2, 8);
      expect(getUnitDamage(kind, 3)).toBeCloseTo(t1Damage[kind] * 4.8, 8);
      expect(getUnitDamage(kind, 4)).toBeCloseTo(t1Damage[kind] * 10.5, 8);
    }
  });

  it("always gains total shot damage after merging two equal units", () => {
    for (const kind of Object.keys(UNITS) as UnitKind[]) {
      for (let tier = 1; tier < 4; tier++) {
        const before = getUnitDamage(kind, tier) * 2;
        const after = getUnitDamage(kind, tier + 1);
        expect(after).toBeGreaterThan(before);
      }
    }
    expect(2.2 / 2 - 1).toBeCloseTo(0.1, 8);
    expect(4.8 / (2.2 * 2) - 1).toBeCloseTo(0.090909, 5);
    expect(10.5 / (4.8 * 2) - 1).toBeCloseTo(0.09375, 5);
  });

  it("applies ×2.0 only to the existing strong enemy targets in combat", () => {
    expect(STRONG_DAMAGE_MULTIPLIERS).toEqual({ sniper: 2, railgun: 2 });
    expect(getStrongDamageMultiplier("sniper", "elite")).toBe(2);
    expect(getStrongDamageMultiplier("sniper", "juggernaut")).toBe(2);
    expect(getStrongDamageMultiplier("railgun", "boss")).toBe(2);
    expect(getStrongDamageMultiplier("sniper", "warden")).toBe(1);

    const game = new GameEngine();
    const position = game.pointAt(0.2);
    const sniper: Unit = {
      id: 990,
      kind: "sniper",
      tier: 1,
      x: position.x,
      y: position.y,
      cooldown: 0,
      damageDone: 0,
    };
    game.enemies.push({
      id: 991,
      kind: "elite",
      group: "test",
      hp: 2000,
      maxHp: 2000,
      progress: 0.2,
      slowUntil: 0,
      route: 0,
      lane: 0,
    });
    game.attack(sniper);
    expect(game.enemies[0].hp).toBe(1080);
    expect(sniper.damageDone).toBe(920);
    expect(sniper.cooldown).toBeCloseTo(1 / (0.14 * 1.3 * 2), 6);
  });

  it("meets every requested PHASE 30 kill and relative-power check", () => {
    const game = new GameEngine();
    expect(game.getEnemyMaxHp("phantom", 30)).toBe(448);
    expect(game.getEnemyMaxHp("grunt", 30)).toBe(199);
    expect(game.getEnemyMaxHp("juggernaut", 30)).toBe(5478);
    expect(game.getEnemyMaxHp("boss", 30)).toBe(34860);
    expect(UNITS.sniper.damage).toBeGreaterThanOrEqual(448);
    expect(UNITS.cataclysm.damage).toBeGreaterThanOrEqual(199);

    const railgunVolley = UNITS.railgun.damage * 2 * 3;
    expect(railgunVolley).toBe(9000);
    expect(railgunVolley).toBeGreaterThan(5478);
    expect(railgunVolley / 34860).toBeCloseTo(0.2582, 4);

    const teslaDps = 3 * UNITS.tesla.damage * UNITS.tesla.rate * 2.7;
    const mortarDps = 2 * UNITS.mortar.damage * UNITS.mortar.rate * 4;
    expect(teslaDps).toBeCloseTo(437.4, 8);
    expect(mortarDps).toBe(252);
    expect(teslaDps).toBeGreaterThan(mortarDps);
  });

  it("matches the intended poker-hand combat-power progression", () => {
    const baseline = UNITS.militia.damage * UNITS.militia.rate;
    const relative = {
      highCard: baseline / baseline,
      onePair: (UNITS.rifle.damage * UNITS.rifle.rate) / baseline,
      twoPair: (2 * UNITS.gunner.damage * UNITS.gunner.rate) / baseline,
      triple: (UNITS.cryo.damage * UNITS.cryo.rate * 2.1) / baseline,
      straight: (UNITS.sniper.damage * UNITS.sniper.rate * 2) / baseline,
      flush: (2 * UNITS.bomber.damage * UNITS.bomber.rate * 4) / baseline,
      fullHouse: (2 * UNITS.mortar.damage * UNITS.mortar.rate * 4) / baseline,
      fourKind: (3 * UNITS.tesla.damage * UNITS.tesla.rate * 2.7) / baseline,
      straightFlush:
        (3 * UNITS.railgun.damage * UNITS.railgun.rate * 2) / baseline,
      royalFlush:
        (4 * UNITS.cataclysm.damage * UNITS.cataclysm.rate * 5) / baseline,
    };
    expect(relative.highCard).toBe(1);
    expect(relative.onePair).toBeCloseTo(2, 1);
    expect(relative.twoPair).toBeCloseTo(5.1, 1);
    expect(relative.triple).toBeCloseTo(3, 1);
    expect(relative.straight).toBeCloseTo(26.6, 1);
    expect(relative.flush).toBeCloseTo(14, 1);
    expect(relative.fullHouse).toBeCloseTo(20, 8);
    expect(relative.fourKind).toBeCloseTo(34.7, 1);
    expect(relative.straightFlush).toBeCloseTo(50, 8);
    expect(relative.royalFlush).toBeCloseTo(120.6, 1);
  });
});

describe("map builder invariants", () => {
  it("places and removes saved map decorations", () => {
    const game = new GameEngine();
    game.enterBuilder();
    game.chooseBuildTool("lamp_post");
    const before = game.mapObjects.length;
    game.clickWorld(50, 44);
    expect(game.mapObjects.length).toBe(before + 1);
    const placed = game.mapObjects.at(-1)!;
    game.chooseBuildTool("erase");
    game.clickWorld(placed.x, placed.y);
    expect(game.mapObjects.length).toBe(before);
  });

  it("allows one floor and one asset per tile without stacking", () => {
    const game = new GameEngine();
    game.enterBuilder();
    const floorCount = game.floorCells.size;
    game.chooseBuildTool("floor_steel");
    game.clickWorld(0.5, 0.5);
    expect(game.floorCells.size).toBe(floorCount);
    expect(game.floorCells.get("0:0")?.kind).toBe("floor_steel");
    game.chooseBuildTool("grass_patch");
    game.clickWorld(26, 12);
    const placed = game.mapObjects.at(-1)!;
    game.chooseBuildTool("dirt_mound");
    game.clickWorld(26, 12);
    expect(game.assetCells.get(`${placed.x}:${placed.y}`)?.kind).toBe(
      "grass_patch",
    );
  });

  it("normalizes legacy overlapping map data", () => {
    const game = new GameEngine();
    game.mapObjects.push(
      { id: 90001, kind: "floor_mud", x: 0, y: 0 },
      { id: 90002, kind: "grass_patch", x: 3, y: 3 },
      { id: 90003, kind: "dirt_mound", x: 3, y: 3 },
    );
    game.normalizeMapObjects();
    expect(
      game.mapObjects.filter(
        (o) => o.x === 0 && o.y === 0 && o.kind.startsWith("floor_"),
      ),
    ).toHaveLength(1);
    expect(
      game.mapObjects.filter(
        (o) => o.x === 3 && o.y === 3 && !o.kind.startsWith("floor_"),
      ),
    ).toHaveLength(1);
  });

  it("snaps a new entrance into an existing route and reuses its exit", () => {
    const game = new GameEngine();
    game.routes = [[[1, 1], [25, 15], [49, 43]]];
    game.computePath();
    game.enterBuilder();
    game.beginPathEdit(true);
    game.clickWorld(1, 43);
    game.clickWorld(25, 15);
    expect(game.routes).toHaveLength(2);
    expect(game.pathEditing).toBe(false);
    expect(game.pathPoints).toEqual([
      [1, 43],
      [25, 15],
      [49, 43],
    ]);
  });

  it("preserves the user-authored exit when the map grows", () => {
    const game = new GameEngine();
    game.routes = [[[1, 1], [19, 13], [37, 21]]];
    game.enterBuilder();
    game.resizeMap(80, 60);
    expect(game.routes[0].at(-1)).toEqual([37, 21]);
  });

  it("saves the exact exit selected while redrawing the primary route", () => {
    const game = new GameEngine();
    game.enterBuilder();
    game.beginPathEdit(false);
    game.clickWorld(1, 1);
    game.clickWorld(17, 11);
    game.clickWorld(31, 27);
    game.finishPathEdit();
    expect(game.routes[0].at(-1)).toEqual([31, 27]);
  });

  it("moves only the shared exit when the builder selects a new location", () => {
    const game = new GameEngine();
    game.routes = [
      [[1, 1], [15, 11], [31, 27]],
      [[49, 5], [15, 11], [31, 27]],
    ];
    game.enterBuilder();
    game.beginExitMove();
    game.clickWorld(39, 33);
    expect(game.routes.map((route) => route.at(-1))).toEqual([
      [39, 33],
      [39, 33],
    ]);
    expect(game.routes[0].slice(0, -1)).toEqual([[1, 1], [15, 11]]);
    expect(game.routes[1].slice(0, -1)).toEqual([[49, 5], [15, 11]]);
  });

  it("edits and deletes entrance phase metadata with its route", () => {
    const game = new GameEngine();
    game.routes = [
      [[1, 1], [31, 27]],
      [[49, 5], [31, 27]],
    ];
    game.routeStartPhases = [1, 4];
    game.enterBuilder();
    game.setRouteStartPhase(1, 7);
    expect(game.routeStartPhases).toEqual([1, 7]);
    game.deleteRoute(0);
    expect(game.routeStartPhases).toEqual([7]);
  });

  it("does not save a second independent exit", () => {
    const game = new GameEngine();
    game.routes = [[[1, 1], [25, 15], [49, 43]]];
    game.computePath();
    game.enterBuilder();
    game.beginPathEdit(true);
    game.clickWorld(1, 43);
    game.clickWorld(11, 39);
    game.finishPathEdit();
    expect(game.pathEditing).toBe(true);
  });

  it("resizes large maps and fills every square floor tile", () => {
    const game = new GameEngine();
    game.enterBuilder();
    game.resizeMap(999, 999);
    expect([game.mapWidth, game.mapHeight]).toEqual([200, 160]);
    game.fillFloor("floor_steel");
    const floors = game.mapObjects.filter((o) => o.kind.startsWith("floor_"));
    expect(floors).toHaveLength((200 / 2) * (160 / 2));
    expect(floors.every((o) => o.kind === "floor_steel")).toBe(true);
  });
});
