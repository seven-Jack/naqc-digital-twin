set -eu
work=/home/HXLIU/knottnerus-p1/p15-holdout-20261120T015715Z
unit=knottnerus-p15-holdout-20261120t015715z
cd "$work"
mkdir tmp
python3 -B admit.py > integrity.log
systemd-run --user --unit="$unit" -p RemainAfterExit=yes -p CPUQuota=100% -p MemoryMax=1G -p MemorySwapMax=0 -p WorkingDirectory="$work" -p StandardOutput="append:$work/compute.log" -p StandardError="append:$work/compute.log" --setenv=TMPDIR="$work/tmp" --setenv=OMP_NUM_THREADS=1 --setenv=OPENBLAS_NUM_THREADS=1 --setenv=MKL_NUM_THREADS=1 --setenv=BLIS_NUM_THREADS=1 --setenv=NUMEXPR_NUM_THREADS=1 --setenv=VECLIB_MAXIMUM_THREADS=1 /bin/bash "$work/run.sh"
cat admission.json
