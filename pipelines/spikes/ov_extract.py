"""Spike: extract Panama rows from Overture parquet using row-group bbox pruning over HTTP Range."""
import sys, json, time, xml.etree.ElementTree as ET
import pyarrow.parquet as pq, fsspec, requests
from shapely import wkb, geometry

REL = "2026-09-23.1"
HOST = "https://overturemaps-us-west-2.s3.amazonaws.com/"
PA = (-83.2, 6.9, -77.0, 9.8)  # xmin,ymin,xmax,ymax (lon/lat)
NS = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}

def list_keys(theme, typ):
    u = f"{HOST}?list-type=2&prefix=release/{REL}/theme={theme}/type={typ}/"
    x = ET.fromstring(requests.get(u, timeout=30).content)
    return [c.find("s:Key", NS).text for c in x.findall("s:Contents", NS)]

def rg_overlaps(rg, idx):
    def st(name):
        c = rg.column(idx[name]).statistics
        return (c.min, c.max) if c is not None and c.has_min_max else None
    xmin, xmax, ymin, ymax = st("bbox.xmin"), st("bbox.xmax"), st("bbox.ymin"), st("bbox.ymax")
    if not all((xmin, xmax, ymin, ymax)):
        return True
    return not (xmax[1] < PA[0] or xmin[0] > PA[2] or ymax[1] < PA[1] or ymin[0] > PA[3])

def extract(theme, typ, cols, keep):
    fs = fsspec.filesystem("https")
    out = []
    for k in list_keys(theme, typ):
        with fs.open(HOST + k, "rb", block_size=4 * 2**20) as f:
            pf = pq.ParquetFile(f)
            md = pf.metadata
            idx = {md.row_group(0).column(i).path_in_schema: i for i in range(md.row_group(0).num_columns)}
            sel = [g for g in range(md.num_row_groups) if rg_overlaps(md.row_group(g), idx)]
            for g in sel:
                t = pf.read_row_group(g, columns=cols).to_pylist()
                for r in t:
                    b = r["bbox"]
                    if b["xmax"] < PA[0] or b["xmin"] > PA[2] or b["ymax"] < PA[1] or b["ymin"] > PA[3]:
                        continue
                    if keep(r):
                        out.append(r)
            print(f"  {k.split('/')[-1][:14]} rg {len(sel)}/{md.num_row_groups} -> rows so far {len(out)}", flush=True)
    return out

if __name__ == "__main__":
    theme, typ, outname = sys.argv[1], sys.argv[2], sys.argv[3]
    cols = sys.argv[4].split(",")
    t = time.time()
    rows = extract(theme, typ, cols, lambda r: r.get("country") == "PA" if "country" in r else True)
    feats = []
    for r in rows:
        g = wkb.loads(r.pop("geometry"))
        feats.append({"type": "Feature", "geometry": geometry.mapping(g), "properties": {k: v for k, v in r.items() if k != "bbox"} | {"bbox": [r["bbox"][k] for k in ("xmin","ymin","xmax","ymax")]}})
    json.dump({"type": "FeatureCollection", "features": feats}, open(outname, "w"), default=str)
    print(typ, len(feats), "features in %.0fs" % (time.time() - t))
