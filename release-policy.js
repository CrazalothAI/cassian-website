// Only public metadata from this fixed repository can enable downloads.
export const REPOSITORY='https://github.com/CrazalothAI/cassian-website';
export const PUBLIC_BETA_TAG='v8.0.0';
export const PUBLIC_BETA_SHA256='93ff96b71c11eab5e54824f99e8789438fafe2d53120f34497b500fc62606b5f';
export const PUBLIC_BETA_BYTES=428772293;
export const RELEASE_API=`https://api.github.com/repos/CrazalothAI/cassian-website/releases/tags/${PUBLIC_BETA_TAG}`;
export const MAX_METADATA_BYTES=128*1024;
export function validateRelease(data){
  const approvedBeta=data?.tag_name===PUBLIC_BETA_TAG&&data?.prerelease===true;
  if(!data||data.draft!==false||(data.prerelease!==false&&!approvedBeta)||data.tag_name===PUBLIC_BETA_TAG&&!approvedBeta||!Number.isSafeInteger(data.id)||data.id<1||typeof data.tag_name!=='string'||!/^v\d+\.\d+\.\d+$/.test(data.tag_name)||data.html_url!==`${REPOSITORY}/releases/tag/${data.tag_name}`||!Array.isArray(data.assets)||data.assets.length<7||data.assets.length>16)throw new Error('Release identity is invalid.');
  const setups=data.assets.filter(a=>a.name?.toLowerCase().endsWith('.exe'));
  const sources=data.assets.filter(a=>/^Cassian-\d+\.\d+\.\d+-Source\.zip$/.test(a.name));
  const portables=data.assets.filter(a=>/^Cassian-\d+\.\d+\.\d+-Windows\.zip$/.test(a.name));
  if(setups.length!==1||setups[0].name!=='Cassian-Setup.exe'||sources.length!==1||portables.length!==1)throw new Error('Download set is incomplete or ambiguous.');
  const version=portables[0].name.match(/^Cassian-(\d+\.\d+\.\d+)-Windows/)[1];
  if(sources[0].name!==`Cassian-${version}-Source.zip`||data.tag_name!==`v${version}`)throw new Error('Release versions disagree.');
  const result={version,channel:approvedBeta?'Public beta · unsigned':'Release',prerelease:approvedBeta,releaseUrl:data.html_url};
  const expected={installer:'Cassian-Setup.exe',portable:`Cassian-${version}-Windows.zip`,source:`Cassian-${version}-Source.zip`,checksums:'SHA256SUMS.txt',md5:'MD5SUMS.txt',readiness:'RELEASE-READINESS.json',build:'Cassian-Build.json'};
  const ids=new Set();
  for(const [key,name]of Object.entries(expected)){
    const rows=data.assets.filter(a=>a.name===name);if(rows.length!==1)throw new Error('Required release file missing or duplicated.');
    const a=rows[0];
    if(a.state!=='uploaded'||!Number.isSafeInteger(a.id)||a.id<1||ids.has(a.id)||!Number.isSafeInteger(a.size)||a.size<1||a.size>512*1024*1024||typeof a.digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(a.digest)||a.browser_download_url!==`${REPOSITORY}/releases/download/${data.tag_name}/${name}`)throw new Error('Download metadata is invalid.');
    ids.add(a.id);result[key]={name,url:a.browser_download_url,size:a.size,sha256:a.digest.slice(7)};
  }
  if(approvedBeta&&(data.assets.length!==7||result.installer.sha256!==PUBLIC_BETA_SHA256||result.installer.size!==PUBLIC_BETA_BYTES))throw new Error('Published beta differs from the approved installer.');
  return result;
}
export function validateSelectedRelease(data){
  if(data?.tag_name!==PUBLIC_BETA_TAG||data?.prerelease!==true)throw new Error('Selected public beta identity differs.');
  return validateRelease(data);
}
export async function readBoundedJson(response){
  if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('Release service unavailable.');
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_METADATA_BYTES))throw new Error('Release response too large.');
  if(!response.body)throw new Error('Release response missing.');
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_METADATA_BYTES){await reader.cancel();throw new Error('Release response too large.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function suggestionURL(kind,title,body){
  if(!['Feature suggestion','Bug report','Playing feedback'].includes(kind)||typeof title!=='string'||typeof body!=='string'||!title.trim()||!body.trim()||title.length>100||body.length>1800)throw new Error('Please complete a short title and description.');
  const url=new URL(`${REPOSITORY}/issues/new`);url.searchParams.set('title',`[${kind}] ${title.trim()}`);url.searchParams.set('body',`${kind}\n\n${body.trim()}\n\nPrepared on the Cassian website. Please remove private information before submitting.`);if(url.href.length>8000)throw new Error('Please shorten this draft before opening GitHub.');return url.href;
}
