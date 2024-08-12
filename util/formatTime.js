export function formatTime(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 3600 % 60);
  return `${h}:${m}:${s}`;
}
