"""Independently verify the S23/P3 fixed-window replay from its author TGA and DAT files."""
import argparse
import csv
import gzip
import hashlib
import io
import json
import re
from pathlib import Path
from zipfile import ZipFile

import numpy as np


BASE = "Datapackage_SLM/data/241129_S23/"
P1_ROI_SHA = "518404c63edf75983eded294e786ace5f83f9fc74246598215730fe9439a047e"
TGA_HEADER = bytes.fromhex("0000030000000000000000006400b4001000")
THRESHOLDS = (6436, *range(6499, 6520))
TARGETS = [row * 6 + col for row in range(1, 5) for col in range(1, 5)]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_archive(archive):
    names = archive.namelist()
    require(len(names) == len(set(names)), "Duplicate ZIP entries")
    expected = {BASE + f"P3_{n}{suffix}" for n in range(1, 101)
                for suffix in (".dat", "_1.tga", "_2.tga")}
    pattern = re.compile(re.escape(BASE) + r"P3_\d+(?:_\d+\.tga|\.dat)")
    require({name for name in names if pattern.fullmatch(name)} == expected, "P3 inventory")
    raw_roi = archive.read(BASE + "P1ROIs.dat")
    require(hashlib.sha256(raw_roi).hexdigest() == P1_ROI_SHA, "P1 ROI freeze")
    require(archive.read(BASE + "P3ROIs.dat") == raw_roi, "P1/P3 ROI mismatch")
    boxes = np.loadtxt(io.BytesIO(raw_roi), skiprows=4, dtype=int)
    require(boxes.shape == (36, 4) and np.all(boxes[:, 2:] - boxes[:, :2] == 3), "P1 rectangles")
    left, top, right, bottom = boxes.T
    counts = np.empty((100, 2, 36), dtype=np.int64)
    logged = np.empty_like(counts, dtype=bool)
    header = archive.read(BASE + "P3_1.dat").decode("ascii").splitlines()[0].split()
    for trial in range(100):
        stem = BASE + f"P3_{trial + 1}"
        lines = [line.split() for line in archive.read(stem + ".dat").decode("ascii").splitlines() if line.strip()]
        if lines[0] == header:
            lines = lines[1:]
        require(len(lines) == 1 and len(lines[0]) == len(header), "Invalid log: " + stem)
        record = dict(zip(header, lines[0]))
        require([int(record[k]) for k in ("Series", "DataSetNr", "RunNr")] == [23, 3, trial + 1],
                "Log identity: " + stem)
        for frame in range(2):
            bits = record[f"Pic{frame + 1}"]
            require(re.fullmatch("[01]{36}", bits), "Invalid Pic bits: " + stem)
            logged[trial, frame] = [bit == "1" for bit in bits]
            path = stem + f"_{frame + 1}.tga"
            raw = archive.read(path)
            require(raw[:18] == TGA_HEADER and len(raw) == 36018, "TGA format: " + path)
            image = np.frombuffer(raw, dtype="<u2", offset=18).reshape(180, 100)
            # An integral image uses four corners instead of the main program's nine pixels.
            sat = np.pad(image.cumsum(axis=0, dtype=np.int64).cumsum(axis=1), ((1, 0), (1, 0)))
            counts[trial, frame] = sat[bottom, right] + sat[top, left] - sat[top, right] - sat[bottom, left]
    return boxes, counts, logged


def csv_rows(path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf8", newline="") as stream:
        return list(csv.DictReader(stream))


def site_key(row):
    return tuple(int(row[key]) for key in ("shot", "frame", "roi"))


def verify_site(row, counts, logged, decision, boxes):
    shot, frame, roi = site_key(row)
    pos = (shot - 1, frame - 1, roi)
    values = tuple(int(row[key]) for key in ("counts", "log_bit", "fixed_bit", "target"))
    require(values == (counts[pos], logged[pos], decision[pos], roi in TARGETS), f"Site values at {pos}")
    rect = [int(row[key]) for key in ("raw_x0", "raw_y0", "raw_x1_exclusive", "raw_y1_exclusive")]
    require(rect == boxes[roi].tolist(), f"Rectangle at {pos}")
    stem = BASE + f"P3_{shot}"
    require(row["frame_member"] == stem + f"_{frame}.tga" and row["log_member"] == stem + ".dat",
            f"Source references at {pos}")


def verify_cohort(row, mask, logged, decision):
    shots = (np.flatnonzero(mask) + 1).tolist()
    require([int(s) for s in row["shots"].split()] == shots, f'Incorrect roster: {row["cohort"]}')
    n = len(shots)
    log, fixed = logged[mask], decision[mask]
    diff = log != fixed
    metrics = dict(rounds=n, site_denominator=36*n, target_denominator=16*n, round_denominator=n,
                   disagreements=diff.sum(), decision_denominator=72*n, pic1_disagreements=diff[:, 0].sum(),
                   pic2_disagreements=diff[:, 1].sum(), pic2_target_disagreements=diff[:, 1][:, TARGETS].sum(),
                   log0_fixed1=(~log & fixed).sum(), log1_fixed0=(log & ~fixed).sum())
    for label, values in (("log", log), ("fixed", fixed)):
        target = values[:, 1][:, TARGETS]
        metrics.update({label + "_initial_n": values[:, 0].sum(), label + "_final_n": values[:, 1].sum(),
                        label + "_target_n": target.sum(), label + "_full_n": target.all(axis=1).sum()})
    for key, value in metrics.items():
        require(int(row[key]) == value, f'Incorrect T={row["threshold"]} cohort={row["cohort"]} {key}')


def verify(archive_path, directory):
    with ZipFile(archive_path) as archive:
        boxes, counts, logged = read_archive(archive)
    sites = csv_rows(directory / "sites.csv.gz")
    keys = [(trial + 1, frame + 1, roi) for trial, frame, roi in np.ndindex(counts.shape)]
    require(sorted(site_key(row) for row in sites) == keys, "Site table coverage")
    baseline = counts > THRESHOLDS[0]
    for row in sites:
        verify_site(row, counts, logged, baseline, boxes)

    diffs = csv_rows(directory / "differences.csv")
    cohorts = csv_rows(directory / "cohorts.csv")
    reported = json.loads((directory / "summary.json").read_text())["thresholds"]
    tested = {str(t) for t in THRESHOLDS}
    require(set(reported) == tested and {r["threshold"] for r in diffs} <= tested and
            {r["threshold"] for r in cohorts} == tested, "Unexpected threshold inventory")
    log_in = logged[:, 0].sum(axis=1) >= 16
    checked = {}
    for threshold in THRESHOLDS:
        fixed = counts > threshold
        t = str(threshold)
        digest = hashlib.sha256((fixed.astype(np.uint8) + ord("0")).tobytes()).hexdigest()
        require(digest == reported[t]["decision_sha256"], f"Decision digest T={t}")
        diff_rows = [r for r in diffs if r["threshold"] == t]
        error_keys = [(s + 1, f + 1, r) for s, f, r in np.argwhere(fixed != logged).tolist()]
        require(sorted(site_key(row) for row in diff_rows) == error_keys, f"Mismatch inventory T={t}")
        for row in diff_rows:
            verify_site(row, counts, logged, fixed, boxes)
        fixed_in = fixed[:, 0].sum(axis=1) >= 16
        masks = dict(all=np.ones(100, dtype=bool), log_in=log_in, log_out=~log_in,
                     fixed_in=fixed_in, fixed_out=~fixed_in, both=log_in & fixed_in,
                     log_only=log_in & ~fixed_in, fixed_only=~log_in & fixed_in, neither=~log_in & ~fixed_in)
        cohort_rows = [r for r in cohorts if r["threshold"] == t]
        require(sorted(r["cohort"] for r in cohort_rows) == sorted(masks), f"Cohort inventory T={t}")
        for row in cohort_rows:
            verify_cohort(row, masks[row["cohort"]], logged, fixed)
        checked[t] = {"decision_sha256": digest, "different": len(error_keys),
                      "log_selected": int(log_in.sum()), "fixed_selected": int(fixed_in.sum())}
    return {
        "verified": True, "batch": "Knottnerus S23/P3", "method": "Independent int64 integral images, original Pic1/Pic2 DAT bits",
        "source_frames": 200, "paired_rounds": 100, "site_rows_checked": len(sites), "cohort_rows_checked": len(cohorts),
        "difference_rows_checked": len(diffs), "thresholds": checked,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("results", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = verify(args.archive, args.results)
    with args.output.open("x", encoding="utf8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
