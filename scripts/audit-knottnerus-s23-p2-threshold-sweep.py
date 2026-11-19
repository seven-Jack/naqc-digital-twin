"""Apply the P1 integer threshold interval to the unchanged S23/P2 fixed-window counts."""
import argparse
import csv
import gzip
import hashlib
import json
from dataclasses import dataclass
from itertools import product
from pathlib import Path


BASELINE = 6436
P1_RANGE = (6480, 6550)
MIN_ATOMS = 16
TARGETS = frozenset((7, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21, 22, 25, 26, 27, 28))
SHOTS = tuple(range(1, 101))
INPUT_HASHES = {
    'sites.csv.gz': '0247189abee79a2319cf6af6c6e7f3d37050af2e55e1a5a4ec9563bda766d01d',
    'rounds.csv': 'c250a228a21abed54f461db17f24f6610060916895d34918f5a0cc9321fa9a64',
    'differences.csv': '25f242b32db5a5b423dc87478a44161c2256931e614472afa59930e26e132859',
    'summary.json': '24b76888ceb8cd7b2050bda8bf67aa336ad2ed24a101b371666c66522078abef',
    'p1-58-diagnostic.json': '5bb9799076deb6f8f0680d9fc6a6643d0f360db78d4795fe6c3e55698119ca15',
}


@dataclass(frozen=True)
class Site:
    shot: int
    frame: int
    roi: int
    counts: int
    logged: int
    baseline: int


@dataclass(frozen=True)
class Round:
    initial: int
    final: int
    targets: int


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sites_from_archive(directory):
    for name, expected in INPUT_HASHES.items():
        require(hashlib.sha256((directory / name).read_bytes()).hexdigest() == expected,
                'Unexpected frozen input: ' + name)
    p1 = json.loads((directory / 'p1-58-diagnostic.json').read_text())
    require(tuple(p1['strict_integer_constraints']['all']['perfect_integer_interval']) == P1_RANGE,
            'Unexpected P1 interval')
    previous = json.loads((directory / 'summary.json').read_text())
    require(previous['threshold'] == BASELINE and previous['minimum_first_frame_atoms'] == MIN_ATOMS,
            'Frozen P2 baseline changed')
    with gzip.open(directory / 'sites.csv.gz', 'rt', newline='') as stream:
        sites = []
        for row in csv.DictReader(stream):
            site = Site(*(int(row[key]) for key in ('shot', 'frame', 'roi', 'counts', 'log_bit', 'fixed_bit')))
            require(site.logged in (0, 1) and site.baseline == int(site.counts > BASELINE), 'Bad baseline bit')
            require(int(row['target']) == int(site.roi in TARGETS), 'Unexpected P2 target mask')
            sites.append(site)
    expected_order = list(product(SHOTS, (1, 2), range(36)))
    require([(s.shot, s.frame, s.roi) for s in sites] == expected_order, 'Invalid site roster or order')
    with (directory / 'differences.csv').open(newline='') as stream:
        old_keys = [tuple(int(row[k]) for k in ('shot', 'frame', 'roi', 'counts')) for row in csv.DictReader(stream)]
    old_sites = [(s.shot, s.frame, s.roi, s.counts) for s in sites if s.baseline != s.logged]
    require(old_keys == old_sites and len(old_keys) == 5, 'Cannot reproduce the five frozen differences')
    with (directory / 'rounds.csv').open(newline='') as stream:
        frozen_rounds = list(csv.DictReader(stream))
    require([int(r['shot']) for r in frozen_rounds] == list(SHOTS), 'Bad round roster')
    for row in frozen_rounds:
        start = 72 * (int(row['shot']) - 1)
        for frame in (1, 2):
            offset = start + 36 * (frame - 1)
            tile = sites[offset:offset+36]
            require(row[f'log_pic{frame}'] == ''.join(str(s.logged) for s in tile), 'Instrument bits changed')
            require(row[f'fixed_pic{frame}'] == ''.join(str(s.baseline) for s in tile), 'Fixed bits changed')
    return sites


def round_counts(bits):
    records = {}
    for shot in SHOTS:
        offset = (shot - 1) * 72
        first = bits[offset:offset+36]
        second = bits[offset+36:offset+72]
        records[shot] = Round(sum(first), sum(second), sum(second[roi] for roi in TARGETS))
    return records


def selected(records):
    return {shot for shot in SHOTS if records[shot].initial >= MIN_ATOMS}


def write_csv(path, rows):
    with path.open('w', newline='', encoding='utf8') as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys(), lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def error_metrics(indices, sites):
    subset = [sites[i] for i in indices]
    return dict(errors=len(subset), pic1_errors=sum(s.frame == 1 for s in subset),
                pic2_errors=sum(s.frame == 2 for s in subset),
                pic2_target_errors=sum(s.frame == 2 and s.roi in TARGETS for s in subset),
                log0_calc1=sum(s.logged == 0 for s in subset), log1_calc0=sum(s.logged == 1 for s in subset))


def cohort_row(threshold, label, roster, logged, computed, mismatches, sites):
    n = len(roster)
    row = dict(threshold=threshold, cohort=label, rounds=n, initial_sites=36*n,
               final_sites=36*n, final_target_sites=16*n, paired_site_frames=72*n)
    for name, readings in [('log', logged), ('calc', computed)]:
        items = [readings[shot] for shot in roster]
        row[name+'_initial_occupied'] = sum(r.initial for r in items)
        row[name+'_final_occupied'] = sum(r.final for r in items)
        row[name+'_final_target_occupied'] = sum(r.targets for r in items)
        row[name+'_full_target_rounds'] = sum(r.targets == 16 for r in items)
    row.update(error_metrics([i for i in mismatches if sites[i].shot in roster], sites))
    row['shots'] = ' '.join(map(str, sorted(roster)))
    return row


def site_data(s):
    return dict(shot=s.shot, frame=s.frame, roi=s.roi, counts=s.counts,
                log_bit=s.logged, baseline_bit=s.baseline, target=int(s.roi in TARGETS))


def summarize_scan(sites):
    summaries, cohorts, changes = [], [], []
    digests, bands = {}, []
    error_ranges = {}
    baseline_errors = {i for i, site in enumerate(sites) if site.baseline != site.logged}
    logged = round_counts([s.logged for s in sites])
    baseline_roster = selected(round_counts([s.baseline for s in sites]))
    log_roster = selected(logged)
    first, last = P1_RANGE
    for threshold in [BASELINE, *range(first, last + 1)]:
        bits = [int(s.counts > threshold) for s in sites]
        digest = hashlib.sha256(bytes(48 + bit for bit in bits)).hexdigest()
        digests[str(threshold)] = digest
        current = round_counts(bits)
        roster = selected(current)
        mismatches = {i for i, s in enumerate(sites) if bits[i] != s.logged}
        summary = dict(threshold=threshold, equal_to_threshold=sum(s.counts == threshold for s in sites),
                       resolved=len(baseline_errors-mismatches), persistent=len(baseline_errors&mismatches),
                       introduced=len(mismatches-baseline_errors), **error_metrics(mismatches, sites),
                       log_selected=len(log_roster), calc_selected=len(roster),
                       log_only=' '.join(map(str, sorted(log_roster-roster))),
                       calc_only=' '.join(map(str, sorted(roster-log_roster))))
        for shot in (2, 16):
            summary[f'P2_{shot}_initial'] = current[shot].initial
            summary[f'P2_{shot}_selected'] = int(shot in roster)
        summaries.append(summary)
        groups = dict(all=set(SHOTS), log_selected=log_roster, baseline_selected=baseline_roster,
                      calc_selected=roster, log_excluded=set(SHOTS)-log_roster, calc_excluded=set(SHOTS)-roster,
                      common=roster&log_roster, log_only=log_roster-roster, calc_only=roster-log_roster,
                      neither=set(SHOTS)-(roster|log_roster))
        for group, members in groups.items():
            cohorts.append(cohort_row(threshold, group, members, logged, current, mismatches, sites))
        for i in sorted(baseline_errors | mismatches):
            if i in baseline_errors:
                status = 'persistent' if i in mismatches else 'resolved'
            else:
                status = 'introduced'
            changes.append(dict(threshold=threshold, status=status, **site_data(sites[i]), calc_bit=bits[i]))
            if threshold != BASELINE:
                key = (i, status)
                intervals = error_ranges.setdefault(key, [])
                if intervals and intervals[-1][1] == threshold-1:
                    intervals[-1][1] = threshold
                else:
                    intervals.append([threshold, threshold])
        if threshold != BASELINE:
            if bands and bands[-1]['decision_sha256'] == digest:
                bands[-1]['last_T'] = threshold
            else:
                bands.append(dict(first_T=threshold, last_T=threshold, decision_sha256=digest,
                                  resolved=summary['resolved'], persistent=summary['persistent'],
                                  introduced=summary['introduced'], errors=summary['errors'],
                                  selected=len(roster)))
    range_rows = [dict(**site_data(sites[i]), status=status, intervals=intervals)
                  for (i,status), intervals in sorted(error_ranges.items())]
    evidence = dict(source='Knottnerus 88Sr, S23/P2 same-series holdout; Senoo cross-apparatus comparison',
                    candidate_strict_gt_counts=BASELINE, p1_interval_inclusive=list(P1_RANGE),
                    denominator_site_frames=len(sites), shots=len(SHOTS), targets_per_shot=len(TARGETS),
                    selection='Initial occupied sites >=16, out of 36; final target mask has 16 sites.',
                    threshold_source='Entire perfect integer interval derived from P1 labels with frozen P1 windows.',
                    baseline_errors=[site_data(sites[i]) for i in sorted(baseline_errors)],
                    input_sha256=INPUT_HASHES, decision_sha256_by_threshold=digests,
                    hash_format='7,200 ASCII 0/1 digits ordered by ascending shot, frame, roi, no separators or LF.',
                    bands=bands, difference_intervals=range_rows,
                    log_selected_shots=sorted(log_roster), baseline_selected_shots=sorted(baseline_roster))
    return summaries, cohorts, changes, evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    sites = sites_from_archive(args.inputs)
    summaries, cohorts, changes, summary = summarize_scan(sites)
    args.output.mkdir(exist_ok=False)
    write_csv(args.output/'thresholds.csv', summaries)
    write_csv(args.output/'cohorts.csv', cohorts)
    write_csv(args.output/'differences.csv', changes)
    (args.output/'summary.json').write_text(json.dumps(summary, indent=2) + '\n')


if __name__ == '__main__':
    main()
