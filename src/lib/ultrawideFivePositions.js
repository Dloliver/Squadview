// Pure layout helper for exactly five selected Twitch streams on ultrawide.
// Three equally-sized tiles on top, two equally-sized tiles centered below.
// A six-stream page continues to use its original pinned-slot geometry.
export function centeredFivePosition(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 5) return null;
  const columns = ['1 / span 2', '3 / span 2', '5 / span 2', '2 / span 2', '4 / span 2'];
  return { gridColumn: columns[index], gridRow: index < 3 ? 1 : 2 };
}
