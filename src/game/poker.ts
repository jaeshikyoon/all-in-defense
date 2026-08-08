import type { UnitKind } from "./data";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type Card = { id: string; suit: Suit; rank: Rank };
export type HandRank =
  | "high_card"
  | "one_pair"
  | "two_pair"
  | "three_kind"
  | "straight"
  | "flush"
  | "full_house"
  | "four_kind"
  | "straight_flush"
  | "royal_flush";
export type PokerResult = {
  rank: HandRank;
  name: string;
  score: number;
  dominantSuit: Suit;
  rewards: { kind: UnitKind; tier: 1; suit: Suit }[];
};

export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};
export const RANK_LABEL: Record<Rank, string> = {
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};
export const HAND_NAMES: Record<HandRank, string> = {
  high_card: "하이 카드",
  one_pair: "원 페어",
  two_pair: "투 페어",
  three_kind: "트리플",
  straight: "스트레이트",
  flush: "플러시",
  full_house: "풀 하우스",
  four_kind: "포 카드",
  straight_flush: "스트레이트 플러시",
  royal_flush: "로열 플러시",
};
const HAND_SCORE: Record<HandRank, number> = {
  high_card: 0,
  one_pair: 1,
  two_pair: 2,
  three_kind: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  four_kind: 7,
  straight_flush: 8,
  royal_flush: 9,
};
export const HAND_UNITS: Record<HandRank, UnitKind> = {
  high_card: "militia",
  one_pair: "rifle",
  two_pair: "gunner",
  three_kind: "cryo",
  straight: "sniper",
  flush: "bomber",
  full_house: "mortar",
  four_kind: "tesla",
  straight_flush: "railgun",
  royal_flush: "cataclysm",
};
export const HAND_REWARD_COUNT: Record<HandRank, number> = {
  high_card: 1,
  one_pair: 1,
  two_pair: 2,
  three_kind: 1,
  straight: 1,
  flush: 2,
  full_house: 2,
  four_kind: 3,
  straight_flush: 3,
  royal_flush: 4,
};
export const HAND_PROBABILITY: Record<HandRank, string> = {
  high_card: "25.832%",
  one_pair: "53.393%",
  two_pair: "12.013%",
  three_kind: "5.339%",
  straight: "2.533%",
  flush: "0.101%",
  full_house: "0.667%",
  four_kind: "0.111%",
  straight_flush: "0.008%",
  royal_flush: "0.002%",
};

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `${suit}-${i + 7}`,
      suit,
      rank: (i + 7) as Rank,
    })),
  );
}
export function shuffledDeck(random = Math.random) {
  const deck = createDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
export function dominantSuit(cards: Card[]): Suit {
  const counts = new Map<Suit, number>();
  for (const c of cards) counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
  return [...SUITS].sort(
    (a, b) =>
      (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
      SUITS.indexOf(a) - SUITS.indexOf(b),
  )[0];
}
export function classifyHand(cards: Card[]): HandRank {
  const counts = [
    ...new Map(
      cards.map((c) => [c.rank, cards.filter((x) => x.rank === c.rank).length]),
    ).values(),
  ].sort((a, b) => b - a);
  const ranks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => a - b),
    flush = cards.every((c) => c.suit === cards[0].suit);
  const straight =
    ranks.length === 5 &&
    (ranks[4] - ranks[0] === 4 || ranks.join(",") === "7,8,9,10,14");
  if (flush && ranks.join(",") === "10,11,12,13,14") return "royal_flush";
  if (flush && straight) return "straight_flush";
  if (counts[0] === 4) return "four_kind";
  if (counts[0] === 3 && counts[1] === 2) return "full_house";
  if (flush) return "flush";
  if (straight) return "straight";
  if (counts[0] === 3) return "three_kind";
  if (counts[0] === 2 && counts[1] === 2) return "two_pair";
  if (counts[0] === 2) return "one_pair";
  return "high_card";
}
export function evaluateHand(cards: Card[]): PokerResult {
  const rank = classifyHand(cards),
    score = HAND_SCORE[rank],
    dominant = dominantSuit(cards);
  const count = HAND_REWARD_COUNT[rank];
  const ordered = [
    dominant,
    ...cards.map((c) => c.suit).filter((s) => s !== dominant),
  ];
  const rewards = Array.from({ length: count }, (_, i) => {
    const suit = ordered[i % ordered.length];
    return { kind: HAND_UNITS[rank], tier: 1 as const, suit };
  });
  return {
    rank,
    name: HAND_NAMES[rank],
    score,
    dominantSuit: dominant,
    rewards,
  };
}
