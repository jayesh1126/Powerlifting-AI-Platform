from pathlib import Path
import json
import os
import datetime

from dotenv import load_dotenv
from openai import OpenAI
import yaml
import yt_dlp
import httpx
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
SEEDS = ROOT / "seeds.yaml"

load_dotenv(ROOT / ".env")
client = OpenAI(api_key=os.environ["OPENROUTER_API_KEY"], base_url="https://openrouter.ai/api/v1")
SOURCES = ROOT / "sources.yaml"

KEEP_THRESHOLD = 7          # tune down to 6 if trusted channels contribute too few
SCORE_MODEL = "openai/gpt-4.1-mini"
BATCH = 15
SCORE_SYSTEM = """You curate sources for a strength & powerlifting coaching knowledge base.
It answers questions on:
- squat / bench / deadlift technique
- programming (volume, intensity, RPE, periodisation, peaking, deloads)
- competition prep and rules
- injuries, rehab, pain management, mobility and prehab FOR LIFTERS

Score each item 0-10 as a SOURCE, on two axes:
- RELEVANCE: is it about any of the above? Rehab / anatomy / mobility / pain /
  movement content is HIGH relevance when it helps a lifter prevent or train
  around injury — it need NOT be powerlifting-branded. LOW relevance: general
  bodybuilding/aesthetics, longevity, metabolism trivia, supplement hype, vlogs,
  drama, reactions, broad unfocused Q&A podcasts.
- SPECIFICITY: concrete, actionable content (cues, drills, protocols, numbers)
  vs. vague or entertainment titles.

If a "Channel focus" is given, judge relevance toward that focus.

You only get the title and duration. Long (>60 min) usually = broad podcast.
Be strict — a 7+ should be genuinely useful to a lifter.

Return JSON: {"scores":[{"title":"<verbatim title>","score":int,"reason":"<=8 words"}]}"""

SKIP_SEGMENTS = {"category", "tag", "author", "page", "feed", "wp-content", "wp-json", "about", "contact"}

def discover_articles(index_url: str, limit: int = 60) -> list[dict]:
    resp = httpx.get(index_url, timeout=30, follow_redirects=True,
                     headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    host = urlparse(index_url).netloc

    items, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = urljoin(index_url, a["href"].split("#")[0]).rstrip("/")
        p = urlparse(href)
        if p.netloc != host:                                   # same site only
            continue
        segments = [s for s in p.path.split("/") if s]
        if not segments or any(s in SKIP_SEGMENTS for s in segments):
            continue                                           # homepage / nav / taxonomy
        if href in seen or href == index_url.rstrip("/"):
            continue
        title = a.get_text(strip=True) or segments[-1].replace("-", " ")
        if len(title) < 10:                                    # skip nav-ish stubs
            continue
        seen.add(href)
        items.append({"title": title, "url": href, "duration": None})
        if len(items) >= limit:
            break
    return items

def list_channel_videos(channel_url: str, limit: int) -> list[dict]:
    url = channel_url.rstrip("/")
    if not url.endswith("/videos"):
        url += "/videos"
    opts = {
        "extract_flat": "in_playlist",   # fast: don't resolve each video fully
        "playlistend": limit,
        "quiet": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    videos = []
    for e in info.get("entries", []) or []:
        vid = e.get("id")
        videos.append({
            "title": e.get("title"),
            "url": e.get("url") or (f"https://www.youtube.com/watch?v={vid}" if vid else None),
            "duration": e.get("duration"),      # seconds, may be None in flat mode
            "views": e.get("view_count"),       # may be None in flat mode
        })
    return videos

def _norm(t: str) -> str:
    return (t or "").strip().lower()

def score_videos(videos: list[dict], focus: str | None = None) -> list[dict]:
    out = []
    for i in range(0, len(videos), BATCH):
        out.extend(_score_batch(videos[i:i + BATCH], focus))
    return out


def _score_batch(videos: list[dict], focus: str | None = None) -> list[dict]:
    header = f"Channel focus: {focus}\n\n" if focus else ""
    listing = header + "\n".join(
        f"- [{(v['duration'] // 60) if v['duration'] else '?'}m] {v['title']}"
        for v in videos
    )
    resp = client.chat.completions.create(
        model=SCORE_MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SCORE_SYSTEM},
            {"role": "user", "content": listing},
        ],
    )
    scored = json.loads(resp.choices[0].message.content or "{}").get("scores", [])
    by_title = {_norm(s.get("title", "")): s for s in scored}

    out = [{**v, "score": by_title.get(_norm(v["title"]), {}).get("score", 0),
            "reason": by_title.get(_norm(v["title"]), {}).get("reason", "")}
           for v in videos]

    missed = sum(1 for v in out if _norm(v["title"]) not in by_title)
    if missed:
        print(f"  WARN: {missed}/{len(videos)} videos went unscored (title mismatch)")
    return out

def existing_source_urls() -> set[str]:
    if not SOURCES.exists():
        return set()
    data = yaml.safe_load(SOURCES.read_text(encoding="utf-8")) or []
    return {e.get("url") for e in data if isinstance(e, dict)}


def append_sources(entries: list[dict], source_label: str, kind: str = "youtube") -> None:
    if not entries:
        return
    lines = [f"\n# --- curated {datetime.date.today()} from {source_label} ---"]
    for e in entries:
        lines.append(f"- url: {e['url']}")
        lines.append(f"  type: {kind}  # {e['score']} · {e['reason']}")
    with SOURCES.open("a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main() -> None:
    seeds = yaml.safe_load(SEEDS.read_text(encoding="utf-8")) or {}
    seen = existing_source_urls()
    for ch in (seeds.get("channels") or []):
        url = ch if isinstance(ch, str) else ch["url"]
        focus = None if isinstance(ch, str) else ch.get("focus")
        print(f"\n=== {url} ===")
        videos = list_channel_videos(url, limit=50)
        scored = score_videos(videos, focus)
        keep = [v for v in scored
                if v["score"] >= KEEP_THRESHOLD and v["url"] and v["url"] not in seen]
        for v in keep:
            seen.add(v["url"])           # dedup within this run too
        append_sources(keep, url)
        print(f"  {len(videos)} videos · "
              f"{sum(1 for v in scored if v['score'] >= KEEP_THRESHOLD)} above threshold · "
              f"{len(keep)} new appended")
    for index_url in (seeds.get("article_indexes") or []):
        print(f"\n=== {index_url} ===")
        items = discover_articles(index_url)
        scored = score_videos(items)                 # same scorer, no focus
        keep = [v for v in scored
                if v["score"] >= KEEP_THRESHOLD and v["url"] and v["url"] not in seen]
        for v in keep:
            seen.add(v["url"])
        append_sources(keep, index_url, kind="article")
        print(f"  {len(items)} links · "
              f"{sum(1 for v in scored if v['score'] >= KEEP_THRESHOLD)} above threshold · "
              f"{len(keep)} new appended")



if __name__ == "__main__":
    main()
