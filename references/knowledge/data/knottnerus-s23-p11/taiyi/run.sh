set -eu
py=/home/HXLIU/Calculation/.venv-rydcalc/bin/python
"$py" -B audit-knottnerus-s23-holdout.py p11-members.zip source-manifest.json freeze.json results
"$py" -B verify-knottnerus-s23-holdout.py p11-members.zip freeze.json results results/independent.json
sha256sum results/* > result-sha256.txt
echo "Completed P11 primary replay and independent verification."
