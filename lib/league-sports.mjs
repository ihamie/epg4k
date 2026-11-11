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
 {key:'EPL',route:'soccer/eng.1',group:'SPORTS | EPL EFL',prefix:'EPL:',duration:2.5*3600},
 {key:'EFL',route:'soccer/eng.2',group:'SPORTS | EPL EFL',prefix:'EFL:',duration:2.5*3600},
 {key:'EFL1',route:'soccer/eng.3',group:'SPORTS | EPL EFL',prefix:'EFL L1:',duration:2.5*3600},
 {key:'EFL2',route:'soccer/eng.4',group:'SPORTS | EPL EFL',prefix:'EFL L2:',duration:2.5*3600},
]);
const ALIASES={
 NBA:{'LOS ANGELES CLIPPERS':'LA CLIPPERS'},
 EPL:{'BRIGHTON':'BRIGHTON AND HOVE ALBION','LEEDS':'LEEDS UNITED',
  'MANCHESTER UTD':'MANCHESTER UNITED','NEWCASTLE UTD':'NEWCASTLE UNITED',
  'TOTTENHAM':'TOTTENHAM HOTSPUR','WEST HAM':'WEST HAM UNITED'},
 EFL:{'LEICTER CITY':'LEICESTER CITY','PRESTON':'PRESTON NORTH END',
  'WEST BROMWICH ALBION':'WEST BROMWICH ALBION','SHEFFIELD WEDNESDAY':'SHEFFIELD WEDNESDAY'},
 EFL1:{'AFC WIMBELDON':'AFC WIMBLEDON','DONCASTER':'DONCASTER ROVERS'},
 EFL2:{'ACCRIGTON STABLEY':'ACCRINGTON STANLEY',
  'COLCHESTER':'COLCHESTER UNITED','FLEETWOOD':'FLEETWOOD TOWN',
  'MK DONS':'MILTON KEYNES DONS','SHREWSBURY':'SHREWSBURY TOWN',
  'TRANMERE':'TRANMERE ROVERS','GRIMBSY TOWN':'GRIMSBY TOWN',
  'NEWPORT COUNTRY':'NEWPORT COUNTY','SWINDOWN TOWN':'SWINDON TOWN'},

 NHL:{'VEGAS GOLDEN NIGHTS':'VEGAS GOLDEN KNIGHTS','ST LOUIS BLUES':'ST. LOUIS BLUES'},
 MLB:{'CLEVELAND INDIANS':'CLEVELAND GUARDIANS',
  'PHILIADELPHIA PHILLIES':'PHILADELPHIA PHILLIES','OAKLAND ATHLETICS':'ATHLETICS'},
 MLS:{'ATLANTA UNITED':'ATLANTA UNITED FC','CHICAGO FIRE':'CHICAGO FIRE FC',
  'HOUSTON DYNAMO':'HOUSTON DYNAMO FC','INTER MIAMI':'INTER MIAMI CF',
  'MINNESOTA UNITED':'MINNESOTA UNITED FC',
  'NEW YORK RED BULLS':'RED BULL NEW YORK','ORLANDO CITY':'ORLANDO CITY SC',
  'CINCINNATI FC':'FC CINCINNATI','DALLAS FC':'FC DALLAS',
  'MONTREAL CF':'CF MONTREAL','LOS ANGELES FC':'LAFC',
  'ST LOUIS CITY':'ST. LOUIS CITY SC','DC UNITED':'D.C. UNITED',
  'SEATTLE SOUNDERS':'SEATTLE SOUNDERS FC',
  'VANCOUVER WHITECAPS':'VANCOUVER WHITECAPS',
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
    category:league.route.startsWith('soccer/')?'Sports / Soccer':'Sports / '+(
     league.key==='NFL'?'American football':league.key==='MLB'?'Baseball':'Hockey'),league:league.key});
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
 const programs=[],logos={},results=[],soccerTeams=[];
 // Small batches avoid overwhelming the public sports API.
 for(let i=0;i<LEAGUES.length;i+=3){
  const batch=await Promise.all(LEAGUES.slice(i,i+3).map(async league=>{
   const item={league:league.key,team_channels:0,matched_teams:0,with_logos:0,programmes:0,source:'espn',error:null};
   const teamNames=channels.filter(c=>teamChannelName(c,league));
   item.team_channels=teamNames.length;
   if(!teamNames.length)return{item,logos:{},programs:[]};
   try{
    const teams=espnTeams(await getJson(ROOT+league.route+'/teams?limit=300',fetcher));
    if(league.route.startsWith('soccer/'))soccerTeams.push(...teams);
    const matched=matchLeagueChannels(channels,league,teams);
    item.matched_teams=matched.byId.size;
    const matchedChannelIds=new Set([...matched.byId.values()].map(v=>v.channel));
    item.unmatched_channels=teamNames.filter(c=>!matchedChannelIds.has(c.output_id)).map(c=>c.name);
    if(item.unmatched_channels.length)item.available_team_names=teams.map(t=>t.name);
    // Existing saved logo URLs survive transient directory failures.
    const itemLogos=matched.logos;
    item.with_logos=Object.keys(itemLogos).length;
    if(league.schedule===false||!matched.byId.size)return {item,logos:itemLogos,programs:[]};
    try{
     // ESPN rejects large date ranges for some leagues. Query individual UTC dates.
     const events=[],dates=[];
     for(let j=-1;j<=8;j++)dates.push(dateYmd(now+j*DAY));
     const failures=[];
     for(let j=0;j<dates.length;j+=3){
      const fetched=await Promise.all(dates.slice(j,j+3).map(async date=>{
       try{
        const data=await getJson(ROOT+league.route+'/scoreboard?dates='+date,fetcher);
        if(!Array.isArray(data.events))throw new Error('No events array');
        return {events:data.events};
       }catch(e){return {error:date+': '+String(e.message||e).slice(0,90)};}
      }));
      for(const f of fetched){if(f.error)failures.push(f.error);else events.push(...f.events);}
     }
     if(failures.length===dates.length)throw new Error('All daily scoreboards failed: '+failures[0]);
     // Incomplete source coverage is reported, rather than silently pretending completeness.
     if(failures.length)item.error='partial scoreboard: '+failures.length+' dates failed';
     const unique=new Map(events.filter(e=>e&&e.id!=null).map(e=>[String(e.id),e]));
     const games=scheduleLeague({events:[...unique.values()]},league,matched,now);
     item.programmes=games.length;
     return{item,logos:itemLogos,programs:games};
    }catch(e){item.error='scoreboard: '+String(e.message||e).slice(0,140);
     return{item,logos:itemLogos,programs:[]};}
   }catch(e){item.error='teams: '+String(e.message||e).slice(0,140);
    return{item,logos:{},programs:[]};}
  }));
  for(const b of batch){programs.push(...b.programs);Object.assign(logos,b.logos);results.push(b.item);}
 }
 // Logos are independent of a provider's league label. Promoted/relegated clubs
 // can use a verified logo from another soccer division, but NEVER its game schedule.
 const soccerNames=new Map();
 for(const t of soccerTeams){
  const key=normalizeSportsName(t.name),url=teamLogo(t);
  if(!key||!url)continue;
  if(!soccerNames.has(key))soccerNames.set(key,new Set());
  soccerNames.get(key).add(url);
 }
 for(const league of LEAGUES.filter(l=>l.route.startsWith('soccer/'))){
  const item=results.find(x=>x.league===league.key);
  for(const channel of channels){
   const key=teamChannelName(channel,league);
   if(!key||logos[channel.output_id])continue;
   const urls=soccerNames.get(key);
   if(urls?.size===1)logos[channel.output_id]=[...urls][0];
  }
  if(item){
   item.with_logos=channels.filter(c=>teamChannelName(c,league)&&logos[c.output_id]).length;
   item.logo_only=Math.max(0,item.with_logos-item.matched_teams);
  }
 }
 const validIds=new Set(channels.filter(c=>LEAGUES.some(l=>teamChannelName(c,l))).map(c=>c.output_id));
 for(const [id,url] of Object.entries(cache||{})){
  if(validIds.has(id)&&!logos[id]&&typeof url==='string'){
   try{const u=new URL(url);if(u.protocol==='https:'&&u.hostname.endsWith('espncdn.com'))logos[id]=url;}catch{}
  }
 }
 return {programs,logos,leagues:results};
}
