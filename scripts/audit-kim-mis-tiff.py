"""Trace the first eight Kim Exp34 repetitions from TIFF pixels to occupancy."""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.io import loadmat


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "references/library/neutral-atoms/kim-mis-figshare-v1"
OUTPUT = ROOT / "references/knowledge/data/kim-mis-exp34-tiff-audit"
ROUND_COUNT = 8
SITE_COUNT = 12
ALIGNMENT_PAGES = 8
FRAME_COUNT = ROUND_COUNT * 2


def verify_file(entry):
    path = ARCHIVE / entry["path"]
    with path.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
    if path.stat().st_size != entry["bytes"] or digest != entry["sha256"]:
        raise ValueError(f"Archive size or SHA-256 mismatch: {path.name}")


def read_tiff(provenance):
    verify_file(provenance["sample"])
    pages = []
    with Image.open(ARCHIVE / provenance["sample"]["path"]) as tiff:
        if tiff.n_frames != FRAME_COUNT or len(provenance["pages"]) != FRAME_COUNT:
            raise ValueError("Expected exactly sixteen TIFF pages")
        for index, entry in enumerate(provenance["pages"]):
            tiff.seek(index)
            pixels = np.array(tiff)
            if (entry["page_1based"] != index + 1 or pixels.shape != (301, 541)
                    or pixels.dtype.kind != "u" or pixels.dtype.itemsize != 2):
                raise ValueError(f"Unexpected TIFF page or pixel type: {index + 1}")
            pixel_bytes = pixels.astype("<u2", copy=False).tobytes(order="C")
            if hashlib.sha256(pixel_bytes).hexdigest() != entry["decoded_pixel_sha256"]:
                raise ValueError(f"Decoded pixel hash differs from the source range: {index + 1}")
            pages.append(pixels)
    return np.stack(pages)


def window(frames, center, radius):
    x, y = center
    values = frames[:, y - 1 - radius:y + radius, x - 1 - radius:x + radius]
    side = 2 * radius + 1
    if values.shape[1:] != (side, side):
        raise ValueError(f"ROI is outside the TIFF frame: {center}")
    return values


def pixel_sums(frames, center):
    return window(frames, center, 2).sum(axis=(1, 2), dtype=np.int64)


def locate_centers(frames, initial, reference_sums):
    alignment = frames[:ALIGNMENT_PAGES]
    average_window = window(alignment, initial, 5).sum(axis=0, dtype=np.int64)
    dy, dx = np.unravel_index(average_window.ravel(order="F").argmax(), (11, 11), order="F")
    x, y = initial
    short_mean = (x + int(dx) - 5, y + int(dy) - 5)
    candidates = [
        (cx, cy)
        for cx in range(x - 5, x + 6)
        for cy in range(y - 5, y + 6)
        if np.array_equal(pixel_sums(alignment, (cx, cy)), reference_sums[:ALIGNMENT_PAGES])
    ]
    if len(candidates) != 1:
        raise ValueError(f"Expected a unique center in the author's search window at {initial}, found {len(candidates)}")
    return {"initial": initial, "short_mean": short_mean, "count_aligned": candidates[0]}


def compare():
    manifest = json.loads((ARCHIVE / "manifest.json").read_text(encoding="utf-8"))
    for entry in manifest["files"]:
        verify_file(entry)
    provenance = json.loads((ARCHIVE / manifest["tiff_sample_provenance"]).read_text(encoding="utf-8"))
    frames = read_tiff(provenance)
    measurement = loadmat(ARCHIVE / "Exp34.mat", variable_names=["fluoAreshape", "fluodigreshape", "threshold"])
    coordinates = loadmat(ARCHIVE / "xxyy_init.mat", variable_names=["xx", "yy"])
    counts = measurement["fluoAreshape"][:SITE_COUNT, :, :ROUND_COUNT].transpose(0, 2, 1).reshape(SITE_COUNT, FRAME_COUNT)
    bits = measurement["fluodigreshape"][:SITE_COUNT, :, :ROUND_COUNT].transpose(0, 2, 1).reshape(SITE_COUNT, FRAME_COUNT)
    limits = measurement["threshold"][:SITE_COUNT, 0]
    target_sums = np.rint(counts * 25).astype(np.int64)
    if not np.array_equal(counts, target_sums / 25) or not np.array_equal(bits, counts >= limits[:, None]):
        raise ValueError("MAT counts are not 5 × 5 integer-pixel means, or source decisions disagree with the thresholds")

    centers = [
        locate_centers(frames, (int(coordinates["xx"][0, site]), int(coordinates["yy"][0, site])), target_sums[site])
        for site in range(SITE_COUNT)
    ]
    names = ("initial", "short_mean", "count_aligned")
    all_sums = {name: np.stack([pixel_sums(frames, site[name]) for site in centers]) for name in names}
    decisions = {name: values / 25 >= limits[:, None] for name, values in all_sums.items()}
    sections = {"all": slice(None), "alignment": slice(0, ALIGNMENT_PAGES), "held_out": slice(ALIGNMENT_PAGES, None)}
    scores = {}
    for name, values in all_sums.items():
        scores[name] = {}
        for label, cols in sections.items():
            sums = values[:, cols]
            diff = sums - target_sums[:, cols]
            scores[name][label] = {
                "site_frames": sums.size,
                "exact_count_matches": int((diff == 0).sum()),
                "bit_matches": int((decisions[name][:, cols] == bits[:, cols]).sum()),
                "max_abs_difference_counts": float(np.abs(diff).max() / 25),
            }

    swapped = np.arange(FRAME_COUNT).reshape(ROUND_COUNT, 2)[:, ::-1].ravel()
    swapped_sums = all_sums["count_aligned"][:, swapped]
    swapped_bits = decisions["count_aligned"][:, swapped]
    swapped_pair_mismatch = (swapped_bits != bits).reshape(SITE_COUNT, ROUND_COUNT, 2).any(axis=2)
    summary = {
        "evidence": "public experimental TIFF pixels, cross-apparatus comparison",
        "isotope": manifest["paper"]["isotope"],
        "paper_doi": manifest["paper"]["doi"],
        "tiff_doi": provenance["dataset_doi"],
        "source_tiff": provenance["file_name"],
        "tiff_pages_1based": [1, FRAME_COUNT],
        "sites_1based": [1, SITE_COUNT],
        "search_window_size": 11,
        "roi_window_size": 5,
        "alignment_repetitions_1based": [1, ALIGNMENT_PAGES // 2],
        "held_out_repetitions_1based": [ALIGNMENT_PAGES // 2 + 1, ROUND_COUNT],
        "rule": "mean of 25 pixels >= archived site threshold",
        "centers_matlab_1based_xy": [{"site_1based": site, **values} for site, values in enumerate(centers, start=1)],
        "metrics": scores,
        "swap_counts_different_site_frames": int((swapped_sums != target_sums).sum()),
        "swap_bits_different_site_pairs": int(swapped_pair_mismatch.sum()),
        "swap_bits_different_held_out_site_pairs": int(swapped_pair_mismatch[:, ALIGNMENT_PAGES // 2:].sum()),
    }

    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow([
        "tiff_page_1based", "repetition_1based", "image_no", "site_1based", "partition",
        "mat_counts", "mat_bit", "threshold_counts",
        *(f"{name}_{field}" for name in names for field in ("pixel_sum", "counts", "difference_counts", "bit")),
    ])
    for page in range(FRAME_COUNT):
        for site in range(SITE_COUNT):
            row = [page + 1, page // 2 + 1, page % 2 + 1, site + 1,
                   "alignment" if page < ALIGNMENT_PAGES else "held_out", counts[site, page],
                   int(bits[site, page]), limits[site]]
            for name in names:
                value = int(all_sums[name][site, page])
                row.extend((value, value / 25, (value - int(target_sums[site, page])) / 25, int(decisions[name][site, page])))
            writer.writerow(row)
    return output.getvalue(), json.dumps(summary, indent=2) + "\n", scores


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare the archived report and CSV without rewriting them.")
    args = parser.parse_args()
    table, report, scores = compare()
    for suffix, content in ((".csv", table), (".json", report)):
        path = OUTPUT.with_suffix(suffix)
        if args.check:
            if path.read_bytes() != content.encode("utf-8"):
                raise ValueError(f"Generated report differs: {path}")
        else:
            path.write_bytes(content.encode("utf-8"))
    for name, split in scores.items():
        print(name, split["held_out"])


if __name__ == "__main__":
    main()
