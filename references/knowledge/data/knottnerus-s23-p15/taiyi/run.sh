set -eu
py=/home/HXLIU/Calculation/.venv-rydcalc/bin/python
"$py" -B audit-knottnerus-s23-holdout.py p15-members.zip source-manifest.json freeze.json results
"$py" -B verify-knottnerus-s23-holdout.py p15-members.zip freeze.json results results/independent.json
"$py" -B inspect_counts.py results/sites.csv.gz > count-ranges.json
sha256sum count-ranges.json > count-ranges-sha256.txt
sha256sum results/* > result-sha256.txt
echo "Completed P15 primary replay and independent verification."
