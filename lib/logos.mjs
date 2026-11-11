// Channel artwork: exact XMLTV/channel-ID matches only; no fuzzy matches.
export const CATALOG_URL = 'https://iptv-org.github.io/api/logos.json';
export function validLogo(url) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  try { const u = new URL(url); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password; }
  catch { return false; }
}
export function catalogLogos(records, channels) {
  const targets = new Map();
  for (const c of channels) {
    const id = String(c.output_id || '');
    if (!id || id.startsWith('stalker.') || id.toLowerCase().includes('.schedulesdirect.org')) continue;
    targets.set(id.toLowerCase(), id);
  }
  const selected = new Map();
  for (const a of records) {
    if (!a || typeof a.channel !== 'string' || !validLogo(a.url) || a.in_use !== true) continue;
    const id = targets.get(a.channel.toLowerCase());
    if (!id || a.feed) continue; // Unqualified feed only: avoid wrong regional variants.
    const score = (a.format === 'PNG' ? 3 : a.format === 'SVG' ? 2 : 1) * 100 +
      (Array.isArray(a.tags) && a.tags.includes('horizontal') ? 10 : 0) +
      Math.min(Number(a.width) || 0, 2000) / 2000;
    if (!selected.has(id) || score > selected.get(id).score) selected.set(id, {url:a.url,score});
  }
  return Object.fromEntries([...selected].map(([id,a])=>[id,a.url]));
}
export async function loadLogos(channels, cachePath, {readFile,writeFile,mkdir}){
  let previous={};
  try { previous=JSON.parse(await readFile(cachePath,'utf8')); } catch {}
  let logos=previous, updated=false;
  try {
    const response=await fetch(CATALOG_URL,{signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error('HTTP '+response.status);
    const records=await response.json();
    if (!Array.isArray(records) || !records.length) throw new Error('Empty logo catalog');
    const fresh=catalogLogos(records,channels);
    if (!Object.keys(fresh).length) throw new Error('No matching logos');
    logos=fresh;updated=true;
    await mkdir('docs',{recursive:true});
    await writeFile(cachePath,JSON.stringify(logos,null,2)+'\n');
  } catch(e) { console.warn('Logo catalog unavailable; using saved logos:',String(e.message||e)); }
  return {logos,updated,count:Object.keys(logos).length};
}
