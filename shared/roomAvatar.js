/** Only formal, visible, non-elite operator identities may be used as room portraits. */
export function roomAvatars(chess) {
  const seen = new Set();
  return Object.values(chess || {}).filter(r => {
    if (!r?.visible || r.isGolden || r.isDiy || !['NORMAL', 'PRESET'].includes(r.chessType) || !r.charId || seen.has(r.charId)) return false;
    seen.add(r.charId); return true;
  });
}
