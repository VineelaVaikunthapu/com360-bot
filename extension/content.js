// content.js — Phase 2: floating search bar
// pages.js is loaded before this file (see manifest.json), so the
// `pages` array is already available here.

(function () {
  // Avoid injecting twice if the script somehow runs more than once.
  if (document.getElementById("com360-bot-bar")) return;

  // ---------- Build the floating bar ----------
  const bar = document.createElement("div");
  bar.id = "com360-bot-bar";

  const input = document.createElement("input");
  input.id = "com360-bot-input";
  input.type = "text";
  input.placeholder = 'Try: "show me John\'s timesheet"';

  const button = document.createElement("button");
  button.id = "com360-bot-submit";
  button.textContent = "Go";

  const status = document.createElement("div");
  status.id = "com360-bot-status";

  bar.appendChild(input);
  bar.appendChild(button);
  bar.appendChild(status);
  document.body.appendChild(bar);

  // ---------- Call the backend (Phase 4/7) ----------
  async function handleQuery(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      status.textContent = "Type something first.";
      return;
    }

    status.textContent = "Thinking...";

    let parsed;
    try {
      const res = await fetch("http://localhost:5001/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed })
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      parsed = await res.json();
    } catch (err) {
      status.textContent =
        "Couldn't reach the backend. Is server.py running on port 5001? (" +
        err.message + ")";
      return;
    }

    const { page: pageName, person, mode } = parsed;

    if (!pageName) {
      status.textContent = `Couldn't figure out which page you meant from "${trimmed}".`;
      return;
    }

    const page = pages.find((p) => p.name === pageName);
    if (!page) {
      status.textContent = `Llama said "${pageName}" but that's not a page I know about.`;
      return;
    }

    // Phase 7: redirect, carrying person + mode along as query params so
    // the destination page can pick them up (used in Phase 8).
    const params = new URLSearchParams();
    if (person) params.set("com360bot_person", person);
    if (mode) params.set("com360bot_mode", mode);

    const destination =
      window.location.origin + page.url + (params.toString() ? "?" + params.toString() : "");

    status.textContent = `Going to ${page.name}...`;
    window.location.href = destination;
  }

  // ---------- Wire up events ----------
  button.addEventListener("click", () => handleQuery(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleQuery(input.value);
  });

  // ---------- Phase 8: select the employee on the destination page ----------
  // Runs once per page load. Reads the person/mode carried over from the
  // Phase 7 redirect (as URL query params) and, depending on the page
  // type, either picks the right <select> option, types into the search
  // box, or highlights the matching table row.

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // React (and similar frameworks) ignore a plain `element.value = x`
  // because it bypasses their internal tracking. This uses the native
  // setter directly so the framework's change handlers actually fire.
  function setNativeValue(element, value) {
    const proto = element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    if (element.tagName === "SELECT") {
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Heuristic: the employee-picking <select> on dropdown pages (Timesheets,
  // Leaves, Delegate, Document Verification) is the one with the most
  // options and a first blank/placeholder option. Adjust here if a page
  // ever has more than one qualifying <select>.
  function findEmployeeSelect() {
    const selects = Array.from(document.querySelectorAll("select"));
    let best = null;
    for (const sel of selects) {
      if (sel.options.length > 3 && (!best || sel.options.length > best.options.length)) {
        best = sel;
      }
    }
    return best;
  }

  // com360 seems to load the employee list into the dropdown via an API
  // call AFTER the page first renders, so the <select> may not have its
  // real options yet the instant our script runs. Poll for a bit instead
  // of giving up immediately.
  function waitForEmployeeSelect(timeoutMs = 6000, intervalMs = 200) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const select = findEmployeeSelect();
        if (select) {
          resolve(select);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function findMatchingOptions(select, person) {
    const query = person.trim().toLowerCase();
    return Array.from(select.options).filter(
      (o) => o.value !== "" && o.text.toLowerCase().includes(query)
    );
  }

  function showMultiMatchPopup(matches, onPick) {
    const existing = document.getElementById("com360-bot-popup");
    if (existing) existing.remove();

    const popup = document.createElement("div");
    popup.id = "com360-bot-popup";

    const title = document.createElement("div");
    title.id = "com360-bot-popup-title";
    title.textContent = "Multiple matches — pick one:";
    popup.appendChild(title);

    matches.forEach((m) => {
      const btn = document.createElement("button");
      btn.className = "com360-bot-popup-option";
      btn.textContent = m.text;
      btn.addEventListener("click", () => {
        onPick(m);
        popup.remove();
      });
      popup.appendChild(btn);
    });

    document.body.appendChild(popup);
  }

  async function selectEmployeeOnDropdownPage(person, onResolved) {
    status.textContent = "Waiting for the employee list to load...";
    const select = await waitForEmployeeSelect();
    if (!select) {
      status.textContent = `Couldn't find an employee dropdown on this page for "${person}".`;
      onResolved({ ok: false, reason: "no-dropdown" });
      return;
    }

    const matches = findMatchingOptions(select, person);

    if (matches.length === 0) {
      status.textContent = `No employee matching "${person}" found in the dropdown.`;
      onResolved({ ok: false, reason: "no-match" });
    } else if (matches.length === 1) {
      setNativeValue(select, matches[0].value);
      status.textContent = `Selected ${matches[0].text}.`;
      onResolved({ ok: true, matchedName: matches[0].text });
    } else {
      status.textContent = `Found ${matches.length} matches for "${person}" — pick one.`;
      showMultiMatchPopup(matches, (picked) => {
        setNativeValue(select, picked.value);
        status.textContent = `Selected ${picked.text}.`;
        // Selection only happens once the person clicks a match, so the
        // summary (if requested) has to wait until now to start.
        onResolved({ ok: true, matchedName: picked.text });
      });
    }
  }

  function selectEmployeeOnSearchPage(person) {
    // Only Employees Overview actually has a per-employee search input.
    const input = document.querySelector('input.search-input[placeholder="Search by Name or Emp ID"]');
    if (!input) {
      // Immigration / H1B pages: no search box, so instead find and
      // highlight matching row(s) already in the table.
      return highlightMatchingRows(person);
    }
    setNativeValue(input, person);
    status.textContent = `Searched for "${person}".`;
    return { ok: true, matchedName: person };
  }

  function highlightMatchingRows(person) {
    const query = person.trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll("tr")).filter((row) =>
      row.textContent.toLowerCase().includes(query)
    );

    if (rows.length === 0) {
      status.textContent = `No rows matching "${person}" found on this page.`;
      return { ok: false, reason: "no-match" };
    }

    rows.forEach((row) => {
      row.style.outline = "3px solid #2563eb";
      row.style.outlineOffset = "-2px";
    });
    rows[0].scrollIntoView({ behavior: "smooth", block: "center" });
    status.textContent = `Highlighted ${rows.length} row(s) matching "${person}".`;
    return { ok: true, matchedName: person };
  }

  function runPhase8() {
    const person = getQueryParam("com360bot_person");
    const mode = getQueryParam("com360bot_mode");
    if (!person) return; // nothing to select, e.g. no name was mentioned

    const currentPage = pages.find((p) => window.location.pathname.startsWith(p.url));
    if (!currentPage) return;

    const maybeSummarize = (result) => {
      if (mode !== "summarize") return;
      if (result.ok) {
        buildAndShowSummary(result.matchedName);
      } else {
        // Don't ask Llama to summarize data for someone we never actually
        // selected — that produces a plausible-looking but fabricated
        // summary. Be upfront instead.
        status.textContent += ` Skipping summary since ${person} wasn't actually selected.`;
      }
    };

    if (currentPage.type === "dropdown") {
      selectEmployeeOnDropdownPage(person, maybeSummarize);
    } else if (currentPage.type === "table-search") {
      maybeSummarize(selectEmployeeOnSearchPage(person));
    } else {
      // self-only page: nothing to select, but the visible data IS the
      // logged-in user's own — safe to summarize as-is.
      status.textContent = `"${currentPage.name}" only shows your own data from this account — can't pull up ${person}'s here.`;
      maybeSummarize({ ok: true, matchedName: null });
    }
  }

  // ---------- Phase 9 & 10: build and show a summary ----------

  // Grabs the visible text of the page, without our own bar/popup mixed in.
  function capturePageText() {
    const prevBarDisplay = bar.style.display;
    const popupEl = document.getElementById("com360-bot-popup");
    const prevPopupDisplay = popupEl ? popupEl.style.display : null;

    bar.style.display = "none";
    if (popupEl) popupEl.style.display = "none";

    const text = document.body.innerText;

    bar.style.display = prevBarDisplay;
    if (popupEl) popupEl.style.display = prevPopupDisplay;

    return text;
  }

  function showSummaryPopup(text) {
    const existing = document.getElementById("com360-bot-popup");
    if (existing) existing.remove();

    const popup = document.createElement("div");
    popup.id = "com360-bot-popup";

    const title = document.createElement("div");
    title.id = "com360-bot-popup-title";
    title.textContent = "Summary";
    popup.appendChild(title);

    const body = document.createElement("div");
    body.id = "com360-bot-summary-text";
    body.textContent = text;
    popup.appendChild(body);

    const closeBtn = document.createElement("button");
    closeBtn.className = "com360-bot-popup-option";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => popup.remove());
    popup.appendChild(closeBtn);

    document.body.appendChild(popup);
  }

  async function buildAndShowSummary(matchedName) {
    status.textContent = "Reading the page...";
    // Give the page a moment to finish loading data after selection
    // (e.g. a table repopulating once the dropdown changes).
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const pageText = capturePageText();

    status.textContent = "Summarizing...";
    try {
      const res = await fetch("http://localhost:5001/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pageText, person: matchedName || "" })
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const { summary } = await res.json();
      showSummaryPopup(summary);
      status.textContent = "Summary ready.";
    } catch (err) {
      status.textContent = "Couldn't build a summary. (" + err.message + ")";
    }
  }

  runPhase8();
})();