import {normalizedName,regionOf,excluded} from './discovery.mjs';
// Channel artwork: exact XMLTV/channel-ID matches only; no fuzzy matches.
export const CATALOG_URL = 'https://iptv-org.github.io/api/logos.json';
export const CHANNELS_URL = 'https://iptv-org.github.io/api/channels.json';
export function validLogo(url) {
  if (typeof url !== 'string' || url.length > 2048) return false;
  try { const u = new URL(url); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password; }
  catch { return false; }
}
export function catalogLogos(records, channels, directory=[]) {
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
  // Fallback to unique exact channel name + matching country, not fuzzy similarity.
  const directoryByKey=new Map();
  for(const entry of directory){
    if(!entry || typeof entry.id!=='string' || typeof entry.name!=='string' || !entry.country)continue;
    const name=normalizedName(entry.name);if(!name)continue;
    const key=String(entry.country).toLowerCase()+'|'+name;
    if(!directoryByKey.has(key))directoryByKey.set(key,new Set());
    directoryByKey.get(key).add(entry.id.toLowerCase());
  }
  const logoById=new Map();
  for(const [id,record] of selected)logoById.set(id.toLowerCase(),record.url);
  for(const entry of records)if(entry && entry.in_use===true && !entry.feed && validLogo(entry.url) && typeof entry.channel==='string' && !logoById.has(entry.channel.toLowerCase()))
   logoById.set(entry.channel.toLowerCase(),entry.url);
  for(const channel of channels){
    if(excluded(channel) || selected.has(channel.output_id))continue;
    const region=regionOf(channel);if(!region)continue;
    const key=region+'|'+normalizedName(channel.name),ids=directoryByKey.get(key);
    if(!ids || ids.size!==1)continue;
    const canonicalId=[...ids][0],url=logoById.get(canonicalId);
    if(url)selected.set(channel.output_id,{url,score:0});
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
    let directory=[];
    try {
      const details=await fetch(CHANNELS_URL,{signal:AbortSignal.timeout(30000)});
      if(details.ok){const parsed=await details.json();if(Array.isArray(parsed))directory=parsed;}
    }catch(e){console.warn('Name-based logo catalog unavailable:',String(e.message||e));}
    const fresh=catalogLogos(records,channels,directory);
    if (!Object.keys(fresh).length) throw new Error('No matching logos');
    logos=fresh;updated=true;
    await mkdir('docs',{recursive:true});
    await writeFile(cachePath,JSON.stringify(logos,null,2)+'\n');
  } catch(e) { console.warn('Logo catalog unavailable; using saved logos:',String(e.message||e)); }
  return {logos,updated,count:Object.keys(logos).length};
}
