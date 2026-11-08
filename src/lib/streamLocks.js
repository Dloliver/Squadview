// Phase 6.3.4A: pure, side-effect-free visible stream paging.
// A lock belongs to a Twitch channel and records its preferred visual slot.
// No Twitch player or audio object is ever changed here.
export function buildLockedPage({
  channels = [],
  page = 0,
  capacity = 4,
  lockedSlots = {},
  impliedPinnedChannel = '',
  impliedPinnedSlot = 0,
  rotationOrder = [],
} = {}) {
  const roster = [...new Set((channels || []).filter(Boolean))];
  const size = Math.max(1, Math.min(4, Math.floor(Number(capacity) || 4)));
  if (!roster.length) return { channels: [], slotsByChannel: {}, pageCount: 1, rotatingCount: 0 };

  // Explicit locks outrank the legacy Chat pin. In all cases reserve one
  // rotating position whenever there is a stream to rotate into it.
  const maxAnchors = Math.min(size - 1, roster.length - 1);
  const anchors = [];
  const seen = new Set();
  const wanted = Object.entries(lockedSlots || {})
    .filter(([channel]) => roster.includes(channel))
    .map(([channel, slot]) => ({ channel, slot: Number(slot) }));
  if (impliedPinnedChannel && roster.includes(impliedPinnedChannel)) {
    wanted.push({ channel: impliedPinnedChannel, slot: Number(impliedPinnedSlot) });
  }
  const occupied = new Set();
  for (const entry of wanted) {
    if (anchors.length >= maxAnchors) break;
    if (seen.has(entry.channel)) continue;
    seen.add(entry.channel);
    const preference = Number.isInteger(entry.slot) && entry.slot >= 0 && entry.slot < size
      ? entry.slot : 0;
    const freeSlot = !occupied.has(preference)
      ? preference
      : Array.from({ length: size }, (_, index) => index).find((index) => !occupied.has(index));
    if (freeSlot === undefined) break;
    anchors.push({ channel: entry.channel, slot: freeSlot });
    occupied.add(freeSlot);
  }

  const anchored = new Set(anchors.map(({ channel }) => channel));
  const orderedRotating = [...new Set([...(rotationOrder || []), ...roster])]
    .filter((channel) => roster.includes(channel) && !anchored.has(channel));
  const openCount = size - anchors.length;
  const pageCount = Math.max(1, Math.ceil(orderedRotating.length / openCount));
  const safePage = Math.min(pageCount - 1, Math.max(0, Math.trunc(Number(page) || 0)));
  const slots = Array(size).fill(null);
  for (const { channel, slot } of anchors) slots[slot] = channel;
  const freeSlots = Array.from({ length: size }, (_, index) => index).filter((index) => slots[index] === null);
  const countToShow = Math.min(freeSlots.length, orderedRotating.length);
  for (let index = 0; index < countToShow; index += 1) {
    slots[freeSlots[index]] = orderedRotating[(safePage * openCount + index) % orderedRotating.length];
  }
  const slotsByChannel = {};
  slots.forEach((channel, slot) => { if (channel) slotsByChannel[channel] = slot; });
  return {
    channels: slots.filter(Boolean),
    slotsByChannel,
    pageCount,
    rotatingCount: orderedRotating.length,
  };
}

export function rotateMobilePair({ channels = [], pair = [], lockedSlots = {}, direction = 1 } = {}) {
  const roster = [...new Set((channels || []).filter(Boolean))];
  if (roster.length < 2) return pair;
  const shown = (pair || []).filter((channel) => roster.includes(channel)).slice(0, 2);
  if (shown.length !== 2) return roster.slice(0, 2);
  const pinned = shown.find((channel) => Object.prototype.hasOwnProperty.call(lockedSlots || {}, channel));
  const delta = direction >= 0 ? 1 : -1;
  if (pinned) {
    const rotatingSlot = shown[0] === pinned ? 1 : 0;
    const rotatingRoster = roster.filter((channel) => channel !== pinned);
    const oldIndex = rotatingRoster.indexOf(shown[rotatingSlot]);
    const newIndex = (Math.max(0, oldIndex) + delta + rotatingRoster.length) % rotatingRoster.length;
    return shown.map((channel, index) => index === rotatingSlot ? rotatingRoster[newIndex] : channel);
  }
  // With no locks, both visible slots are eligible to move as one page.
  const currentStart = Math.max(0, roster.indexOf(shown[0]));
  const nextStart = (currentStart + delta * 2 + roster.length * 2) % roster.length;
  return [roster[nextStart], roster[(nextStart + 1) % roster.length]];
}
