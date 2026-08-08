import { describe, expect, it } from "vitest";
import { circularIndex, sortBattlefieldsByName } from "./ui";

describe("circular battlefield carousel", () => {
  it("wraps from the first map to the last map", () => {
    expect(circularIndex(0, 5, -1)).toBe(4);
  });

  it("wraps from the last map to the first map", () => {
    expect(circularIndex(4, 5, 1)).toBe(0);
  });

  it("moves normally between maps", () => {
    expect(circularIndex(2, 5, -1)).toBe(1);
    expect(circularIndex(2, 5, 1)).toBe(3);
  });
});

describe("battlefield name ordering", () => {
  it("sorts Korean, English and numbered names from left to right", () => {
    const maps = [
      { id: "4", name: "전장 10" },
      { id: "2", name: "Alpha" },
      { id: "1", name: "전장 2" },
      { id: "3", name: "기지" },
    ];

    expect(sortBattlefieldsByName(maps).map((map) => map.name)).toEqual([
      "기지",
      "전장 2",
      "전장 10",
      "Alpha",
    ]);
    expect(maps.map((map) => map.name)).toEqual([
      "전장 10",
      "Alpha",
      "전장 2",
      "기지",
    ]);
  });
});
