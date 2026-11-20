"""Report P19 count ranges and sites called occupied by the log or the candidate rule."""
import csv
import gzip
import hashlib
import json
import sys
from pathlib import Path


def main():
    path = Path(sys.argv[1])
    with gzip.open(path, "rt", newline="") as stream:
        rows = list(csv.DictReader(stream))
    summary = {"source": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "frames": {}}
    for frame in ("1", "2"):
        sites = [r for r in rows if r["frame"] == frame]
        counts = [int(r["counts"]) for r in sites]
        summary["frames"][frame] = {
            "site_decisions": len(sites),
            "min_counts": min(counts),
            "max_counts": max(counts),
            "logged_occupied": sum(int(r["log_bit"]) for r in sites),
            "fixed_occupied": sum(int(r["fixed_bit"]) for r in sites),
            "occupied_sites": [
                {key: int(row[key]) for key in ("shot", "roi", "counts", "target", "log_bit", "fixed_bit")}
                for row in sites if row["log_bit"] == "1" or row["fixed_bit"] == "1"
            ],
        }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
