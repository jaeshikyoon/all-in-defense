import { describe, expect, it } from "vitest";
import { clampAudioVolume } from "./AudioManager";

describe("audio volume", () => {
  it("keeps the master volume inside the supported range", () => {
    expect(clampAudioVolume(-0.4)).toBe(0);
    expect(clampAudioVolume(0.63)).toBe(0.63);
    expect(clampAudioVolume(1.8)).toBe(1);
    expect(clampAudioVolume(Number.NaN)).toBe(1);
  });
});
