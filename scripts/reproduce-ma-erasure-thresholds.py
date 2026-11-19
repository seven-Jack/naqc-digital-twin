"""Reproduce the 24 published thresholds in Ma et al., Nature 622, Fig. 2g."""

import argparse
import csv
from decimal import Decimal
from hashlib import sha256
from io import StringIO
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "references/library/171yb/yb-ma-erasure-dataverse-v2/Fig2.csv"
SOURCE_SHA256 = "64f8d65d5d268da38211ddb529f4a900ce109835b1975198c75c1a770e8aee7b"
OUTPUT = ROOT / "references/knowledge/data/ma-fig2g-threshold-scan.csv"
FIGURE = OUTPUT.with_suffix(".png")
SOURCE_COLUMNS = [
    "Fig2g_P(err.|det.)_x",
    "Fig2g_P(err.|det.)_y",
    "Fig2g_P(err.|det.)_yerr",
    "Fig2g_(e-e_c)/e_x",
    "Fig2g_(e-e_c)/e_y",
    "Fig2g_(e-e_c)/e_yerr",
]


def read_scan():
    original = SOURCE.read_bytes()
    if sha256(original).hexdigest() != SOURCE_SHA256:
        raise ValueError("Fig2.csv does not match the archived Dataverse V2 original")

    reader = csv.DictReader(StringIO(original.decode("utf-8"), newline=""))
    if reader.fieldnames[19:25] != SOURCE_COLUMNS:
        raise ValueError("Unexpected Fig. 2g columns T:Y")

    points = []
    for row_number, row in enumerate(reader, start=2):
        cells = [row[column] for column in SOURCE_COLUMNS]
        if not any(cells):
            continue
        if not all(cells):
            raise ValueError(f"Incomplete threshold entry at T{row_number}:Y{row_number}")

        threshold, prob, prob_sd, second_threshold, fraction, fraction_sd = map(Decimal, cells)
        expected = Decimal("262.5") + Decimal("162.5") * len(points)
        if threshold != second_threshold or threshold != expected:
            raise ValueError(f"Mismatched threshold at T{row_number}:Y{row_number}")
        if not all(value.is_finite() and 0 <= value <= 1 for value in (prob, prob_sd, fraction, fraction_sd)):
            raise ValueError(f"Invalid central value or standard deviation at T{row_number}:Y{row_number}")

        # Retain the exact decimal text of each published value.
        points.append((row_number, f"T{row_number}:Y{row_number}", *cells[:3], *cells[4:]))

    if len(points) != 24:
        raise ValueError(f"Expected 24 thresholds, found {len(points)}")
    return points


def csv_text(points):
    exported = StringIO(newline="")
    writer = csv.writer(exported, lineterminator="\n")
    writer.writerow([
        "source_row", "source_cell_range", "threshold_counts",
        "p_error_given_detection", "p_error_given_detection_sd",
        "erasure_fraction", "erasure_fraction_sd",
    ])
    writer.writerows(points)
    return exported.getvalue()


def plot_scan(points):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    x, probability, probability_sd, fraction, fraction_sd = zip(
        *(map(float, point[2:]) for point in points), strict=True
    )
    fig, (top, bottom) = plt.subplots(2, 1, sharex=True, figsize=(6.1, 4.8), layout="constrained")
    for ax, y, sd, color, panel in [
        (top, probability, probability_sd, "#0072B2", "a"),
        (bottom, fraction, fraction_sd, "#009E73", "b"),
    ]:
        ax.errorbar(x, y, yerr=sd, color=color, fmt="o", markersize=3.5,
                    elinewidth=0.9, capsize=2.4, zorder=3)
        ax.axvline(700, color="#62686d", linewidth=0.8, linestyle=(0, (2, 3)), zorder=1)
        ax.text(0.02, 0.94, panel, transform=ax.transAxes, va="top", fontsize=10, fontweight="bold")
        ax.spines[["top", "right"]].set_visible(False)
        ax.tick_params(direction="out", labelsize=9)
    top.set_title("Published thresholds in Ma et al. Fig. 2g", loc="left", fontsize=11, pad=9)
    top.set_ylabel("P(error | detection)", fontsize=10)
    top.set_ylim(0.24, 1.08)
    top.text(770, 0.29, "Fig. 2e uses ~700 counts", fontsize=8, color="#4b5156")
    bottom.set_ylabel(r"Erasure fraction $(\epsilon-\epsilon_c)/\epsilon$", fontsize=10)
    bottom.set_xlabel("Camera-count threshold", fontsize=10)
    bottom.set_ylim(-0.08, 0.69)
    bottom.axhline(0, color="#aeb4b7", linewidth=0.65, zorder=1)
    bottom.set_xlim(0, 4200)
    bottom.set_xticks([0, 1000, 2000, 3000, 4000])
    fig.savefig(FIGURE, dpi=300, facecolor="white")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    options = parser.add_mutually_exclusive_group()
    options.add_argument("--check", action="store_true", help="check the saved CSV against the original")
    options.add_argument("--plot", action="store_true", help="also render the published error bars with Matplotlib")
    args = parser.parse_args()

    points = read_scan()
    exported = csv_text(points)
    if args.check:
        if OUTPUT.read_bytes() != exported.encode("utf-8"):
            raise SystemExit("Saved CSV differs from the figure source. Regenerate it before use.")
    else:
        OUTPUT.write_bytes(exported.encode("utf-8"))
    if args.plot:
        plot_scan(points)

    print(f"{len(points)} shared Fig. 2g thresholds checked, {points[0][2]}–{points[-1][2]} camera counts")


if __name__ == "__main__":
    main()
