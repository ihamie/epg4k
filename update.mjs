// Single-process GitHub Actions adapter for the tested XMLTV engine.
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {refresh,sources,publish,coverage,channels,setActiveChannels,states} from './lib/epg.mjs';
import {fetchIndexes,resolveMappings} from './lib/discovery.mjs';
import {loadLogos} from './lib/logos.mjs';
import {fetchNbaPrograms} from './lib/sports.mjs';
import {fetchLeagueSports} from './lib/league-sports.mjs';
import {fetchMinorHockey} from './lib/minor-hockey.mjs';
import {mergeSportsPrograms,failedSportsLeagues} from './lib/sports-cache.mjs';
import {buildQualityReport} from './lib/quality.mjs';
const root='.state'; await mkdir(root,{recursive:true});
const database=new DatabaseSync(join(root,'leases.sqlite'));
database.exec('CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, owner TEXT, expires INTEGER)');
const env={
 DB:{prepare(sql){return {bind(...params){return {async first(){return database.prepare(sql).get(...params)??null;},async run(){const r=database.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}};}};}};}},
 BUCKET:{
  async get(key){try{const b=await readFile(join(root,key));return {size:b.length,body:new Blob([b]).stream(),json:async()=>JSON.parse(b.toString())};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async put(key,value){const dest=join(root,key);await mkdir(join(dest,'..'),{recursive:true});await writeFile(dest,value);},
  async delete(keys){for(const key of [].concat(keys))await unlink(join(root,key)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
};
try {
 let previousStatus=null;
 try{previousStatus=JSON.parse(await readFile('docs/status.json','utf8'));}catch{}
 const indexes=await fetchIndexes(sources);
 let previousMappings=[];
 try{previousMappings=JSON.parse(await readFile('docs/auto-mappings.json','utf8'));}catch{}
 const discovery=resolveMappings(channels,indexes.indexes,previousMappings);
 setActiveChannels(discovery.channels);
 console.log('Automatic mappings:',discovery.mappings.length,'unavailable indexes:',indexes.failures.length);
 for(let i=0;i<sources.length;i+=2){
  const results=await Promise.all(sources.slice(i,i+2).map(s=>refresh(env,s.id)));
  for(const r of results)console.log(r.id,r.result,r.programmes??0,r.error??'');
 }
 const artwork=await loadLogos(discovery.channels,'docs/channel-logos.json',{readFile,writeFile,mkdir});
 console.log('Channel logos:',artwork.count,'catalog updated:',artwork.updated);
 const nba=await fetchNbaPrograms(discovery.channels);
 console.log('NBA team programmes:',nba.programs.length,'team channels:',nba.team_channels,'source:',nba.source,'errors:',nba.errors.join('; '));
 let cachedTeamLogos={};
 try{cachedTeamLogos=JSON.parse(await readFile('docs/team-logos.json','utf8'));}catch{}
 const otherSports=await fetchLeagueSports(discovery.channels,{cache:cachedTeamLogos});
 const minors=await fetchMinorHockey(discovery.channels);
 let previousSports={};
 try{previousSports=JSON.parse(await readFile('docs/sports-programs.json','utf8'));}catch{}
 const failed=failedSportsLeagues(nba,otherSports,minors);
 const freshSports=[...nba.programs,...otherSports.programs,...minors.programs];
 const combined=mergeSportsPrograms(freshSports,previousSports,failed,discovery.channels);
 const sportsPrograms=combined.programs;
 // Preserve only previously verified official logo URLs for known team channels.
 const teamChannelIds=new Set(discovery.channels.filter(c=>
   /^(SPORTS \| (NBA|NFL|NHL|MLB|MLS|EPL EFL|AHL OHL QMJHL WHL))$/.test(c.group||'')&&
   /^stalker\.\d+$/.test(c.output_id)).map(c=>c.output_id));
 const safeCachedLogos=Object.fromEntries(Object.entries(cachedTeamLogos).filter(([id,url])=>{
  if(!teamChannelIds.has(id)||typeof url!=='string')return false;
  try{const host=new URL(url).hostname;return url.startsWith('https://')&&
   (host.endsWith('.espncdn.com')||host==='espncdn.com'||
    host==='assets.leaguestat.com'||host.endsWith('.leaguestat.com'));}catch{return false;}
 }));
 const teamLogos={...safeCachedLogos,...otherSports.logos,...minors.logos};
 const sportLogos={...artwork.logos,...teamLogos};
 console.log('Additional major-league schedules:',otherSports.programs.length,
  'minor-hockey schedules:',minors.programs.length,'team logos:',Object.keys(teamLogos).length);
 console.log('Sports league coverage:',JSON.stringify(otherSports.leagues));
 console.log('Minor hockey:',JSON.stringify(minors.leagues),'Fallback:',JSON.stringify(combined.stats));
 const report=await publish(env,sportLogos,sportsPrograms);
 if(report.result!=='published')throw new Error('Publication did not complete');
 const rows=await coverage(env);
 const {guideKey,coverageKey,...status}=report;
 await mkdir('docs',{recursive:true});
 await writeFile('docs/guide.xml.gz',await readFile(join(root,guideKey)));
 await writeFile('docs/status.json',JSON.stringify(status,null,2)+'\n');
 await writeFile('docs/coverage.json',JSON.stringify(rows,null,2)+'\n');
 await writeFile('docs/auto-mappings.json',JSON.stringify(discovery.mappings,null,2)+'\n');
 const generated=Math.floor(Date.now()/1000);
 const sportReport={
  generated_at:generated,source:nba.source,team_channels:nba.team_channels,
  programmes:sportsPrograms.length,channels_with_games:new Set(sportsPrograms.map(p=>p.channel)).size,
  team_logos:Object.keys(teamLogos).length,nba_programmes:nba.programs.length,
  leagues:otherSports.leagues,
  minor_leagues:minors.leagues,cache:combined.stats,
  errors:nba.errors
 };
 await writeFile('docs/team-logos.json',JSON.stringify(teamLogos,null,2)+'\n');
 await writeFile('docs/sports-programs.json',JSON.stringify({generated_at:generated,programs:sportsPrograms},null,2)+'\n');
 await writeFile('docs/sports-status.json',JSON.stringify(sportReport,null,2)+'\n');
 const quality=buildQualityReport({
  channels:discovery.channels,coverage:rows,logos:sportLogos,
  sources:await states(env),sports:{nba:{source:nba.source,team_channels:nba.team_channels,logos:30,
   programmes:nba.programs.length},leagues:[...otherSports.leagues,...minors.leagues]},
  indexErrors:indexes.failures,previousStatus,now:generated
 });
 await writeFile('docs/quality.json',JSON.stringify(quality.data,null,2)+'\n');
 await writeFile('docs/quality.md',quality.markdown);
 console.log('EPG quality:',quality.data.channels_with_epg,'with programmes,',
  quality.data.channels_with_logos,'with logos,',quality.data.conflicting_source_id_groups,'ID conflicts');
 await writeFile('docs/source-index-errors.json',JSON.stringify(indexes.failures,null,2)+'\n');
 console.log(JSON.stringify(status));
} finally {database.close();}
