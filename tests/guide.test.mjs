import {MINOR_LEAGUES,hockeyUrl,parseHockeytech,seasonsToFetch,minorTeamDirectory,matchMinorTeams,minorGamePrograms,fetchMinorHockey} from '../lib/minor-hockey.mjs';
import {mergeSportsPrograms,failedSportsLeagues} from '../lib/sports-cache.mjs';
import {buildQualityReport} from '../lib/quality.mjs';
import {LEAGUES,espnTeams,teamChannelName,teamLogo,matchLeagueChannels,scheduleLeague,fetchLeagueSports} from '../lib/league-sports.mjs';
import {nbaTeamChannels,parseNbaSchedule,parseEspnScoreboard,fetchNbaPrograms} from '../lib/sports.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import{gzipSync,gunzipSync}from'node:zlib';import{filterSource,timestamp,refresh,publish}from'../lib/epg.mjs';
import {catalogLogos,validLogo} from '../lib/logos.mjs';
import {parseIndex,resolveMappings,excluded,regionOf} from '../lib/discovery.mjs';
const now=Date.UTC(2026,10,8)/1000,xml='<tv><programme channel="src" start="20261108010000 +0000" stop="20261108020000 +0000"><title>News &amp; فارسی</title><desc><![CDATA[A < B and </programme> in text]]></desc></programme></tv>',map=new Map([['src',new Set(['cnn.us','stalker.2'])]]);
function stream(v,n=1){const b=typeof v==='string'?new TextEncoder().encode(v):v;let i=0;return new ReadableStream({pull(c){if(i>=b.length)c.close();else{c.enqueue(b.slice(i,i+n));i+=n;}}});}
test('gzip chunk boundaries, Unicode, CDATA and multiple channel aliases',async()=>{const r=await filterSource(stream(gzipSync(xml)),map,now),s=gunzipSync(r.gzip).toString();assert.equal(r.programmes,2);assert.match(s,/فارسی/);assert.match(s,/A &lt; B and &lt;\/programme&gt; in text/);assert.match(s,/channel="cnn.us"/);});
test('expired, placeholder and duplicate listings do not inflate coverage',async()=>{assert.equal((await filterSource(stream(xml,30),map,now+86400)).programmes,0);assert.equal((await filterSource(stream(xml.replace('News &amp; فارسی','No details available'),30),map,now)).programmes,0);const twice=xml.replace('</tv>',xml.match(/<programme[\s\S]*<\/programme>/)[0]+'</tv>');assert.equal((await filterSource(stream(twice,30),map,now)).programmes,2);});
test('offsets converted once; invalid dates and missing offsets rejected',()=>{assert.equal(timestamp('20261108053000 +0530'),now);assert.equal(timestamp('20261101013000 -0700')+3600,timestamp('20261101013000 -0800'));assert.ok(Number.isNaN(timestamp('20260230000000 +0000')));assert.ok(Number.isNaN(timestamp('20261108010000')));});
test('truncated, HTML and entity-bearing input cannot become a valid guide',async()=>{await assert.rejects(()=>filterSource(stream(xml.slice(0,-5),30),map,now),/Incomplete/);await assert.rejects(()=>filterSource(stream('<html>Denied</html>',30),map,now),/Incomplete/);await assert.rejects(()=>filterSource(stream('<!DOCTYPE tv [<!ENTITY bad SYSTEM "file:///etc/passwd">]>'+xml,30),map,now),/Entity/);assert.equal((await filterSource(stream('<!DOCTYPE tv SYSTEM "xmltv.dtd">'+xml,30),map,now)).programmes,2);});
function fake(){const objects=new Map(),locks=new Map();return{objects,DB:{prepare(){return{bind(...v){return{async first(){if(locks.has(v[0]))return null;locks.set(v[0],v[1]);return{owner:v[1]};},async run(){locks.delete(v[0]);}};}};}},BUCKET:{async get(k){if(!objects.has(k))return null;const v=objects.get(k),b=typeof v==='string'?new TextEncoder().encode(v):v;return{body:stream(b,1024),size:b.length,httpEtag:'test',json:async()=>JSON.parse(new TextDecoder().decode(b))};},async put(k,v){objects.set(k,v);},async delete(k){for(const a of Array.isArray(k)?k:[k])objects.delete(a);}}};}
test('failed download retains last successful source',async()=>{const e=fake();e.objects.set('sources/UK1.json',JSON.stringify({id:'UK1',last_success:1,programmes:3,partKey:'old'}));e.objects.set('old',new Uint8Array([1]));const f=globalThis.fetch;globalThis.fetch=async()=>new Response('Unavailable',{status:503});try{const r=await refresh(e,'UK1');assert.equal(r.result,'failed');assert.equal(r.partKey,'old');assert.ok(e.objects.has('old'));}finally{globalThis.fetch=f;}});
test('empty update cannot replace the published guide',async()=>{const e=fake();e.objects.set('current.json',JSON.stringify({guideKey:'good'}));await assert.rejects(()=>publish(e),/previous guide preserved/);assert.equal(JSON.parse(e.objects.get('current.json')).guideKey,'good');});

test('channel logos use exact channel IDs, reject wrong regional feeds and invalid URLs',()=>{
 const channels=[{output_id:'cnn.us'},{output_id:'stalker.2'},{output_id:'I123.schedulesdirect.org'}];
 const records=[
  {channel:'CNN.us',feed:null,in_use:true,format:'PNG',url:'https://example.org/cnn.png'},
  {channel:'CNN.us',feed:'West',in_use:true,format:'PNG',url:'https://example.org/west.png'},
  {channel:'CNN.ca',feed:null,in_use:true,format:'PNG',url:'https://example.org/canada.png'},
  {channel:'CNN.us',feed:null,in_use:true,format:'PNG',url:'http://example.org/insecure.png'},
  {channel:'stalker.2',feed:null,in_use:true,format:'PNG',url:'https://example.org/unknown.png'}];
 assert.deepEqual(catalogLogos(records,channels),{'cnn.us':'https://example.org/cnn.png'});
 assert.equal(validLogo('javascript:alert(1)'),false);
 assert.equal(validLogo('https://example.org/cnn.png'),true);
});
test('published XMLTV includes channel icon without changing its ID or guide',async()=>{
 const e=fake(),now=Math.floor(Date.now()/1000);
 const start=new Date((now+120)*1000).toISOString().slice(0,19).replace(/[-:T]/g,'')+' +0000';
 const stop=new Date((now+3720)*1000).toISOString().slice(0,19).replace(/[-:T]/g,'')+' +0000';
 const sample='<tv><programme channel="cnn.us" start="'+start+'" stop="'+stop+'"><title>News</title></programme></tv>';
 e.objects.set('sources/US2.json',JSON.stringify({id:'US2',partKey:'sample.gz'}));
 e.objects.set('sample.gz',gzipSync(sample));
 const report=await publish(e,{'cnn.us':'https://example.org/cnn.png?a=1&b=2'});
 assert.equal(report.result,'published');
 const output=gunzipSync(e.objects.get(report.guideKey)).toString();
 const channelHeader=output.split('\n').find(line=>line.startsWith('<channel id="cnn.us">'));
 assert.ok(channelHeader,'cnn.us channel should be present in the generated guide');
 assert.ok(channelHeader.includes('<icon src="https://example.org/cnn.png?a=1&amp;b=2"/>'),'cnn.us channel should include its escaped logo URL');
 assert.match(output,/<programme[^>]*channel="cnn.us"/);
});

test('daily discovery adds only unambiguous source IDs in the correct region',()=>{
 const channels=[
  {id:'1',name:'HGTV HD USA',group:'ENGLISH USA',output_id:'hgtv.us',source:null},
  {id:'2',name:'HGTV HD CA',group:'ENGLISH CANADA',output_id:'hgtv.ca',source:null},
  {id:'3',name:'MOVIES 24x7',group:'ENGLISH MOVIES 24x7',output_id:'stalker.3',source:null},
  {id:'4',name:'NEWS A',group:'ENGLISH USA',output_id:'newsa.us',source:'US2',source_id:'NEWS.A.us2'}
 ];
 const indexes={US2:parseIndex('Home.and.Garden.Television.HD.us2\nNEWS.A.us2'),CA2:parseIndex('Home.and.Garden.Television.HD.ca2')};
 const r=resolveMappings(channels,indexes);
 assert.equal(r.mappings.length,1);
 assert.equal(r.channels[0].source_id,'Home.and.Garden.Television.HD.us2');
 assert.equal(r.channels[1].source,null);
 assert.equal(r.channels[2].source,null);
 assert.equal(r.channels[3].source_id,'NEWS.A.us2');
 assert.equal(excluded(channels[2]),true);
});
test('discovery skips ambiguous source variants and avoids unsafe overrides',()=>{
 const channels=[
  {id:'1',name:'Fox HD USA',group:'ENGLISH USA',output_id:'fox.us',source:null},
  {id:'2',name:'FOX NEWS HD USA',group:'ENGLISH USA',output_id:'foxnews.us',source:'US2',source_id:'Fox.News.HD.us2'},
  {id:'3',name:'HALLMARK HD USA',group:'ENGLISH USA',output_id:'hallmark.us',source:null}
 ];
 const r=resolveMappings(channels,{US2:parseIndex('FOX.HD.us2\nFOX.4K.us2\nFox.News.HD.us2\nHallmark.HD.us2')});
 assert.equal(r.channels[0].source,null);
 assert.equal(r.channels[2].source_id,'Hallmark.HD.us2');
 assert.equal(r.channels[1].source_id,'Fox.News.HD.us2');
});
test('logo fallback requires exact normalized name and country',()=>{
 const records=[{channel:'HGTV.us',url:'https://example.org/hgtv.png',in_use:true,format:'PNG',feed:null}];
 const channels=[
  {id:'1',name:'HGTV HD USA',group:'ENGLISH USA',output_id:'I123.schedulesdirect.org'},
  {id:'2',name:'HGTV HD CA',group:'ENGLISH CANADA',output_id:'I124.schedulesdirect.org'}];
 const directory=[{id:'HGTV.us',name:'HGTV',country:'US'}];
 const result=catalogLogos(records,channels,directory);
 assert.equal(result['I123.schedulesdirect.org'],'https://example.org/hgtv.png');
 assert.equal(result['I124.schedulesdirect.org'],undefined);
});

test('USA suffix overrides misleading India XMLTV ID and HD does not use SD feed',()=>{
 const channels=[
  {id:'1',name:'SONY MAX HD USA',group:'HINDI',output_id:'sonymax.in',source:null},
  {id:'2',name:'PTC SIMRAN HD USA',group:'PUNJABI RELIGIOUS',output_id:'ptcsimran.in',source:null},
  {id:'3',name:'HGTV HD USA',group:'ENGLISH USA',output_id:'hgtv.us',source:null},
  {id:'4',name:'FOX EAST HD USA',group:'ENGLISH USA',output_id:'foxeast.us',source:null},
  {id:'5',name:'EXAMPLE HD INDIA',group:'HINDI',output_id:'example.in',source:'IN1',source_id:'Example.HD.in'}
 ];
 const indexes={IN1:parseIndex('Sony.Max.SD.in\nPTC.Simran.in\nExample.HD.in'),
 US2:parseIndex('Home.and.Garden.Television.SD.us2\nFOX.West.HD.us2')};
 assert.equal(regionOf(channels[0]),'us');
 const r=resolveMappings(channels,indexes);
 assert.equal(r.channels[0].source,null);
 assert.equal(r.channels[1].source,null);
 assert.equal(r.channels[2].source,null);
 assert.equal(r.channels[3].source,null);
 assert.equal(r.channels[4].source,'IN1');
});

test('NBA team channels correctly identify 30 teams but exclude WNBA event placeholders',()=>{
 const channels=[
  {group:'SPORTS | NBA',name:'NBA: GOLDEN STATE WARRIORS 4K',output_id:'stalker.6174'},
  {group:'SPORTS | NBA',name:'NBA: HOUSTON ROCKETS 4K',output_id:'stalker.6175'},
  {group:'SPORTS | NBA',name:'WNBA 1 4K',output_id:'stalker.5909'}
 ];
 const matched=nbaTeamChannels(channels);
 assert.equal(matched.size,2);
 assert.equal(matched.get('GSW').channel,'stalker.6174');
 assert.equal(matched.get('HOU').channel,'stalker.6175');
});
test('NBA scheduled matchup generates both team listings at accurate UTC tipoff',()=>{
 const channels=[
  {group:'SPORTS | NBA',name:'NBA: GOLDEN STATE WARRIORS 4K',output_id:'stalker.6174'},
  {group:'SPORTS | NBA',name:'NBA: HOUSTON ROCKETS 4K',output_id:'stalker.6175'}
 ];
 const data={leagueSchedule:{leagueId:'00',gameDates:[{games:[
  {gameStatus:1,gameDateTimeUTC:'2026-11-12T02:30:00Z',homeTeam:{teamTricode:'HOU'},awayTeam:{teamTricode:'GSW'}},
  {gameStatus:3,gameDateTimeUTC:'2026-11-11T02:00:00Z',homeTeam:{teamTricode:'GSW'},awayTeam:{teamTricode:'HOU'}}]}]}};
 const rows=parseNbaSchedule(data,channels,Date.parse('2026-11-11T11:00:00Z'));
 assert.equal(rows.length,2);
 assert.equal(rows[0].title,'Golden State Warriors @ Houston Rockets');
 assert.equal(rows[0].start,Date.parse('2026-11-12T02:30:00Z')/1000);
 assert.equal(rows[0].stop-rows[0].start,3*3600);
 assert.deepEqual(new Set(rows.map(p=>p.channel)),new Set(['stalker.6174','stalker.6175']));
});
test('ESPN NBA fallback extracts schedule and excludes off-days, finals and cancellations',()=>{
 const channels=[{group:'SPORTS | NBA',name:'NBA: GOLDEN STATE WARRIORS 4K',output_id:'stalker.6174'}];
 const event=(date,state,name='STATUS_SCHEDULED')=>({date,status:{type:{state,name}},competitions:[{date,competitors:[
 {homeAway:'away',team:{abbreviation:'GSW'}},{homeAway:'home',team:{abbreviation:'HOU'}}]}]});
 const data={events:[event('2026-11-12T02:30:00Z','pre'),event('2026-11-13T02:30:00Z','post','STATUS_FINAL'),event('2026-11-14T02:30:00Z','pre','STATUS_POSTPONED')]};
 const rows=parseEspnScoreboard(data,channels,Date.parse('2026-11-11T00:00:00Z'));
 assert.equal(rows.length,1);
 assert.equal(rows[0].channel,'stalker.6174');
});
test('NBA schedule source failure is nonfatal and ESPN fallback is used',async()=>{
 const channels=[{group:'SPORTS | NBA',name:'NBA: GOLDEN STATE WARRIORS 4K',output_id:'stalker.6174'}];
 const requests=[];
 const fetcher=async url=>{
   requests.push(url);
   if(url.includes('cdn.nba.com'))return new Response('',{status:403});
   return new Response(JSON.stringify({events:[{date:'2026-11-12T02:30:00Z',status:{type:{state:'pre'}},
    competitions:[{competitors:[{homeAway:'away',team:{abbreviation:'GSW'}},{homeAway:'home',team:{abbreviation:'HOU'}}]}]}]}),{status:200});
 };
 const r=await fetchNbaPrograms(channels,{fetcher,now:Date.parse('2026-11-11T00:00:00Z')});
 assert.equal(r.programs.length,1);
 assert.equal(r.source,'espn.com (fallback)');
 assert.equal(requests.length,2);
});

test('verified team logos map only to dedicated team channels, not numbered event channels',()=>{
 const league=LEAGUES.find(l=>l.key==='NFL');
 const channels=[
  {group:'SPORTS | NFL',name:'NFL: SAN FRANCISCO 49ERS 4K',output_id:'stalker.6160'},
  {group:'SPORTS | NFL',name:'NFL: RED ZONE HD',output_id:'nflredzone.us'},
  {group:'SPORTS | ESPN+',name:'ESPN PLUS 1 HD',output_id:'1.espn'}];
 const data={sports:[{leagues:[{teams:[
  {team:{id:'25',displayName:'San Francisco 49ers',logos:[{href:'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png'}]}},
  {team:{id:'26',displayName:'Seattle Seahawks',logos:[{href:'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png'}]}}
 ]}]}]};
 const r=matchLeagueChannels(channels,league,espnTeams(data));
 assert.equal(r.byId.size,1);
 assert.equal(r.logos['stalker.6160'],'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png');
 assert.equal(Object.keys(r.logos).length,1);
 assert.equal(teamLogo({logos:[{href:'http://evil.com/x.png'}]}),null);
 assert.equal(teamChannelName(channels[1],league),null);
});
test('non-NBA team schedule correctly places matchup for both teams and rejects finals and cancellations',()=>{
 const league=LEAGUES.find(l=>l.key==='NHL'),teams=[
  {id:'1',name:'San Jose Sharks',logos:[]},
  {id:'2',name:'Seattle Kraken',logos:[]}];
 const channels=[
  {group:'SPORTS | NHL',name:'NHL: SAN JOSE SHARKS 4K',output_id:'stalker.6100'},
  {group:'SPORTS | NHL',name:'NHL: SEATTLE KRAKEN 4K',output_id:'stalker.6101'}];
 const match=matchLeagueChannels(channels,league,teams),event=(id,state,label)=>({
  id,date:'2026-11-13T03:00:00Z',status:{type:{state,name:label}},
  competitions:[{competitors:[
   {homeAway:'home',team:{id:'1',displayName:'San Jose Sharks'}},
   {homeAway:'away',team:{id:'2',displayName:'Seattle Kraken'}}]}]});
 const rows=scheduleLeague({events:[event('one','pre','STATUS_SCHEDULED'),event('two','post','STATUS_FINAL'),event('three','pre','STATUS_POSTPONED')]},league,match,Date.parse('2026-11-11T00:00:00Z'));
 assert.equal(rows.length,2);
 assert.equal(rows[0].title,'Seattle Kraken @ San Jose Sharks');
 assert.equal(rows[0].start,Date.parse('2026-11-13T03:00:00Z')/1000);
 assert.deepEqual(new Set(rows.map(x=>x.channel)),new Set(['stalker.6100','stalker.6101']));
});
test('sports league fetch preserves usable team artwork on schedule failure',async()=>{
 const channels=[{group:'SPORTS | NFL',name:'NFL: SAN FRANCISCO 49ERS 4K',output_id:'stalker.6160'}];
 const fetcher=async(url)=>{
  if(url.includes('/football/nfl/teams'))return new Response(JSON.stringify({sports:[{leagues:[{teams:[
   {team:{id:'25',displayName:'San Francisco 49ers',logos:[{href:'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png'}]}}]}]}]}),{status:200});
  return new Response('',{status:503});
 };
 const r=await fetchLeagueSports(channels,{fetcher,now:Date.parse('2026-11-11T00:00:00Z')});
 assert.equal(r.programs.length,0);
 assert.equal(r.logos['stalker.6160'],'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png');
 assert.equal(r.leagues.find(x=>x.league==='NFL').matched_teams,1);
 assert.match(r.leagues.find(x=>x.league==='NFL').error,/scoreboard/);
});

test('multi-league daily scoreboard integration yields team-specific matchup listings',async()=>{
 const channels=[
  {group:'SPORTS | NFL',name:'NFL: SAN FRANCISCO 49ERS 4K',output_id:'stalker.6160'},
  {group:'SPORTS | NFL',name:'NFL: SEATTLE SEAHAWKS 4K',output_id:'stalker.6161'}];
 const fetcher=async url=>{
  if(url.includes('/football/nfl/teams'))return new Response(JSON.stringify({sports:[{leagues:[{teams:[
   {team:{id:'25',displayName:'San Francisco 49ers',logos:[{href:'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png'}]}},
   {team:{id:'26',displayName:'Seattle Seahawks',logos:[{href:'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png'}]}}
  ]}]}]}),{status:200});
  if(url.includes('/football/nfl/scoreboard'))return new Response(JSON.stringify({
   events:url.includes('20261113')?[{id:'game1',date:'2026-11-13T01:15:00Z',status:{type:{state:'pre'}},
    competitions:[{date:'2026-11-13T01:15:00Z',competitors:[
     {homeAway:'home',team:{id:'25',displayName:'San Francisco 49ers'}},
     {homeAway:'away',team:{id:'26',displayName:'Seattle Seahawks'}}]}]}]:[]}),{status:200});
  return new Response('',{status:404});
 };
 const r=await fetchLeagueSports(channels,{fetcher,now:Date.parse('2026-11-11T12:00:00Z')});
 assert.equal(r.programs.length,2);
 assert.equal(r.programs[0].title,'Seattle Seahawks @ San Francisco 49ers');
 assert.equal(r.programs[0].stop-r.programs[0].start,4*3600);
 assert.equal(r.leagues.find(x=>x.league==='NFL').error,null);
});

test('all eight differently named MLS teams resolve to their official team logos',()=>{
 const league=LEAGUES.find(l=>l.key==='MLS');
 const cases=[
 ['ATLANTA UNITED','Atlanta United FC'],
 ['CHICAGO FIRE','Chicago Fire FC'],
 ['HOUSTON DYNAMO','Houston Dynamo FC'],
 ['INTER MIAMI','Inter Miami CF'],
 ['MINNESOTA UNITED','Minnesota United FC'],
 ['NEW YORK RED BULLS','Red Bull New York'],
 ['ORLANDO CITY','Orlando City SC'],
 ['VANCOUVER WHITECAPS','Vancouver Whitecaps']];
 const channels=cases.map(([c],i)=>({group:'SPORTS | MLS',name:'MLS | '+c+' 4K',output_id:'stalker.'+(7500+i)}));
 const teams=cases.map(([,name],i)=>({id:String(i+1),name,logos:[{href:'https://a.espncdn.com/i/teamlogos/soccer/500/'+(i+1)+'.png'}]}));
 const matches=matchLeagueChannels(channels,league,teams);
 assert.equal(matches.byId.size,8);
 assert.equal(Object.keys(matches.logos).length,8);
});

test('published XMLTV carries team logos and scheduled sports matchups on stable channel IDs',async()=>{
 const env=fake(),now=Math.floor(Date.now()/1000);
 const p={channel:'stalker.6174',start:now+120,stop:now+10800,
  title:'Golden State Warriors @ Houston Rockets',
  description:'Scheduled NBA tipoff; channel availability is unverified.',category:'Sports / Basketball'};
 const result=await publish(env,{'stalker.6174':'https://a.espncdn.com/i/teamlogos/nba/500/gs.png'},[p]);
 assert.equal(result.result,'published');
 assert.equal(result.nba_programmes,1);
 assert.equal(result.sports_channels_with_programmes,1);
 const content=gunzipSync(env.objects.get(result.guideKey)).toString();
 const header=content.split('\n').find(line=>line.startsWith('<channel id="stalker.6174">'));
 assert.ok(header?.includes('<icon src="https://a.espncdn.com/i/teamlogos/nba/500/gs.png"/>'));
 assert.match(content,/<programme[^>]*channel="stalker\.6174"/);
 assert.match(content,/<title>Golden State Warriors @ Houston Rockets<\/title>/);
});

test('EPL and EFL team groups are distinct, including misspelled legacy provider labels',()=>{
 const epl=LEAGUES.find(l=>l.key==='EPL'),efl=LEAGUES.find(l=>l.key==='EFL');
 const l1=LEAGUES.find(l=>l.key==='EFL1'),l2=LEAGUES.find(l=>l.key==='EFL2');
 assert.equal(teamChannelName({group:'SPORTS | EPL EFL',name:'EPL: MANCHESTER UTD',output_id:'stalker.1'},epl),'MANCHESTER UNITED');
 assert.equal(teamChannelName({group:'SPORTS | EPL EFL',name:'EFL: LEICTER CITY',output_id:'stalker.2'},efl),'LEICESTER CITY');
 assert.equal(teamChannelName({group:'SPORTS | EPL EFL',name:'EFL L1: AFC WIMBELDON',output_id:'stalker.3'},l1),'AFC WIMBLEDON');
 assert.equal(teamChannelName({group:'SPORTS | EPL EFL',name:'EFL L2: ACCRIGTON STABLEY',output_id:'stalker.4'},l2),'ACCRINGTON STANLEY');
 assert.equal(teamChannelName({group:'SPORTS | EPL EFL',name:'EFL: LEICTER CITY',output_id:'stalker.2'},epl),null);
 assert.equal(teamChannelName({group:'SPORTS | EPL EFL',name:'EPL 01 4K',output_id:'stalker.99'},epl),null);
});
test('HockeyTech schedule reads exact team IDs, source timezone, and rejects completed and TBD events',()=>{
 const league=MINOR_LEAGUES[0],now=Date.parse('2026-11-11T00:00:00Z');
 const seasons=seasonsToFetch({SiteKit:{Seasons:[
  {season_id:'94',season_name:'2026-27 Regular Season',start_date:'2026-10-02',end_date:'2027-04-11'},
  {season_id:'90',season_name:'2025-26 Regular Season',start_date:'2025-10-07',end_date:'2026-04-19'}]}},now);
 assert.deepEqual(seasons,['94']);
 const channels=[
 {group:'SPORTS | AHL OHL QMJHL WHL',name:'AHL | SAN JOSE BARRACUDA',output_id:'stalker.1'},
 {group:'SPORTS | AHL OHL QMJHL WHL',name:'AHL | ONTARIO REIGN',output_id:'stalker.2'},
 {group:'SPORTS | AHL OHL QMJHL WHL',name:'WHL 01 4K',output_id:'stalker.3'}];
 const dir={SiteKit:{Teamsbyseason:[
  {id:'11',name:'San Jose Barracuda',logo:'https://assets.leaguestat.com/ahl/team11.png'},
  {id:'12',name:'Ontario Reign',logo:'http://evil.example/logo.png'}]}};
 const match=matchMinorTeams(channels,league,minorTeamDirectory(dir));
 assert.equal(match.map.size,2);
 assert.equal(match.logos['stalker.1'],'https://assets.leaguestat.com/ahl/team11.png');
 assert.equal(match.logos['stalker.2'],undefined);
 const base={home_team:'11',visiting_team:'12',home_team_name:'San Jose Barracuda',
  visiting_team_name:'Ontario Reign',GameDateISO8601:'2026-11-12T19:00:00-08:00',game_status:'7:00 pm PST',final:'0'};
 const rows=minorGamePrograms([{SiteKit:{Schedule:[{...base,game_id:'1'}, {...base,game_id:'2',final:'1'},
  {...base,game_id:'3',date_tbd:'1'}]}}],league,match,now);
 assert.equal(rows.length,2);
 assert.equal(rows[0].title,'Ontario Reign @ San Jose Barracuda');
 assert.equal(rows[0].start,Date.parse('2026-11-12T19:00:00-08:00')/1000);
 assert.equal(rows[0].league,'AHL');
 assert.match(hockeyUrl(league,'schedule',{season_id:'94'}),/view=schedule/);
 assert.equal(parseHockeytech('angular.callbacks._0({"SiteKit":{"Schedule":[]}});').SiteKit.Schedule.length,0);
});
test('HockeyTech source errors do not manufacture schedules or logos',async()=>{
 const result=await fetchMinorHockey([{group:'SPORTS | AHL OHL QMJHL WHL',name:'AHL | SAN JOSE BARRACUDA',output_id:'stalker.1'}],
  {fetcher:async()=>new Response('',{status:503})});
 assert.equal(result.programs.length,0);
 assert.equal(Object.keys(result.logos).length,0);
 assert.match(result.leagues[0].error,/HTTP 503/);
});
test('sports fallback preserves only short-lived future fixtures for failed sources',()=>{
 const channels=[{output_id:'stalker.1'},{output_id:'stalker.2'}],now=1794391200;
 const p=(league,id,start)=>({league,channel:id,start,stop:start+10800,title:'A @ B',description:'Fixture'});
 const old={generated_at:now-3600,programs:[p('NFL','stalker.1',now+1000),p('MLB','stalker.2',now+1000),
  p('NFL','stalker.999',now+1000),p('NFL','stalker.1',now-20000)]};
 const a=mergeSportsPrograms([],old,new Set(['NFL']),channels,now);
 assert.equal(a.programs.length,1);
 assert.equal(a.programs[0].league,'NFL');
 assert.equal(a.stats.reused,1);
 assert.equal(mergeSportsPrograms([],old,new Set(),channels,now).programs.length,0);
 assert.equal(mergeSportsPrograms([],{...old,generated_at:now-37*3600},new Set(['NFL']),channels,now).programs.length,0);
 assert.equal(failedSportsLeagues({source:'nba.com'},{leagues:[]},{leagues:[{league:'AHL',error:'schedule HTTP 503',programmes:0}]}).has('AHL'),true);
});
test('quality dashboard counts channel coverage, logos and conflicting XMLTV identities',()=>{
 const channels=[
 {id:'1',name:'ABC HD',group:'ENGLISH USA',output_id:'abc.us',source:'US2',source_id:'abc1'},
 {id:'2',name:'ABC 4K',group:'ENGLISH USA',output_id:'abc.us',source:'US2',source_id:'abc2'},
 {id:'3',name:'NBA: TEAM',group:'SPORTS | NBA',output_id:'stalker.3',source:null,source_id:null}];
 const coverage=[{id:'1',programmes:2},{id:'2',programmes:2},{id:'3',programmes:0}];
 const report=buildQualityReport({channels,coverage,logos:{'abc.us':'https://example.org/logo.png'},sources:[],
  sports:{leagues:[]},now:1794391200});
 assert.equal(report.data.channels_with_epg,2);
 assert.equal(report.data.channels_with_logos,2);
 assert.equal(report.data.duplicate_id_groups,1);
 assert.equal(report.data.conflicting_source_id_groups,1);
 assert.match(report.markdown,/Conflicting source-ID groups/);
});
