// Scheduled NBA matchups for team-specific Stalker channels.
// This supplies EPG metadata only: it does not assert that a channel is streaming the game.
export const NBA_SCHEDULE_URL='https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json';
export const NBA_SCOREBOARD_URL='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const DAY=86400000, GAME_DURATION=3*3600;
export const NBA_TEAMS=Object.freeze({
  'ATLANTA HAWKS':'ATL','BOSTON CELTICS':'BOS','BROOKLYN NETS':'BKN',
  'CHARLOTTE HORNETS':'CHA','CHICAGO BULLS':'CHI','CLEVELAND CAVALIERS':'CLE',
  'DALLAS MAVERICKS':'DAL','DENVER NUGGETS':'DEN','DETROIT PISTONS':'DET',
  'GOLDEN STATE WARRIORS':'GSW','HOUSTON ROCKETS':'HOU','INDIANA PACERS':'IND',
  'LOS ANGELES LAKERS':'LAL','LOS ANGELES CLIPPERS':'LAC','MEMPHIS GRIZZLIES':'MEM',
  'MIAMI HEAT':'MIA','MILWAUKEE BUCKS':'MIL','MINNESOTA TIMBERWOLVES':'MIN',
  'NEW ORLEANS PELICANS':'NOP','NEW YORK KNICKS':'NYK','OKLAHOMA CITY THUNDER':'OKC',
  'ORLANDO MAGIC':'ORL','PHILADELPHIA 76ERS':'PHI','PHOENIX SUNS':'PHX',
  'PORTLAND TRAIL BLAZERS':'POR','SACRAMENTO KINGS':'SAC',
  'SAN ANTONIO SPURS':'SAS','TORONTO RAPTORS':'TOR','UTAH JAZZ':'UTA',
  'WASHINGTON WIZARDS':'WAS'
});
export function nbaTeamChannels(channels){
 const teams=new Map();
 for(const c of channels){
  if(c.group!=='SPORTS | NBA'||!/^stalker\.\d+$/.test(String(c.output_id)))continue;
  const m=/^NBA:\s+(.+?)\s+(?:4K|HD|FHD|UHD)$/i.exec(c.name||'');
  const team=m?.[1].toUpperCase(),code=NBA_TEAMS[team];
  if(code&&!teams.has(code))teams.set(code,{channel:c.output_id,name:team});
 }
 return teams;
}
function validTime(iso){
 const t=Date.parse(iso);
 return typeof iso==='string'&&Number.isFinite(t)&&t>0?t:null;
}
const fullName=Object.fromEntries(Object.entries(NBA_TEAMS).map(([name,code])=>[code,name.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())]));
function gameRows(games,channels,now){
 const wanted=nbaTeamChannels(channels),result=[],seen=new Set();
 for(const g of games){
  if(!g||!g.away||!g.home||g.away===g.home||!fullName[g.away]||!fullName[g.home])continue;
  const time=validTime(g.date);if(time===null)continue;
  const start=Math.floor(time/1000),stop=start+GAME_DURATION;
  if(stop<=now/1000||time>now+8*DAY)continue;
  if(g.cancelled||g.final)continue;
  const title=fullName[g.away]+' @ '+fullName[g.home];
  for(const code of [g.away,g.home]){
   const info=wanted.get(code);if(!info)continue;
   const key=info.channel+'|'+start+'|'+g.away+'|'+g.home;
   if(seen.has(key))continue;
   seen.add(key);
   result.push({
    channel:info.channel,start,stop,title,
    description:'Scheduled NBA tipoff. Game window is estimated at three hours; actual end time and channel stream availability are not confirmed.',
    category:'Sports / Basketball'
   });
  }
 }
 return result.sort((a,b)=>a.start-b.start||a.channel.localeCompare(b.channel));
}
export function parseNbaSchedule(data,channels,now=Date.now()){
 const schedule=data?.leagueSchedule;
 if(!schedule||!Array.isArray(schedule.gameDates)||String(schedule.leagueId||'00')!=='00')
  throw new Error('Invalid NBA schedule format or league');
 const games=[];
 for(const day of schedule.gameDates)for(const g of Array.isArray(day.games)?day.games:[]){
  const status=Number(g.gameStatus);
  if(![1,2,3].includes(status))continue;
  const away=String(g.awayTeam?.teamTricode||'').toUpperCase(),
   home=String(g.homeTeam?.teamTricode||'').toUpperCase();
  games.push({away,home,date:g.gameDateTimeUTC,final:status===3,
   cancelled:/postpon|cancel|suspend/i.test(String(g.gameStatusText||''))});
 }
 if(!games.length)throw new Error('NBA schedule returned no games');
 return gameRows(games,channels,now);
}
export function parseEspnScoreboard(data,channels,now=Date.now()){
 if(!data||!Array.isArray(data.events))throw new Error('Invalid NBA scoreboard format');
 const games=[];
 for(const event of data.events){
  const competition=event?.competitions?.[0],competitors=competition?.competitors;
  if(!Array.isArray(competitors))continue;
  const home=competitors.find(c=>c.homeAway==='home')?.team?.abbreviation;
  const away=competitors.find(c=>c.homeAway==='away')?.team?.abbreviation;
  const state=event?.status?.type?.state||competition?.status?.type?.state;
  const label=String(event?.status?.type?.name||event?.status?.type?.description||'');
  games.push({home:String(home||'').toUpperCase(),away:String(away||'').toUpperCase(),
   date:competition.date||event.date,final:state==='post'||event?.status?.type?.completed===true,
   cancelled:/postpon|cancel|suspend/i.test(label)});
 }
 return gameRows(games,channels,now);
}
function dateUTC(time){return new Date(time).toISOString().slice(0,10).replace(/-/g,'');}
export async function fetchNbaPrograms(channels,{fetcher=fetch,now=Date.now()}={}){
 const errors=[];
 try{
  const response=await fetcher(NBA_SCHEDULE_URL,{
   headers:{'User-Agent':'Mozilla/5.0 (compatible; epg4k/1.0)','Accept':'application/json',
    'Origin':'https://www.nba.com','Referer':'https://www.nba.com/'},
   signal:AbortSignal.timeout(25000)
  });
  if(!response.ok)throw new Error('NBA schedule HTTP '+response.status);
  const programs=parseNbaSchedule(await response.json(),channels,now);
  return {programs,source:'nba.com',errors,team_channels:nbaTeamChannels(channels).size};
 }catch(e){errors.push('nba.com: '+String(e.message||e).slice(0,140));}
 try{
  // ESPN is a fallback only; the range is padded for UTC/ET rollover.
  const range=dateUTC(now-DAY)+'-'+dateUTC(now+8*DAY);
  const response=await fetcher(NBA_SCOREBOARD_URL+'?dates='+range+'&limit=500',{
   headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0 (compatible; epg4k/1.0)'},
   signal:AbortSignal.timeout(25000)
  });
  if(!response.ok)throw new Error('Scoreboard HTTP '+response.status);
  const programs=parseEspnScoreboard(await response.json(),channels,now);
  return {programs,source:'espn.com (fallback)',errors,team_channels:nbaTeamChannels(channels).size};
 }catch(e){errors.push('espn.com: '+String(e.message||e).slice(0,140));}
 // Do not invent event data or extend expired schedules when both sources fail.
 return {programs:[],source:'unavailable',errors,team_channels:nbaTeamChannels(channels).size};
}
