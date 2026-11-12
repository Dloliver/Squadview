// Five-up uses the same tile dimensions as six-up. TwitchPlayer applies
// numeric gridColumn values; the scoped five-up CSS spans two of six tracks.
// Three tiles fill row one and two equally-sized tiles center in row two.
export function centeredFivePosition(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 5) return null;
  const columns = [1, 3, 5, 2, 4];
  return { gridColumn: columns[index], gridRow: index < 3 ? 1 : 2 };
}
