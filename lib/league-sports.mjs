// Team-specific sports listings and verified team logos.
// All schedule data is metadata; a provider channel may not broadcast a listed game.
const ROOT='https://site.api.espn.com/apis/site/v2/sports/';
const DAY=86400000;
export const LEAGUES=Object.freeze([
 {key:'NBA',route:'basketball/nba',group:'SPORTS | NBA',prefix:'NBA:',duration:3*3600,schedule:false},
 {key:'NFL',route:'football/nfl',group:'SPORTS | NFL',prefix:'NFL:',duration:4*3600},
 {key:'NHL',route:'hockey/nhl',group:'SPORTS | NHL',prefix:'NHL:',duration:3*3600},
 {key:'MLB',route:'baseball/mlb',group:'SPORTS | MLB',prefix:'MLB:',duration:3.5*3600},
 {key:'MLS',route:'soccer/usa.1',group:'SPORTS | MLS',prefix:'MLS |',duration:2.5*3600},
 // These junior/minor leagues are optional: unsupported feeds are skipped, not guessed.
 {key:'AHL',route:'hockey/ahl',group:'SPORTS | AHL OHL QMJHL WHL',prefix:'AHL |',duration:3*3600},
 {key:'OHL',route:'hockey/ohl',group:'SPORTS | AHL OHL QMJHL WHL',prefix:'OHL |',duration:3*3600},
 {key:'QMJHL',route:'hockey/qmjhl',group:'SPORTS | AHL OHL QMJHL WHL',prefix:'QMJHL |',duration:3*3600}
]);
const ALIASES={
 NHL:{'VEGAS GOLDEN NIGHTS':'VEGAS GOLDEN KNIGHTS','ST LOUIS BLUES':'ST. LOUIS BLUES'},
 MLB:{'CLEVELAND INDIANS':'CLEVELAND GUARDIANS',
  'PHILIADELPHIA PHILLIES':'PHILADELPHIA PHILLIES','OAKLAND ATHLETICS':'ATHLETICS'},
 MLS:{'CINCINNATI FC':'FC CINCINNATI','DALLAS FC':'FC DALLAS',
  'MONTREAL CF':'CF MONTREAL','LOS ANGELES FC':'LAFC',
  'ST LOUIS CITY':'ST. LOUIS CITY SC','DC UNITED':'D.C. UNITED',
  'SEATTLE SOUNDERS':'SEATTLE SOUNDERS FC',
  'VANCOUVER WHITECAPS':'VANCOUVER WHITECAPS FC',
  'PORTLAND TIMBERS':'PORTLAND TIMBERS',
  'NEW YORK CITY FC':'NEW YORK CITY FC'}
};
export function normalizeSportsName(name){
 return String(name||'').normalize('NFKD').replace(/\p{M}/gu,'').toUpperCase()
   .replace(/&/g,' AND ').replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export function teamChannelName(channel,league){
 if(channel?.group!==league.group || !/^stalker\.\d+$/.test(String(channel.output_id||'')))return null;
 const full=String(channel.name||''),prefix=league.prefix;
 if(!full.toUpperCase().startsWith(prefix.toUpperCase()))return null;
 let raw=full.slice(prefix.length).trim().replace(/\s+(?:4K|FHD|UHD|HD|SD)$/i,'');
 if(!raw||/^\d+$/.test(raw))return null;
 const name=normalizeSportsName(raw);
 return normalizeSportsName(ALIASES[league.key]?.[name]||name);
}
export function espnTeams(data){
 const leagues=data?.sports?.flatMap(s=>s?.leagues||[])||[];
 const nodes=leagues.flatMap(l=>l?.teams||[]);
 if(!nodes.length)throw new Error('Empty or invalid ESPN team directory');
 return nodes.map(t=>t?.team||t)
   .filter(t=>t&&t.id!=null&&t.displayName&&t.isActive!==false)
   .map(t=>({id:String(t.id),name:String(t.displayName),logos:t.logos||[]}));
}
export function teamLogo(team){
 for(const logo of team.logos||[]){
  const href=logo?.href;
  if(typeof href!=='string'||href.length>2048)continue;
  try{const u=new URL(href);
   if(u.protocol==='https:'&&(u.hostname==='espncdn.com'||u.hostname.endsWith('.espncdn.com')))return href;
  }catch{}
 }
 return null;
}
export function matchLeagueChannels(channels,league,teams){
 const byName=new Map();
 for(const team of teams){
  const key=normalizeSportsName(team.name);
  if(!byName.has(key))byName.set(key,[]);
  byName.get(key).push(team);
 }
 const byId=new Map(),logos={};
 for(const c of channels){
  const key=teamChannelName(c,league);
  if(!key)continue;
  const matches=byName.get(key)||[];
  if(matches.length!==1)continue;
  const t=matches[0];
  // Prevent one ESPN ID from matching two unrelated provider channels.
  if(byId.has(t.id) && byId.get(t.id).channel!==c.output_id)continue;
  byId.set(t.id,{channel:c.output_id,name:t.name});
  const image=teamLogo(t);
  if(image)logos[c.output_id]=image;
 }
 return {byId,logos};
}
function dateYmd(time){return new Date(time).toISOString().slice(0,10).replace(/-/g,'');}
function isCancelled(event,competition){
 const fields=[event?.status?.type?.name,event?.status?.type?.description,
  competition?.status?.type?.name,competition?.status?.type?.description,
  event?.status?.type?.detail,competition?.status?.type?.detail];
 return fields.some(x=>/postpon|cancel|suspend|abandon/i.test(String(x||'')));
}
export function scheduleLeague(data,league,matched,now=Date.now()){
 if(!data||!Array.isArray(data.events))throw new Error('Invalid scoreboard payload');
 const rows=[],seen=new Set();
 for(const event of data.events){
  const cmp=event?.competitions?.[0],competitors=cmp?.competitors||[];
  if(!Array.isArray(competitors)||isCancelled(event,cmp))continue;
  const state=event?.status?.type?.state||cmp?.status?.type?.state;
  if(!['pre','in'].includes(state))continue;
  const home=competitors.find(c=>c.homeAway==='home')?.team;
  const away=competitors.find(c=>c.homeAway==='away')?.team;
  if(home?.id==null||away?.id==null||String(home.id)===String(away.id))continue;
  const time=Date.parse(cmp?.date||event.date);
  if(!Number.isFinite(time)||time>now+8*DAY)continue;
  const start=Math.floor(time/1000),stop=start+league.duration;
  if(stop<=now/1000)continue;
  const ht=matched.byId.get(String(home.id)),at=matched.byId.get(String(away.id));
  if(!ht&&!at)continue;
  const hn=String(home.displayName||home.name||ht?.name||''),
    an=String(away.displayName||away.name||at?.name||'');
  if(!hn||!an)continue;
  for(const team of [ht,at]){
   if(!team)continue;
   const key=team.channel+'|'+start+'|'+String(event.id||an+'@'+hn);
   if(seen.has(key))continue;
   seen.add(key);
   rows.push({channel:team.channel,start,stop,title:an+' @ '+hn,
    description:'Scheduled '+league.key+' match. Game length is estimated; streaming availability and actual end time are not verified.',
    category:league.key==='MLS'?'Sports / Soccer':'Sports / '+(
     league.key==='NFL'?'American football':league.key==='MLB'?'Baseball':'Hockey')});
  }
 }
 return rows.sort((a,b)=>a.start-b.start||a.channel.localeCompare(b.channel));
}
async function getJson(url,fetcher){
 const response=await fetcher(url,{headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0 (compatible; epg4k/1.0)'},
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('HTTP '+response.status);
 return response.json();
}
export async function fetchLeagueSports(channels,{fetcher=fetch,now=Date.now(),cache={}}={}){
 const programs=[],logos={},results=[];
 // Small batches avoid overwhelming the public sports API.
 for(let i=0;i<LEAGUES.length;i+=3){
  const batch=await Promise.all(LEAGUES.slice(i,i+3).map(async league=>{
   const item={league:league.key,team_channels:0,matched_teams:0,with_logos:0,programmes:0,source:'espn',error:null};
   const teamNames=channels.filter(c=>teamChannelName(c,league));
   item.team_channels=teamNames.length;
   if(!teamNames.length)return{item,logos:{},programs:[]};
   try{
    const teams=espnTeams(await getJson(ROOT+league.route+'/teams?limit=300',fetcher));
    const matched=matchLeagueChannels(channels,league,teams);
    item.matched_teams=matched.byId.size;
    // Existing saved logo URLs survive transient directory failures.
    const itemLogos=matched.logos;
    item.with_logos=Object.keys(itemLogos).length;
    if(!league.schedule||!matched.byId.size)return {item,logos:itemLogos,programs:[]};
    try{
     const range=dateYmd(now-DAY)+'-'+dateYmd(now+8*DAY);
     const schedule=await getJson(ROOT+league.route+'/scoreboard?dates='+range+'&limit=1000',fetcher);
     const games=scheduleLeague(schedule,league,matched,now);
     item.programmes=games.length;
     return{item,logos:itemLogos,programs:games};
    }catch(e){item.error='scoreboard: '+String(e.message||e).slice(0,140);
     return{item,logos:itemLogos,programs:[]};}
   }catch(e){item.error='teams: '+String(e.message||e).slice(0,140);
    return{item,logos:{},programs:[]};}
  }));
  for(const b of batch){programs.push(...b.programs);Object.assign(logos,b.logos);results.push(b.item);}
 }
 const validIds=new Set(channels.filter(c=>LEAGUES.some(l=>teamChannelName(c,l))).map(c=>c.output_id));
 for(const [id,url] of Object.entries(cache||{})){
  if(validIds.has(id)&&!logos[id]&&typeof url==='string'){
   try{const u=new URL(url);if(u.protocol==='https:'&&u.hostname.endsWith('espncdn.com'))logos[id]=url;}catch{}
  }
 }
 return {programs,logos,leagues:results};
}
