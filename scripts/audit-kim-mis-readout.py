#!/usr/bin/env python3
"""Check paired, site-resolved 87Rb counts in Kim et al.'s public Exp34 sample."""

import argparse
import csv
import hashlib
import io
import json
import math
from collections import Counter
from pathlib import Path

from scipy.io import loadmat


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "references/library/neutral-atoms/kim-mis-figshare-v1"
OUTPUT = ROOT / "references/knowledge/data"
STEM = "kim-mis-exp34-paired-readout"
SITE_COUNT = 12
ROUND_COUNT = 8
ARRAY_SHAPE = (198, 2, 3479)


def verify_archive():
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    for file in manifest["files"]:
        path = SOURCE / file["path"]
        with path.open("rb") as handle:
            sha256 = hashlib.file_digest(handle, "sha256").hexdigest()
        if path.stat().st_size != file["bytes"] or sha256 != file["sha256"]:
            raise ValueError(f"Source bytes or SHA-256 differ from the manifest: {path.name}")
    return manifest


def compare_sample():
    manifest = verify_archive()
    arrays = loadmat(SOURCE / "Exp34.mat", variable_names=["fluoAreshape", "fluodigreshape", "threshold"])
    counts = arrays["fluoAreshape"]
    source_bits = arrays["fluodigreshape"]
    threshold = arrays["threshold"]
    if counts.shape != ARRAY_SHAPE or source_bits.shape != ARRAY_SHAPE or threshold.shape != (ARRAY_SHAPE[0], 1):
        raise ValueError("Source array shapes differ from Exp34's documented axes")

    classes = Counter({"00": 0, "01": 0, "10": 0, "11": 0})
    frame_matches = [0, 0]
    pair_matches = 0
    swapped_pair_mismatches = 0
    threshold_ties = 0
    table = io.StringIO(newline="")
    writer = csv.writer(table, lineterminator="\n")
    writer.writerow([
        "repetition_1based", "site_1based", "image_1_column_1based", "image_2_column_1based",
        "image_1_counts", "image_2_counts", "site_threshold_both_images", "image_1_published_bit",
        "image_2_published_bit", "image_1_recomputed_bit", "image_2_recomputed_bit",
        "pair_matches", "swapped_pair_matches",
    ])
    for repetition in range(ROUND_COUNT):
        for site in range(SITE_COUNT):
            before, after = (float(value) for value in counts[site, :, repetition])
            limit = float(threshold[site, 0])
            original = tuple(source_bits[site, :, repetition])
            if not all(map(math.isfinite, (before, after, limit))) or any(bit not in (0, 1) for bit in original):
                raise ValueError(f"Invalid pair at site {site + 1}, repetition {repetition + 1}")
            published = tuple(int(bit) for bit in original)
            recomputed = (int(before >= limit), int(after >= limit))
            pair_matches += recomputed == published
            swapped_pair_mismatches += recomputed[::-1] != published
            threshold_ties += int(before == limit) + int(after == limit)
            classes["".join(str(bit) for bit in recomputed)] += 1
            for frame, (actual, expected) in enumerate(zip(recomputed, published)):
                frame_matches[frame] += actual == expected
            writer.writerow([
                repetition + 1, site + 1, 2 * repetition + 1, 2 * repetition + 2,
                before, after, limit, *published, *recomputed, recomputed == published, recomputed[::-1] == published,
            ])

    pairs = SITE_COUNT * ROUND_COUNT
    if pair_matches != pairs or swapped_pair_mismatches == 0:
        raise ValueError("Paired counts disagree with the public bits, or the sample cannot detect reversed frame order")
    result = {
        "evidence": "cross-apparatus check using public measured ROI counts",
        "isotope": "87Rb",
        "paper_doi": manifest["paper"]["doi"],
        "source": next(file for file in manifest["files"] if file["path"] == "Exp34.mat"),
        "axes": ["site", "image before or after evolution", "repetition"],
        "counts_and_bits_shape": list(ARRAY_SHAPE),
        "threshold_shape": list(threshold.shape),
        "selection": {"repetitions_1based": [1, ROUND_COUNT], "sites_1based": [1, SITE_COUNT]},
        "rule": "bit 1 iff fluorescence >= site threshold; same threshold in both images",
        "rule_source": {
            "archive_file": "Digitize_Data.m",
            "doi": "10.6084/m9.figshare.23911368.v1",
            "comparison_line": 96,
            "equality_to_one_line": 99,
        },
        "pairing": "same site and repetition; image 1 before evolution, image 2 after evolution",
        "source_pair_columns": "1-based logical columns of the published MATLAB reshape, 2r-1 and 2r",
        "pairs": pairs,
        "frames": 2 * pairs,
        "pairs_matching_published_bits": pair_matches,
        "image_1_matching_published_bits": frame_matches[0],
        "image_2_matching_published_bits": frame_matches[1],
        "threshold_equal_frames": threshold_ties,
        "pair_classes": dict(classes),
        "pairs_mismatching_after_swapping_image_order": swapped_pair_mismatches,
    }
    return table.getvalue(), json.dumps(result, ensure_ascii=False, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare with the archived CSV and summary without writing.")
    args = parser.parse_args()
    table, result = compare_sample()
    for suffix, text in (("csv", table), ("json", result)):
        path = OUTPUT / f"{STEM}.{suffix}"
        if args.check:
            if path.read_bytes() != text.encode("utf-8"):
                raise ValueError(f"Generated bytes differ: {path}")
        else:
            path.write_bytes(text.encode("utf-8"))
    report = json.loads(result)
    print(f"{report['pairs_matching_published_bits']}/{report['pairs']} pairs agree with Exp34")
    print(f"{report['pairs_mismatching_after_swapping_image_order']} pairs differ when images are reversed")


if __name__ == "__main__":
    main()
