"""Temporary owner-approved v8 draft transfer. This program cannot publish.

Original project provenance: Crazaloth. Remove after the single beta transfer.
Account credentials are never supplied: the job uses its temporary repo token.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = 'CrazalothAI/cassian-website'
TAG = 'v8.0.0'
MAX_JSON = 262144
PINS = {'Cassian-8.0.0-Source.zip': {'size': 362398321, 'sha256': '90878ff8c7ac21a4c8325fcf9ce616bc4d04d4f509909741dc719a328c09227b'}, 'Cassian-8.0.0-Windows.zip': {'size': 297371217, 'sha256': '3f2917158ce6b1271f73e8c55ff9480f39790d8a7e16506a2fa07e512f5424ab'}, 'Cassian-Build.json': {'size': 9604, 'sha256': 'e5825e5a72a887a6e8098065af1ff894d90ce6dfbcc9ee75573f2b69ea9adff7'}, 'Cassian-Setup.exe': {'size': 428772293, 'sha256': '93ff96b71c11eab5e54824f99e8789438fafe2d53120f34497b500fc62606b5f'}, 'MD5SUMS.txt': {'size': 171, 'sha256': 'a1a6e865bb7c0d649232f8596749229a2fda0856cd81c6530acf2dfa702e8874'}, 'RELEASE-READINESS.json': {'size': 3270, 'sha256': '89858e3eb913ac188a73deaf6046e16ca530326876bfb62cc68b7cc80b72ef18'}, 'SHA256SUMS.txt': {'size': 267, 'sha256': '4213aec06535135ff09dc1820ec6e4e05865544dd236056aaa6be035918543d8'}}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_manifest(manifest):
    if (not isinstance(manifest, dict) or set(manifest) != {'releaseId', 'files'}
            or type(manifest['releaseId']) is not int or manifest['releaseId'] < 1
            or not isinstance(manifest['files'], dict) or len(PINS) != 7
            or set(manifest['files']) != set(PINS)):
        raise ValueError('Expected the exact approved seven-file manifest.')
    for name, pin in PINS.items():
        row = manifest['files'][name]
        if (not isinstance(row, dict) or set(row) != {'size', 'sha256', 'url'}
                or row['size'] != pin['size'] or row['sha256'] != pin['sha256']
                or not isinstance(row['url'], str) or len(row['url']) > 8192):
            raise ValueError('File differs from the independently verified package.')
        url = urllib.parse.urlsplit(row['url'])
        if (url.scheme != 'https' or url.hostname not in
                ('release-assets.githubusercontent.com', 'objects.githubusercontent.com')
                or url.username or url.password or url.port not in (None, 443)
                or url.fragment or any(c in row['url'] for c in '\r\n')):
            raise ValueError('Download must use a signed GitHub asset URL.')
    return manifest


def verify_assets(rows):
    if not isinstance(rows, list):
        raise ValueError('Unexpected draft asset metadata.')
    assets = {row.get('name'): row for row in rows}
    if len(assets) != len(rows) or not set(assets) <= set(PINS):
        raise ValueError('Unexpected draft assets; nothing is replaced or removed.')
    for name, row in assets.items():
        if (row.get('state') != 'uploaded' or row.get('size') != PINS[name]['size']
                or row.get('digest') != 'sha256:' + PINS[name]['sha256']):
            raise ValueError('Draft asset differs; no overwrite.')
    return assets


def main():
    if os.environ.get('GITHUB_REPOSITORY') != REPOSITORY:
        raise ValueError('This one-use transfer is limited to the public mirror.')
    raw = os.environ.get('TRANSFER_MANIFEST', '')
    if not 0 < len(raw) <= 65535:
        raise ValueError('Missing or oversized transfer manifest.')
    manifest = validate_manifest(json.loads(raw))
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        raise ValueError('Missing temporary job token.')
    opener = urllib.request.build_opener(NoRedirect())
    headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
               'User-Agent': 'Cassian-one-use-draft-transfer'}
    api_base = 'https://api.github.com/repos/' + REPOSITORY
    release_path = '/releases/' + str(manifest['releaseId'])

    def metadata(request):
        with opener.open(request, timeout=120) as response:
            data = response.read(MAX_JSON + 1)
        if len(data) > MAX_JSON:
            raise ValueError('Oversized API response.')
        return json.loads(data)

    def draft():
        row = metadata(urllib.request.Request(api_base + release_path, headers=headers))
        if (row.get('draft') is not True or row.get('prerelease') is not True
                or row.get('tag_name') != TAG or row.get('id') != manifest['releaseId']):
            raise ValueError('Only the unpublished v8.0.0 beta draft may receive files.')
        return verify_assets(row.get('assets'))

    assets = draft()
    with tempfile.TemporaryDirectory(prefix='cassian-verified-beta-') as temp:
        for name, pin in PINS.items():
            if name in assets:
                continue
            path = Path(temp) / name
            digest = hashlib.sha256()
            size = 0
            # Asset requests never carry an authorization header and never redirect.
            request = urllib.request.Request(manifest['files'][name]['url'],
                headers={'User-Agent': 'Cassian-one-use-draft-transfer'})
            with opener.open(request, timeout=120) as response, path.open('xb') as output:
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > pin['size']:
                        raise ValueError('Asset exceeded its pinned size.')
                    output.write(chunk)
                    digest.update(chunk)
            if size != pin['size'] or digest.hexdigest() != pin['sha256']:
                raise ValueError('Downloaded asset hash or size differs.')
            current = draft()
            if name not in current:
                url = 'https://uploads.github.com/repos/' + REPOSITORY + release_path
                url += '/assets?name=' + urllib.parse.quote(name, safe='')
                with path.open('rb') as stream:
                    row = metadata(urllib.request.Request(url, data=stream, method='POST',
                        headers={**headers, 'Content-Type': 'application/octet-stream',
                                 'Content-Length': str(pin['size'])}))
                verify_assets([row])
            path.unlink()
            print(json.dumps({'status': 'draft-file-verified', 'name': name}), flush=True)
    if set(draft()) != set(PINS):
        raise ValueError('Incomplete draft; it remains unpublished.')
    print(json.dumps({'status': 'complete-draft-only', 'assets': 7,
                      'tag': TAG, 'published': False}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # HTTP exceptions can contain signed URLs. Never emit them or credentials.
        print(json.dumps({'status': 'failed-draft-retained', 'type': type(error).__name__}))
        sys.exit(1)
