set -eu
cd /home/HXLIU/knottnerus-p1/p13-holdout-20261120T011929Z
unit=knottnerus-p13-holdout-20261120t011929z.service
systemctl --user show "$unit" -p Id -p SubState -p Result -p ExecMainStatus -p ExecMainStartTimestamp -p ExecMainExitTimestamp -p CPUUsageNSec -p MemoryPeak -p CPUQuotaPerSecUSec -p MemoryMax -p MemorySwapMax > compute-unit-final.log
cat compute-unit-final.log >&2
if ! test "$(systemctl --user show "$unit" -p SubState --value)" = exited; then cat compute.log >&2; exit 3; fi
test "$(systemctl --user show "$unit" -p Result --value)" = success
sha256sum -c result-sha256.txt >&2
tar -czf return.tar.gz admission.json input-sha256.txt integrity.log compute.log compute-unit-final.log result-sha256.txt results
sha256sum return.tar.gz >&2
cat return.tar.gz
