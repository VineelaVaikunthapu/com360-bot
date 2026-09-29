"""
Phase 4 — Ask Llama to read the sentence.

Run this from the command line to test:
    python3 parse_query.py "show me vineela's timesheet"

It sends the sentence to your local Ollama server and asks for:
  - page:   which page the person wants (one of the known page names)
  - person: whose name they mentioned (or null if none)
  - mode:   "show" (just display it) or "summarize" (give a plain-English summary)

Requires: pip install requests
"""

import sys
import json
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "llama3.2:3b"

# Same page names as extensions/pages.js — keep these two files in sync.
PAGE_NAMES = [
    "timesheet",
    "performance_review",
    "leaves",
    "expenses",
    "employees_overview",
    "immigration",
    "h1b_registration",
    "h1b_filing",
    "service_requests",
    "delegate",
    "document_verification",
    "form_completion",
]

SYSTEM_INSTRUCTIONS = f"""You turn a manager's short request into structured JSON.

Valid page values (pick exactly one): {", ".join(PAGE_NAMES)}

Return ONLY a JSON object, nothing else. No explanation, no markdown fences.
Format exactly:
{{"page": "<one of the valid page values, or null if unclear>", "person": "<the person's name mentioned, or null if none>", "mode": "<'show' or 'summarize'>"}}

Rules:
- "mode" is "summarize" if the sentence asks for a summary, overview, or "how is X doing".
- "mode" is "show" for anything else (e.g. "show me", "open", "pull up", "go to").
- "person" should be just the name as typed, e.g. "vineela" or "John Smith". Use null if no person is named.
- If the sentence doesn't clearly match a page, set "page" to null.
"""


def parse_query(sentence: str) -> dict:
    prompt = f"{SYSTEM_INSTRUCTIONS}\n\nSentence: \"{sentence}\"\nJSON:"

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "format": "json",  # ask Ollama to constrain output to valid JSON
        },
        timeout=30,
    )
    response.raise_for_status()
    raw_text = response.json()["response"]

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        # Fallback: if the model wrapped it in text/fences anyway, try to
        # find the first { ... } block and parse that.
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError(f"Could not parse JSON from model output: {raw_text!r}")
        parsed = json.loads(raw_text[start : end + 1])

    # Basic validation / normalization
    if parsed.get("page") not in PAGE_NAMES:
        parsed["page"] = None
    if parsed.get("mode") not in ("show", "summarize"):
        parsed["mode"] = "show"

    return parsed


def summarize_text(page_text: str, person: str = "") -> str:
    """Phase 9 — turn the raw text now visible on the page into a short,
    plain-English summary."""
    who_line = (
        f'This page is showing data for "{person}". Refer to them by this '
        f"name — ignore any single-letter initials, avatar icons, or "
        f"abbreviations you see in the page text.\n\n"
        if person
        else ""
    )
    prompt = f"""You are helping a manager quickly understand what's on their screen.

Below is the raw text content of a company HR page. {who_line}Write a short,
plain-English summary (2-4 sentences). Focus on the actual data \u2014 numbers,
statuses, dates, names \u2014 not the page's menus or navigation. If the page
appears to show no data, say so plainly.

PAGE CONTENT:
{page_text[:4000]}

SUMMARY:"""

    response = requests.post(
        OLLAMA_URL,
        json={"model": MODEL, "prompt": prompt, "stream": False},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["response"].strip()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python3 parse_query.py "show me vineela\'s timesheet"')
        sys.exit(1)

    sentence = " ".join(sys.argv[1:])
    result = parse_query(sentence)
    print(json.dumps(result, indent=2))