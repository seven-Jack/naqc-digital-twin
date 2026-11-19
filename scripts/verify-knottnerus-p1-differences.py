"""Independently audit P1 classifier transitions from the published notebook and raw frames."""
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


BASE = 'Datapackage_SLM/data/241129_S23/'
NB = 'Datapackage_SLM/AnalyzeFastSLMMovesPaper.ipynb'
METHODS = ('log_bit', 'author6300', 'author6436', 'roi6436')
COUNTS = ('author_max_counts', 'roi_max_counts')


def require(ok, msg):
    if not ok:
        raise ValueError(msg)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_sites(path):
    with gzip.open(path, 'rt', newline='') as f:
        rows = {}
        for row in csv.DictReader(f):
            k = tuple(int(row[i]) for i in ('shot', 'frame', 'roi'))
            require(k not in rows, f'duplicate {k} in {path}')
            rows[k] = row
    require(len(rows) == 7200, f'wrong row count: {path}')
    return rows


def parameters(archive):
    raw = archive.read(NB)
    require(sha(raw) == '73386f212c3aca6328548d20e42cbdf1565d8fb51e6f64102e613725eedf258a', 'notebook hash')
    cells = json.loads(raw)['cells']
    functions = [n for n in ast.parse(''.join(cells[2]['source'])).body
                 if isinstance(n, ast.FunctionDef) and n.name in ('read_tga', 'get_filling_per_roi')]
    require(len(functions) == 2, 'author functions missing')
    scope = {'np': np}
    exec(compile(ast.Module(body=functions, type_ignores=[]), NB, 'exec'), scope)
    assignment = ast.parse(''.join(cells[4]['source'])).body[-1]
    require(assignment.targets[0].id == 'rois_sort_6x6', 'ROI source cell')
    coords = np.asarray(ast.literal_eval(assignment.value.args[0]), dtype=int)
    require(coords.shape == (36, 2), 'wrong author ROI shape')
    raw = archive.read(BASE + 'P1ROIs.dat')
    require(sha(raw) == '518404c63edf75983eded294e786ace5f83f9fc74246598215730fe9439a047e', 'rectangle file hash')
    rect = np.asarray([[int(i) for i in line.split()] for line in raw.decode('ascii').splitlines()[4:] if line.strip()], dtype=int)
    require(rect.shape == (36, 4) and (rect[:, 2:] - rect[:, :2] == 3).all(), 'unexpected rectangle size')
    # Assuming half-open rectangle bounds, the selected pixel center is the midpoint of the first and last included index.
    rect_centers = (rect[:, :2] + rect[:, 2:] - 1) // 2
    return scope['read_tga'], scope['get_filling_per_roi'], coords, rect_centers


def max_sums(image, sites):
    # Summed-area table of the cropped pixels; box is [r-1:r+2,c-1:c+2].
    integral = np.pad(image, ((1, 0), (1, 0))).cumsum(axis=0, dtype=np.int64).cumsum(axis=1)
    require((sites >= 2).all() and (sites < image.shape[0] - 2).all(), 'site too close to edge')
    candidates = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            x, y = sites[:, 0] + dx - 1, sites[:, 1] + dy - 1
            candidates.append(integral[y + 3, x + 3] - integral[y, x + 3] - integral[y + 3, x] + integral[y, x])
    return np.max(candidates, axis=0)


def transitions(first, second):
    return {'before': int(first.sum()), 'after': int(second.sum()), 'resolved': int((first & ~second).sum()),
            'introduced': int((second & ~first).sum()), 'persistent': int((first & second).sum())}


def verify(archive_path, prior_path, new_path):
    require(sha(prior_path.read_bytes()) == '7eeadba9b6679ae54807416baad5221d9fa11b0971a40a48e965eb3bb6bc8d4e', 'old site table hash')
    old, new = read_sites(prior_path), read_sites(new_path)
    bits = np.zeros((4, 100, 2, 36), dtype=bool)
    counts = np.zeros((2, 100, 2, 36), dtype=int)
    targets = [7, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21, 22, 25, 26, 27, 28]
    with ZipFile(archive_path) as z:
        read_tga, filling, coords, rect_centers = parameters(z)
        for shot in range(1, 101):
            root = BASE + f'P1_{shot}'
            row = z.read(root + '.dat').decode('ascii').strip().splitlines()[-1].split()
            require(row[2:5] == ['23', '1', str(shot)], f'log ID {shot}')
            for frame in (1, 2):
                data = z.read(root + f'_{frame}.tga')
                width, height = np.frombuffer(data, dtype='<u2', count=2, offset=12)
                require((int(width), int(height)) == (100, 180), 'image dimensions')
                with tempfile.TemporaryFile() as f:
                    f.write(data)
                    f.seek(0)
                    image = read_tga(f)
                require(image.shape == (100, 100), 'author crop')
                adapted = rect_centers - [0, int(height) - image.shape[0]]
                instrument = row[-3 + frame]
                require(len(instrument) == 36 and set(instrument) <= {'0', '1'}, f'log bit string {shot}/{frame}')
                slots = bits[:, shot - 1, frame - 1]
                slots[0] = [v == '1' for v in instrument]
                slots[1] = filling(image, coords, 6300, 3)
                slots[2] = filling(image, coords, 6436, 3)
                slots[3] = filling(image, adapted, 6436, 3)
                values = counts[:, shot - 1, frame - 1]
                values[0], values[1] = max_sums(image, coords), max_sums(image, adapted)
                for roi in range(36):
                    k = shot, frame, roi
                    prev, current = old[k], new[k]
                    measured = tuple(int(v) for v in slots[:, roi])
                    require(tuple(int(current[c]) for c in METHODS) == measured, f'new bit comparison at {k}')
                    require((int(prev['log_bit']), int(prev['pixel_bit'])) == measured[:2], f'prior bit comparison at {k}')
                    require(tuple(int(current[c]) for c in COUNTS) == tuple(values[:, roi]), f'max sums at {k}')
                    require(int(prev['max_counts']) == values[0, roi], f'changed author max at {k}')
                    require((int(current['roi_x']), int(current['roi_y'])) == tuple(adapted[roi]), f'center {k}')

    selected = bits[:, :, 0].sum(axis=-1) >= 16
    six = [s + 1 for s in range(100) if selected[1, s] and not selected[0, s]]
    require(six == [5, 9, 30, 83, 93, 96], 'original six changed')
    groups = {'all': list(range(100)), **{m: np.flatnonzero(s).tolist() for m, s in zip(METHODS, selected)},
              'original_six': [s - 1 for s in six]}
    divergences = bits[1:] != bits[0]
    require(int(divergences[0].sum()) == 39, 'original 39 not recovered')
    stats = {}
    for label, indices in groups.items():
        err = divergences[:, indices]
        g = {'shots': [i + 1 for i in indices]}
        for method, matrix in zip(METHODS, bits):
            subset = matrix[indices]
            final_targets = subset[:, 1, :][:, targets]
            g[method] = {'initial_occupied': [int(subset[:, 0].sum()), 36 * len(indices)],
                         'target_occupied': [int(final_targets.sum()), 16 * len(indices)],
                         'full_attempts': [int(final_targets.all(axis=1).sum()), len(indices)]}
        g['threshold'] = transitions(err[0], err[1])
        g['coordinates'] = transitions(err[1], err[2])
        g['both_changes'] = transitions(err[0], err[2])
        g['eight_paths'] = {f'{a}{b}{c}': int(((err[0] == a) & (err[1] == b) & (err[2] == c)).sum())
                            for a in (0, 1) for b in (0, 1) for c in (0, 1)}
        stats[label] = g
    focus = {}
    for shot in [6, *six, 16, 40]:
        i = shot - 1
        focus[shot] = {'initial_occupied': [int(a) for a in bits[:, i, 0].sum(axis=-1)],
                       'final_target_occupied': [int(a) for a in bits[:, i, 1][:, targets].sum(axis=-1)],
                       'roi14_final_log_a6300_a6436_r6436': bits[:, i, 1, 14].astype(int).tolist(),
                       'roi14_final_author_rect_maxima': counts[:, i, 1, 14].tolist()}
    equal = {}
    for label, plane, thresh in [('author6300', counts[0], 6300), ('author6436', counts[0], 6436), ('roi6436', counts[1], 6436)]:
        equal[label] = [[int(s + 1), int(f + 1), int(r)] for s, f, r in np.argwhere(plane == thresh)]
    return {'status': 'verified', 'source_frame_count': 200, 'site_decisions_per_method': 7200, 'maxima_checked_per_geometry': 7200,
            'new_table_sha256': sha(new_path.read_bytes()), 'numpy': np.__version__, 'cross_audit': stats,
            'equal_to_threshold_shot_frame_roi': equal, 'focus': focus}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('prior_sites', type=Path)
    parser.add_argument('new_sites', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.archive, args.prior_sites, args.new_sites), indent=2))
