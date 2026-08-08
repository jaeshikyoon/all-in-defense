export function circularIndex(
  currentIndex: number,
  length: number,
  direction: -1 | 1,
) {
  if (length <= 0) return -1;
  const start = currentIndex >= 0 && currentIndex < length ? currentIndex : 0;
  return (start + direction + length) % length;
}

const battlefieldNameCollator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base",
});

export function sortBattlefieldsByName<T extends { id: string; name: string }>(
  battlefields: readonly T[],
) {
  return [...battlefields].sort((a, b) => {
    const byName = battlefieldNameCollator.compare(
      a.name.trim(),
      b.name.trim(),
    );
    return byName || battlefieldNameCollator.compare(a.id, b.id);
  });
}
