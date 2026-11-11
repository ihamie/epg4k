// Bounded fallback for temporary sports-source failures.
// Never manufacture matches, reuse cancelled/final listings indefinitely, or hide no-game days.
const MAX_AGE=36*3600,MAX_FUTURE=8*86400;
export function mergeSportsPrograms(fresh,previous,failedLeagues,channels,now=Math.floor(Date.now()/1000)){
 const allow=new Set(channels.map(c=>c.output_id));
 const result=[],seen=new Set(),stats={fresh:0,reused:0,rejected:0,failed_leagues:[...failedLeagues].sort()};
 function add(p,cached){
  if(!p||typeof p!=='object'||!allow.has(p.channel)||typeof p.league!=='string'||
    typeof p.title!=='string'||!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.stop)||
    p.stop<=now||p.start>=p.stop||p.start>now+MAX_FUTURE||p.title.length>220||
    p.stop-p.start>8*3600){stats.rejected++;return;}
  const key=p.channel+'|'+p.start+'|'+p.league;
  if(seen.has(key)){stats.rejected++;return;}
  seen.add(key);
  result.push({channel:p.channel,start:p.start,stop:p.stop,title:p.title,
    description:String(p.description||'').slice(0,500),category:String(p.category||'').slice(0,100),
    league:p.league});
  if(cached)stats.reused++;else stats.fresh++;
 }
 for(const p of fresh)add(p,false);
 const savedAt=Number(previous?.generated_at);
 if(Number.isFinite(savedAt)&&savedAt<=now&&now-savedAt<=MAX_AGE&&Array.isArray(previous.programs)){
  const freshLeagues=new Set(fresh.map(p=>p?.league));
  for(const p of previous.programs){
   if(!failedLeagues.has(p?.league)||freshLeagues.has(p.league))continue;
   add(p,true);
  }
 }
 result.sort((a,b)=>a.start-b.start||a.channel.localeCompare(b.channel));
 return {programs:result,stats};
}
export function failedSportsLeagues(nba,others,minors){
 const failed=new Set();
 if(nba?.source==='unavailable')failed.add('NBA');
 for(const league of [...(others?.leagues||[]),...(minors?.leagues||[])]){
  if(!league?.league||Number(league.programmes)>0||!league.error)continue;
  if(/HTTP|timeout|fetch|scoreboard|directory|Invalid|ECONN|No team directory|Missing seasons|No seasons/i.test(league.error))
   failed.add(league.league);
 }
 return failed;
}
