from pathlib import Path
import os
import random, time

import frontmatter
import trafilatura
import yaml
import httpx
from slugify import slugify
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv
from openai import OpenAI
from youtube_transcript_api import YouTubeTranscriptApi

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources.yaml"
DOCS = ROOT / "docs"

load_dotenv(ROOT / ".env")
client = OpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)

DISTILL_MODEL = "openai/gpt-4.1-mini"   # cheap, capable enough for restructuring

DISTILL_SYSTEM = """You convert a raw auto-generated YouTube transcript of a \
powerlifting coaching video into clean, structured markdown notes.

Rules:
- PRESERVE every concrete, actionable detail: cues, numbers, sets/reps/percentages,
  RPE, protocols, technique points, named exercises and lifters.
- REMOVE filler: greetings, "smash like and subscribe", sponsor reads, tangents,
  repetition, verbal tics ("um", "you know", "basically").
- ORGANISE into markdown with `##` headings grouped by topic, so the notes are
  scannable and splittable.
- Do NOT invent, infer, or embellish. Use ONLY what the transcript actually says.
  A thin video should produce short notes — that is correct, not a failure.
- Output ONLY the markdown notes. No preamble, no sign-off, no commentary."""


def video_id(url: str) -> str | None:
    u = urlparse(url)
    if u.hostname == "youtu.be":
        return u.path.lstrip("/")
    if u.hostname and "youtube.com" in u.hostname:
        return parse_qs(u.query).get("v", [None])[0]
    return None


def youtube_meta(url: str) -> dict:
    """Title + channel via oEmbed — no API key needed."""
    resp = httpx.get("https://www.youtube.com/oembed",
                     params={"url": url, "format": "json"}, timeout=15)
    resp.raise_for_status()
    d = resp.json()
    return {"title": d.get("title"), "author": d.get("author_name")}


def fetch_transcript(vid: str) -> str:
    fetched = YouTubeTranscriptApi().fetch(vid, languages=["en"])
    return " ".join(snippet.text for snippet in fetched)


def distill_transcript(raw: str, title: str) -> str:
    resp = client.chat.completions.create(
        model=DISTILL_MODEL,
        temperature=0.2,
        messages=[
            {"role": "system", "content": DISTILL_SYSTEM},
            {"role": "user", "content": f"Video title: {title}\n\nTranscript:\n{raw}"},
        ],
    )
    return resp.choices[0].message.content or ""


def scrape_youtube(url: str, override: dict) -> Path | None:
    vid = video_id(url)
    if not vid:
        print(f"  BAD YOUTUBE URL: {url}")
        return None
    try:
        time.sleep(random.uniform(4, 10))
        raw = fetch_transcript(vid)
    except Exception as e:
        print(f"  NO TRANSCRIPT: {url} ({e})")
        return None

    meta = youtube_meta(url)
    title = override.get("title") or meta.get("title") or "untitled"
    print(f"  transcript {len(raw)} chars -> distilling with {DISTILL_MODEL}...")
    body = distill_transcript(raw, title)
    if not body.strip():
        print(f"  DISTILL EMPTY: {url}")
        return None

    post = frontmatter.Post(
        body,
        source_url=url,
        source_type="youtube",
        title=title,
        author=override.get("author") or meta.get("author") or "Unknown",
        licence=override.get("licence", "scraped-review-required"),
    )
    path = DOCS / f"{slugify(title)[:80]}.md"
    path.write_text(frontmatter.dumps(post), encoding="utf-8")
    print(f"  wrote {path.name} ({len(body)} chars distilled from {len(raw)})")
    return path


def scrape_article(url: str, override: dict) -> Path | None:
    downloaded = trafilatura.fetch_url(url)
    if downloaded is None:
        print(f"  FETCH FAILED: {url}")
        return None

    body = trafilatura.extract(downloaded, output_format="markdown")
    meta = trafilatura.extract_metadata(downloaded)   # .title, .author, .date
    if not body:
        print(f"  EXTRACT FAILED: {url}")
        return None

    title = override.get("title") or (meta.title if meta else None) or "untitled"
    post = frontmatter.Post(
        body,
        source_url=url,
        source_type="article",
        title=title,
        author=override.get("author") or (meta.author if meta else None) or "Unknown",
        licence=override.get("licence", "scraped-review-required"),
    )
    path = DOCS / f"{slugify(title)[:80]}.md"
    path.write_text(frontmatter.dumps(post), encoding="utf-8")
    print(f"  wrote {path.name} ({len(body)} chars)")
    return path

def scraped_urls() -> set[str]:
    """source_urls already in docs/, so we don't re-fetch or re-distill them."""
    urls = set()
    for p in DOCS.glob("*.md"):
        try:
            post = frontmatter.load(str(p))
            if post.get("source_url"):
                urls.add(post["source_url"])
        except Exception:
            pass
    return urls

def main() -> None:
    sources = yaml.safe_load(SOURCES.read_text(encoding="utf-8")) or []
    done = scraped_urls()
    for src in sources:
        url, kind = src["url"], src.get("type", "article")
        if url in done:
            print(f"{kind}: {url}\n  SKIP (already scraped)")
            continue
        print(f"{kind}: {url}")
        if kind in ("article", "blog"):
            scrape_article(url, src)
        elif kind == "youtube":
            scrape_youtube(url, src)
        else:
            print(f"  SKIP (type '{kind}' not implemented yet)")


if __name__ == "__main__":
    main()
