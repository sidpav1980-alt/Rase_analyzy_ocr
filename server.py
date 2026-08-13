
from flask import Flask, request, jsonify, send_from_directory
from pathlib import Path
import os, re, json, time
import requests
from PIL import Image
import io


def normalize_ford_payload(payload):
    if not isinstance(payload, dict):
        return payload
    raw=payload.get("ford_kms")
    if raw is None and isinstance(payload.get("fords"), list):
        raw=[x.get("km") for x in payload["fords"] if isinstance(x, dict)]
    try:
        pts=sorted(float(x) for x in (raw or []))
    except Exception:
        pts=[]
    groups=[]
    cur=None
    for km in pts:
        if cur is None or km-cur["start"] > 0.500001:
            if cur is not None:
                groups.append(cur)
            cur={"start":km,"end":km}
        else:
            cur["end"]=km
    if cur is not None:
        groups.append(cur)
    starts=[round(g["start"],1) for g in groups]
    payload["ford_kms"]=starts
    payload["ford_count"]=len(starts)
    payload["ford_labels"]=[f"{x:.1f}" for x in starts]
    return payload



def _group_ford_kms(kms, span_km=0.50):
    try:
        pts=sorted(float(x) for x in (kms or []))
    except Exception:
        return [], []
    groups=[]
    cur=None
    for km in pts:
        if cur is None or km-cur["start"] > span_km:
            if cur is not None:
                groups.append(cur)
            cur={"start":km,"end":km}
        else:
            cur["end"]=km
    if cur is not None:
        groups.append(cur)
    starts=[g["start"] for g in groups]
    labels=[f'{g["start"]:.1f}' for g in groups]
    return starts, labels

try:
    import pytesseract
except Exception:
    pytesseract=None

try:
    from ddgs import DDGS
except Exception:
    DDGS = None

ROOT=Path(__file__).resolve().parent
app=Flask(__name__, static_folder=str(ROOT), static_url_path="")

# OSM / Overpass
OVERPASS_ENDPOINTS=[
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]
UA={"User-Agent":"TrailRaceAnalyzer/0.37"}

# OpenRouter
OPENROUTER_API_KEY=os.getenv("OPENROUTER_API_KEY","").strip()
OPENROUTER_MODEL=os.getenv("OPENROUTER_MODEL","openrouter/free").strip()
SITE_URL=os.getenv("SITE_URL","").strip()

@app.get("/")
def home():
    return send_from_directory(ROOT,"index.html")

@app.post("/api/osm")
def osm_proxy():
    payload=request.get_json(silent=True) or {}
    query=str(payload.get("query","")).strip()
    if not query:
        return jsonify({"error":"empty query"}),400

    last_error=None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            r=requests.post(endpoint,data={"data":query},headers=UA)
            if r.ok:
                return jsonify(r.json())
            last_error=f"{endpoint} -> HTTP {r.status_code}"
        except Exception as e:
            last_error=f"{endpoint} -> {e}"

    return jsonify({"error":last_error or "all Overpass endpoints failed"}),502

def web_search_runner(name):
    if not DDGS:
        return []
    queries=[
        f'site:itra.run/RunnerSpace "{name}"',
        f'site:itra.run "{name}" "Performance Index"',
        f'"{name}" ITRA trail'
    ]
    out=[]
    seen=set()
    try:
        with DDGS() as ddgs:
            for q in queries:
                for r in ddgs.text(q,max_results=6):
                    url=r.get("href") or ""
                    title=r.get("title") or ""
                    body=r.get("body") or ""
                    k=(url,title,body)
                    if k in seen:
                        continue
                    seen.add(k)
                    if "itra.run" in url or "ITRA" in (title+" "+body):
                        out.append({"title":title,"url":url,"snippet":body})
                    if len(out)>=8:
                        break
                if len(out)>=8:
                    break
    except Exception:
        pass
    return out

def openrouter_extract(batch, api_key=None):
    key=(api_key or OPENROUTER_API_KEY).strip()
    if not key:
        raise RuntimeError("OpenRouter key не задан: добавьте OPENROUTER_API_KEY в Render или введите ключ в приложении")

    prompt={
        "task":"Match each athlete to the correct ITRA runner and extract current ITRA Performance Index only when explicitly supported by the provided search evidence.",
        "rules":[
            "Prefer official itra.run sources.",
            "Never guess a missing PI.",
            "Do not confuse race points, ranking position, year, distance or time with PI.",
            "Return strict JSON only."
        ],
        "schema":{"results":[{"name":"string","pi":"integer or null","source":"url or null","confidence":"0..1"}]},
        "athletes":batch
    }

    headers={
        "Authorization":f"Bearer {key}",
        "Content-Type":"application/json",
        "X-Title":"Trail Race Analyzer"
    }
    if SITE_URL:
        headers["HTTP-Referer"]=SITE_URL

    payload={
        "model":OPENROUTER_MODEL,
        "messages":[
            {"role":"system","content":"You are a conservative sports-data extraction engine. Return valid JSON only and never fabricate ITRA PI."},
            {"role":"user","content":json.dumps(prompt,ensure_ascii=False)}
        ],
        "temperature":0,
        "response_format":{"type":"json_object"}
    }

    r=requests.post("https://openrouter.ai/api/v1/chat/completions",headers=headers,json=payload)
    if not r.ok:
        raise RuntimeError(f"OpenRouter HTTP {r.status_code}: {r.text[:300]}")

    data=r.json()
    content=data["choices"][0]["message"]["content"]
    try:
        parsed=json.loads(content)
    except Exception:
        m=re.search(r"\{.*\}",content,re.S)
        if not m:
            raise RuntimeError("OpenRouter вернул не-JSON")
        parsed=json.loads(m.group(0))
    return parsed.get("results",[])



def parse_itra_profile_ref(profile):
    """Return candidate URLs plus exact runner token/id parsed from ITRA links or IDs."""
    p=(profile or "").strip()
    if p.startswith("http") and "itra.run/RunnerSpace/" not in p:
        raise RuntimeError("Invalid ITRA profile URL")
    if not p:
        return {"raw":"","urls":[],"runner_id":None,"slug":None}

    urls=[]
    runner_id=None
    slug=None

    # Full ITRA RunnerSpace URL.
    m=re.search(r"itra\.run/RunnerSpace/([^?#]+)",p,re.I)
    if m:
        tail=m.group(1).strip("/")
        parts=tail.split("/")
        if len(parts)>=2 and parts[-1].isdigit():
            runner_id=parts[-1]
            slug=parts[-2]
        else:
            # Old format: sidorenko.pavel.1840251
            m2=re.match(r"(.+)\.(\d+)$",tail)
            if m2:
                slug=m2.group(1)
                runner_id=m2.group(2)
            else:
                slug=tail

        urls.append(p if p.startswith("http") else "https://"+p)

    # Bare numeric runner id.
    elif p.isdigit():
        runner_id=p

    # Bare old-format slug with trailing numeric ID.
    else:
        m=re.match(r"(.+)\.(\d+)$",p)
        if m:
            slug=m.group(1)
            runner_id=m.group(2)
        else:
            slug=p

    # Build canonical-looking path used by current RunnerSpace pages:
    # sidorenko.pavel + 1840251 -> /RunnerSpace/SIDORENKO.Pavel/1840251
    if slug and runner_id:
        bits=slug.split(".")
        if len(bits)>=2:
            canon=".".join([bits[0].upper()]+[x[:1].upper()+x[1:].lower() for x in bits[1:]])
        else:
            canon=slug
        urls.append(f"https://itra.run/RunnerSpace/{canon}/{runner_id}")
        urls.append(f"https://itra.run/RunnerSpace/{slug}/{runner_id}")

    # Old URL form if we have both.
    if slug and runner_id:
        urls.append(f"https://itra.run/RunnerSpace/{slug}.{runner_id}")

    # Deduplicate.
    seen=set()
    urls=[u for u in urls if not (u in seen or seen.add(u))]
    return {"raw":p,"urls":urls,"runner_id":runner_id,"slug":slug}



def extract_pi_from_text(text):
    """
    Extract PI only from the explicit ITRA Performance Index section.
    This intentionally ignores arbitrary 3-digit numbers elsewhere on the page.
    """
    raw=text or ""

    # 1) JSON/API responses with explicit field names only.
    json_patterns=[
        r'"performanceIndex"\s*:\s*"?(\d{1,3})"?',
        r'"performance_index"\s*:\s*"?(\d{1,3})"?',
        r'"itraPi"\s*:\s*"?(\d{1,3})"?',
        r'"itraPI"\s*:\s*"?(\d{1,3})"?',
        r'"PerformanceIndex"\s*:\s*"?(\d{1,3})"?',
        r'"ITRAPerformanceIndex"\s*:\s*"?(\d{1,3})"?'
    ]
    for pat in json_patterns:
        m=re.search(pat,raw,re.I)
        if m:
            v=int(m.group(1))
            if 0 <= v <= 999:
                return v

    # 2) Convert HTML to compact visible text.
    import html as _html
    clean=_html.unescape(raw)
    clean=re.sub(r"<script\b[^>]*>.*?</script>"," ",clean,flags=re.I|re.S)
    clean=re.sub(r"<style\b[^>]*>.*?</style>"," ",clean,flags=re.I|re.S)
    clean=re.sub(r"<[^>]+>"," ",clean)
    clean=re.sub(r"\s+"," ",clean).strip()

    # 3) Isolate the first Performance Index block. Official RunnerSpace pages
    # expose text like:
    #   ITRA Performance Index ... 548 Advanced 3 General Stats
    # We only inspect that block, never the rest of the page.
    section_patterns=[
        r"ITRA\s+Performance\s+Index(.*?)(?:General\s+Stats|Finished\s+Races|Endurance\s+Points|ITRA\s+Performance\s+Index\s+Ranking)",
        r"Performance\s+Index(.*?)(?:General\s+Stats|Finished\s+Races|Endurance\s+Points|Performance\s+Index\s+Ranking)"
    ]
    for pat in section_patterns:
        m=re.search(pat,clean,re.I|re.S)
        if not m:
            continue
        section=m.group(1)[:1200]

        # The PI is the first standalone 1-3 digit score in this narrow block.
        # Ignore years/IDs/rankings because they are outside this section.
        nums=re.findall(r"(?<!\d)(\d{1,3})(?!\d)",section)
        for s in nums:
            v=int(s)
            if 0 <= v <= 999:
                return v

    # 4) Very tight text fallback: number must be directly bound to the label.
    tight_patterns=[
        r"\bITRA\s+Performance\s+Index\s*[:\-]?\s*(\d{1,3})\b",
        r"\bPerformance\s+Index\s*[:\-]?\s*(\d{1,3})\b",
        r"\bITRA\s+PI\s*[:\-]?\s*(\d{1,3})\b"
    ]
    for pat in tight_patterns:
        m=re.search(pat,clean,re.I)
        if m:
            v=int(m.group(1))
            if 0 <= v <= 999:
                return v

    return None

def extract_runner_api_urls(html, base_url="https://itra.run"):
    """Discover the internal RunnerSpace API URL/memberString from page HTML."""
    found=[]

    # Literal API URLs or paths embedded in HTML/JS.
    for m in re.finditer(r'((?:https://itra\.run)?/api/RunnerSpace/GetRunnerSpace\?[^"\'<>\s]+)', html or "", re.I):
        u=m.group(1).replace("&amp;","&")
        if u.startswith("/"):
            u=base_url+u
        found.append(u)

    # memberString/runnerString values embedded separately.
    for key in ("memberString","runnerString"):
        pats=[
            rf'{key}\s*[:=]\s*["\']([^"\']+)["\']',
            rf'["\']{key}["\']\s*:\s*["\']([^"\']+)["\']'
        ]
        for pat in pats:
            for m in re.finditer(pat,html or "",re.I):
                val=m.group(1).replace("\\u003d","=").replace("&amp;","&")
                from urllib.parse import quote
                found.append(f"https://itra.run/api/RunnerSpace/GetRunnerSpace?{key}={quote(val,safe='')}")

    seen=set()
    return [u for u in found if not (u in seen or seen.add(u))]

def fetch_itra_url(url):
    r=requests.get(url,headers={
        **UA,
        "Accept":"text/html,application/json;q=0.9,*/*;q=0.8",
        "Referer":"https://itra.run/"
    },allow_redirects=True)
    if not r.ok:
        raise RuntimeError(f"ITRA HTTP {r.status_code}")
    return r.text, r.url

def search_direct_itpa(name, profile):
    ref=parse_itra_profile_ref(profile)

    # 1) Exact supplied/canonical RunnerSpace URLs. No FIO search when profile is supplied.
    for url in ref["urls"]:
        try:
            html,final_url=fetch_itra_url(url)

            # Sometimes the page itself already contains PI.
            pi=extract_pi_from_text(html)
            if pi:
                return {"name":name or ref["raw"],"pi":pi,"source":final_url,"confidence":1.0}

            # Current ITRA RunnerSpace pages can load details through internal API.
            for api_url in extract_runner_api_urls(html):
                try:
                    api_text,api_final=fetch_itra_url(api_url)
                    pi=extract_pi_from_text(api_text)
                    if pi:
                        return {"name":name or ref["raw"],"pi":pi,"source":api_final,"confidence":1.0}
                except Exception:
                    pass
        except Exception:
            pass

    # 2) If Runner ID / profile was explicitly supplied, search by that exact reference only.
    if ref["raw"]:
        queries=[]
        if ref["runner_id"]:
            queries += [
                f'site:itra.run/RunnerSpace "{ref["runner_id"]}"',
                f'site:itra.run/api/RunnerSpace/GetRunnerSpace "{ref["runner_id"]}"'
            ]
        if ref["slug"]:
            queries += [
                f'site:itra.run/RunnerSpace "{ref["slug"]}"',
                f'site:itra.run "{ref["slug"]}" "Performance Index"'
            ]
    else:
        queries=[
            f'site:itra.run/RunnerSpace "{name}"',
            f'site:itra.run "{name}" "Performance Index"'
        ]

    if not DDGS:
        return None

    candidates=[]
    try:
        with DDGS() as ddgs:
            for q in queries:
                for r in ddgs.text(q,max_results=10):
                    u=r.get("href") or ""
                    title=r.get("title") or ""
                    body=r.get("body") or ""
                    if "itra.run" not in u:
                        continue
                    candidates.append(u)
    except Exception:
        pass

    # 3) Fetch official candidate pages/API results discovered by search.
    for u in candidates[:8]:
        try:
            text,final_url=fetch_itra_url(u)
            pi=extract_pi_from_text(text)
            if pi:
                return {"name":name or ref["raw"],"pi":pi,"source":final_url,"confidence":0.9}
            for api_url in extract_runner_api_urls(text):
                try:
                    api_text,api_final=fetch_itra_url(api_url)
                    pi=extract_pi_from_text(api_text)
                    if pi:
                        return {"name":name or ref["raw"],"pi":pi,"source":api_final,"confidence":0.9}
                except Exception:
                    pass
        except Exception:
            continue

    return None



@app.get("/api/ocr-health")
def ocr_health():
    import shutil as _shutil
    path=_shutil.which("tesseract")
    return jsonify({
        "ok": bool(path and pytesseract is not None),
        "tesseract_path": path,
        "pytesseract": pytesseract is not None,
        "version": "0.63"
    })

@app.post("/api/training-ocr")
def training_ocr():
    import shutil as _shutil
    tess=_shutil.which("tesseract")

    if pytesseract is None:
        return jsonify({"error":"pytesseract Python package is not installed"}),500
    if not tess:
        return jsonify({"error":"Tesseract OCR binary is not installed on Render"}),500

    f=request.files.get("image")
    if not f:
        return jsonify({"error":"Image is required"}),400

    try:
        raw=f.read()
        if not raw:
            return jsonify({"error":"Empty image"}),400

        img=Image.open(io.BytesIO(raw)).convert("L")

        # Resize to a sensible width; huge screenshots are slow on free Render.
        w,h=img.size
        target_w=1400
        if w>target_w:
            scale=target_w/w
            img=img.resize((target_w,max(1,int(h*scale))))
        elif w<900:
            scale=900/max(1,w)
            img=img.resize((900,max(1,int(h*scale))))

        # Slight thresholding improves UI screenshots.
        img=img.point(lambda p: 255 if p>175 else 0)

        try:
            text=pytesseract.image_to_string(
                img,
                lang="rus+eng",
                config="--psm 6"
            )
        except RuntimeError as e:
            if "timeout" in str(e).lower():
                return jsonify({"error":"OCR превысил 60 секунд. Повторите снова."}),504
            text=pytesseract.image_to_string(
                img,
                lang="eng",
                config="--psm 6"
            )

        text=re.sub(r"\n{3,}","\n\n",text or "").strip()
        return jsonify({"text":text})
    except Exception as e:
        return jsonify({"error":f"OCR failed: {e}"}),500


@app.post("/api/itra-batch")
def itra_batch():
    payload=request.get_json(silent=True) or {}
    manual_key=request.headers.get("X-OpenRouter-Key","").strip()
    names=[str(x).strip() for x in payload.get("names",[]) if str(x).strip()]
    names=names[:100]

    evidence=[]
    for name in names:
        evidence.append({"name":name,"search_results":web_search_runner(name)})
        time.sleep(0.05)

    all_results=[]
    batch_size=12
    for i in range(0,len(evidence),batch_size):
        batch=evidence[i:i+batch_size]
        extracted=openrouter_extract(batch, manual_key)
        by_name={str(x.get("name","")).strip().lower():x for x in extracted if isinstance(x,dict)}
        for item in batch:
            name=item["name"]
            x=by_name.get(name.lower(),{})
            pi=x.get("pi")
            try:
                pi=int(pi) if pi is not None else None
            except Exception:
                pi=None
            if pi is not None and not (100<=pi<900):
                pi=None
            all_results.append({
                "name":name,
                "pi":pi,
                "source":x.get("source"),
                "confidence":x.get("confidence")
            })

    return jsonify({
        "provider":"OpenRouter",
        "model":OPENROUTER_MODEL,
        "results":all_results
    })

@app.get("/health")
def health():
    return jsonify({
        "ok":True,
        "version":"0.40",
        "itra_enabled":bool(OPENROUTER_API_KEY),
        "model":OPENROUTER_MODEL
    })

if __name__=="__main__":
    app.run(host="0.0.0.0",port=int(os.getenv("PORT","10000")))


def _parse_width_m(tags):
    if not isinstance(tags, dict): return None
    raw=tags.get("width")
    if raw is None: return None
    s=str(raw).strip().lower().replace(",", ".")
    try:
        if "cm" in s:
            return float(re.sub(r"[^0-9.+-]", "", s))/100.0
        return float(re.sub(r"[^0-9.+-]", "", s))
    except Exception:
        return None

def _filter_and_dedupe_fords(fords):
    if not isinstance(fords, list):
        return []

    cleaned=[]
    for f in fords:
        if not isinstance(f, dict):
            continue
        w=f.get("width_m")
        if w is None:
            w=_parse_width_m(f.get("tags") or {})
        if w is not None and w < 1.0:
            continue
        if w is not None:
            f["width_m"]=w
        try:
            f["_km_num"]=float(f.get("km"))
        except Exception:
            continue
        cleaned.append(f)

    cleaned.sort(key=lambda x: x["_km_num"])

    # Cluster from the FIRST crossing of a group, max span 0.5 km.
    # This avoids transitive merging:
    # 6.3/6.5/6.7 => one ford, while 7.1/7.2 => another.
    out=[]
    current=None
    for f in cleaned:
        km=f["_km_num"]
        if current is None or km-current["km_start"] > 0.50:
            if current is not None:
                out.append(current)
            current=dict(f)
            current["km_start"]=km
            current["km_end"]=km
            current["crossing_count"]=1
        else:
            current["km_end"]=km
            current["crossing_count"]=current.get("crossing_count",1)+1

    if current is not None:
        out.append(current)

    for f in out:
        f["km"]=f["km_start"]
        if f["km_end"]-f["km_start"] >= 0.05:
            f["km_label"]=f'{f["km_start"]:.1f}–{f["km_end"]:.1f}'
        else:
            f["km_label"]=f'{f["km_start"]:.1f}'
        f.pop("_km_num",None)

    return out
