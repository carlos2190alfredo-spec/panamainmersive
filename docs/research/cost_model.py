# Cost model v0 — every input is an ASSUMPTION (see docs/costs.md). Prices: secondary sources, 2026-10-20, UNVERIFIED vs vendor pages.
SC = [1_000, 10_000, 100_000, 1_000_000]
A = dict(
  sessions_per_mau=2.0,            # sessions / month / MAU
  share_3d=0.0,                    # share of sessions that start a Google photoreal 3D scene (0 at MVP: no coverage evidence, no key)
  tile_reqs_per_session=180,       # PMTiles Range reads per 2D session (assumption; to be measured)
  tile_mb_per_session=2.5,         # MB tiles per session (assumption; to be measured; CDN-served)
  page_mb_per_session=1.2,         # MB JS/HTML/media from app host per session (assumption)
  pages_edge_req_per_session=40,   # edge requests per session hitting app host (assumption)
  fn_invocations_per_session=12,   # SSR/API invocations per session (assumption)
  routing_per_mau=1.0,             # route computations / MAU / month (self-hosted)
  cache_hit=0.90,                  # CDN cache-hit ratio on tile reads (assumption; Class B ops only on misses)
  r2_storage_gb=8,                 # PMTiles + packs + media (assumption)
)
P = dict(  # secondary-source prices
  vercel_seat=20.0, vercel_incl_transfer_gb=1000, vercel_gb=0.15, vercel_incl_edge_m=10, vercel_edge_per_m=2.0, vercel_fn_per_m=0.60,
  r2_gb_month=0.015, r2_classB_per_m=0.36,
  supabase_pro=25.0,
  google_3d_per_1000_root=6.0,
  valhalla_vm=40.0,
)
def model(mau, a=A, p=P):
    s = mau * a["sessions_per_mau"]
    web_gb = s * a["page_mb_per_session"] / 1024
    edge_m = s * a["pages_edge_req_per_session"] / 1e6
    fn_m = s * a["fn_invocations_per_session"] / 1e6
    vercel = p["vercel_seat"] + max(0, web_gb - p["vercel_incl_transfer_gb"]) * p["vercel_gb"] + max(0, edge_m - p["vercel_incl_edge_m"]) * p["vercel_edge_per_m"] + fn_m * p["vercel_fn_per_m"]
    tile_ops_m = s * a["tile_reqs_per_session"] * (1 - a["cache_hit"]) / 1e6
    r2 = a["r2_storage_gb"] * p["r2_gb_month"] + tile_ops_m * p["r2_classB_per_m"]
    compute = {1_000: 0, 10_000: 0, 100_000: 60, 1_000_000: 410}[mau]  # supabase compute add-on guess tiers (small / medium / large+replica) — ASSUMPTION
    supabase = p["supabase_pro"] + compute
    g3d = s * a["share_3d"] * p["google_3d_per_1000_root"] / 1000
    routing = p["valhalla_vm"] * (1 if mau <= 100_000 else 3)
    tot = vercel + r2 + supabase + g3d + routing
    return dict(mau=mau, sessions=s, web_gb=round(web_gb, 1), tile_gb_cdn=round(s * a["tile_mb_per_session"] / 1024, 1), vercel=round(vercel, 2), r2=round(r2, 2), supabase=round(supabase, 2), google3d=round(g3d, 2), routing=routing, total=round(tot, 2))
print("BASE (share_3d=0):")
for m in SC: print(model(m))
print("\nSENSITIVITY share_3d=0.15 (if Google 3D were verified & enabled):")
for m in SC: 
    a=dict(A, share_3d=0.15); r=model(m,a); print(m, "google3d=", r["google3d"], "total=", r["total"])
print("\nSENSITIVITY cache_hit=0.5, tile_reqs=400:")
for m in SC:
    a=dict(A, cache_hit=0.5, tile_reqs_per_session=400); r=model(m,a); print(m, "r2=", r["r2"], "total=", r["total"])
