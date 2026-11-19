"""Tabulate Figure 2b classifications over the 10–200 counts playback range."""

import argparse
from bisect import bisect_left
import csv
from decimal import Decimal
from io import StringIO
from pathlib import Path


DERIVED = Path(__file__).resolve().parents[1] / "references/library/171yb/derived"
SOURCE = DERIVED / "senoo-fig2b-readout-pairs.csv"
OUTPUT = DERIVED / "senoo-fig2b-threshold-scan.csv"
GROUPS = ("spin1", "spin0", "loss")
OUTCOMES = ("m1", "m0", "double_low", "ambiguous")
LOWER = Decimal(10)
UPPER = Decimal(200)


def read_pairs() -> dict[str, list[tuple[Decimal, Decimal]]]:
    groups = {group: [] for group in GROUPS}
    seen = set()
    with SOURCE.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            group = row["prepared_group"]
            source_index = int(row["source_index"])
            key = (group, source_index)
            if group not in groups or key in seen or not 0 <= source_index < 255:
                raise ValueError(f"Unexpected group or duplicate/invalid index: {key}")
            pair = (Decimal(row["image1_counts"]), Decimal(row["image2_counts"]))
            if any(not value.is_finite() or value <= 0 for value in pair):
                raise ValueError(f"Invalid count at {key}: {pair}")
            groups[group].append(pair)
            seen.add(key)
    if any(len(pairs) != 255 for pairs in groups.values()):
        raise ValueError("Expected 255 paired observations in each Figure 2b group")
    return groups


def intervals(values):
    edges = sorted({UPPER, *(value for value in values if LOWER <= value <= UPPER)})
    return [(left, i == 0, right) for i, (left, right) in enumerate(zip([LOWER, *edges[:-1]], edges))]


def counts_at(first_high, first_low, second_threshold):
    # A count equal to its threshold is high, as in the playback rule.
    high_low = bisect_left(first_high, second_threshold)
    low_low = bisect_left(first_low, second_threshold)
    return high_low, len(first_low) - low_low, low_low, len(first_high) - high_low


def render_scan(groups) -> tuple[str, int, int]:
    first_intervals = intervals(p[0] for group in groups.values() for p in group)
    second_intervals = intervals(p[1] for group in groups.values() for p in group)
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow([
        "image1_lower", "image1_lower_inclusive", "image1_upper",
        "image2_lower", "image2_lower_inclusive", "image2_upper",
        *(f"{group}_{outcome}_count" for group in GROUPS for outcome in OUTCOMES),
    ])
    for first in first_intervals:
        first_threshold = first[2]
        split = [
            (
                sorted(y for x, y in group if x >= first_threshold),
                sorted(y for x, y in group if x < first_threshold),
            )
            for group in groups.values()
        ]
        for second in second_intervals:
            second_threshold = second[2]
            group_counts = [counts_at(high, low, second_threshold) for high, low in split]
            writer.writerow([*first, *second, *(count for row in group_counts for count in row)])
    return output.getvalue(), len(first_intervals), len(second_intervals)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated, first_count, second_count = render_scan(read_pairs())
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != generated:
            raise ValueError("The saved scan differs from the Figure 2b counts")
    else:
        OUTPUT.write_text(generated, encoding="utf-8")
    print(f"{first_count} × {second_count} = {first_count * second_count:,} threshold interval pairs")


if __name__ == "__main__":
    main()
