import sys, pyarrow.parquet as pq, fsspec, requests, xml.etree.ElementTree as ET
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from ov_extract import list_keys, HOST, rg_overlaps, PA
fs = fsspec.filesystem("https")
for theme, typ in [("base","water"),("base","land"),("base","land_use"),("base","land_cover"),("base","infrastructure"),("base","bathymetry"),("transportation","segment"),("places","place")]:
    ks = list_keys(theme, typ)
    tot_rg = sel_rg = rows = 0
    sel_rows = 0
    cols = None
    for k in ks:
        with fs.open(HOST + k, "rb", block_size=2**22) as f:
            pf = pq.ParquetFile(f); md = pf.metadata
            if cols is None: cols = pf.schema_arrow.names
            idx = {md.row_group(0).column(i).path_in_schema: i for i in range(md.row_group(0).num_columns)}
            for g in range(md.num_row_groups):
                tot_rg += 1
                if rg_overlaps(md.row_group(g), idx):
                    sel_rg += 1; sel_rows += md.row_group(g).num_rows
    print(f"{theme}/{typ}: files={len(ks)} rowgroups {sel_rg}/{tot_rg} candidate_rows~{sel_rows:,}\n   cols={cols}", flush=True)
