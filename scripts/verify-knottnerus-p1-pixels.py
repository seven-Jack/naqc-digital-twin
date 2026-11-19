"""Check a P1 site table against the hash-pinned, published NumPy functions (Taiyi)."""
import argparse
import ast
import csv
import gzip
import hashlib
import json
import tempfile
from pathlib import Path
from zipfile import ZipFile

import numpy as np


NOTEBOOK = 'Datapackage_SLM/AnalyzeFastSLMMovesPaper.ipynb'
SOURCE = 'Datapackage_SLM/data/241129_S23/'
NB_SHA = '73386f212c3aca6328548d20e42cbdf1565d8fb51e6f64102e613725eedf258a'


def need(condition, message):
    if not condition:
        raise ValueError(message)


def original_functions(archive):
    raw = archive.read(NOTEBOOK)
    need(hashlib.sha256(raw).hexdigest() == NB_SHA, 'Unexpected author notebook')
    cells = json.loads(raw)['cells']
    definitions = ast.parse(''.join(cells[2]['source'])).body
    names = {'read_tga', 'get_filling_per_roi'}
    defs = [fn for fn in definitions if isinstance(fn, ast.FunctionDef) and fn.name in names]
    need(len(defs) == 2, 'Missing author functions in cell 2')
    namespace = {'np': np}
    exec(compile(ast.Module(body=defs, type_ignores=[]), NOTEBOOK, 'exec'), namespace)
    array = ast.parse(''.join(cells[4]['source'])).body[-1]
    need(array.targets[0].id == 'rois_sort_6x6', 'Unexpected ROI declaration')
    coords = np.asarray(ast.literal_eval(array.value.args[0]))
    need(coords.shape == (36, 2), 'Unexpected ROI count')
    return namespace['read_tga'], namespace['get_filling_per_roi'], coords


def verify(archive_path, table_path):
    rows = {}
    with gzip.open(table_path, 'rt', newline='') as fp:
        for record in csv.DictReader(fp):
            key = tuple(int(record[t]) for t in ('shot', 'frame', 'roi'))
            need(key not in rows, f'Duplicate site row {key}')
            rows[key] = tuple(int(record[t]) for t in ('log_bit', 'pixel_bit', 'max_counts'))
    need(len(rows) == 7200, 'Wrong site row count')
    frames = {}
    at_threshold = []
    with ZipFile(archive_path) as archive:
        read_tga, decisions, centers = original_functions(archive)
        for shot in range(1, 101):
            prefix = f'{SOURCE}P1_{shot}'
            fields = archive.read(prefix + '.dat').decode('ascii').splitlines()[-1].split()
            need(fields[2:5] == ['23', '1', str(shot)], f'Log ID for shot {shot}')
            for frame in (1, 2):
                online = fields[-3 + frame]
                need(len(online) == 36 and set(online) <= {'0', '1'}, f'Invalid log bits for shot {shot}')
                with tempfile.TemporaryFile() as raw:
                    raw.write(archive.read(prefix + f'_{frame}.tga'))
                    raw.seek(0)
                    image = read_tga(raw)
                need(image.shape == (100, 100), 'Unexpected cropped image')
                offline = decisions(image, centers, 6300, 3)
                frames[(shot, frame)] = (online, ''.join(str(int(x)) for x in offline))
                for roi, bit in enumerate(offline):
                    key = (shot, frame, roi)
                    log_bit, pixel_bit, maximum = rows[key]
                    need(log_bit == int(online[roi]), f'Wrong instrument bit at {key}')
                    need(pixel_bit == int(bit), f'Wrong author bit at {key}')
                    if maximum == 6300:
                        at_threshold.append(key)
                    need(0 <= maximum <= 9 * 65535, f'Invalid count at {key}')
                    # Integer M is the exact maximum iff the original strict test passes M-1 and fails M.
                    site = centers[roi:roi + 1]
                    need(decisions(image, site, maximum - 1, 3)[0]
                         and not decisions(image, site, maximum, 3)[0], f'Wrong maximum at {key}')
    targets = [7, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21, 22, 25, 26, 27, 28]
    masks = {}
    for i, name in enumerate(('logged', 'author')):
        masks[name] = [shot for shot in range(1, 101) if frames[(shot, 1)][i].count('1') >= 16]
    selected = {**masks, 'all': list(range(1, 101)),
                'intersection': sorted(set(masks['logged']) & set(masks['author']))}
    cross_denominators = {}
    for name, shots in selected.items():
        stats = {}
        for i, rule in enumerate(('logged', 'author')):
            targets_full = [sum(frames[shot, 2][i][roi] == '1' for roi in targets) for shot in shots]
            stats[rule] = {'initial_occupied': sum(frames[shot, 1][i].count('1') for shot in shots),
                           'initial_site_observations': 36 * len(shots),
                           'final_target_occupied': sum(targets_full), 'final_target_observations': 16 * len(shots),
                           'fully_assembled': targets_full.count(16), 'attempts': len(shots)}
        cross_denominators[name] = stats
    special_ids = [6, 11, 14, 21, 44, 45, 47, 52, 54, 57, 72, 82, 85, 90]
    measured = [shot for shot in masks['logged'] if any(frames[shot, 2][0][roi] == '0' for roi in targets)]
    need(measured == special_ids, 'Online list of 14 target-defect shots changed')
    special = {}
    for shot in special_ids:
        special[shot] = {rule: [r for r in targets if frames[(shot, 2)][i][r] == '0']
                         for i, rule in enumerate(('logged_missing', 'author_missing'))}
    roi14 = {shot: {frame: dict(zip(('logged', 'author', 'maximum_counts'), rows[shot, frame, 14]))
                    for frame in (1, 2)} for shot in (16, 40)}
    return {'status': 'verified', 'initial_ge16_masks': masks, 'by_selection': cross_denominators,
            'sites_exactly_6300': at_threshold, 'online_qualified_defect_shots': special,
            'roi14_at_special_shots': roi14, 'author_notebook_sha256': NB_SHA, 'numpy_version': np.__version__,
            'site_table_sha256': hashlib.sha256(table_path.read_bytes()).hexdigest(),
            'raw_frames': 200, 'site_frames': len(rows), 'author_bit_matches': len(rows),
            'log_bit_matches': len(rows), 'author_count_matches': len(rows),
            'count_check': 'Original > test passes reported maximum minus one and fails at reported maximum.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('sites_csv_gz', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.archive, args.sites_csv_gz), indent=2))
