#!/usr/bin/env python3
"""Export the surface maps referenced by the distributed scenes from verified official theme bundles.

Maintainer tool only: needs UnityPy/Pillow, an official hot-update index, and its theme bundles.
Run build-board-art.mjs afterwards. Existing base catalogue and scene meshes are never rewritten.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/local-extract'))
import scenes

SLOTS = {'_BumpMap': '_NORMALMAP', '_MetallicGlossMap': '_METALLICGLOSSMAP', '_EmissionMap': '_EMISSION'}


def material_texture_names(material):
    if re.search(r'Unlit|Particles|Water', material.get('shader', ''), re.I):
        return {}
    return {env['texture']: slot for slot, keyword in SLOTS.items()
            if keyword in material.get('keywords', [])
            and (env := material.get('textures', {}).get(slot)) and env.get('texture')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ab-root', type=Path, required=True)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--version', default='26-04-13-12-31-42_e9b560')
    args = parser.parse_args()
    import aklz4  # noqa: F401: official LZ4AK decoder registration
    import UnityPy

    raw_index = args.index.read_bytes()
    infos = {row['name']: row for row in json.loads(raw_index)['abInfos']}
    art_root = ROOT / 'public/assets/scenes'
    catalogue = json.loads((art_root / 'catalogue.json').read_text(encoding='utf-8'))
    wanted = {}
    for sid in catalogue['stages']:
        doc = json.loads((art_root / 'scene' / sid / 'scene.json').read_text())
        for mat in doc['materials'].values():
            wanted.update(material_texture_names(mat))
    bundles = sorted({dep for _, deps in scenes.SCENES for dep in deps if dep.endswith('/res.ab')})
    entries, sources = {}, []
    out = art_root / 'material'
    for name in bundles:
        if name not in infos:
            raise ValueError('official index lacks theme: ' + name)
        blob = (args.ab_root / name).read_bytes()
        if hashlib.md5(blob).hexdigest() != infos[name]['md5']:
            raise ValueError('official MD5 mismatch: ' + name)
        source = {'bundle': name, 'md5': infos[name]['md5'], 'sha256': hashlib.sha256(blob).hexdigest()}
        sources.append(source)
        for obj in UnityPy.load(blob).objects:
            if obj.type.name != 'Texture2D':
                continue
            tex = obj.read()
            if tex.m_Name not in wanted or tex.m_Name in entries:
                continue
            stem, slot = tex.m_Name, wanted[tex.m_Name]
            if not re.fullmatch(r'[A-Za-z0-9_.\[\]-]+', stem):
                raise ValueError('unsafe texture name')
            fmt = int(tex.m_TextureFormat)
            # Verified in the fixed Android source: ETC2_RGB and ASTC_6x6 store XYZ normals as RGB.
            # A different normal encoding needs an explicit decoder, never a guessed swizzle.
            if slot == '_BumpMap' and fmt not in (34, 50):
                raise ValueError('unverified scene normal encoding: ' + stem)
            image = tex.image.convert('RGB' if slot == '_BumpMap' else 'RGBA')
            stream = io.BytesIO()
            image.save(stream, 'PNG', compress_level=9)
            data = stream.getvalue()
            target = out / (stem + '.png')
            if out.resolve() not in target.resolve().parents:
                raise ValueError('texture target escapes material directory')
            if target.exists() and target.read_bytes() != data:
                raise ValueError('refusing to overwrite different existing material art: ' + stem)
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_bytes(data)
            entries[stem] = {'path': '/assets/scenes/material/' + target.name, 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest(), 'slot': slot, 'textureFormat': fmt,
                'colorSpace': 'srgb' if slot == '_EmissionMap' else 'linear',
                'sourceBundle': name, **({'normalEncoding': 'rgb'} if slot == '_BumpMap' else {})}
    if set(wanted) != set(entries):
        raise ValueError('missing material textures: ' + ', '.join(sorted(set(wanted) - set(entries))))
    result = {'version': 1, 'source': {
        'index': f'https://ak.hycdn.cn/assetbundle/official/Android/assets/{args.version}/hot_update_list.json',
        'indexSha256': hashlib.sha256(raw_index).hexdigest(), 'bundles': sources},
        'notice': catalogue['notice'], 'groups': {'scene/material': dict(sorted(entries.items()))}}
    (art_root / 'materials.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'files': len(entries), 'bytes': sum(e['bytes'] for e in entries.values())}))


if __name__ == '__main__':
    main()
