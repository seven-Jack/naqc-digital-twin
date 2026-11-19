"""Independent S23/P2 holdout check with P1 detector settings frozen before the comparison."""
import hashlib
import io
import json
import re
import sys
from zipfile import ZipFile

import numpy as np


BASE = "Datapackage_SLM/data/241129_S23/"
TGA_HEADER = bytes.fromhex("0000030000000000000000006400b4001000")
P1_ROI_HASH = "518404c63edf75983eded294e786ace5f83f9fc74246598215730fe9439a047e"
TARGETS = [row * 6 + col for row in range(1, 5) for col in range(1, 5)]


def check(condition, message):
    if not condition:
        raise ValueError(message)


def load_counts_and_log(archive):
    roi_file = archive.read(BASE + "P1ROIs.dat")
    check(hashlib.sha256(roi_file).hexdigest() == P1_ROI_HASH, "P1 rectangles changed")
    check(archive.read(BASE + "P2ROIs.dat") == roi_file, "P2 geometry differs from P1")
    rects = np.loadtxt(io.BytesIO(roi_file), skiprows=4, dtype=int)
    check(rects.shape == (36, 4) and np.all(rects[:, 2:] - rects[:, :2] == 3), "ROI dimensions")
    check("threshold;6436;int" in archive.read(BASE + "params.dat").decode("ascii").splitlines(),
          "Unexpected candidate threshold source")
    lookup = set(archive.namelist())
    check(len(lookup) == len(archive.infolist()), "Ambiguous ZIP entries")
    expected = {BASE + f"P2_{shot}{suffix}" for shot in range(1, 101)
                for suffix in (".dat", "_1.tga", "_2.tga")}
    shot_path = re.compile(re.escape(BASE) + r"P2_[0-9]+(?:_[0-9]+\.tga|\.dat)")
    present = {p for p in lookup if shot_path.fullmatch(p)}
    check(present == expected, "P2 image and log inventory")
    counts = np.empty((100, 2, 36), dtype=np.int64)
    logged = np.empty_like(counts, dtype=bool)
    for shot in range(1, 101):
        stem = BASE + f"P2_{shot}"
        lines = archive.read(stem + ".dat").decode("ascii").strip().splitlines()
        words = lines[-1].split()
        check(words[2:5] == ["23", "2", str(shot)], f"P2 identifier {shot}")
        for fi, bits in enumerate(words[-2:]):
            check(re.fullmatch("[01]{36}", bits), f"P2_{shot} Pic{fi+1} bit string")
            logged[shot-1, fi] = [bit == "1" for bit in bits]
            raw = archive.read(stem + f"_{fi+1}.tga")
            check(raw[:18] == TGA_HEADER and len(raw) == 36018, f"TGA layout {shot}/{fi+1}")
            image = np.frombuffer(raw[18:], dtype="<u2").reshape(180, 100)
            # Evaluate the half-open rectangle via an integral image, independently of direct slicing.
            integ = np.pad(image.cumsum(axis=0, dtype=np.int64).cumsum(axis=1), ((1, 0), (1, 0)))
            left, top, right, bottom = rects.T
            counts[shot-1, fi] = integ[bottom, right] - integ[top, right] - integ[bottom, left] + integ[top, left]
    return counts, logged


def count_occupancy(bits):
    n = len(bits)
    end = bits[:, 1][:, TARGETS]
    return {
        "initial": [int(bits[:, 0].sum()), 36*n],
        "final": [int(bits[:, 1].sum()), 36*n],
        "final_targets": [int(end.sum()), 16*n],
        "full_target_rounds": [int(end.all(axis=1).sum()), n],
    }


def comparisons(logged, inferred):
    return {
        "different": int(np.count_nonzero(logged != inferred)),
        "log0_fixed1": int(np.count_nonzero(~logged & inferred)),
        "log1_fixed0": int(np.count_nonzero(logged & ~inferred)),
        "denominator": int(logged.size),
    }


def shot_ids(mask):
    return (np.flatnonzero(mask) + 1).tolist()


def evaluate(path):
    with ZipFile(path) as archive:
        counts, logged = load_counts_and_log(archive)
    inferred = counts > 6436
    site_digest = hashlib.sha256()
    count_digest = hashlib.sha256()
    for shot, frame, roi in np.ndindex(counts.shape):
        row = (shot + 1, frame + 1, roi, counts[shot,frame,roi],
               int(logged[shot,frame,roi]), int(inferred[shot,frame,roi]))
        site_digest.update(("%d,%d,%d,%d,%d,%d\n" % row).encode("ascii"))
        count_digest.update(("%d\n" % row[3]).encode("ascii"))
    log_in = logged[:, 0].sum(axis=-1) >= 16
    calc_in = inferred[:, 0].sum(axis=-1) >= 16
    conditions = {
        "all": np.full(100, True), "log_in": log_in, "fixed_in": calc_in,
        "both": log_in & calc_in, "log_only": log_in & ~calc_in,
        "fixed_only": ~log_in & calc_in, "neither": ~log_in & ~calc_in,
        "log_out": ~log_in, "fixed_out": ~calc_in,
    }
    cohorts = {}
    for name, mask in conditions.items():
        log, calc = logged[mask], inferred[mask]
        cohorts[name] = {
            "rounds": shot_ids(mask), "logged": count_occupancy(log), "fixed": count_occupancy(calc),
            "all_sites": comparisons(log, calc), "Pic1": comparisons(log[:, 0], calc[:, 0]),
            "Pic2": comparisons(log[:, 1], calc[:, 1]),
            "Pic2_targets": comparisons(log[:, 1][:, TARGETS], calc[:, 1][:, TARGETS]),
        }
    mismatches = []
    for si, fi, roi in np.argwhere(inferred != logged).tolist():
        mismatches.append({"shot": si+1, "frame": fi+1, "roi": roi, "log_bit": int(logged[si, fi, roi]),
                           "fixed_bit": int(inferred[si, fi, roi]), "counts": int(counts[si, fi, roi])})
    return {
        "source": "Knottnerus S23 P2; same-series holdout, cross-apparatus 88Sr",
        "method": "NumPy int64 integral images, native unflipped u16 LE with frozen P1 rectangles",
        "candidate_strict_gt_counts": 6436, "equal_6436": np.argwhere(counts == 6436).shape[0],
        "dimensions_shots_frames_sites": list(counts.shape), "targets_0based": TARGETS,
        "counts_sha256": count_digest.hexdigest(),
        "site_sha256": site_digest.hexdigest(),
        "site_hash_encoding": "ASCII shot,frame,roi,counts,log_bit,fixed_bit LF; numeric ascending, no header; shot/frame 1-based, roi 0-based.",
        "mismatches": mismatches, "cohorts": cohorts,
    }


if __name__ == "__main__":
    print(json.dumps(evaluate(sys.argv[1]), indent=2))
