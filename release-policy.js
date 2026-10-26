// Only public metadata from this fixed repository can enable downloads.
export const REPOSITORY='https://github.com/Min10Studios/cassian-website';
export const RELEASE_API='https://api.github.com/repos/Min10Studios/cassian-website/releases/latest';
export const MAX_METADATA_BYTES=128*1024;
export function validateRelease(data){
  if(!data||data.draft!==false||data.prerelease!==false||!Number.isSafeInteger(data.id)||data.id<1||typeof data.tag_name!=='string'||!/^v\d+\.\d+\.\d+$/.test(data.tag_name)||data.html_url!==`${REPOSITORY}/releases/tag/${data.tag_name}`||!Array.isArray(data.assets)||data.assets.length<7||data.assets.length>16)throw new Error('Release identity is invalid.');
  const setups=data.assets.filter(a=>a.name?.toLowerCase().endsWith('.exe'));
  const sources=data.assets.filter(a=>/^Cassian-\d+\.\d+\.\d+-Source\.zip$/.test(a.name));
  const portables=data.assets.filter(a=>/^Cassian-\d+\.\d+\.\d+-Windows\.zip$/.test(a.name));
  if(setups.length!==1||setups[0].name!=='Cassian-Setup.exe'||sources.length!==1||portables.length!==1)throw new Error('Download set is incomplete or ambiguous.');
  const version=portables[0].name.match(/^Cassian-(\d+\.\d+\.\d+)-Windows/)[1];
  if(sources[0].name!==`Cassian-${version}-Source.zip`||data.tag_name!==`v${version}`)throw new Error('Release versions disagree.');
  const result={version,channel:'Release',releaseUrl:data.html_url};
  const expected={installer:'Cassian-Setup.exe',portable:`Cassian-${version}-Windows.zip`,source:`Cassian-${version}-Source.zip`,checksums:'SHA256SUMS.txt',md5:'MD5SUMS.txt',readiness:'RELEASE-READINESS.json',build:'Cassian-Build.json'};
  const ids=new Set();
  for(const [key,name]of Object.entries(expected)){
    const rows=data.assets.filter(a=>a.name===name);if(rows.length!==1)throw new Error('Required release file missing or duplicated.');
    const a=rows[0];
    if(a.state!=='uploaded'||!Number.isSafeInteger(a.id)||a.id<1||ids.has(a.id)||!Number.isSafeInteger(a.size)||a.size<1||a.size>512*1024*1024||typeof a.digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(a.digest)||a.browser_download_url!==`${REPOSITORY}/releases/download/${data.tag_name}/${name}`)throw new Error('Download metadata is invalid.');
    ids.add(a.id);result[key]={name,url:a.browser_download_url,size:a.size,sha256:a.digest.slice(7)};
  }
  return result;
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

// The 8.0 CTA must never download a different version under a beta label.
export const PUBLIC_BETA_API = `${REPOSITORY.replace('https://github.com/', 'https://api.github.com/repos/')}/releases/tags/v8.0.0`;
export function validatePublicBeta(data) {
  if (!data || data.tag_name !== 'v8.0.0' || typeof data.prerelease !== 'boolean') {
    throw new Error('The public beta must be the exact 8.0.0 release.');
  }
  // Only this pinned public-beta path admits a prerelease; all asset checks remain.
  const release = validateRelease(data.prerelease ? {...data, prerelease: false} : data);
  return {...release, channel: 'Public beta'};
}

// Exact owner-approved build; the original v8.0.0 release remains immutable.
export const PUBLIC_BETA_TAG = "v8.0.0-build.87f30fe3";
export const PUBLIC_BETA_SHA256 = "7c62ea6702421f797377a5a536f31262d9bd97b84b832ffc85df8285a115546a";
export const PUBLIC_BETA_BYTES = 429138857;
export const PUBLIC_BUILD_COMMIT = "87f30fe356ebf1dd3ba19ae132125ca91739bf0b";
export const SELECTED_RELEASE_API =
  `https://api.github.com/repos/Min10Studios/cassian-website/releases/tags/${PUBLIC_BETA_TAG}`;
export const VERIFIED_BUILD_PAYLOADS = Object.freeze(Object.fromEntries(
  Object.entries({
  "Cassian-8.0.0-Source.zip": {
    "size": 362684525,
    "sha256": "7afe249cdfece1c8b9261ba419e2baa4a7336e31518abfc1938dc6b3d9af6539"
  },
  "Cassian-8.0.0-Windows.zip": {
    "size": 297762226,
    "sha256": "c7e7402b1196366052225b7ccbbb96a84831baab19fdf665298e470308a0869e"
  },
  "Cassian-Build.json": {
    "size": 9224,
    "sha256": "1d3d02a0504e17951dc9d95261cf3db33188d9fd8be395d639de5e3d6af31293"
  },
  "Cassian-Setup.exe": {
    "size": 429138857,
    "sha256": "7c62ea6702421f797377a5a536f31262d9bd97b84b832ffc85df8285a115546a"
  },
  "MD5SUMS.txt": {
    "size": 171,
    "sha256": "ac401f0548a01f35283afd402fd354bf5e3d7e3019b4ef2e839cee171b451cff"
  },
  "RELEASE-READINESS.json": {
    "size": 4076,
    "sha256": "bb3eba1ec6e42fac8b91a1f07b8c98c49bdad27faf2477e68939c12808bc372e"
  },
  "SHA256SUMS.txt": {
    "size": 267,
    "sha256": "a36193be0e9e0267ed126851caa802f8c7ca4794eb91b0b8f3ca4c1a94529816"
  }
}).map(([name, value]) => [name, Object.freeze(value)])
));

export function validateSelectedRelease(data) {
  if (!data || data.tag_name !== PUBLIC_BETA_TAG || data.prerelease !== true ||
      data.draft !== false || data.html_url !== `${REPOSITORY}/releases/tag/${PUBLIC_BETA_TAG}` ||
      !Array.isArray(data.assets) || data.assets.length !== 7) {
    throw new Error('The exact approved unsigned build is required.');
  }
  // Check real destinations before adapting the identity for the shared validator.
  // Never turn an invalid URL or unknown payload into a valid download.
  for (const asset of data.assets) {
    if (!asset || !Object.hasOwn(VERIFIED_BUILD_PAYLOADS, asset.name)) {
      throw new Error('Unknown approved-build asset.');
    }
    const expected = VERIFIED_BUILD_PAYLOADS[asset.name];
    if (asset.browser_download_url !== `${REPOSITORY}/releases/download/${PUBLIC_BETA_TAG}/${asset.name}` ||
        asset.size !== expected.size || asset.digest !== `sha256:${expected.sha256}`) {
      throw new Error('Approved-build bytes or destination do not match.');
    }
  }
  const baseTag = 'v8.0.0';
  const checked = validateRelease({
    ...data, prerelease: false, tag_name: baseTag,
    html_url: `${REPOSITORY}/releases/tag/${baseTag}`,
    assets: data.assets.map(asset => ({
      ...asset, browser_download_url: `${REPOSITORY}/releases/download/${baseTag}/${asset.name}`
    }))
  });
  const result = {...checked, channel: 'Public beta · unsigned', prerelease: true,
    tag: PUBLIC_BETA_TAG, buildCommit: PUBLIC_BUILD_COMMIT, releaseUrl: data.html_url};
  for (const key of ['installer', 'portable', 'source', 'checksums', 'md5', 'readiness', 'build']) {
    result[key] = {...checked[key],
      url: `${REPOSITORY}/releases/download/${PUBLIC_BETA_TAG}/${checked[key].name}`};
  }
  return result;
}
