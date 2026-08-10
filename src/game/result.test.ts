import { describe, expect, it } from "vitest";
import {
  findScorePlacement,
  getOperationGrade,
  getOperationGradeAsset,
  type OperationGrade,
} from "./result";

describe("operation result grade", () => {
  it.each([
    [-1, "C"],
    [0, "C"],
    [199, "C"],
    [200, "B"],
    [499, "B"],
    [500, "A"],
    [999, "A"],
    [1_000, "S"],
    [1_999, "S"],
    [2_000, "SS"],
    [3_999, "SS"],
    [4_000, "SSS"],
    [100_000, "SSS"],
  ] satisfies ReadonlyArray<readonly [number, OperationGrade]>) (
    "maps %i kills to %s",
    (kills, grade) => {
      expect(getOperationGrade(kills)).toBe(grade);
    },
  );

  it("provides WebP badges for the S-family grades", () => {
    expect(getOperationGradeAsset("S")).toBe(
      "assets/ui/grades/operation-grade-s.webp",
    );
    expect(getOperationGradeAsset("SS")).toBe(
      "assets/ui/grades/operation-grade-ss.webp",
    );
    expect(getOperationGradeAsset("SSS")).toBe(
      "assets/ui/grades/operation-grade-sss.webp",
    );
  });

  it.each(["C", "B", "A"] as const)(
    "keeps the %s grade text-only",
    (grade) => {
      expect(getOperationGradeAsset(grade)).toBeNull();
    },
  );
});

describe("score placement", () => {
  const scores = [
    { id: "first", kills: 4_000 },
    { id: "second", kills: 2_500 },
    { id: "third", kills: 1_000 },
  ] as const;

  it("returns the one-based position and leaderboard size", () => {
    expect(findScorePlacement(scores, "first")).toEqual({ rank: 1, total: 3 });
    expect(findScorePlacement(scores, "second")).toEqual({ rank: 2, total: 3 });
    expect(findScorePlacement(scores, "third")).toEqual({ rank: 3, total: 3 });
  });

  it("returns null when the current result is not in the supplied ranking", () => {
    expect(findScorePlacement(scores, "missing")).toBeNull();
  });

  it("handles an empty ranking", () => {
    expect(findScorePlacement([], "missing")).toBeNull();
  });

  it("uses the first matching record when duplicate ids are supplied", () => {
    expect(
      findScorePlacement([{ id: "same" }, { id: "same" }], "same"),
    ).toEqual({ rank: 1, total: 2 });
  });
});
