import test from 'node:test';import assert from 'node:assert/strict';import{gzipSync,gunzipSync}from'node:zlib';import{filterSource,timestamp,refresh,publish}from'../lib/epg.mjs';
import {catalogLogos,validLogo} from '../lib/logos.mjs';
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
