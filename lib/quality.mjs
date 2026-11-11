// Human-readable, portable quality report for GitHub and downstream automation.
const round=(n,d)=>d?Math.round(1000*n/d)/10:0;
const md=s=>String(s??'').replace(/[\r\n|]/g,' ').replaceAll(String.fromCharCode(96),' ').trim().slice(0,110);
const NON_PROGRAMMED=/24\s*[X/]\s*7|24\/7|EVENT|PPV|FOR ADULTS|SPORTS \| (ESPN\+|PEACOCK|DAZN|TSN\+|SPORTSNET\+|PARAMOUNT\+|SKY SPORTS\+|FLO SPORTS|STAN SPORTS|SETANTA|OPTUS)/i;
export function buildQualityReport({channels,coverage,logos,sources,sports,indexErrors=[],previousStatus=null,now=Math.floor(Date.now()/1000)}){
 if(!Array.isArray(channels)||!Array.isArray(coverage))throw Error('Missing channel coverage');
 const covered=new Map(coverage.map(c=>[String(c.id),c]));
 const groupMap=new Map(),ids=new Map(),badSources=[];
 let listings=0,withLogo=0;
 for(const c of channels){
  const row=covered.get(String(c.id))||{};
  const hasGuide=Number(row.programmes)>0,logo=!!logos[c.output_id];
  const group=String(c.group||'Other');
  let item=groupMap.get(group);
  if(!item){item={group,total:0,epg:0,logos:0,mapped:0};groupMap.set(group,item);}
  item.total++;item.epg+=+hasGuide;item.logos+=+logo;item.mapped+=+!!c.source;
  listings+=+hasGuide;withLogo+=+logo;
  const id=String(c.output_id||'');
  if(!ids.has(id))ids.set(id,[]);
  ids.get(id).push({name:c.name,source:c.source,source_id:c.source_id,group});
 }
 const duplicates=[],conflicts=[];
 for(const [id,arr] of ids){
  if(arr.length<=1)continue;
  const entry={id,names:arr.map(c=>c.name),count:arr.length};
  duplicates.push(entry);
  const pairs=new Set(arr.filter(c=>c.source_id).map(c=>c.source+'|'+c.source_id));
  if(pairs.size>1)conflicts.push({...entry,sources:[...pairs]});
 }
 for(const s of sources||[]){
  if(!s||!s.id)continue;
  if(s.error)badSources.push({id:s.id,error:String(s.error).slice(0,180)});
 }
 const groupStats=[...groupMap.values()].map(x=>({...x,pct:round(x.epg,x.total),logo_pct:round(x.logos,x.total)}))
  .sort((a,b)=>b.total-a.total);
 const opportunity=groupStats.filter(x=>x.total>=10&&!NON_PROGRAMMED.test(x.group))
  .sort((a,b)=>(b.total-b.epg)-(a.total-a.epg)).slice(0,18);
 const leagueStats=(sports?.leagues||[]).map(x=>({
  league:x.league,channels:Number(x.team_channels??x.channels??0),
  matched:Number(x.matched_teams??x.matched??0),logos:Number(x.with_logos??0),
  programmes:Number(x.programmes??0),error:x.error||null
 }));
 if(sports?.nba)leagueStats.unshift({
  league:'NBA',channels:Number(sports.nba.team_channels)||0,
  matched:Number(sports.nba.team_channels)||0,logos:Number(sports.nba.logos)||0,
  programmes:Number(sports.nba.programmes)||0,
  error:sports.nba.source==='unavailable'?'Schedule sources unavailable':null
 });
 const data={
  generated_at:now,channels:channels.length,unique_xmltv_ids:ids.size,
  channels_with_epg:listings,channels_with_logos:withLogo,
  epg_percent:round(listings,channels.length),logo_percent:round(withLogo,channels.length),
  net_change_epg:previousStatus?listings-Number(previousStatus.covered_channels||0):null,
  net_change_logos:previousStatus?withLogo-Number(previousStatus.channels_with_logos||0):null,
  duplicate_id_groups:duplicates.length,conflicting_source_id_groups:conflicts.length,
  groups:groupStats,sports:leagueStats,source_failures:badSources,
  index_failures:indexErrors,duplicate_ids:duplicates,conflicting_ids:conflicts
 };
 const lines=[
  '# EPG quality report',
  '',
  '**Generated:** '+new Date(now*1000).toISOString().replace('T',' ').slice(0,16)+' UTC',
  '',
  '| Metric | Current |',
  '|---|---:|',
  '| Playlist channels | '+data.channels.toLocaleString('en-US')+' |',
  '| Distinct XMLTV IDs | '+data.unique_xmltv_ids.toLocaleString('en-US')+' |',
  '| Channels with guide listings | '+listings.toLocaleString('en-US')+' ('+data.epg_percent+'%) |',
  '| Channels with logos | '+withLogo.toLocaleString('en-US')+' ('+data.logo_percent+'%) |',
  '| Reused IDs / potential aliases | '+duplicates.length+' groups |',
  '| Conflicting source-ID groups for review | '+conflicts.length+' |',
  '| Source refresh errors | '+badSources.length+' |',
  '| Source index errors | '+indexErrors.length+' |',
  '',
  '## Largest potential coverage opportunities',
  '',
  'Low coverage does not imply a usable public EPG exists; 24/7 loops, generic events and PPV groups are deliberately excluded.',
  '',
  '| Group | Channels | EPG | Logos |',
  '|---|---:|---:|---:|',
  ...opportunity.map(g=>'| '+md(g.group)+' | '+g.total+' | '+g.epg+' ('+g.pct+'%) | '+g.logos+' ('+g.logo_pct+'%) |'),
  '',
  '## Team sports',
  '',
  '| League | Team channels | Matched | Logos | Programmes | Source health |',
  '|---|---:|---:|---:|---:|---|',
  ...leagueStats.map(l=>'| '+md(l.league)+' | '+l.channels+' | '+l.matched+' | '+l.logos+' | '+l.programmes+' | '+(l.error?md(l.error):'OK')+' |'),
  '',
  '## Duplicated XMLTV IDs requiring review',
  '',
  'Many shared IDs are intentional channel aliases. **Do not change an ID solely because it is duplicated.**',
  '',
  '| XMLTV ID | Playlist names |',
  '|---|---|',
  ...duplicates.slice(0,75).map(d=>'| '+md(d.id)+' | '+d.names.map(md).join(' / ')+' |'),
  '',
  '## Data-source errors',
  '',
  ...(badSources.length?badSources.map(s=>'- EPG '+md(s.id)+': '+md(s.error)):['- No EPG refresh errors detected']),
  ...(indexErrors||[]).map(s=>'- Index '+md(s.source)+': '+md(s.error)),
  '',
  '## Interpretation',
  '',
  '- Game schedules indicate scheduled fixtures, **not verified IPTV broadcasts**.',
  '- Team-specific EPG windows use estimated durations; actual games may end earlier or later.',
  '- On source failures, only short-lived previously confirmed future fixtures may be retained.',
  '- TiviMate may prefer playlist logos over XMLTV logos, depending on playlist settings.',
  '- Public data changes frequently; exact channel identities take precedence over fuzzy guessing.',
  ''
 ];
 return {data,markdown:lines.join('\n')};
}
