export type OperationGrade = "C" | "B" | "A" | "S" | "SS" | "SSS";

const OPERATION_GRADE_ASSETS = {
  S: "assets/ui/grades/operation-grade-s.webp",
  SS: "assets/ui/grades/operation-grade-ss.webp",
  SSS: "assets/ui/grades/operation-grade-sss.webp",
} as const satisfies Partial<Record<OperationGrade, string>>;

export function getOperationGrade(kills: number): OperationGrade {
  if (kills >= 4_000) return "SSS";
  if (kills >= 2_000) return "SS";
  if (kills >= 1_000) return "S";
  if (kills >= 500) return "A";
  if (kills >= 200) return "B";
  return "C";
}

export function getOperationGradeAsset(
  grade: OperationGrade,
): string | null {
  return grade in OPERATION_GRADE_ASSETS
    ? OPERATION_GRADE_ASSETS[
        grade as keyof typeof OPERATION_GRADE_ASSETS
      ]
    : null;
}

export function findScorePlacement<T extends { readonly id: string }>(
  scores: readonly T[],
  currentId: string,
): { rank: number; total: number } | null {
  const index = scores.findIndex((score) => score.id === currentId);
  return index < 0 ? null : { rank: index + 1, total: scores.length };
}
