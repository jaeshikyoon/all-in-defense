import { describe, expect, it } from "vitest";
import { createStoredMap, exportMapJson, importMapJson, validateMapData } from "./storage";

const sampleMap = {
  width: 52,
  height: 46,
  seed: 1234,
  objects: [{ kind: "command_tent" as const, x: 4, y: 6 }],
  routes: [
    [
      [2, 4],
      [18, 20],
      [40, 32],
    ],
  ] as [number, number][][],
  routeStartPhases: [1],
};

describe("local map storage format", () => {
  it("validates and normalizes portable map JSON", () => {
    expect(validateMapData(sampleMap)).toEqual(sampleMap);
  });

  it("rejects maps without a playable route", () => {
    expect(() => validateMapData({ ...sampleMap, routes: [] })).toThrow(
      "경로가 필요합니다",
    );
  });

  it("exports and imports a map without browser-specific identifiers", () => {
    const stored = createStoredMap("테스트 전장", sampleMap);
    const exported = exportMapJson(stored);
    expect(exported).not.toContain(stored.id);
    const imported = importMapJson(exported);
    expect(imported.name).toBe("테스트 전장 가져옴");
    expect(imported.routes).toEqual(sampleMap.routes);
    expect(imported.id).not.toBe(stored.id);
  });
});
