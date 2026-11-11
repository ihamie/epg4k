// Single-process GitHub Actions adapter for the tested XMLTV engine.
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {refresh,sources,publish,coverage,channels} from './lib/epg.mjs';
import {loadLogos} from './lib/logos.mjs';
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
 for(let i=0;i<sources.length;i+=2){
  const results=await Promise.all(sources.slice(i,i+2).map(s=>refresh(env,s.id)));
  for(const r of results)console.log(r.id,r.result,r.programmes??0,r.error??'');
 }
 const artwork=await loadLogos(channels,'docs/channel-logos.json',{readFile,writeFile,mkdir});
 console.log('Channel logos:',artwork.count,'catalog updated:',artwork.updated);
 const report=await publish(env,artwork.logos);
 if(report.result!=='published')throw new Error('Publication did not complete');
 const rows=await coverage(env);
 const {guideKey,coverageKey,...status}=report;
 await mkdir('docs',{recursive:true});
 await writeFile('docs/guide.xml.gz',await readFile(join(root,guideKey)));
 await writeFile('docs/status.json',JSON.stringify(status,null,2)+'\n');
 await writeFile('docs/coverage.json',JSON.stringify(rows,null,2)+'\n');
 console.log(JSON.stringify(status));
} finally {database.close();}
