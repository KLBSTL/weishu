/** Transport must outlive the existing 120/180 second model task deadlines. */
function bridgeTimeout(method, url, body) {
  if (method !== 'POST') return 45000;
  let path;
  try { path=new URL(url,'http://127.0.0.1').pathname; } catch { return 45000; }
  if (/^\/dsh-pet-7340\/(?:chat|whisper|stronghold\/idle)$/u.test(path)) return 185000;
  if (path === '/dsh-pet-7340/stronghold/library') {
    try { if (JSON.parse(body).action === 'research-card') return 185000; } catch { /* malformed bodies keep the ordinary transport limit */ }
  }
  return 45000;
}
module.exports={bridgeTimeout};
