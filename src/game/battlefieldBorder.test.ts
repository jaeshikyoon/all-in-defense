import { describe, expect, it } from "vitest";
import {
  computeWallSpriteTransform,
  createBattlefieldBorderLayout,
  WALL_IMAGE_SOCKETS,
  WALL_OVERLAP_TILES,
  type BorderSide,
} from "./battlefieldBorder";

const sizes = [
  [24, 24],
  [160, 160],
  [160, 32],
  [32, 160],
] as const;

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("procedural battlefield border", () => {
  it("maps the measured wall image sockets exactly onto both isometric slopes", () => {
    const targets = [
      [{ x: 0, y: 0 }, { x: 320, y: 160 }],
      [{ x: 0, y: 160 }, { x: 320, y: 0 }],
    ] as const;
    for (const [from, to] of targets) {
      const transform = computeWallSpriteTransform(from, to),
        socket = transform.endSocket,
        localX = (socket.x - transform.anchor.x) * transform.scaleX,
        localY = (socket.y - transform.anchor.y) * transform.scaleY,
        cos = Math.cos(transform.rotation),
        sin = Math.sin(transform.rotation),
        mapped = {
          x: transform.position.x + localX * cos - localY * sin,
          y: transform.position.y + localX * sin + localY * cos,
        };
      expect(mapped.x).toBeCloseTo(to.x, 5);
      expect(mapped.y).toBeCloseTo(to.y, 5);
      expect(transform.anchor === WALL_IMAGE_SOCKETS.left || transform.anchor === WALL_IMAGE_SOCKETS.right).toBe(true);
    }
  });

  it.each(sizes)("connects every wall run without gaps on a %ix%i map", (width, height) => {
    const layout = createBattlefieldBorderLayout({ width, height, seed: 77 });
    expect(layout.towers).toHaveLength(4);
    expect(layout.maintenanceLines).toHaveLength(4);
    for (const side of ["north", "east", "south", "west"] as BorderSide[]) {
      const pieces = layout.wallPieces.filter((piece) => piece.side === side);
      expect(pieces.length).toBeGreaterThan(0);
      for (let index = 1; index < pieces.length; index++)
        expect(distance(pieces[index - 1].to, pieces[index].from)).toBeCloseTo(
          WALL_OVERLAP_TILES,
          5,
        );
      const expectedLength = side === "north" || side === "south" ? width : height;
      expect(pieces.length).toBeGreaterThanOrEqual(Math.floor(expectedLength / 9));
    }
    for (const tower of layout.towers)
      for (const socket of tower.sockets)
        expect(
          layout.wallPieces.some(
            (piece) =>
              distance(piece.from, socket) < 0.00001 ||
              distance(piece.to, socket) < 0.00001,
          ),
        ).toBe(true);
  });

  it.each(sizes)("keeps decorations outside the playable area on a %ix%i map", (width, height) => {
    const layout = createBattlefieldBorderLayout({
      width,
      height,
      seed: 991,
      routes: [
        [
          [1, 1],
          [width - 1, height - 1],
        ],
      ],
    });
    for (const decoration of layout.decorations) {
      expect(
        decoration.x < 0 ||
          decoration.x > width ||
          decoration.y < 0 ||
          decoration.y > height,
      ).toBe(true);
    }
    for (let i = 0; i < layout.decorations.length; i++)
      for (let j = i + 1; j < layout.decorations.length; j++)
        expect(distance(layout.decorations[i], layout.decorations[j])).toBeGreaterThanOrEqual(
          1.149,
        );
  });

  it("is deterministic for a map seed and scales density with perimeter", () => {
    const small = createBattlefieldBorderLayout({ width: 24, height: 24, seed: 42 }),
      repeat = createBattlefieldBorderLayout({ width: 24, height: 24, seed: 42 }),
      large = createBattlefieldBorderLayout({ width: 160, height: 160, seed: 42 });
    expect(repeat).toEqual(small);
    expect(large.decorations.length).toBeGreaterThan(small.decorations.length * 4);
    expect(large.wallPieces.length).toBeGreaterThan(small.wallPieces.length * 4);
  });
});
