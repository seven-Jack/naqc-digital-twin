"""Independently sweep frozen P1 thresholds using the raw S23/P2 images and binary logs."""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from zipfile import ZipFile

import numpy as np


READER_SHA = "233513a8ab9e754951c07878f14f02a33cfa88556c6f592176644bf26fb02855"
BASELINE_SITE_SHA = "55f8dbecd05642c6b2b7919da29bb670e18554d3594531638fa01d7f91631d6a"
BASELINE = 6436
THRESHOLDS = (BASELINE, *range(6480, 6551))


def load_reader():
    path = Path(__file__).with_name("verify-knottnerus-s23-p2.py")
    if hashlib.sha256(path.read_bytes()).hexdigest() != READER_SHA:
        raise ValueError("The frozen v0.1.2 raw-image reader has changed")
    spec = importlib.util.spec_from_file_location("p2_integral_reader", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def site_hash(counts, logged):
    digest = hashlib.sha256()
    for shot, frame, roi in np.ndindex(counts.shape):
        count = int(counts[shot, frame, roi])
        online = int(logged[shot, frame, roi])
        fields = (shot + 1, frame + 1, roi, count, online, int(count > BASELINE))
        digest.update(("%d,%d,%d,%d,%d,%d\n" % fields).encode("ascii"))
    return digest.hexdigest()


def decision_hash(decision):
    # The canonical sequence is 7,200 ASCII digits in C order, without separators.
    digits = np.asarray(decision, dtype=np.uint8) + ord("0")
    return hashlib.sha256(digits.tobytes(order="C")).hexdigest()


def describe_sites(mask, counts, logged, baseline, current):
    records = []
    for shot, frame, roi in np.argwhere(mask).tolist():
        k = (shot, frame, roi)
        records.append({
            "shot": shot + 1, "frame": frame + 1, "roi": roi,
            "counts": int(counts[k]), "logged": int(logged[k]),
            "baseline": int(baseline[k]), "current": int(current[k]),
        })
    return records


def group_stats(logged, current, mask, reader):
    online = logged[mask]
    predicted = current[mask]
    return {
        "shots": reader.shot_ids(mask),
        "logged": reader.count_occupancy(online),
        "current": reader.count_occupancy(predicted),
        "mismatches": {
            "all": reader.comparisons(online, predicted),
            "pic1": reader.comparisons(online[:, 0], predicted[:, 0]),
            "pic2": reader.comparisons(online[:, 1], predicted[:, 1]),
            "pic2_targets": reader.comparisons(online[:, 1, reader.TARGETS], predicted[:, 1, reader.TARGETS]),
        },
    }


def summarize_state(counts, logged, baseline, current, reader):
    baseline_diff = baseline != logged
    current_diff = current != logged
    initial_log = logged[:, 0, :].sum(axis=1)
    initial_baseline = baseline[:, 0, :].sum(axis=1)
    initial_current = current[:, 0, :].sum(axis=1)
    online_in = initial_log >= 16
    current_in = initial_current >= 16
    groups = {
        "all": np.full(100, True),
        "log_in": online_in, "log_out": ~online_in,
        "baseline_in": initial_baseline >= 16, "baseline_out": initial_baseline < 16,
        "current_in": current_in, "current_out": ~current_in,
        "both": current_in & online_in, "log_only": online_in & ~current_in,
        "current_only": current_in & ~online_in, "neither": ~current_in & ~online_in,
    }
    classes = {
        "persistent": current_diff & baseline_diff,
        "resolved": baseline_diff & ~current_diff,
        "new": current_diff & ~baseline_diff,
    }
    return {
        "classes": {k: describe_sites(mask, counts, logged, baseline, current) for k, mask in classes.items()},
        "cohorts": {k: group_stats(logged, current, mask, reader) for k, mask in groups.items()},
        "focus": {
            str(shot): {
                "initial_log": int(initial_log[shot - 1]),
                "initial_baseline": int(initial_baseline[shot - 1]),
                "initial_current": int(initial_current[shot - 1]),
                "selected": bool(current_in[shot - 1]),
            }
            for shot in (2, 16)
        },
    }


def verify(archive_path):
    reader = load_reader()
    with ZipFile(archive_path) as archive:
        counts, logged = reader.load_counts_and_log(archive)
    baseline_sha = site_hash(counts, logged)
    if baseline_sha != BASELINE_SITE_SHA:
        raise ValueError("Raw P2 images or logs do not reproduce the v0.1.2 frozen table")

    baseline = counts > BASELINE
    hashes = {}
    states = {}
    for threshold in THRESHOLDS:
        decision = np.greater(counts, threshold)
        digest = decision_hash(decision)
        hashes[str(threshold)] = digest
        if digest not in states:
            states[digest] = summarize_state(counts, logged, baseline, decision, reader)
            states[digest]["thresholds"] = []
        states[digest]["thresholds"].append(threshold)
    return {
        "method": "Independent raw P2 integral-image counts, native unflipped little-endian u16; "
                  "classify with frozen P1 3x3 rectangles and strict count > integer threshold.",
        "baseline_site_sha256": baseline_sha,
        "decision_sha256_by_threshold": hashes,
        "decision_hash_encoding": "7,200 ASCII 0/1 digits, ascending shot/frame/zero-based ROI, no delimiters",
        "states_by_decision_sha256": states,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with args.output.open("x") as stream:
        json.dump(verify(args.archive), stream, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
