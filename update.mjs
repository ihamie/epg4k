// Single-process GitHub Actions adapter for the tested XMLTV engine.
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {refresh,sources,publish,coverage,channels,setActiveChannels} from './lib/epg.mjs';
import {fetchIndexes,resolveMappings} from './lib/discovery.mjs';
import {loadLogos} from './lib/logos.mjs';
import {fetchNbaPrograms} from './lib/sports.mjs';
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
 const report=await publish(env,artwork.logos,nba.programs);
 if(report.result!=='published')throw new Error('Publication did not complete');
 const rows=await coverage(env);
 const {guideKey,coverageKey,...status}=report;
 await mkdir('docs',{recursive:true});
 await writeFile('docs/guide.xml.gz',await readFile(join(root,guideKey)));
 await writeFile('docs/status.json',JSON.stringify(status,null,2)+'\n');
 await writeFile('docs/coverage.json',JSON.stringify(rows,null,2)+'\n');
 await writeFile('docs/auto-mappings.json',JSON.stringify(discovery.mappings,null,2)+'\n');
 await writeFile('docs/sports-status.json',JSON.stringify({generated_at:Math.floor(Date.now()/1000),source:nba.source,team_channels:nba.team_channels,programmes:nba.programs.length,channels_with_games:new Set(nba.programs.map(p=>p.channel)).size,errors:nba.errors},null,2)+'\n');
 await writeFile('docs/source-index-errors.json',JSON.stringify(indexes.failures,null,2)+'\n');
 console.log(JSON.stringify(status));
} finally {database.close();}
