"""Reproduce Kim Exp34 from three complete TIFF parts on an approved server."""

import argparse
import csv
import gzip
import hashlib
import json
import platform
from pathlib import Path
from tempfile import mkdtemp

import numpy as np
import scipy
from PIL import Image, __version__ as pillow_version
from scipy.io import loadmat


PARTS = (
    ("Exp34_X1.tif", 5001, 1640260430, "3b7ef98e35cc318232fbbb0934aafcdb"),
    ("Exp34_X2.tif", 1401, 459508780, "c143e77a5ce2c63233fbc7ca5d1ad21d"),
    ("Exp34_X3.tif", 556, 182363026, "7f3a634d2276524693b4275c561680cd"),
)
REFERENCE_SHA256 = {
    "Exp34.mat": "448c8e6a025390bcc4d43deb434e656dc4c055862e59d85927c87f39888c05f1",
    "xxyy_init.mat": "b38ad03e0d8b29c146a709c089c46a5af01d74d10531a214c3328ad8641e8494",
}
SITE_COUNT = 198
ROUND_COUNT = 3479
FRAME_SHAPE = (301, 541)
THRESHOLD_TOL_COUNTS = 1e-9


def digest(path, kind):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, kind).hexdigest()


def verify_inputs(tiff_dir, reference_dir):
    verified = []
    for name, pages, size, md5 in PARTS:
        path = tiff_dir / name
        if path.stat().st_size != size or digest(path, "md5") != md5:
            raise ValueError(f"Figshare size or MD5 differs: {name}")
        verified.append({"name": name, "bytes": size, "md5": md5, "expected_pages": pages})
    for name, sha256 in REFERENCE_SHA256.items():
        path = reference_dir / name
        if digest(path, "sha256") != sha256:
            raise ValueError(f"Public MAT SHA-256 differs: {name}")
        verified.append({"name": name, "bytes": path.stat().st_size, "sha256": sha256})
    return verified


def tiff_pages(tiff_dir, parts):
    for name, expected_pages, _, _ in parts:
        with Image.open(tiff_dir / name) as source:
            for index in range(expected_pages):
                source.seek(index)
                pixels = np.array(source)
                if pixels.shape != FRAME_SHAPE or pixels.dtype.kind != "u" or pixels.dtype.itemsize != 2:
                    raise ValueError(f"Unexpected pixel array in {name} at page {index + 1}")
                yield name, index + 1, pixels
            try:
                source.seek(expected_pages)
            except EOFError:
                continue
            raise ValueError(f"{name} contains pages beyond its expected {expected_pages}")


def peak_centers(pixels_sum, initial):
    centers = []
    for x, y in initial:
        window = pixels_sum[y - 6:y + 5, x - 6:x + 5]
        if window.shape != (11, 11):
            raise ValueError(f"Initial position ({x}, {y}) is too close to the edge")
        row, column = np.unravel_index(window.ravel(order="F").argmax(), window.shape, order="F")
        centers.append((x + column - 5, y + row - 5))
    return np.array(centers)


def threshold_bins(counts):
    average = counts.mean()
    edges = np.linspace(average - 45, average + 75, 71)
    frequencies = np.histogram(counts, bins=edges)[0]
    selected = int(frequencies[9:25].argmin()) + 9
    return float(edges[selected]), edges.tolist(), frequencies.tolist(), selected + 1


def read_reference(reference_dir):
    reference = loadmat(reference_dir / "Exp34.mat", variable_names=["fluoAreshape", "fluodigreshape", "threshold"])
    positions = loadmat(reference_dir / "xxyy_init.mat", variable_names=["xx", "yy"])
    counts, bits, thresholds = (reference[name] for name in ("fluoAreshape", "fluodigreshape", "threshold"))
    initial = np.column_stack((positions["xx"].ravel(), positions["yy"].ravel())).astype(np.int64)
    if counts.shape != (SITE_COUNT, 2, ROUND_COUNT) or bits.shape != counts.shape or thresholds.shape != (SITE_COUNT, 1):
        raise ValueError("Unexpected dimensions in Exp34.mat")
    if initial.shape != (SITE_COUNT, 2):
        raise ValueError("Unexpected initial coordinate layout")
    counts = counts.transpose(0, 2, 1).reshape(SITE_COUNT, 2 * ROUND_COUNT)
    bits = bits.transpose(0, 2, 1).reshape(SITE_COUNT, 2 * ROUND_COUNT)
    sums = np.rint(counts * 25).astype(np.int64)
    if not np.array_equal(counts, sums / 25) or not np.array_equal(bits, counts >= thresholds):
        raise ValueError("Archive values disagree with the ROI count lattice or its digitization rule")
    return initial, sums, bits, thresholds.ravel()


def quantify(tiff_dir, reference_dir, output, center_audit):
    verified = verify_inputs(tiff_dir, reference_dir)
    initial, reference_sums, reference_bits, reference_thresholds = read_reference(reference_dir)
    previous = json.loads(center_audit.read_text(encoding="utf-8"))["centers_matlab_1based_xy"]
    previous_centers = {entry["site_1based"]: tuple(entry["count_aligned"]) for entry in previous}

    image_sum = np.zeros(FRAME_SHAPE, dtype=np.uint64)
    for _, _, pixels in tiff_pages(tiff_dir, PARTS):
        image_sum += pixels
    centers = peak_centers(image_sum, initial)
    print(f"Pass 1 complete. {SITE_COUNT} global centers located.", flush=True)

    relative = np.arange(-2, 3)
    columns = centers[:, 0, None, None] - 1 + relative[None, None, :]
    rows = centers[:, 1, None, None] - 1 + relative[None, :, None]
    sums = np.empty_like(reference_sums)
    pages = []
    for index, (name, page, pixels) in enumerate(tiff_pages(tiff_dir, PARTS)):
        sums[:, index] = pixels[rows, columns].sum(axis=(1, 2), dtype=np.int64)
        pages.append((name, page))
    if len(pages) != 2 * ROUND_COUNT:
        raise ValueError(f"The concatenation does not produce exactly {ROUND_COUNT} double-frame rounds")
    print("Pass 2 complete. ROI sums computed in global frame order.", flush=True)

    thresholds = []
    thresholds_on_reference_counts = []
    histograms = []
    counts = sums / 25
    reference_counts = reference_sums / 25
    for site, (series, reference_series) in enumerate(zip(counts, reference_counts, strict=True), start=1):
        value, edges, frequencies, selected = threshold_bins(series)
        reference_value, reference_edges, reference_frequencies, reference_selected = threshold_bins(reference_series)
        thresholds.append(value)
        thresholds_on_reference_counts.append(reference_value)
        histograms.append({"site_1based": site, "edges": edges, "frequencies": frequencies, "selected_bin_1based": selected,
                           "archived_count_replay": {"edges": reference_edges, "frequencies": reference_frequencies,
                                                     "selected_bin_1based": reference_selected}})
    thresholds = np.array(thresholds)
    thresholds_on_reference_counts = np.array(thresholds_on_reference_counts)
    bits = counts >= thresholds[:, None]
    bits_with_archived_thresholds = counts >= reference_thresholds[:, None]
    roi_diff = sums - reference_sums
    threshold_diff = thresholds - reference_thresholds

    with (output / "site-comparison.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["site_1based", "initial_x", "initial_y", "global_x", "global_y", "previous_refit_x", "previous_refit_y",
                         "threshold_counts", "archived_threshold_counts", "threshold_difference_counts",
                         "replayed_threshold_using_archived_counts",
                         "count_mismatches", "bit_mismatches", "bit_mismatches_at_archived_threshold", "max_abs_count_difference"])
        for site in range(SITE_COUNT):
            writer.writerow([site + 1, *initial[site], *centers[site], *previous_centers.get(site + 1, ("", "")),
                             thresholds[site], reference_thresholds[site], threshold_diff[site], thresholds_on_reference_counts[site],
                             np.count_nonzero(roi_diff[site]),
                             np.count_nonzero(bits[site] != reference_bits[site]),
                             np.count_nonzero(bits_with_archived_thresholds[site] != reference_bits[site]),
                             np.max(np.abs(roi_diff[site])) / 25])

    with gzip.open(output / "frame-comparison.csv.gz", "wt", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["part", "page_1based", "global_page_1based", "repetition_1based", "image_no", "site_1based",
                         "pixel_sum", "roi_counts", "archived_roi_counts", "difference_counts", "bit", "archived_bit",
                         "bit_at_archived_threshold"])
        for index, (name, page) in enumerate(pages):
            prefix = (name, page, index + 1, 1 + index // 2, 1 + index % 2)
            writer.writerows((*prefix, site + 1, sums[site, index], counts[site, index], reference_counts[site, index],
                              roi_diff[site, index] / 25, int(bits[site, index]), int(reference_bits[site, index]),
                              int(bits_with_archived_thresholds[site, index])) for site in range(SITE_COUNT))

    (output / "histograms.json").write_text(json.dumps(histograms, indent=2) + "\n", encoding="utf-8")
    summaries_by_part = []
    offset = 0
    for name, length, _, _ in PARTS:
        block = slice(offset, offset + length)
        summaries_by_part.append({"part": name, "global_pages_1based": [offset + 1, offset + length],
                                  "count_mismatches": int(np.count_nonzero(roi_diff[:, block])),
                                  "bit_mismatches": int(np.count_nonzero(bits[:, block] != reference_bits[:, block]))})
        offset += length
    summary = {
        "evidence": "87Rb cross-apparatus comparison with Kim Exp34",
        "inputs": verified,
        "script_sha256": digest(Path(__file__), "sha256"),
        "previous_roi_audit_sha256": digest(center_audit, "sha256"),
        "versions": {"python": platform.python_version(), "numpy": np.__version__, "pillow": pillow_version, "scipy": scipy.__version__},
        "parts": summaries_by_part,
        "repetitions": ROUND_COUNT,
        "site_frames": sums.size,
        "centers_different_from_initial": int(np.count_nonzero(np.any(centers != initial, axis=1))),
        "centers_matching_previous_refit": sum(tuple(centers[site - 1]) == xy for site, xy in previous_centers.items()),
        "previous_refit_sites": len(previous_centers),
        "exact_count_matches": int(np.count_nonzero(roi_diff == 0)),
        "maximum_abs_count_difference": float(np.max(np.abs(roi_diff)) / 25),
        "threshold_rule": "70 equal bins on [mean-45, mean+75], first minimum among bins 10-25, left edge",
        "threshold_comparison_tolerance_counts": THRESHOLD_TOL_COUNTS,
        "threshold_matches_within_tolerance": int(np.count_nonzero(np.abs(threshold_diff) <= THRESHOLD_TOL_COUNTS)),
        "maximum_abs_threshold_difference": float(np.max(np.abs(threshold_diff))),
        "threshold_matches_using_archived_counts": int(np.count_nonzero(
            np.abs(thresholds_on_reference_counts - reference_thresholds) <= THRESHOLD_TOL_COUNTS)),
        "bit_matches": int(np.count_nonzero(bits == reference_bits)),
        "bit_matches_at_archived_threshold": int(np.count_nonzero(bits_with_archived_thresholds == reference_bits)),
    }
    summary["output_sha256"] = {path.name: digest(path, "sha256") for path in sorted(output.iterdir())}
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tiff-dir", type=Path, required=True)
    parser.add_argument("--reference-dir", type=Path, required=True)
    parser.add_argument("--center-audit", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if args.output_dir.exists():
        parser.error("Select a new output directory")
    args.output_dir.parent.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix=f"{args.output_dir.name}.partial-", dir=args.output_dir.parent))
    print(f"Staging output: {output}", flush=True)
    quantify(args.tiff_dir, args.reference_dir, output, args.center_audit)
    if args.output_dir.exists():
        raise FileExistsError(args.output_dir)
    output.rename(args.output_dir)


if __name__ == "__main__":
    main()
