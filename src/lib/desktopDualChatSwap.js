// Pure desktop Dual Chat stream-selection helpers. No backend/audio writes.
export function selectDesktopDualSwap({ channels = [], lead, other, selected, slot, rotationOrder = [] } = {}) {
  const roster = [...new Set(channels.filter(Boolean))];
  if (roster.length < 2 || !roster.includes(lead) || !roster.includes(other) || lead === other ||
      !roster.includes(selected) || !['lead','other'].includes(slot)) return null;
  const newLead = slot === 'lead' ? selected : lead;
  const newOther = slot === 'other' ? selected : (selected === other ? lead : other);
  if (newLead === newOther || !roster.includes(newOther)) return null;
  const order = [...new Set([newOther, ...rotationOrder, ...roster])]
    .filter((channel) => roster.includes(channel) && channel !== newLead);
  return { lead: newLead, other: newOther, rotationOrder: order };
}

export function rotateDesktopDualOther({ channels = [], lead, other, direction = 1 } = {}) {
  const candidates = [...new Set(channels.filter((channel) => channel && channel !== lead))];
  if (candidates.length < 2) return other;
  const index = candidates.indexOf(other);
  if (index < 0) return candidates[0];
  const delta = direction < 0 ? -1 : 1;
  return candidates[(index + delta + candidates.length) % candidates.length];
}
