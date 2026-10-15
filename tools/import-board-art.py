#!/usr/bin/env python3
"""Import only board/scene art from the pinned upstream full release; never install its code or settings."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASE = 'https://github.com/sganggs/Stronghold-Protocol/releases/tag/v0.2.6'
RELEASE_SHA256 = '8ad71ab1111438c483daddf3cba116d20058a5bb813d9a16eccef087a28e2866'


def digest_file(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    if digest_file(args.archive) != RELEASE_SHA256:
        raise ValueError('release archive SHA256 differs from the pinned v0.2.6 digest')
    out = ROOT / 'public/assets/scenes'
    with zipfile.ZipFile(args.archive) as archive:
        names = set(archive.namelist())
        manifests = [n for n in names if n == 'data/local-assets.json' or n.endswith('/data/local-assets.json')]
        if len(manifests) != 1:
            raise ValueError('expected exactly one local-art manifest in the full release')
        prefix = manifests[0][:-len('data/local-assets.json')]
        source = json.loads(archive.read(manifests[0]))
        groups = {}
        files = {}

        def copy(url):
            if not isinstance(url, str) or not url.startswith('/assets/local/'):
                raise ValueError('unexpected board-art URL: ' + str(url))
            rel = PurePosixPath(url[len('/assets/local/'):])
            if rel.is_absolute() or '..' in rel.parts or '\\' in str(rel):
                raise ValueError('unsafe board-art path')
            # Some Windows browser integrations return an empty 204 for .bin. Keep identical bytes under .mesh.
            if rel.name == 'scene.bin':
                rel = rel.with_name('scene.mesh')
            key = rel.as_posix()
            if key in files:
                return files[key]
            data = archive.read(prefix + 'public' + url)
            target = out.joinpath(*rel.parts)
            if out.resolve() not in target.resolve().parents:
                raise ValueError('board-art destination escapes its directory')
            sha = hashlib.sha256(data).hexdigest()
            if target.exists() and digest_file(target) != sha:
                raise ValueError('refusing to overwrite different existing art: ' + str(target))
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_bytes(data)
            entry = {'path': '/assets/scenes/' + key, 'bytes': len(data), 'sha256': sha}
            files[key] = entry
            return entry

        for group, entries in source['groups'].items():
            if not group.startswith(('scene/', 'map/', 'mesh/')):
                continue
            groups[group] = {name: copy(entry['path']) for name, entry in entries.items()}
        # loadBoardPack historically resolves this neighbour of the diffuse atlas; explicitly list it too.
        if prefix + 'public/assets/local/map/autochess/tiles.json' in names:
            groups.setdefault('map/autochess', {})['tiles'] = copy('/assets/local/map/autochess/tiles.json')
        scene_ids = sorted(g.split('/', 1)[1] for g in groups if g.startswith('scene/act'))
        if len(scene_ids) != 11:
            raise ValueError('full release must contain all eleven battlefield scenes')
        catalogue = {
            'version': 1,
            'source': {'release': RELEASE, 'archiveSha256': RELEASE_SHA256,
                       'upstreamCommit': '488db49f11daf862b67ce26fa4cf89aa6cba2466'},
            'notice': 'Official game art belongs to Hypergryph. Non-commercial fan use; see NOTICE.md.',
            'stages': scene_ids,
            'groups': groups,
        }
        (out / 'catalogue.json').write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'stages': len(scene_ids), 'groups': len(groups), 'files': len(files),
                          'bytes': sum(f['bytes'] for f in files.values())}))


if __name__ == '__main__':
    main()
