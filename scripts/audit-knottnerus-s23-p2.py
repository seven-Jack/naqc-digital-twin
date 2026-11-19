"""Replay S23/P2 with the fixed 3×3 P1 rectangles and the strict P1 candidate threshold."""
import argparse
import ast
import csv
import gzip
import hashlib
import io
import json
import re
import struct
from pathlib import Path
from zipfile import ZipFile

BASE = 'Datapackage_SLM/data/241129_S23/'
NOTEBOOK = 'Datapackage_SLM/AnalyzeFastSLMMovesPaper.ipynb'
P1_ROI_SHA = '518404c63edf75983eded294e786ace5f83f9fc74246598215730fe9439a047e'
PACKAGE_SHA = '16ba89851ae045172fb1e8139623128d0780ef348b2437f2c1e0fd8541b84802'
THRESHOLD = 6436
MIN_ATOMS = 16
SHOTS = tuple(range(1, 101))
TGA_HEADER = bytes.fromhex('0000030000000000000000006400b4001000')
TARGETS = (7, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21, 22, 25, 26, 27, 28)
ROW_SUM = struct.Struct('<3H')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def rectangle_table(raw):
    rows = raw.decode('ascii').splitlines()
    require(rows[3].split() == ['NrROIS', '36'], 'Expected 36 ROIs')
    boxes = [tuple(map(int,row.split())) for row in rows[4:] if row.strip()]
    require(len(boxes) == 36, 'Incomplete ROI table')
    for x0, y0, x1, y1 in boxes:
        require(0 <= x0 < x1 <= 100 and 80 <= y0 < y1 <= 180 and x1-x0 == y1-y0 == 3, 'Invalid raw box')
    return boxes


def inspect_sources(archive, manifest):
    members = manifest['member_sha256']
    require(manifest['archive_sha256'] == PACKAGE_SHA, 'Unexpected original archive')
    require(len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate ZIP paths')
    for name, expected in members.items():
        require(digest(archive.read(name)) == expected, 'Hash mismatch: ' + name)
    source_shots = {n for n in archive.namelist() if re.fullmatch(re.escape(BASE)+r'P2_\d+(\.dat|_\d+\.tga)',n)}
    expect = {BASE+f'P2_{shot}{suffix}' for shot in SHOTS for suffix in ('.dat','_1.tga','_2.tga')}
    require(source_shots == expect and expect <= members.keys(), 'Unexpected P2 frame/log roster')

    roi1, roi2 = (archive.read(BASE+f'P{k}ROIs.dat') for k in (1,2))
    require(digest(roi1) == P1_ROI_SHA, 'P1 geometry freeze mismatch')
    boxes = rectangle_table(roi1)
    p2_boxes = rectangle_table(roi2)
    params = archive.read(BASE+'params.dat').decode().splitlines()
    require(f'threshold;{THRESHOLD};int' in params, 'Frozen series setting changed')
    cells = json.loads(archive.read(NOTEBOOK))['cells']
    target_line = next(line for line in cells[9]['source'] if line.startswith('targets = '))
    require(tuple(ast.literal_eval(target_line.split('=',1)[1])) == TARGETS, 'Target freeze mismatch')

    controls = [archive.read(BASE+f'P{i}.txt').decode().splitlines() for i in (1,2)]
    require(len(controls[0]) == len(controls[1]), 'Control text structure changed')
    changes = []
    for n, (old,new) in enumerate(zip(*controls,strict=True),1):
        if old != new:
            changes.append(dict(line=n,p1=old,p2=new))
    pairs = {}
    for suffix in ('.dat','.txt','ROIs.dat','_outputlist.dat','_timinglist.dat'):
        a,b = (members[BASE+f'P{i}'+suffix] for i in (1,2))
        pairs[suffix] = dict(p1_sha256=a,p2_sha256=b,identical=(a==b))
    for i in (1,2):
        frame = archive.read(BASE+f'P1_1_{i}.tga')
        require(frame[:18] == TGA_HEADER and len(frame) == 36018, 'P1 reference frame format changed')
    for shot in SHOTS:
        for frame in (1,2):
            raw = archive.read(BASE+f'P2_{shot}_{frame}.tga')
            require(raw[:18] == TGA_HEADER and len(raw) == 36018, 'P2 reference frame format changed')
    condition = dict(file_comparison=pairs,control_text_lines=len(controls[0]),control_text_changes=changes,
        unequal_roi_indices=[i for i,(a,b) in enumerate(zip(boxes,p2_boxes)) if a!=b],
        p1_raw_boxes=boxes,p2_raw_boxes=p2_boxes,raw_frame_width=100,raw_frame_height=180,
        tga_header_hex=TGA_HEADER.hex(),p1_format_reference_frames=2,p2_format_checked_frames=200,
        target_roi_indices=TARGETS,target_source=NOTEBOOK+'#cell9 targets',member_count_verified=len(members))
    return boxes, condition


def read_log(raw, expected_header, shot):
    dat = [line.split() for line in raw.decode('ascii').splitlines() if line.strip()]
    if dat[0] == expected_header:
        dat = dat[1:]
    require(len(dat) == 1 and len(dat[0]) == len(expected_header), 'Invalid shot record')
    record = dict(zip(expected_header, dat[0],strict=True))
    require(tuple(int(record[k]) for k in ('Series','DataSetNr','RunNr')) == (23,2,shot),'Shot identity mismatch')
    for key in ('Pic1','Pic2'):
        require(re.fullmatch('[01]{36}', record[key]),'Bad occupancy string')
    return record


def replay(archive, boxes):
    header = archive.read(BASE+'P2_1.dat').decode().splitlines()[0].split()
    rounds, sites = [], []
    for shot in SHOTS:
        stem = BASE+f'P2_{shot}'
        record = read_log(archive.read(stem+'.dat'),header,shot)
        row = dict(shot=shot,attempt_id=f'P2_{shot}',recorded_time=record['Date']+' '+record['Time'],
                   source_log=stem+'.dat',logged_scan_field=record['RbRepumpDPAOMB2Intensity1'])
        for frame in (1,2):
            path = stem + f'_{frame}.tga'
            raw = archive.read(path)
            logged = record[f'Pic{frame}']
            fixed_bits, diff_rois = [], []
            for roi,(x0,y0,x1,y1) in enumerate(boxes):
                counts = sum(sum(ROW_SUM.unpack_from(raw,18+2*(100*y+x0))) for y in range(y0,y1))
                fixed = int(counts > THRESHOLD)
                log = int(logged[roi])
                fixed_bits.append(str(fixed))
                if log != fixed:
                    diff_rois.append(str(roi))
                sites.append(dict(shot=shot,frame=frame,roi=roi,target=int(roi in TARGETS),raw_x0=x0,
                                  raw_y0=y0,raw_x1_exclusive=x1,raw_y1_exclusive=y1,counts=counts,
                                  log_bit=log,fixed_bit=fixed,frame_member=path,log_member=stem+'.dat'))
            fixed = ''.join(fixed_bits)
            row[f'pic{frame}_disagreement_rois'] = ' '.join(diff_rois)
            for rule,bits in [('log',logged),('fixed',fixed)]:
                row[f'{rule}_pic{frame}'] = bits
                row[f'{rule}_pic{frame}_n'] = bits.count('1')
                if frame == 1:
                    row[rule+'_selected'] = int(bits.count('1') >= MIN_ATOMS)
                else:
                    row[rule+'_target_n'] = sum(int(bits[i]) for i in TARGETS)
                    row[rule+'_missing_targets'] = ' '.join(str(i) for i in TARGETS if bits[i]=='0')
        rounds.append(row)
    return rounds, sites


def fraction(count, denominator):
    return dict(n=count,d=denominator)


def compare(rows):
    high = sum(r['log_bit']==0 and r['fixed_bit']==1 for r in rows)
    low = sum(r['log_bit']==1 and r['fixed_bit']==0 for r in rows)
    return dict(disagreements=high+low,denominator=len(rows),log0_fixed1=high,log1_fixed0=low)


def summarize(ids, rounds, sites):
    trials = [r for r in rounds if r['shot'] in ids]
    rows = [r for r in sites if r['shot'] in ids]
    n = len(trials)
    counts = {}
    for rule in ('log','fixed'):
        counts[rule] = dict(
            initial_occupied=fraction(sum(r[rule+'_pic1_n'] for r in trials),36*n),
            final_occupied=fraction(sum(r[rule+'_pic2_n'] for r in trials),36*n),
            final_target_occupied=fraction(sum(r[rule+'_target_n'] for r in trials),16*n),
            full_target_rounds=fraction(sum(r[rule+'_target_n']==16 for r in trials),n))
    return dict(shots=sorted(ids),rounds=n,counts=counts,
                comparisons=dict(all=compare(rows),pic1=compare([r for r in rows if r['frame']==1]),
                    pic2=compare([r for r in rows if r['frame']==2]),
                    pic2_targets=compare([r for r in rows if r['frame']==2 and r['target']])))


def write_csv(stream, fields, data):
    writer=csv.DictWriter(stream,fieldnames=fields,lineterminator='\n')
    writer.writeheader()
    writer.writerows(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive',type=Path)
    parser.add_argument('source_manifest',type=Path)
    parser.add_argument('out',type=Path)
    args=parser.parse_args()
    require(not args.out.exists(), 'Output path already exists')
    manifest=json.loads(args.source_manifest.read_text())
    with ZipFile(args.archive) as z:
        boxes, check=inspect_sources(z,manifest)
        rounds, sites=replay(z,boxes)
    all_ids=set(SHOTS)
    online={r['shot'] for r in rounds if r['log_selected']}
    fixed={r['shot'] for r in rounds if r['fixed_selected']}
    groups=dict(all=all_ids,log_ge16=online,fixed_ge16=fixed,log_lt16=all_ids-online,fixed_lt16=all_ids-fixed,
                both=online&fixed,log_only=online-fixed,fixed_only=fixed-online,neither=all_ids-online-fixed)
    ordered_keys=('shot','frame','roi','counts','log_bit','fixed_bit')
    canonical=''.join(','.join(str(r[k]) for k in ordered_keys)+'\n' for r in sites)
    diffs=[r for r in sites if r['log_bit']!=r['fixed_bit']]
    summary=dict(evidence='Same-series held-out scan point; cross-apparatus 88Sr Knottnerus S23/P2, Senoo CAL/VAL deferred.',
        rule='P1ROIs.dat rectangles, zero-based raw 3x3, half-open native endpoints; no correction, strict sum > 6436. Unrefitted candidate.',
        threshold=THRESHOLD,minimum_first_frame_atoms=MIN_ATOMS,original_sha256=manifest['archive_sha256'],
        source_manifest_sha256=digest(args.source_manifest.read_bytes()),conditions=check,
        groups={k:summarize(v,rounds,sites) for k,v in groups.items()},
        discrepant_shots=sorted({r['shot'] for r in diffs}),
        exactly_at_candidate=[{k:r[k] for k in ordered_keys} for r in sites if r['counts']==THRESHOLD],
        canonical_site_sha256=digest(canonical.encode('ascii')))
    args.out.mkdir()
    for name,fields,data in [('rounds.csv',rounds[0].keys(),rounds),('differences.csv',sites[0].keys(),diffs)]:
        with (args.out/name).open('w',newline='',encoding='utf-8') as f:
            write_csv(f,fields,data)
    with (args.out/'sites.csv.gz').open('wb') as raw, gzip.GzipFile(filename='', mode='wb',fileobj=raw,mtime=0) as gz:
        with io.TextIOWrapper(gz,encoding='utf-8',newline='') as f:
            write_csv(f,sites[0],sites)
    (args.out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')

if __name__=='__main__':
    main()
