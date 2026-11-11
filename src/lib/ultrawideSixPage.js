// SquadView 1.0.1: isolated, pure ultrawide paging. No player/audio effects.
// A maximum of three explicit locks stay at their chosen slots on every page.
// Other streams advance in groups of the available unoccupied slots.
export function buildUltrawideSixPage({ channels = [], page = 0, lockedSlots = {} } = {}) {
  const roster = [...new Set((channels || []).filter(Boolean))];
  if (!roster.length) return { channels: [], slotsByChannel: {}, pageCount: 1 };
  const slots = Array(6).fill(null);
  let anchoredCount = 0;
  for (const [channel, requestedSlot] of Object.entries(lockedSlots || {})) {
    if (anchoredCount >= 3) break;
    if (!roster.includes(channel)) continue;
    const slot = Number(requestedSlot);
    const proposed = Number.isInteger(slot) && slot >= 0 && slot < 6 && !slots[slot]
      ? slot : slots.indexOf(null);
    if (proposed < 0) break;
    slots[proposed] = channel;
    anchoredCount += 1;
  }
  const anchored = new Set(slots.filter(Boolean));
  const rotating = roster.filter(channel => !anchored.has(channel));
  const openSlots = slots.flatMap((channel, i) => channel ? [] : [i]);
  const pageSize = openSlots.length;
  const pageCount = Math.max(1, Math.ceil(rotating.length / pageSize));
  const safePage = Math.min(pageCount - 1, Math.max(0, Math.trunc(Number(page) || 0)));
  const selected = rotating.slice(safePage * pageSize, (safePage + 1) * pageSize);
  selected.forEach((channel, i) => { slots[openSlots[i]] = channel; });
  const slotsByChannel = {};
  slots.forEach((channel, slot) => { if (channel) slotsByChannel[channel] = slot; });
  return { channels: slots.filter(Boolean), slotsByChannel, pageCount };
}
