// Conservative daily EPG source discovery. Existing curated mappings always take precedence.
// Only exact normalized channel identities (or individually verified aliases) may be added.
export const VERIFIED = Object.freeze({
  'mtv.us':['US2','MTV.-.Music.Television.HD.us2'],
  'mtv2.us':['US2','MTV2:.Music.Television.HD.us2'],
  'hgtv.us':['US2','Home.and.Garden.Television.HD.us2'],
  'tlc.us':['US2','TLC.HD.(US).us2'],
  'natgeo.us':['US2','National.Geographic.HD.us2'],
  'natgeowild.us':['US2','National.Geographic.Wild.HD.us2'],
  'eentertainment.us':['US2','E!.Entertainment.Television.HD.us2'],
  'bloombergtv.us':['US2','Bloomberg.HD.us2'],
  'babytv.us':['US2','Baby.TV.US.us2'],
  'babyfirst.us':['US2','BabyFirst.TV.us2'],
  'beinsports.us':['US2','beIN.Sports.USA.HD.us2'],
  'beinsportespanol.us':['US2','beIN.Sports.En.Español.HD.us2'],
  'espnnews.us':['US2','ESPNEWS.HD.us2'],
  'travel.us':['US2','The.Travel.Channel.HD.us2'],
  'worldfishingnetwork.us':['US2','World.Fishing.Network.HD.(US).us2']
});
const SOURCE_REGION={
 US2:'us',US_LOCALS1:'us',UK1:'uk',CA2:'ca',IN1:'in',IN4:'in',
 AE1:'ae',BB1:'bb',CL1:'cl',CO1:'co',ES1:'es',GR1:'gr',HK1:'hk',
 IT1:'it',JM1:'jm',NG1:'ng',PH2:'ph',PK1:'pk',PL1:'pl',PT1:'pt',
 SA1:'sa',SE1:'se',SG1:'sg',VOA1:'us',ZA1:'za'
};
const EXPLICIT_GROUP_REGION={'ENGLISH USA':'us','ENGLISH USA LOCALS':'us',
 'ENGLISH CANADA':'ca','ENGLISH UK':'uk','GREEK':'gr','POLISH':'pl',
 'PORTUGUESE':'pt','SWEDISH':'se','ITALIAN':'it'};
const REGION_CODES=new Set(Object.values(SOURCE_REGION));
const NON_SCHEDULED=/(?:24\s*[x/]\s*7|24\/7|PPV|PAY.PER.VIEW|(?:SPORTS\s*\|)|(?:FOR ADULTS)|EVENTS? ONLY)/i;
export function excluded(channel) {
 return NON_SCHEDULED.test(String(channel.group||'')) || NON_SCHEDULED.test(String(channel.name||''));
}
export function regionOf(channel) {
 const explicit=String(channel.output_id||'').match(/\.([a-z]{2})$/i);
 if(explicit && REGION_CODES.has(explicit[1].toLowerCase())) return explicit[1].toLowerCase();
 const name=String(channel.name||'');
 if(/\bUSA?\s*$/i.test(name)) return 'us';
 if(/\bCANADA\s*$/i.test(name)) return 'ca';
 if(/\bUK\s*$/i.test(name)) return 'uk';
 if(/\bINDIA\s*$/i.test(name)) return 'in';
 return EXPLICIT_GROUP_REGION[channel.group]||null;
}
export function normalizedName(raw) {
 let s=String(raw||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
 s=s.replace(/&/g,' and ').replace(/\+/g,' plus ');
 const words=s.replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
 const dropped=new Set(['hd','fhd','uhd','sd','4k','8k','1080p','720p','480p','hevc','h265','h264','50fps','60fps']);
 const kept=words.filter(w=>!dropped.has(w));
 while(kept.length && ['usa','us','canada','uk'].includes(kept.at(-1))) kept.pop();
 return kept.join('');
}
function sourceLabel(id){
 return String(id).replace(/\.[a-z]{2}(?:\d+)?$/i,'');
}
export function parseIndex(text){
 if(typeof text!=='string'||text.length>3_000_000) throw Error('Oversized or invalid channel index');
 const ids=new Set();
 for(const raw of text.split(/\r?\n/)){
  const id=raw.trim();
  if(id.length>=3 && id.length<=190 && id.includes('.') && !/\s|[<>"']/.test(id) && !id.startsWith('--')) ids.add(id);
 }
 return ids;
}
export async function fetchIndexes(sources,{fetcher=fetch}={}){
 const indexes={},failures=[];
 // Bounded concurrency and timeouts to avoid stalling the scheduled job.
 for(let i=0;i<sources.length;i+=5){
  await Promise.all(sources.slice(i,i+5).map(async s=>{
   try {
    const url=s.url.replace(/\.xml(?:\.gz)?$/i,'.txt');
    if(url===s.url) throw Error('No matching index URL');
    const response=await fetcher(url,{signal:AbortSignal.timeout(18000)});
    if(!response.ok) throw Error('HTTP '+response.status);
    const body=await response.text();
    const ids=parseIndex(body);
    if(ids.size<1) throw Error('No valid channel IDs');
    indexes[s.id]=ids;
   } catch(e){failures.push({source:s.id,error:String(e.message||e).slice(0,100)});}
  }));
 }
 return {indexes,failures};
}
export function resolveMappings(channels,indexes,previous=[]){
 const allowedByGroup=new Map(),pinned=new Map();
 for(const c of channels){
  if(!c.source) continue;
  if(!allowedByGroup.has(c.group)) allowedByGroup.set(c.group,new Set());
  allowedByGroup.get(c.group).add(c.source);
  const pair=c.source+'|'+c.source_id;
  if(!pinned.has(c.output_id)) pinned.set(c.output_id,pair);
  else if(pinned.get(c.output_id)!==pair) pinned.set(c.output_id,null);
 }
 const names={};
 for(const [source,ids] of Object.entries(indexes)){
  const m=new Map();
  for(const id of ids){
   const key=normalizedName(sourceLabel(id));
   if(key && key.length>=3){if(!m.has(key))m.set(key,[]);m.get(key).push(id);}
  }
  names[source]=m;
 }
 const previousById=new Map((Array.isArray(previous)?previous:[]).filter(a=>a&&a.id).map(a=>[String(a.id),a]));
 const effective=[],mappings=[];
 for(const c of channels){
  if(c.source||excluded(c)||!allowedByGroup.has(c.group)){effective.push(c);continue;}
  const region=regionOf(c),allowed=allowedByGroup.get(c.group),existing=pinned.get(c.output_id);
  const regions=new Set([...allowed].filter(s=>indexes[s]).map(s=>SOURCE_REGION[s]));
  // If a group mixes countries, require an identified region rather than guessing.
  if(!region && regions.size>1){effective.push(c);continue;}
  const candidates=[],verified=VERIFIED[c.output_id],candidateKeys=new Set();
  const cleanName=normalizedName(c.name);
  const outputMatch=String(c.output_id||'').match(/^([a-z0-9_-]+)\.([a-z]{2})$/i);
  const cleanId=outputMatch?normalizedName(outputMatch[1]):'';
  for(const source of allowed){
   const ids=indexes[source];if(!ids)continue;
   if(region && SOURCE_REGION[source] && region!==SOURCE_REGION[source])continue;
   const found=new Set();
   if(verified && verified[0]===source && ids.has(verified[1])) found.add(verified[1]);
   for(const key of new Set([cleanName,cleanId])){
    if(!key||key.length<3)continue;
    const foundIds=names[source]?.get(key)||[];
    // The label must identify precisely one source feed (no HD/SD or regional ambiguity).
    if(foundIds.length===1)found.add(foundIds[0]);
   }
   for(const source_id of found){
    if(existing!==undefined && existing!==source+'|'+source_id) continue;
    const method=verified&&verified[0]===source&&verified[1]===source_id?'verified':'exact';
    const k=source+'|'+source_id;
    if(!candidateKeys.has(k)){candidateKeys.add(k);candidates.push({source,source_id,method});}
   }
  }
  // Cached matches are eligible only when their source index is temporarily unavailable.
  if(candidates.length===0){
   const cached=previousById.get(String(c.id));
   if(cached && allowed.has(cached.source) && !indexes[cached.source] &&
      (!region || SOURCE_REGION[cached.source]===region) &&
      (existing===undefined||existing===cached.source+'|'+cached.source_id) &&
      typeof cached.source_id==='string'){
    candidates.push({source:cached.source,source_id:cached.source_id,method:'cached'});
   }
  }
  if(candidates.length!==1){effective.push(c);continue;}
  const match=candidates[0];
  const record={id:c.id,name:c.name,group:c.group,output_id:c.output_id,...match};
  mappings.push(record);
  pinned.set(c.output_id,match.source+'|'+match.source_id);
  effective.push({...c,source:match.source,source_id:match.source_id,match:'Automatic '+match.method+' source-ID match'});
 }
 return {channels:effective,mappings};
}
