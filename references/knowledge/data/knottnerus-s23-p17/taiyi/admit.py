"""Check the frozen package and available resources immediately before the single-core run."""
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time

def counters():
    fields = list(map(int, Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
    return sum(fields), sum(fields[3:5])

def memory():
    return int(next(s.split()[1] for s in Path('/proc/meminfo').read_text().splitlines() if s.startswith('MemAvailable:')))

def main():
    subprocess.run(['sha256sum','-c','input-sha256.txt'], check=True)
    a, m0 = counters(), memory()
    time.sleep(3)
    b, m1 = counters(), memory()
    idle = os.cpu_count() * (b[1] - a[1]) / (b[0] - a[0])
    free = shutil.disk_usage('.').free
    active = subprocess.check_output(['systemctl','--user','list-units','--state=running','--type=service','--no-pager','--no-legend'],text=True).splitlines()
    # Includes 1 CPU and 1 GiB job budget, with spare host capacity.
    allowed = (idle >= 2 and min(m0,m1) >= 2 * 1024**2 and free >= 1024**3 and len(os.sched_getaffinity(0)) > 0)
    report = {'timestampUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'host':socket.gethostname(),
        'residence':str(Path.cwd()),'logicalCores':os.cpu_count(),'sampleSeconds':3,'idleEquivalentCores':idle,
        'availableMemoryKiB':[m0,m1],'diskFreeBytes':free,'activeUserServices':active,
        'inputSha256Verified':True,'CPUQuota':'100%','MemoryMaxBytes':1024**3,'MemorySwapMaxBytes':0,
        'admission':'pass' if allowed else 'hold'}
    Path('admission.json').write_text(json.dumps(report,indent=2)+'\n')
    if not allowed: raise SystemExit('insufficient available capacity')

if __name__=='__main__': main()
