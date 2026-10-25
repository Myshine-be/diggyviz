// Optional live transport diagnostic. No user metadata, credentials or dependency on the answer.
// A failed service does not break offline rendering tests; the result must be reviewed before release.
import {mkdir,writeFile} from 'node:fs/promises';
import {bpmFromTrack} from '../js/tempo-lookup.js';
const url='https://api.deezer.com/track/isrc:USUM71703861?output=jsonp&callback=__tempo';
const result={at:new Date().toISOString(),url,location:'CI server (not Safari or user network)'};
try {
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
  const body=await response.text();
  result.status=response.status;result.contentType=response.headers.get('content-type');
  const match=body.trim().match(/^__tempo\s*\(([\s\S]*)\)\s*;?$/);
  result.jsonp=!!match;
  if(match){const data=JSON.parse(match[1]);result.apiError=data.error??null;result.bpm=bpmFromTrack(data);}
  else result.note='No valid JSONP callback received';
} catch(e){result.error=e.message;}
await mkdir('test-results',{recursive:true});
await writeFile('test-results/deezer-probe.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
