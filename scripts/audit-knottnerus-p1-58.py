"""Audit the Knottnerus S23 P1_58 public pixel/log discrepancy under strict integer thresholds."""
import ast
import collections
import csv
import gzip
import hashlib
import io
import json
import math
import pickletools
import struct
import sys
from pathlib import Path
from zipfile import ZipFile

BASE = "Datapackage_SLM/data/241129_S23/"
CANDIDATE = 6436

def digest(data):
    return hashlib.sha256(data).hexdigest()

def read_npy_headers(path):
    # Do not unpickle object arrays. Use pickletools to locate STOP and list metadata keys.
    stream = io.BytesIO(path.read_bytes())
    records = []
    while stream.tell() < len(stream.getbuffer()):
        pos = stream.tell()
        assert stream.read(6) == b"\x93NUMPY"
        major, minor = stream.read(2)
        assert major in (1, 2, 3)
        hdr_len = int.from_bytes(stream.read(2 if major == 1 else 4), "little")
        hdr = ast.literal_eval(stream.read(hdr_len).decode("ascii"))
        rec = {"offset":pos, **hdr}
        if "O" in hdr["descr"]:
            ops = list(pickletools.genops(stream))
            assert ops[-1][0].name == "STOP"
            rec["opcodes"] = len(ops)
            rec["simple_metadata_strings"] = sorted({v for _,v,_ in ops if isinstance(v,str) and 2<=len(v)<180 and v.isascii() and v.isprintable()})
            rec["byte_payload_lengths"] = sorted({len(v) for _,v,_ in ops if isinstance(v,bytes)})
        else:
            assert hdr["descr"] in ("<f8",">f8")
            stream.seek(8*math.prod(hdr["shape"]),1)
        assert pos < stream.tell() <= len(stream.getbuffer())
        rec["stop"] = stream.tell()
        records.append(rec)
    return records

def cut_description(records):
    def rowkey(r): return dict(zip(("shot","frame","roi","counts","log"),r))
    empties = [r for r in records if not r[4]]
    ones = [r for r in records if r[4]]
    maxzero, minone = max(r[3] for r in empties), min(r[3] for r in ones)
    ids = lambda rs: [rowkey(r) for r in rs]
    cur = len(empties)
    best = cur
    intervals = []
    for_counts = collections.defaultdict(list)
    for r in records: for_counts[r[3]].append(r)
    keys = sorted(for_counts)
    for i, val in enumerate(keys):
        roi_rows = for_counts[val]
        cur += sum(1 if r[4] else -1 for r in roi_rows)
        if cur <= best:
            if cur < best:
                best, intervals = cur, []
            right = keys[i+1]-1 if i+1<len(keys) else None
            if intervals and intervals[-1][1]+1 == val: intervals[-1][1] = right
            else: intervals.append([val,right])
    return {"site_frames":len(records),"log0":len(empties),"log1":len(ones),
        "maximum_log0":ids(r for r in empties if r[3]==maxzero),
        "minimum_log1":ids(r for r in ones if r[3]==minone),
        "perfect_integer_interval": [maxzero,minone-1] if maxzero < minone else None,
        "min_errors":best, "optimal_integer_threshold_intervals":intervals,
        "candidate_errors":ids(r for r in records if (r[3] > CANDIDATE)!=bool(r[4])),
        "at_6480_errors":ids(r for r in records if (r[3] > 6480)!=bool(r[4])),
        "log1_above_6436_through_6480":ids(r for r in ones if CANDIDATE < r[3] <= 6480)}

def inspect(work):
    with gzip.open(work / "sites.csv.gz","rt",newline="") as f:
        rows = [tuple(int(r[k]) for k in ("shot","frame","roi","fixed_counts","log_bit")) for r in csv.DictReader(f)]
    assert len(rows) == len({r[:3] for r in rows}) == 7200
    with ZipFile(work / "p1-members.zip") as z:
        def member(name): return z.read(BASE+name)
        names = ("P1_58_1.tga","P1_58_2.tga","P1_58.dat","P1ROIs.dat","params.dat")
        hashes = {name:digest(member(name)) for name in names}
        dat = member("P1_58.dat").decode().split()
        assert dat[2:5]==["23","1","58"] and len(dat)==9
        boxes = [tuple(map(int,s.split())) for s in member("P1ROIs.dat").decode().splitlines()[4:] if s.strip()]
        params = {k:v for k,v,*_ in (s.split(";") for s in member("params.dat").decode().splitlines())}
        assert len(boxes)==36 and int(params["threshold"])==CANDIDATE
        p3=ast.literal_eval(params["rois"])[3]
        x,y,x1,y1 = boxes[3]
        assert p3 == [x,x1,y-80,y1-80] and x1-x==y1-y==3
        frames=[]
        for frame in (1,2):
            image=member(f"P1_58_{frame}.tga")
            w,h=struct.unpack_from("<HH",image,12)
            assert (w,h,len(image))==(100,180,18+2*100*180)
            px=struct.unpack_from("<18000H", image,18)
            patch=[list(px[j*w+x-1:j*w+x1+1]) for j in range(y-1,y1+1)]
            center=[row[1:4] for row in patch[1:4]]
            neighborhood=[[sum(sum(row[i:i+3]) for row in patch[j:j+3]) for i in range(3)] for j in range(3)]
            counts=sum(map(sum,center))
            log=int(dat[frame-3][3])
            assert counts==neighborhood[1][1] and (58,frame,3,counts,log) in rows
            frames.append({"frame":frame,"patch5x5":patch,"fixed_pixels":center,"sums_rows_dy_columns_dx_minus1_to1":neighborhood,
               "fixed_sum":counts,"max_sum":max(map(max,neighborhood)),"log_bit":log,"binary_log":dat[frame-3],"threshold_margin":counts-CANDIDATE})
    avg=(work/"Average.dat").read_text().splitlines()
    hdr=avg[0].split()
    avrows=[dict(zip(hdr,s.split(),strict=True)) for s in avg[1:] if s.strip()]
    a,=[r for r in avrows if r["DataSetNr"]=="1"]
    assert a["NrIdentRuns"]=="100"
    agg={prefix:[float(a[f"{prefix}ROI{i}"]) for i in range(36)] for prefix in ("Pic0","Pic1")}
    obs={f:[sum(r[4] for r in rows if r[1]==f and r[2]==i) for i in range(36)] for f in (1,2)}
    avga={"P1_repetitions":100, "table_points":len(avrows),"record_time":[a["Date"],a["Time"]],
          "Pic0ROI3":agg["Pic0"][3],"Pic1ROI3":agg["Pic1"][3],
          "all36_Average_Pic0_equal_Average_Pic1":agg["Pic0"]==agg["Pic1"],
          "site_columns_matching_per100_log":{k:{f:sum(round(p*100)==j for p,j in zip(v,obs[f])) for f in (1,2)} for k,v in agg.items()},
          "per_shot_log_occupied_ROI3_of_100":{f:obs[f][3] for f in (1,2)}}
    cuts={k:cut_description(rs) for k, rs in {"all":rows, "Pic1":[r for r in rows if r[1]==1],
        "ROI3_both_frames":[r for r in rows if r[2]==3],
        "ROI3_Pic1":[r for r in rows if r[1:3]==(1,3)]}.items()}
    return {"source":"Knottnerus 88Sr public S23 P1, cross-apparatus comparison","candidate_strict_gt":CANDIDATE,
        "raw_member_hashes":hashes,"shot_timestamp":dat[:2], "native_xyxy_half_open":boxes[3],
        "params_cropped_xx_yy_half_open":p3,"frames":frames,"strict_integer_constraints":cuts,
        "Average":avga,"npy_headers_no_pickle_execution":read_npy_headers(work/"measurement_on_241129_1604.npy")}
if __name__ == "__main__":
    print(json.dumps(inspect(Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")),indent=2))
