import { describe, expect, it } from "vitest";
import {
  classifyHand,
  createDeck,
  evaluateHand,
  HAND_REWARD_COUNT,
  HAND_UNITS,
  type Card,
  type Rank,
  type Suit,
} from "./poker";

const cards = (
  ranks: Rank[],
  suits: Suit[] = ["spades", "hearts", "diamonds", "clubs", "spades"],
): Card[] =>
  ranks.map((rank, index) => ({
    id: `${suits[index]}-${rank}`,
    rank,
    suit: suits[index],
  }));

describe("poker hand evaluation", () => {
  it("recognizes royal flushes and grants the maximum reward", () => {
    const hand = cards([10, 11, 12, 13, 14], Array(5).fill("spades") as Suit[]);
    const result = evaluateHand(hand);
    expect(result.rank).toBe("royal_flush");
    expect(result.rewards).toHaveLength(4);
    expect(result.rewards.every((reward) => reward.kind === "cataclysm")).toBe(
      true,
    );
    expect(result.rewards.every((reward) => reward.tier === 1)).toBe(true);
  });

  it("builds a 32-card deck from ranks seven through ace", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map((card) => card.id)).size).toBe(32);
    expect(new Set(deck.map((card) => card.rank))).toEqual(
      new Set([7, 8, 9, 10, 11, 12, 13, 14]),
    );
  });

  it("recognizes ace-seven-eight-nine-ten as a short-deck straight", () => {
    expect(classifyHand(cards([14, 7, 8, 9, 10]))).toBe("straight");
    expect(
      classifyHand(cards([14, 7, 8, 9, 10], Array(5).fill("clubs") as Suit[])),
    ).toBe("straight_flush");
  });

  it("distinguishes full houses, two pair, and high card", () => {
    expect(classifyHand(cards([8, 8, 8, 12, 12]))).toBe("full_house");
    expect(classifyHand(cards([7, 7, 9, 9, 13]))).toBe("two_pair");
    expect(classifyHand(cards([7, 9, 11, 12, 14]))).toBe("high_card");
  });

  it("keeps the dominant suit while the hand chooses the unit", () => {
    const result = evaluateHand(
      cards(
        [7, 7, 8, 10, 13],
        ["hearts", "hearts", "hearts", "clubs", "diamonds"],
      ),
    );
    expect(result.dominantSuit).toBe("hearts");
    expect(result.rewards[0].kind).toBe("rifle");
    expect(result.rewards[0].tier).toBe(1);
  });

  it("maps each stronger hand to a different unit instead of a higher tier", () => {
    const twoPair = evaluateHand(cards([7, 7, 9, 9, 13]));
    const straight = evaluateHand(cards([7, 8, 9, 10, 11]));
    const fullHouse = evaluateHand(cards([8, 8, 8, 12, 12]));
    expect(twoPair.rewards[0]).toMatchObject({ kind: "gunner", tier: 1 });
    expect(straight.rewards[0]).toMatchObject({ kind: "sniper", tier: 1 });
    expect(fullHouse.rewards[0]).toMatchObject({ kind: "mortar", tier: 1 });
  });

  it("keeps the visual reward catalog aligned with the poker rewards", () => {
    expect(Object.keys(HAND_UNITS)).toHaveLength(10);
    expect(HAND_UNITS.straight).toBe("sniper");
    expect(HAND_REWARD_COUNT.two_pair).toBe(2);
    expect(HAND_REWARD_COUNT.royal_flush).toBe(4);
  });
});
