"""
Phase 7 support — turns parsequery.py's logic into a tiny local web server
so the Chrome extension can call it directly (instead of you running it
by hand in Terminal).

Run with:
    python3 server.py

It starts a server at http://localhost:5000
The extension will POST to http://localhost:5000/parse with a sentence
and get back {"page": ..., "person": ..., "mode": ...}.

Requires: pip3 install flask flask-cors
(you already have `requests` from Phase 4)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

from parsequery import parse_query, summarize_text  # reuses everything from Phase 4

app = Flask(__name__)
CORS(app)  # allow the extension (running on com360view.com) to call this


@app.route("/parse", methods=["POST"])
def parse():
    data = request.get_json(force=True)
    sentence = data.get("text", "")

    if not sentence.strip():
        return jsonify({"error": "empty text"}), 400

    result = parse_query(sentence)
    return jsonify(result)


@app.route("/summarize", methods=["POST"])
def summarize():
    data = request.get_json(force=True)
    page_text = data.get("text", "")
    person = data.get("person", "")

    if not page_text.strip():
        return jsonify({"error": "empty text"}), 400

    summary = summarize_text(page_text, person)
    return jsonify({"summary": summary})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001)