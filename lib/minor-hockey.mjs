// Minor-hockey schedules from the public HockeyTech feeds used by league websites.
// Metadata only: the existence of a fixture does not verify any provider stream.
// Public read-only website keys, not user credentials.
import {normalizeSportsName} from './league-sports.mjs';
const DAY=86400000;
export const MINOR_LEAGUES=Object.freeze([
 {key:'AHL',code:'ahl',site:'3',keyValue:'ccb91f29d6744675',host:'lscluster.hockeytech.com',prefix:'AHL |'},
 {key:'OHL',code:'ohl',site:'1',keyValue:'f1aa699db3d81487',host:'lscluster.hockeytech.com',prefix:'OHL |'},
 {key:'QMJHL',code:'lhjmq',site:'0',keyValue:'f322673b6bcae299',host:'cluster.leaguestat.com',prefix:'QMJHL |'}
]);
const ALIASES={
 'BRIDGEPORT ISLANDERS':'BRIDGEPORT ISLANDERS',
 'WILKES BARRE SCRANTON PENGUINS':'WILKES BARRE SCRANTON PENGUINS',
 'SAINT JOHN SEA DOGS':'SAINT JOHN SEA DOGS',
 'NEWFOUNDLAND REGIMENT':'NEWFOUNDLAND REGIMENT'
};
function normal(name){const n=normalizeSportsName(name);return ALIASES[n]||n;}
export function minorChannels(channels,league){
 return channels.filter(c=>c.group==='SPORTS | AHL OHL QMJHL WHL' &&
  /^stalker\.\d+$/.test(String(c.output_id||''))&&
  String(c.name||'').toUpperCase().startsWith(league.prefix));
}
export function hockeyUrl(league,view,params={}){
 const url=new URL('https://'+league.host+'/feed/index.php');
 const query={feed:'modulekit',view,key:league.keyValue,client_code:league.code,
  site_id:league.site,lang:'en',fmt:'json',...params};
 for(const [k,v] of Object.entries(query))url.searchParams.set(k,String(v));
 return url.toString();
}
export function parseHockeytech(payload){
 if(payload&&typeof payload==='object')return payload;
 if(typeof payload!=='string'||payload.length>6e6)throw new Error('Invalid HockeyTech response');
 let s=payload.trim().replace(/;\s*$/,'');
 if(/^angular\.callbacks\._\d+\(/.test(s)&&s.endsWith(')'))s=s.slice(s.indexOf('(')+1,-1);
 else if(s.startsWith('(')&&s.endsWith(')'))s=s.slice(1,-1);
 const j=JSON.parse(s);
 if(j?.error||j?.SiteKit?.Undefined)throw new Error('HockeyTech feed rejected requested view');
 return j;
}
function goodSeason(s,now){
 const end=Date.parse(s.end_date+'T23:59:59Z'),start=Date.parse(s.start_date+'T00:00:00Z');
 return Number.isFinite(start)&&Number.isFinite(end)&&end>=now-DAY&&start<=now+8*DAY
  &&!/all.star|prospect|challenge|exhibition|preseason|pre-season/i.test(String(s.season_name||''));
}
export function seasonsToFetch(payload,now=Date.now()){
 const a=payload?.SiteKit?.Seasons;
 if(!Array.isArray(a)||!a.length)throw new Error('Missing seasons');
 const active=a.filter(s=>goodSeason(s,now)&&/regular|playoff/i.test(s.season_name||''));
 return active.sort((a,b)=>Date.parse(b.start_date)-Date.parse(a.start_date))
  .slice(0,2).map(s=>String(s.season_id));
}
function logoUrl(value){
 if(typeof value!=='string'||!value)return null;
 try{const u=new URL(value.startsWith('//')?'https:'+value:value);
  if(u.protocol==='https:'&&(u.hostname==='assets.leaguestat.com'||u.hostname.endsWith('.leaguestat.com')))return u.toString();
 }catch{}
 return null;
}
export function minorTeamDirectory(payload){
 const sk=payload?.SiteKit,arr=sk?.Teamsbyseason||sk?.TeamsBySeason||sk?.Teams||sk?.teamsbyseason;
 if(!Array.isArray(arr))throw new Error('No team directory');
 return arr.map(t=>({
  id:String(t.id??t.team_id??t.team??''),
  name:String(t.name??t.team_name??t.team_long_name??t.team_label??''),
  logo:logoUrl(t.team_logo_url||t.team_logo||t.logo||t.logo_url||'')
 })).filter(t=>t.id&&t.name);
}
export function matchMinorTeams(channels,league,teams){
 const map=new Map(),logos={},nameMap=new Map();
 for(const t of teams){const k=normal(t.name);if(!nameMap.has(k))nameMap.set(k,[]);nameMap.get(k).push(t)}
 for(const c of minorChannels(channels,league)){
  const name=normal(String(c.name).slice(league.prefix.length)),arr=nameMap.get(name)||[];
  if(arr.length!==1)continue;
  const team=arr[0];
  if(map.has(team.id))continue;
  map.set(team.id,{channel:c.output_id,name:team.name});
  if(team.logo)logos[c.output_id]=team.logo;
 }
 return {map,logos};
}
export function minorGamePrograms(payloads,league,match,now=Date.now()){
 const seen=new Set(),programs=[];
 for(const payload of payloads){
  const rows=payload?.SiteKit?.Schedule;
  if(!Array.isArray(rows))continue;
  for(const g of rows){
   if(String(g.final)==='1'||/final|postpon|cancel|suspend|abandon/i.test(String(g.game_status||'')))continue;
   if(String(g.date_tbd)==='1'||String(g.time_tbd)==='1')continue;
   const startMs=Date.parse(g.GameDateISO8601||'');
   if(!Number.isFinite(startMs)||startMs>now+8*DAY||startMs+3*3600000<=now)continue;
   const home=match.map.get(String(g.home_team)),away=match.map.get(String(g.visiting_team));
   if(!home&&!away)continue;
   const hn=String(g.home_team_name||home?.name||''),an=String(g.visiting_team_name||away?.name||'');
   if(!hn||!an)continue;
   const start=Math.floor(startMs/1000);
   for(const target of [home,away]){
    if(!target)continue;
    const k=target.channel+'|'+String(g.game_id||an+'@'+hn)+'|'+start;
    if(seen.has(k))continue;
    seen.add(k);
    programs.push({channel:target.channel,start,stop:start+3*3600,title:an+' @ '+hn,
     description:'Scheduled '+league.key+' hockey game. Three-hour EPG window is estimated. The IPTV stream has not been verified.',
     category:'Sports / Hockey',league:league.key});
   }
  }
 }
 return programs;
}
async function request(league,view,fetcher,params={}){
 const response=await fetcher(hockeyUrl(league,view,params),{
  headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 (compatible; epg4k/1.0)'},
  signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw new Error(view+' HTTP '+response.status);
 const body=await response.text();
 return parseHockeytech(body);
}
export async function fetchMinorHockey(channels,{fetcher=fetch,now=Date.now()}={}){
 const programs=[],logos={},leagues=[];
 // Sequential requests: public site feeds, low rate, tiny number of calls.
 for(const league of MINOR_LEAGUES){
  const item={league:league.key,channels:minorChannels(channels,league).length,
   matched:0,with_logos:0,programmes:0,error:null};
  try{
   const seasons=seasonsToFetch(await request(league,'seasons',fetcher),now);
   if(!seasons.length){item.error='No active season';leagues.push(item);continue;}
   const teams=minorTeamDirectory(await request(league,'teamsbyseason',fetcher,{season:seasons[0]}));
   const matched=matchMinorTeams(channels,league,teams);
   Object.assign(logos,matched.logos);item.matched=matched.map.size;item.with_logos=Object.keys(matched.logos).length;
   const ids=new Set([...matched.map.values()].map(x=>x.channel));
   item.unmatched_channels=minorChannels(channels,league).filter(c=>!ids.has(c.output_id)).map(c=>c.name);
   if(item.unmatched_channels.length)item.available_team_names=teams.map(t=>t.name);
   if(!matched.map.size){item.error='No exact matching team identities';leagues.push(item);continue;}
   const payloads=[];
   for(const id of seasons)payloads.push(await request(league,'schedule',fetcher,{season_id:id}));
   const games=minorGamePrograms(payloads,league,matched,now);
   programs.push(...games);item.programmes=games.length;
  }catch(e){item.error=String(e.message||e).slice(0,180);}
  leagues.push(item);
 }
 return {programs,logos,leagues};
}
