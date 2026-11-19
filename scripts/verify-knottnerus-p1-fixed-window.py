"""Independently verify the fixed-window comparison against the raw S23/P1 images."""

import argparse
import csv
import gzip
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

import numpy as np


BASE = "Datapackage_SLM/data/241129_S23/"
ROI_SHA = "518404c63edf75983eded294e786ace5f83f9fc74246598215730fe9439a047e"
PARAMS_SHA = "478e3898c4f9c59010d5566bb382ef19645274abf9ccf7cb26564badd7e5f32a"
STAGES = ("log", "max", "fixed")
TARGETS = (7, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21, 22, 25, 26, 27, 28)
THRESHOLD = 6436


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_site_table(path):
    records = {}
    with gzip.open(path, "rt", newline="") as stream:
        for row in csv.DictReader(stream):
            key = tuple(int(row[col]) for col in ("shot", "frame", "roi"))
            require(key not in records, f"Duplicate site row {key}")
            records[key] = row
    require(len(records) == 7200, "Unexpected site row count")
    return records


def geometry(archive):
    raw = archive.read(BASE + "P1ROIs.dat")
    params = archive.read(BASE + "params.dat")
    require(hashlib.sha256(raw).hexdigest() == ROI_SHA, "Unexpected rectangle source")
    require(hashlib.sha256(params).hexdigest() == PARAMS_SHA, "Unexpected threshold source")
    require("threshold;6436;int" in params.decode("ascii").splitlines(), "Unexpected threshold")
    rects = np.asarray([line.split() for line in raw.decode("ascii").splitlines()[4:] if line.strip()],
                       dtype=int)
    require(rects.shape == (36, 4) and (rects[:, 2:] - rects[:, :2] == 3).all(), "Unexpected geometry")
    return rects


def status(initial_error, new_error):
    return (("agreed", "introduced"), ("resolved", "persistent"))[int(initial_error)][int(new_error)]


def direct_checks(archive, records):
    rects = geometry(archive)
    bits = np.empty((3, 100, 2, 36), dtype=bool)
    counts = np.empty((2, 100, 2, 36), dtype=int)
    for shot in range(1, 101):
        stem = BASE + f"P1_{shot}"
        dat = archive.read(stem + ".dat").decode("ascii").splitlines()[-1].split()
        require(dat[2:5] == ["23", "1", str(shot)], f"Unexpected run ID for {shot}")
        for frame in (1, 2):
            log = dat[-3 + frame]
            require(len(log) == 36 and set(log) <= {"0", "1"}, f"Invalid log {shot}/{frame}")
            raw = archive.read(stem + f"_{frame}.tga")
            width, height = np.frombuffer(raw, dtype="<u2", count=2, offset=12)
            require((int(width), int(height), len(raw)) == (100, 180, 36018), "Unexpected TGA")
            image = np.frombuffer(raw, dtype="<u2", offset=18).reshape(int(height), int(width))
            for roi, (left, top, right, bottom) in enumerate(rects):
                window = image[top:bottom, left:right]
                require(window.shape == (3, 3), f"Truncated fixed window for ROI {roi}")
                fixed_counts = int(window.sum(dtype=np.int64))
                # Slid windows of the 5-by-5 raw patch cover all nine possible centers.
                patch = image[top-1:bottom+1, left-1:right+1]
                require(patch.shape == (5, 5), f"Truncated neighborhood for ROI {roi}")
                windows = np.lib.stride_tricks.sliding_window_view(patch, (3, 3))
                max_counts = int(windows.sum(axis=(-2, -1), dtype=np.int64).max())
                require(fixed_counts <= max_counts, "Fixed sum exceeds neighborhood maximum")
                key = shot, frame, roi
                row = records[key]
                require((int(row["max_counts"]), int(row["fixed_counts"])) == (max_counts, fixed_counts),
                        f"Count mismatch at {key}")
                require((int(row["roi_x"]), int(row["roi_y"])) == (left + 1, top + 1 - 80),
                        f"Unexpected cropped center at {key}")
                require(int(row["target"]) == int(roi in TARGETS), f"Invalid target at {key}")
                measured = int(log[roi]), int(max_counts > THRESHOLD), int(fixed_counts > THRESHOLD)
                require(tuple(int(row[col]) for col in ("log_bit", "max_bit", "fixed_bit")) == measured,
                        f"Bit mismatch at {key}")
                require(row["status"] == status(measured[1] != measured[0], measured[2] != measured[0]),
                        f"Incorrect mismatch category at {key}")
                counts[:, shot-1, frame-1, roi] = max_counts, fixed_counts
                bits[:, shot-1, frame-1, roi] = measured
    return bits, counts


def comparisons(log, maximum, fixed):
    before = log != maximum
    after = log != fixed
    return {
        "denominator": int(log.size),
        "before": int(before.sum()), "after": int(after.sum()),
        "resolved": int((before & ~after).sum()), "introduced": int((~before & after).sum()),
        "persistent": int((before & after).sum()),
        "max_0_to_fixed_1": int((~maximum & fixed).sum()),
        "max_1_to_fixed_0": int((maximum & ~fixed).sum()),
        "fixed_log0_result1": int((~log & fixed).sum()), "fixed_log1_result0": int((log & ~fixed).sum()),
    }


def cohort(bits, mask):
    sample = bits[:, mask]
    result = {}
    n = int(mask.sum())
    for stage, values in zip(STAGES, sample):
        target = values[:, 1, :][:, TARGETS]
        result[stage] = {
            "initial_occupied": [int(values[:, 0, :].sum()), 36*n],
            "final_occupied": [int(values[:, 1, :].sum()), 36*n],
            "target_occupied": [int(target.sum()), 16*n],
            "full_target_rounds": [int(target.all(axis=1).sum()), n],
        }
    return {
        "shots": (np.flatnonzero(mask) + 1).tolist(), "counts": result,
        "all_site_frames": comparisons(*sample), "pic1": comparisons(*sample[:, :, 0, :]),
        "pic2": comparisons(*sample[:, :, 1, :]),
        "pic2_targets": comparisons(*sample[:, :, 1, :][:, :, TARGETS]),
    }


def verify(archive_path, site_path):
    with ZipFile(archive_path) as archive:
        bits, counts = direct_checks(archive, read_site_table(site_path))
    log, maximum, fixed = bits
    before = maximum != log
    after = fixed != log
    require(before.sum() == 26 and not (before & log).any(), "Baseline 26 not reproduced")
    require(not (fixed & ~maximum).any(), "Unexpected increase under fixed windows")
    selected = bits[:, :, 0, :].sum(axis=-1) >= 16
    log_sel, max_sel, fixed_sel = selected
    require(not (fixed_sel & ~max_sel).any(), "Fixed-window selection could only remove shots")
    masks = {
        "all": np.ones(100, dtype=bool), "log_ge16": log_sel, "max_ge16": max_sel, "fixed_ge16": fixed_sel,
        "both_ge16": max_sel & fixed_sel, "max_only_ge16": max_sel & ~fixed_sel,
        "fixed_only_ge16": fixed_sel & ~max_sel, "neither_ge16": ~max_sel & ~fixed_sel,
        "log_lt16": ~log_sel, "max_lt16": ~max_sel, "fixed_lt16": ~fixed_sel,
    }
    def keys(array):
        return [[int(s+1), int(f+1), int(r)] for s, f, r in np.argwhere(array)]

    focus = {}
    for shot in (5, 6, 9, 16, 30, 40, 83, 93, 96):
        i = shot - 1
        focus[shot] = {
            "initial_occupied": bits[:, i, 0].sum(axis=-1).tolist(),
            "final_target_occupied": bits[:, i, 1][:, TARGETS].sum(axis=-1).tolist(),
            "roi14_final_log_max_fixed": bits[:, i, 1, 14].astype(int).tolist(),
            "roi14_final_max_fixed_counts": counts[:, i, 1, 14].tolist(),
        }
    return {
        "status": "verified", "frames": 200, "site_frames_per_method": 7200,
        "source": "raw unflipped 100x180 little-endian TGA, native half-open rectangles",
        "numpy": np.__version__, "site_table_sha256": hashlib.sha256(site_path.read_bytes()).hexdigest(),
        "target_rois_0based": list(TARGETS), "cohorts": {k: cohort(bits, v) for k, v in masks.items()},
        "resolved": keys(before & ~after), "introduced": keys(after & ~before), "persistent": keys(before & after),
        "equal_6436_keys": {"max": keys(counts[0] == THRESHOLD), "fixed": keys(counts[1] == THRESHOLD)},
        "focus": focus,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("sites_csv_gz", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.archive, args.sites_csv_gz), indent=2))
