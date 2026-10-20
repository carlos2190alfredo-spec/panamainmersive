"""Spike: search Overture rows by name for destination keywords (accent/case-insensitive). Writes JSONL of hits."""
import sys, json, unicodedata, time
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import pyarrow.parquet as pq, fsspec
from ov_extract import list_keys, HOST, rg_overlaps, PA
from shapely import wkb

def norm(s): return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(c) != "Mn")
KEYS = ["casco", "panama viejo", "canal de panama", "miraflores", "gatun", "gamboa", "valle de anton", "el valle", "anton", "boquete", "volcan baru", "baru", "bocas del toro", "isla colon", "santa catalina", "coiba", "gulf of chiriqui", "golfo de chiriqui"]
theme, typ = sys.argv[1], sys.argv[2]
out = open(sys.argv[3], "w")
fs = fsspec.filesystem("https"); n = hits = 0; t = time.time()
for k in list_keys(theme, typ):
    with fs.open(HOST + k, "rb", block_size=4 * 2**20) as f:
        pf = pq.ParquetFile(f); md = pf.metadata
        idx = {md.row_group(0).column(i).path_in_schema: i for i in range(md.row_group(0).num_columns)}
        cols = [c for c in ("id","names","subtype","class","bbox","geometry","basic_category","taxonomy","confidence","sources","wikidata","operating_status") if c in pf.schema_arrow.names]
        for g in range(md.num_row_groups):
            if not rg_overlaps(md.row_group(g), idx): continue
            tbl = pf.read_row_group(g, columns=cols)
            for r in tbl.to_pylist():
                n += 1
                b = r["bbox"]
                if b["xmax"] < PA[0] or b["xmin"] > PA[2] or b["ymax"] < PA[1] or b["ymin"] > PA[3]: continue
                nm = r.get("names") or {}
                prim = nm.get("primary") or ""
                if any(x in norm(prim) for x in KEYS):
                    geom = wkb.loads(r["geometry"])
                    out.write(json.dumps({"theme": theme, "type": typ, "id": r["id"], "name": prim, "subtype": r.get("subtype"), "class": r.get("class"), "cat": (r.get("basic_category") or (r.get("taxonomy") or {}).get("primary") if isinstance(r.get("taxonomy"), dict) else r.get("basic_category")), "geom": geom.geom_type, "bbox": [round(b[k], 4) for k in ("xmin","ymin","xmax","ymax")], "wikidata": r.get("wikidata"), "sources": [s.get("dataset") for s in (r.get("sources") or [])][:3]}, ensure_ascii=False, default=str) + "\n"); hits += 1
print(f"{theme}/{typ}: scanned {n:,} rows, {hits} hits in {time.time()-t:.0f}s", flush=True)
