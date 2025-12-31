function getGeminiModel() {
  return new Promise((resolve) => {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['geminiModel'], (result) => {
        resolve(result.geminiModel || 'gemini-2.5-flash-lite');
      });
    } else {
      resolve('gemini-2.5-flash-lite');
    }
  });
}
// =======================
// Context Menu Setup
// =======================
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-anki",
    title: "Add to Anki",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "add-to-anki-custom-meaning",
    title: "Add to Anki with input Vietnamese meaning",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ankihelper_read_page_content",
    title: "Generate flashcards from all page content",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "ankihelper_read_selection_content",
    title: "Generate flashcards from selected content",
    contexts: ["selection"]
  });
});

// =======================
// Notification Helpers
// =======================
function notify(tabId, message, success, id = null) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg, ok, nid) => {
      let div = document.createElement("div");
      div.textContent = msg;
      div.style.position = "fixed";
      div.style.top = "20px";
      div.style.right = "20px";
      div.style.zIndex = 9999;
      div.style.background = ok ? "#388e3c" : "#c62828";
      div.style.color = "#fff";
      div.style.padding = "12px 24px";
      div.style.borderRadius = "8px";
      div.style.fontSize = "18px";
      div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
      if (nid) div.id = nid;
      document.body.appendChild(div);
      if (!nid) setTimeout(() => div.remove(), 3000);
    },
    args: [message, success, id]
  }).catch((err) => {
    console.error("Notification inject error:", err);
  });
}

function removeNotify(tabId, id) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (nid) => {
      let div = document.getElementById(nid);
      if (div) div.remove();
    },
    args: [id]
  }).catch(() => { });
}

// =======================
// Loading Overlay
// =======================
function showLoadingOverlay(tabId, message = "Loading...") {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg) => {
      // Remove any existing loading overlay
      const existing = document.getElementById("ankihelper-loading-overlay");
      if (existing) existing.remove();

      // Create overlay
      const overlay = document.createElement("div");
      overlay.id = "ankihelper-loading-overlay";
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.7);
        backdrop-filter: blur(4px);
        z-index: 999998;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease-out;
      `;

      // Create loading card
      const card = document.createElement("div");
      card.style.cssText = `
        background: #ffffff;
        border-radius: 16px;
        padding: 40px 60px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        text-align: center;
        animation: slideUp 0.3s ease-out;
      `;

      // Spinner
      const spinner = document.createElement("div");
      spinner.style.cssText = `
        width: 50px;
        height: 50px;
        border: 5px solid #e5e7eb;
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 20px;
      `;

      // Message
      const text = document.createElement("div");
      text.textContent = msg;
      text.style.cssText = `
        font-size: 18px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 8px;
      `;

      // Sub text
      const subtext = document.createElement("div");
      subtext.textContent = "This may take a few seconds...";
      subtext.style.cssText = `
        font-size: 14px;
        color: #6b7280;
      `;

      // Add animations
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `;
      document.head.appendChild(style);

      card.appendChild(spinner);
      card.appendChild(text);
      card.appendChild(subtext);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    },
    args: [message]
  }).catch((err) => {
    console.error("Loading overlay inject error:", err);
  });
}

function hideLoadingOverlay(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      const overlay = document.getElementById("ankihelper-loading-overlay");
      if (overlay) {
        overlay.style.animation = "fadeOut 0.2s ease-out";
        setTimeout(() => overlay.remove(), 200);
      }
    },
    args: []
  }).catch(() => { });
}

// =======================
// Cloze Helpers
// =======================
function createCloze(word) {
  if (!word || word.length === 0) return word;
  const words = word.split(/\s+/);
  return words.map(createSingleWordCloze).join(" ");
}

function createSingleWordCloze(word) {
  if (word.length <= 2) return word;
  const wordLen = word.length;
  if (wordLen === 2) return word[0] + "_";
  const maxHide = Math.floor(wordLen * 0.4);
  const minKeep = wordLen <= 3 ? wordLen : 2;
  const charsToKeep = Math.max(minKeep, wordLen - maxHide);
  const keepFromStart = Math.floor(charsToKeep / 2);
  const keepFromEnd = charsToKeep - keepFromStart;
  let result = "";
  for (let i = 0; i < wordLen; i++) {
    if (word[i] === "'" || word[i] === "-") {
      result += word[i];
    } else if (i < keepFromStart || i >= wordLen - keepFromEnd) {
      result += word[i];
    } else {
      result += "_";
    }
  }
  return result;
}

// =======================
// Gemini API Helpers
// =======================

// Round-robin Gemini API Key Pool
let geminiApiKeyPoolIndex = 0;
function getGeminiApiKeyFromPool() {
  return new Promise((resolve) => {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['geminiApiKeyPool', 'geminiApiKey'], (result) => {
        let pool = result.geminiApiKeyPool;
        if (Array.isArray(pool) && pool.length > 0) {
          // Round-robin
          const idx = geminiApiKeyPoolIndex % pool.length;
          geminiApiKeyPoolIndex = (geminiApiKeyPoolIndex + 1) % pool.length;
          resolve(pool[idx]);
        } else if (typeof result.geminiApiKey === 'string' && result.geminiApiKey) {
          resolve(result.geminiApiKey);
        } else {
          resolve("");
        }
      });
    } else {
      resolve("");
    }
  });
}

async function geminiTranslate(word) {
  const apiKey = await getGeminiApiKeyFromPool();
  if (!apiKey) {
    console.error("Gemini API Key chưa được thiết lập.");
    return "";
  }
  const prompt = `Translate this to Vietnamese: "${word}". Only output the Vietnamese translation, no explanation, no extra text. Write the result in lowercase.`;

  try {
    const model = await getGeminiModel();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const data = await res.json();
    console.debug("Gemini translate response:", data);
    if (data && data.candidates && data.candidates.length > 0) {
      const parts = data.candidates[0].content.parts;
      if (parts && parts.length > 0 && parts[0].text) {
        return parts[0].text.trim().toLowerCase();
      }
    }
    return "";
  } catch (err) {
    console.error("Gemini API error:", err);
    return "";
  }
}

function getInfoPrompt(word, translation) {
  return `For the English word "${word}" (Vietnamese: "${translation}"), provide the following in JSON:
{
  "example": "<Give a simple, natural English sentence using the word \\"${word}\\" with Vietnamese meaning is \\"${translation}\\". Do not use generic templates or mention the instruction itself.>",
  "exampleVN": "<Translate the example sentence to Vietnamese.>",
  "ipa": "<IPA transcription, e.g. /ˈwɜ:d/>",
  "type": "<word type: n, v, adj, adv, prep, pron, conj, interj>",
  "syllables": "<Split the word into syllables, separated by comma, e.g. pro, cras, ti, nate>"
}
Only output valid JSON, no explanation, no extra text.`;
}

async function getWordInfo(word, translation) {
  const apiKey = await getGeminiApiKeyFromPool();
  if (!apiKey) return {};
  const prompt = getInfoPrompt(word, translation);
  console.log("Gemini getWordInfo prompt:", prompt);
  try {
    const model = await getGeminiModel();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const data = await res.json();
    console.log("Gemini getWordInfo response:", data);
    let respText = "";
    if (data && data.candidates && data.candidates.length > 0) {
      const parts = data.candidates[0].content.parts;
      if (parts && parts.length > 0 && parts[0].text) {
        respText = parts[0].text;
      }
    }
    const start = respText.indexOf("{");
    const end = respText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const jsonStr = respText.slice(start, end + 1);
      try {
        const info = JSON.parse(jsonStr);
        return {
          example: info.example ? info.example.trim() : "",
          exampleVN: info.exampleVN ? info.exampleVN.trim() : "",
          ipa: info.ipa ? info.ipa.trim() : "",
          type: info.type ? info.type.trim() : "",
          syllables: info.syllables ? info.syllables.trim() : ""
        };
      } catch (e) {
        console.warn("Gemini getWordInfo JSON parse error:", e, jsonStr);
        return {};
      }
    }
    return {};
  } catch (err) {
    console.error("Gemini getWordInfo error:", err);
    return {};
  }
}

// =======================
// AnkiConnect Helpers
// =======================
async function ensureDeckExists(deckName) {
  const payload = { action: "deckNames", version: 6, params: {} };
  try {
    const res = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.debug("AnkiConnect deckNames response:", data);
    if (data.result && data.result.includes(deckName)) return true;
    const createPayload = { action: "createDeck", version: 6, params: { deck: deckName } };
    const createRes = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPayload)
    });
    const createData = await createRes.json();
    console.debug("AnkiConnect createDeck response:", createData);
    return true;
  } catch (err) {
    console.error("ensureDeckExists error:", err);
    return false;
  }
}

async function ensureModelExists(modelName, inOrderFields, css, cardTemplates) {
  const payload = { action: "modelNames", version: 6, params: {} };
  try {
    const res = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.debug("AnkiConnect modelNames response:", data);
    if (data.result && data.result.includes(modelName)) return true;
    const createPayload = {
      action: "createModel",
      version: 6,
      params: {
        modelName,
        inOrderFields,
        css,
        cardTemplates
      }
    };
    const createRes = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPayload)
    });
    const createData = await createRes.json();
    console.debug("AnkiConnect createModel response:", createData);
    return true;
  } catch (err) {
    console.error("ensureModelExists error:", err);
    return false;
  }
}

async function ensureMultipleChoiceModelExists(modelName, inOrderFields) {
  const payload = { action: "modelNames", version: 6, params: {} };
  try {
    const res = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.debug("AnkiConnect modelNames response:", data);
    if (data.result && data.result.includes(modelName)) return true;

    // CSS from example.js
    const css = `
        /* -------------------------------------------------- PREFERENCES */
        :root {
        --card-max-width: 40em;
        --card-text-align: left;
        --font-size-regular: 18px;
        --font-size-small: 16px;
        --font-family: "DejaVu Sans", -apple-system, system-ui, BlinkMacSystemFont, Segoe UI,
            Roboto, Helvetica, Arial, sans-serif;
        --img-width: 50%;
        --img-brightness: 1;
        --img-filter: none;
        }

        /* -------------------------------------------------- COLORS */
        .card {
        /* Light theme */
        background-color: #cfd6d8;
        --text-fg: #333333e6;
        --text-fg-faint: #333333cc;
        --text-bg-selected: #3333331a;
        --card-bg: #ffffff;
        --card-border: #f7f7f7;
        --card-box-shadow: #3c42570f;
        --divider: #3333331a;
        --tag-fg: #333333cc;
        --tag-bg: #3333330f;
        --tag-fg-active: #333333;
        --tag-bg-active: #3333331a;
        --tag-border: transparent;
        --cloze-fg: #348ccb;
        --cloze-bg: transparent;
        --link-fg: #2a70a2;
        --link-bg: transparent;
        --link-fg-active: #2f7eb6;
        --link-bg-active: transparent;
        --bold-fg: var(--text-fg);
        --italic-fg: var(--text-fg);
        --bold-italic-fg: var(--text-fg);
        --underline-fg: var(--text-fg);
        }

        .card.night_mode {
        /* Dark theme */
        background-color: #242426;
        --text-fg: #ffffffe6;
        --text-fg-faint: #ffffffb3;
        --text-bg-selected: #ffffff1f;
        --card-bg: #2e2f31;
        --card-border: #ffffff0a;
        --card-box-shadow: #0000001f;
        --divider: #ffffff1f;
        --tag-fg: #ffffffb3;
        --tag-bg: #ffffff14;
        --tag-fg-active: #ffffff;
        --tag-bg-active: #ffffff1f;
        --tag-border: transparent;
        --cloze-fg: #99ebff;
        --cloze-bg: transparent;
        --link-fg: #5da3d5;
        --link-bg: transparent;
        --link-fg-active: #71afda;
        --link-bg-active: transparent;
        --bold-fg: var(--text-fg);
        --italic-fg: var(--text-fg);
        --bold-italic-fg: var(--text-fg);
        --underline-fg: var(--text-fg);
        }

        /* -------------------------------------------------- BACKGROUND */
        .card {
        cursor: default;
        padding: 0.5em 0;
        }
        html:not(.mobile) .card {
        padding: 0.5em;
        }
        .card::-webkit-scrollbar {
        display: none;
        }

        /* -------------------------------------------------- FLASHCARD */
        .prettify-flashcard {
        background-color: var(--card-bg);
        border-radius: 0.25em;
        border: 1px solid var(--card-border);
        box-shadow: var(--card-box-shadow) 0px 7px 14px 0px, var(--card-box-shadow) 0px 3px 6px 0px;
        color: var(--text-fg);
        font-family: var(--font-family);
        font-size: var(--font-size-regular);
        line-height: 1.5;
        margin: 0 auto;
        padding: 15px;
        max-width: var(--card-max-width);
        text-align: var(--card-text-align);
        word-wrap: break-word;
        }
        .prettify-flashcard ::selection {
        background-color: var(--text-bg-selected);
        }

        /* -------------------------------------------------- FIELDS */
        .prettify-field {
        margin: 2em;
        }
        .mobile .prettify-field {
        margin: 1em;
        }

        .prettify-field--back {
        color: var(--text-fg-faint);
        font-size: var(--font-size-regular);
        }

        /* -------------------------------------------------- CLOZE */
        .cloze {
        background-color: var(--cloze-bg);
        color: var(--cloze-fg);
        }

        /* -------------------------------------------------- DECK */
        .prettify-deck {
        margin: 2em;
        display: flex;
        color: var(--text-fg-faint);
        font-size: var(--font-size-small);
        white-space: nowrap;
        text-decoration: underline;
        }
        .mobile .prettify-deck {
        margin: 1em;
        }

        .prettify-subdeck {
        text-decoration: underline;
        text-overflow: ellipsis;
        overflow: hidden;
        }

        /* -------------------------------------------------- TAGS */
        .prettify-tags {
        margin: 2em;
        display: flex;
        flex-flow: row wrap;
        font-size: var(--font-size-small);
        }
        .mobile .prettify-tags {
        margin: 1em;
        }

        .prettify-tag {
        all: initial;
        background-color: var(--tag-bg);
        border-radius: 0.2em;
        color: var(--tag-fg);
        display: inline;
        font-size: var(--font-size-small);
        font-family: var(--font-family);
        margin: 0 0.5em 0.5em 0;
        padding: 0.25em;
        transition: all 0.25s;
        word-break: break-word;
        }
        .prettify-tag:hover {
        background-color: var(--tag-bg-active);
        color: var(--tag-fg-active);
        cursor: pointer;
        }

        /* -------------------------------------------------- DIVIDER */
        .prettify-divider {
        background-color: transparent;
        border: none;
        border-bottom: 1px dashed var(--divider);
        margin: 1em;
        padding: 0;
        }

        .prettify-divider--answer {
        margin: 0 0 1em;
        }

        /* -------------------------------------------------- IMAGES */
        img {
        border-radius: 0.25em;
        display: block;
        margin: 1em auto;
        max-width: var(--img-width) !important;
        transition: max-width 0.25s 0.1s, opacity 0.25s 0.1s, filter 0.1s, transform 0s;
        }
        .night_mode img {
        filter: var(--img-filter);
        opacity: var(--img-brightness);
        }
        img:hover {
        cursor: zoom-in;
        filter: none;
        max-width: 100% !important;
        opacity: 1;
        }
        img + br {
        display: none;
        }
        html:not(.mobile) img:active {
        border: 1px solid var(--link-fg-active);
        cursor: zoom-out;
        filter: none;
        left: 0;
        max-width: 95% !important;
        opacity: 1;
        position: fixed;
        top: 0;
        transform: translate(calc(50vw - 50%), calc(50vh - 50%));
        z-index: 100;
        }

        /* -------------------------------------------------- TABLES */
        table {
        border-collapse: separate;
        border-spacing: 0;
        margin: 0 auto;
        max-width: 100%;
        }
        table thead {
        background-color: var(--card-border);
        }
        table tr:nth-of-type(even) {
        background-color: var(--card-border);
        }
        table tr:first-child th:first-child {
        border-top-left-radius: 0.25em;
        }
        table tr:first-child th:last-child {
        border-top-right-radius: 0.25em;
        }
        table tr:last-child td:first-child {
        border-bottom-left-radius: 0.25em;
        }
        table tr:last-child td:last-child {
        border-bottom-right-radius: 0.25em;
        }
        table th {
        border-bottom: solid 1px var(--text-bg-selected);
        border-left: solid 1px var(--text-bg-selected);
        border-top: solid 1px var(--text-bg-selected);
        padding: 0.5em;
        }
        table th:last-child {
        border-right: solid 1px var(--text-bg-selected);
        }
        table td {
        border-bottom: solid 1px var(--text-bg-selected);
        border-left: solid 1px var(--text-bg-selected);
        padding: 0.5em;
        }
        table td:last-of-type {
        border-right: solid 1px var(--text-bg-selected);
        }

        /* -------------------------------------------------- HYPERLINKS */
        a, a:visited {
        text-decoration: none;
        color: var(--link-fg);
        }
        a:hover, a:active {
        text-decoration: underline;
        color: var(--link-fg-active);
        }

        /* -------------------------------------------------- FORMATTING */
        b {
        color: var(--bold-fg);
        }

        i {
        color: var(--italic-fg);
        }

        b > i,
        i > b {
        color: var(--bold-italic-fg);
        }

        u {
        color: var(--underline-fg);
        }

        pre {
        white-space: normal;
        }

        /* -------------------------------------------------- CUSTOM FONTS */
        @font-face {
        font-family: Inter;
        src: local("Inter-Regular"), url("_Inter-Regular.woff2") format("woff2");
        font-style: normal;
        font-weight: normal;
        }
        @font-face {
        font-family: Inter;
        src: local("Inter-Bold"), url("_Inter-Bold.woff2") format("wofff2");
        font-style: normal;
        font-weight: bold;
        }
        @font-face {
        font-family: Inter;
        src: local("Inter-Italic"), url("_Inter-Italic.woff2") format("wofff2");
        font-style: italic;
        font-weight: normal;
        }
        @font-face {
        font-family: Inter;
        src: local("Inter-BoldItalic"), url("_Inter-BoldItalic.woff2") format("wofff2");
        font-style: italic;
        font-weight: bold;
        }

        /* -------------------------------------------------- ADDITIONAL STYLES ADDED BY ANKI-DECKS.COM */
        /* -------------------------------------------------- MULTIPLE CHOICE */
        .prettify-multiple-choice {
            list-style-type: none; /* Remove the default list styling */
            padding-left: 0; /* Remove the left padding */
            margin: 1em 0; /* Add space around the list */
        }

        .prettify-multiple-choice li {
            margin-bottom: 0.5em; /* Add space between list items */
            padding: 0.5em 1em; /* Add padding inside each option */
            border: 1px solid var(--divider); /* Light border around each option */
            border-radius: 0.25em; /* Slightly round the edges of each option */
            cursor: pointer; /* Show pointer cursor on hover */
            transition: background-color 0.2s ease, border-color 0.2s ease; /* Smooth transition for hover effects */
        }

        .prettify-multiple-choice li:hover {
            background-color: var(--text-bg-selected); /* Highlight option on hover */
            border-color: var(--text-fg); /* Change border color on hover */
        }

        .prettify-correct {
            color: #4caf50; /* Green for correct answers */
            font-weight: bold; /* Make the correct answer bold */
        }

        .prettify-incorrect {
            color: #f44336; /* Red for incorrect answers */
            text-decoration: line-through; /* Strike through incorrect answers */
            opacity: 0.8; /* Slightly dim the incorrect answers */
        }

        /* -------------------------------------------------- END OF THEME */
    `
    // Templates from example.js - simplified front template
    const cardTemplates = [
      {
        Name: "Multiple Choice With Explanation Card",
        Front: `
<!-- Hidden data containers to avoid JavaScript escaping issues -->
<div style="display: none;">
    <div id="data-question">{{question}}</div>
    <div id="data-answer-1">{{answer_1}}</div>
    <div id="data-answer-1-vi">{{answer_1_vi}}</div>
    <div id="data-flag-1">{{correct_answer_flag_1}}</div>
    <div id="data-answer-2">{{answer_2}}</div>
    <div id="data-answer-2-vi">{{answer_2_vi}}</div>
    <div id="data-flag-2">{{correct_answer_flag_2}}</div>
    <div id="data-answer-3">{{answer_3}}</div>
    <div id="data-answer-3-vi">{{answer_3_vi}}</div>
    <div id="data-flag-3">{{correct_answer_flag_3}}</div>
    <div id="data-answer-4">{{answer_4}}</div>
    <div id="data-answer-4-vi">{{answer_4_vi}}</div>
    <div id="data-flag-4">{{correct_answer_flag_4}}</div>
    <div id="data-explanation">{{explanation}}</div>
    <div id="data-explanation-vi">{{explanation_vi}}</div>
</div>
<div class="prettify-flashcard">
    <div class="prettify-field prettify-field--front">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">{{question}}</div>
        {{#question_vi}}
        <div style="font-size: 16px; color: #666; font-weight: 500;">{{question_vi}}</div>
        {{/question_vi}}
    </div>
    <ol class="prettify-multiple-choice" id="answer-options">
        <!-- Options will be dynamically inserted here by JavaScript -->
    </ol>
</div>
<script>
    // Function to shuffle array elements (Fisher-Yates algorithm)
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    // Function to generate a deterministic seed from the question text
    function generateSeed(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }
    
    // Seeded random function
    function seededRandom(seed) {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }
    
    // Shuffle array with a seed for deterministic output
    function seededShuffle(array, seed) {
        const newArray = [...array];
        let currentSeed = seed;
        
        for (let i = newArray.length - 1; i > 0; i--) {
            // Use seeded random number generator
            const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        
        return newArray;
    }
    
    // Store the shuffled order in a global variable for use on both sides of the card
    if (typeof window.ankiShuffledIndices === 'undefined') {
        window.ankiShuffledIndices = [];
    }
    
    // Run once when card is shown
    onUpdateHook.push(function () {
        const optionsContainer = document.getElementById("answer-options");
        
        // Read data from hidden data containers to avoid escaping issues
        const questionText = document.getElementById("data-question").textContent;
        const options = [
            { 
                text: document.getElementById("data-answer-1").textContent, 
                text_vi: document.getElementById("data-answer-1-vi").textContent, 
                correct: document.getElementById("data-flag-1").textContent === 'True' 
            },
            { 
                text: document.getElementById("data-answer-2").textContent, 
                text_vi: document.getElementById("data-answer-2-vi").textContent, 
                correct: document.getElementById("data-flag-2").textContent === 'True' 
            },
            { 
                text: document.getElementById("data-answer-3").textContent, 
                text_vi: document.getElementById("data-answer-3-vi").textContent, 
                correct: document.getElementById("data-flag-3").textContent === 'True' 
            },
            { 
                text: document.getElementById("data-answer-4").textContent, 
                text_vi: document.getElementById("data-answer-4-vi").textContent, 
                correct: document.getElementById("data-flag-4").textContent === 'True' 
            }
        ];
        
        // Generate shuffled options with seed based on question text for consistency
        const seed = generateSeed(questionText);
        const shuffledOptions = seededShuffle(options, seed);
        
        // Store the order of indices for the answer side
        window.ankiShuffledIndices = shuffledOptions.map(opt => 
            options.findIndex(o => o.text === opt.text && o.correct === opt.correct)
        );
        
        // Store this as a data attribute on the card for persistence
        document.querySelector('.card').setAttribute('data-shuffled-indices', 
            window.ankiShuffledIndices.join(','));
        
        // Clear existing options if any (for when card is reset)
        optionsContainer.innerHTML = '';
        
        // Add shuffled options to the container
        shuffledOptions.forEach(option => {
            const li = document.createElement('li');
            // Show both English and Vietnamese if available
            let optionHtml = option.text;
            if (option.text_vi && option.text_vi.trim()) {
                optionHtml += '<br><span style="font-size: 14px; color: #666;">' + option.text_vi + '</span>';
            }
            li.innerHTML = optionHtml;
            li.setAttribute('data-correct', option.correct ? 'True' : 'False');
            
            // Add click event listener
            li.addEventListener('click', function() {
                const isCorrect = option.correct;
                const allOptions = document.querySelectorAll('#answer-options li');
                
                // Clear previous classes
                allOptions.forEach(opt => opt.classList.remove('prettify-correct', 'prettify-incorrect'));
                
                // Apply appropriate class based on correctness
                if (isCorrect) {
                    li.classList.add('prettify-correct');
                } else {
                    li.classList.add('prettify-incorrect');
                    
                    // Also highlight the correct answer
                    allOptions.forEach(opt => {
                        if (opt.getAttribute('data-correct') === 'True') {
                            opt.classList.add('prettify-correct');
                        }
                    });
                }
                
                // Disable further clicks
                allOptions.forEach(opt => opt.style.pointerEvents = 'none');
            });
            
            optionsContainer.appendChild(li);
        });
    });
</script>`,
        Back: `
<!-- Hidden data containers to avoid JavaScript escaping issues -->
<div style="display: none;">
    <div id="data-question-back">{{question}}</div>
    <div id="data-answer-1-back">{{answer_1}}</div>
    <div id="data-answer-1-vi-back">{{answer_1_vi}}</div>
    <div id="data-flag-1-back">{{correct_answer_flag_1}}</div>
    <div id="data-answer-2-back">{{answer_2}}</div>
    <div id="data-answer-2-vi-back">{{answer_2_vi}}</div>
    <div id="data-flag-2-back">{{correct_answer_flag_2}}</div>
    <div id="data-answer-3-back">{{answer_3}}</div>
    <div id="data-answer-3-vi-back">{{answer_3_vi}}</div>
    <div id="data-flag-3-back">{{correct_answer_flag_3}}</div>
    <div id="data-answer-4-back">{{answer_4}}</div>
    <div id="data-answer-4-vi-back">{{answer_4_vi}}</div>
    <div id="data-flag-4-back">{{correct_answer_flag_4}}</div>
    <div id="data-explanation-back">{{explanation}}</div>
    <div id="data-explanation-vi-back">{{explanation_vi}}</div>
</div>
<div class="prettify-flashcard">
    <div class="prettify-field prettify-field--front">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">{{question}}</div>
        {{#question_vi}}
        <div style="font-size: 16px; color: #666; font-weight: 500;">{{question_vi}}</div>
        {{/question_vi}}
    </div>
    <ol class="prettify-multiple-choice" id="answer-options-back">
        <!-- Options will be dynamically inserted here by JavaScript -->
    </ol>
    <div id="explanation-container" style="margin-top: 20px; padding: 16px; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 6px; display: none;">
        <div style="font-size: 14px; font-weight: 600; color: #1e40af; margin-bottom: 8px;">💡 Explanation</div>
        <div id="explanation-text" style="font-size: 15px; color: #1e3a8a; line-height: 1.6;"></div>
    </div>
</div>

<script>
    // Function to retrieve the order of answers from front side
    function getShuffledIndices() {
        // Try to get from the data attribute first
        const indicesAttr = document.querySelector('.card').getAttribute('data-shuffled-indices');
        if (indicesAttr) {
            return indicesAttr.split(',').map(Number);
        }
        
        // If the attribute is not found (shouldn't happen), use a seeded shuffle
        // This is a fallback that ensures consistent ordering between front/back
        function generateSeed(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash = hash & hash;
            }
            return hash;
        }
        
        function seededRandom(seed) {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        }
        
        function seededShuffle(array, seed) {
            const result = Array.from({length: array.length}, (_, i) => i);
            let currentSeed = seed;
            
            for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
                [result[i], result[j]] = [result[j], result[i]];
            }
            
            return result;
        }
        
        // Generate same shuffle order based on question text
        const questionText = document.getElementById("data-question-back").textContent;
        return seededShuffle([0, 1, 2, 3], generateSeed(questionText));
    }
    
    // Run once when the answer side is shown
    onUpdateHook.push(function() {
        const optionsContainer = document.getElementById("answer-options-back");
        if (!optionsContainer) return;
        
        // Read data from hidden data containers to avoid escaping issues
        const options = [
            { 
                text: document.getElementById("data-answer-1-back").textContent, 
                text_vi: document.getElementById("data-answer-1-vi-back").textContent, 
                correct: document.getElementById("data-flag-1-back").textContent === 'True' 
            },
            { 
                text: document.getElementById("data-answer-2-back").textContent, 
                text_vi: document.getElementById("data-answer-2-vi-back").textContent, 
                correct: document.getElementById("data-flag-2-back").textContent === 'True' 
            },
            { 
                text: document.getElementById("data-answer-3-back").textContent, 
                text_vi: document.getElementById("data-answer-3-vi-back").textContent, 
                correct: document.getElementById("data-flag-3-back").textContent === 'True' 
            },
            { 
                text: document.getElementById("data-answer-4-back").textContent, 
                text_vi: document.getElementById("data-answer-4-vi-back").textContent, 
                correct: document.getElementById("data-flag-4-back").textContent === 'True' 
            }
        ];
        
        // Get the indices in the same order as the front template
        const indices = getShuffledIndices();
        
        // Use the indices to create the same order as the front
        const orderedOptions = indices.map(index => options[index]);
        
        // Clear existing options if any
        optionsContainer.innerHTML = '';
        
        // Add options in the same order as front template
        orderedOptions.forEach(option => {
            const li = document.createElement('li');
            // Show both English and Vietnamese if available
            let optionHtml = option.text;
            if (option.text_vi && option.text_vi.trim()) {
                optionHtml += '<br><span style="font-size: 14px; color: #666;">' + option.text_vi + '</span>';
            }
            li.innerHTML = optionHtml;
            
            // Add appropriate class for correct answers
            if (option.correct) {
                li.classList.add('prettify-correct');
            }
            
            optionsContainer.appendChild(li);
        });
        
        // Display explanation if available
        const explanationText = document.getElementById('data-explanation-back').textContent;
        const explanationViText = document.getElementById('data-explanation-vi-back').textContent;
        if ((explanationText && explanationText.trim()) || (explanationViText && explanationViText.trim())) {
            const explanationContainer = document.getElementById('explanation-container');
            const explanationTextDiv = document.getElementById('explanation-text');
            
            // Clear previous content
            explanationTextDiv.innerHTML = '';
            
            if (explanationText && explanationText.trim()) {
                const enDiv = document.createElement('div');
                enDiv.textContent = explanationText;
                explanationTextDiv.appendChild(enDiv);
            }
            
            if (explanationViText && explanationViText.trim()) {
                const viDiv = document.createElement('div');
                viDiv.style.color = '#3730a3';
                viDiv.style.fontWeight = '500';
                viDiv.style.marginTop = '8px';
                viDiv.textContent = explanationViText;
                explanationTextDiv.appendChild(viDiv);
            }
            
            explanationContainer.style.display = 'block';
        }
    });
</script>`,
      }
    ];

    const createPayload = {
      action: "createModel",
      version: 6,
      params: {
        modelName,
        inOrderFields,
        css,
        cardTemplates
      }
    };
    const createRes = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPayload)
    });
    const createData = await createRes.json();
    console.debug("AnkiConnect createModel response:", createData);
    return true;
  } catch (err) {
    console.error("ensureMultipleChoiceModelExists error:", err);
    return false;
  }
}

// =======================
// Card Template & CSS
// =======================
const css = `
.card {
    font-family: arial;
    font-size: 22px;
    text-align: center;
    color: #222;
    background: #fff;
    padding: 24px 8px;
}
.cloze {
    font-weight: bold;
    color: #1565c0;
    font-size: 28px;
    margin: 18px 0 8px 0;
    letter-spacing: 2px;
}
.translation {
    color: #388e3c;
    font-size: 20px;
    margin: 10px 0 18px 0;
}
.ipa {
    color: #555;
    font-size: 18px;
    margin-bottom: 6px;
}
.wordtype {
    color: #888;
    font-size: 16px;
    margin-bottom: 12px;
}
.audio-button {
    background: none;
    color: #1976d2;
    border: none;
    cursor: pointer;
    font-size: 18px;
    margin: 8px 0;
}
.example {
    margin-top: 18px;
    padding: 12px;
    background: #f1f8e9;
    border-radius: 4px;
    color: #333;
}
`;

const cardTemplates = [
  {
    Name: "Vocabulary Cloze",
    Front: `
<div class="cloze">{{EnglishCloze}}</div>
<div class="ipa">{{IPA}}</div>
<div class="wordtype">({{WordType}})</div>
<div class="translation">{{VietnameseCloze}}</div>
{{#AudioFile}}
<button class="audio-button" onclick="playAudio()">🔊</button>
<audio id="localAudio" preload="auto">
    <source src="{{AudioFile}}" type="audio/mpeg">
</audio>
{{/AudioFile}}
{{^AudioFile}}
<!-- No audio available -->
{{/AudioFile}}
<audio id="onlineAudio" preload="auto">
    <source src="https://ssl.gstatic.com/dictionary/static/sounds/20200429/{{EnglishWord}}--_us_1.mp3" type="audio/mpeg">
</audio>
<script>
function playAudio() {
    var localAudio = document.getElementById('localAudio');
    var onlineAudio = document.getElementById('onlineAudio');
    if (localAudio && localAudio.canPlayType('audio/mpeg')) {
        localAudio.play().catch(function() {
            onlineAudio.play();
        });
    } else {
        onlineAudio.play();
    }
}
playAudio();
</script>
`,
    Back: `
<div class="cloze">{{EnglishWord}}</div>
<div id="syllables-boxes" style="margin: 10px 0;"></div>
<script>
(function() {
    var syllables = "{{Syllables}}";
    var container = document.getElementById("syllables-boxes");
    if (syllables && container) {
        var parts = syllables.split(/,\\s*/);
        for (var i = 0; i < parts.length; i++) {
            var span = document.createElement("span");
            span.textContent = parts[i];
            span.style.display = "inline-block";
            span.style.background = "#e3eafc";
            span.style.color = "#1565c0";
            span.style.padding = "6px 16px";
            span.style.margin = "2px 4px";
            span.style.borderRadius = "6px";
            span.style.fontWeight = "bold";
            container.appendChild(span);
        }
    }
})();
</script>
<div class="ipa">{{IPA}}</div>
<div class="wordtype">({{WordType}})</div>
<div class="translation">{{VietnameseTranslation}}</div>
{{#AudioFile}}
<button class="audio-button" onclick="playAudio()">🔊</button>
<audio id="localAudio" preload="auto">
    <source src="{{AudioFile}}" type="audio/mpeg">
</audio>
{{/AudioFile}}
{{^AudioFile}}
<!-- No audio available -->
{{/AudioFile}}
<audio id="onlineAudio" preload="auto">
    <source src="https://ssl.gstatic.com/dictionary/static/sounds/20200429/{{EnglishWord}}--_us_1.mp3" type="audio/mpeg">
</audio>
<div class="example"><strong>Example:</strong> {{ExampleSentence}}</div>
<div class="example"><strong>Ví dụ:</strong> {{ExampleSentenceVN}}</div>
<script>
function playAudio() {
    var localAudio = document.getElementById('localAudio');
    var onlineAudio = document.getElementById('onlineAudio');
    if (localAudio && localAudio.canPlayType('audio/mpeg')) {
        localAudio.play().catch(function() {
            onlineAudio.play();
        });
    } else {
        onlineAudio.play();
    }
}
playAudio();
</script>
`
  }
];

// =======================
// Deck Name Helper
// =======================
async function getDeckName() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['deckName'], (result) => {
      resolve(result.deckName || "English Vocabulary");
    });
  });
}

// =======================
// Main Add-to-Anki Logic
// =======================

// Helper: Get both translation and info from Gemini in one call
async function getGeminiTranslationAndInfo(word) {
  const apiKey = await getGeminiApiKeyFromPool();
  if (!apiKey) return { translation: "", info: {} };
  // Compose a single prompt to get both translation and info
  const prompt = `For the English word "${word}", provide the following in JSON:\n{\n  \"translation\": \"<Vietnamese translation, only the word, no explanation, lowercase>\",\n  \"example\": \"<Give a simple, natural English sentence using the word \\\"${word}\\\". Do not use generic templates or mention the instruction itself.>\",\n  \"exampleVN\": \"<Translate the example sentence to Vietnamese.>\",\n  \"ipa\": \"<IPA transcription, e.g. /ˈwɜ:d/>\",\n  \"type\": \"<word type: n, v, adj, adv, prep, pron, conj, interj>\",\n  \"syllables\": \"<Split the word into syllables, separated by comma, e.g. pro, cras, ti, nate>\"\n}\nOnly output valid JSON, no explanation, no extra text.`;
  try {
    const model = await getGeminiModel();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
    const data = await res.json();
    let respText = "";
    if (data && data.candidates && data.candidates.length > 0) {
      const parts = data.candidates[0].content.parts;
      if (parts && parts.length > 0 && parts[0].text) {
        respText = parts[0].text;
      }
    }
    const start = respText.indexOf("{");
    const end = respText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const jsonStr = respText.slice(start, end + 1);
      try {
        const info = JSON.parse(jsonStr);
        return {
          translation: info.translation ? info.translation.trim().toLowerCase() : "",
          info: {
            example: info.example ? info.example.trim() : "",
            exampleVN: info.exampleVN ? info.exampleVN.trim() : "",
            ipa: info.ipa ? info.ipa.trim() : "",
            type: info.type ? info.type.trim() : "",
            syllables: info.syllables ? info.syllables.trim() : ""
          }
        };
      } catch (e) {
        console.warn("Gemini getGeminiTranslationAndInfo JSON parse error:", e, jsonStr);
        return { translation: "", info: {} };
      }
    }
    return { translation: "", info: {} };
  } catch (err) {
    console.error("Gemini getGeminiTranslationAndInfo error:", err);
    return { translation: "", info: {} };
  }
}

async function addToAnki(word) {
  const deckName = await getDeckName();
  const modelName = "English Vocab Cloze Template 1.0";
  const inOrderFields = [
    "Id", "EnglishWord", "EnglishCloze", "VietnameseTranslation", "VietnameseCloze",
    "IPA", "WordType", "ExampleSentence", "ExampleSentenceVN", "AudioFile", "Syllables"
  ];

  await ensureDeckExists(deckName);
  await ensureModelExists(modelName, inOrderFields, css, cardTemplates);

  const englishCloze = createCloze(word);
  const { translation: vietnameseTranslation, info } = await getGeminiTranslationAndInfo(word);
  const vietnameseCloze = createCloze(vietnameseTranslation);

  const audioFile = await downloadAndStoreAudio(word);
  console.log("Word info from Gemini:", info);
  console.log("Audio filename for word:", word, audioFile);

  const note = {
    deckName,
    modelName,
    fields: {
      Id: word + "::" + vietnameseTranslation,
      EnglishWord: word,
      EnglishCloze: englishCloze,
      VietnameseTranslation: vietnameseTranslation,
      VietnameseCloze: vietnameseCloze,
      IPA: info.ipa || "",
      WordType: info.type || "",
      ExampleSentence: info.example || "",
      ExampleSentenceVN: info.exampleVN || "",
      AudioFile: audioFile,
      Syllables: info.syllables || "",
    },
    tags: ["vocabulary", "english", "cloze"]
  };
  const params = { note };
  const payload = {
    action: "addNote",
    version: 6,
    params: params
  };
  try {
    const res = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.debug("AnkiConnect addNote response:", data);
    if (data.error) {
      throw new Error(data.error);
    }
    return { success: true, vietnameseTranslation };
  } catch (err) {
    // Hiển thị popup lỗi và clear popup loading
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const tabId = tabs[0].id;
          removeNotify(tabId, "ankihelper-loading-notify");
          notify(tabId, "Lỗi kết nối AnkiConnect: " + (err.message || err), false);
        }
      });
    }
    console.error("AnkiConnect error:", err);
    return { success: false, vietnameseTranslation };
  }
}

async function addToAnkiWithCustomMeaning(word, vietnameseTranslation) {
  const deckName = await getDeckName();
  const modelName = "English Vocab Cloze Template 1.0";
  const inOrderFields = [
    "Id", "EnglishWord", "EnglishCloze", "VietnameseTranslation", "VietnameseCloze",
    "IPA", "WordType", "ExampleSentence", "ExampleSentenceVN", "AudioFile", "Syllables"
  ];

  await ensureDeckExists(deckName);
  await ensureModelExists(modelName, inOrderFields, css, cardTemplates);

  const englishCloze = createCloze(word);
  const vietnameseCloze = createCloze(vietnameseTranslation);

  const info = await getWordInfo(word, vietnameseTranslation);
  const audioFile = await downloadAndStoreAudio(word);
  console.log("Word info from Gemini:", info);
  console.log("Audio filename for word:", word, audioFile);

  const note = {
    deckName,
    modelName,
    fields: {
      Id: word + "::" + vietnameseTranslation,
      EnglishWord: word,
      EnglishCloze: englishCloze,
      VietnameseTranslation: vietnameseTranslation,
      VietnameseCloze: vietnameseCloze,
      IPA: info.ipa || "",
      WordType: info.type || "",
      ExampleSentence: info.example || "",
      ExampleSentenceVN: info.exampleVN || "",
      AudioFile: audioFile,
      Syllables: info.syllables || "",
    },
    tags: ["vocabulary", "english", "cloze"]
  };
  const params = { note };
  const payload = {
    action: "addNote",
    version: 6,
    params: params
  };
  try {
    const res = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.debug("AnkiConnect addNote response:", data);
    if (data.error) {
      throw new Error(data.error);
    }
    return { success: true, vietnameseTranslation };
  } catch (err) {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const tabId = tabs[0].id;
          removeNotify(tabId, "ankihelper-loading-notify");
          notify(tabId, "Lỗi kết nối AnkiConnect: " + (err.message || err), false);
        }
      });
    }
    console.error("AnkiConnect error:", err);
    return { success: false, vietnameseTranslation };
  }
}

// =======================
// Audio Download & Store
// =======================
async function downloadAndStoreAudio(word) {
  let audioSources = [];
  try {
    const cambridgeUrl = `https://dictionary.cambridge.org/vi/dictionary/english/${word}`;
    const resp = await fetch(cambridgeUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      }
    });
    if (resp.status === 200) {
      const html = await resp.text();
      const match = html.match(/<source[^>]+src="([^"]+\.mp3)"[^>]*type=['"]audio\/mpeg['"]/);
      if (match && match[1]) {
        const link = match[1].startsWith("/") ? "https://dictionary.cambridge.org" + match[1] : match[1];
        audioSources = [link];
      }
    }
  } catch (err) {
    audioSources = [
      `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${word}--_us_1.mp3`,
      `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${word}--_gb_1.mp3`,
      `https://ssl.gstatic.com/dictionary/static/sounds/20220808/${word}--_us_1.mp3`,
      `https://ssl.gstatic.com/dictionary/static/sounds/20220808/${word}--_us_1_rr.mp3`,
      `https://ssl.gstatic.com/dictionary/static/sounds/20220808/${word}--_us_2.mp3`,
      `https://audio.vocab.com/1.0/us/${word.charAt(0).toUpperCase() + word.slice(1)}.mp3`
    ];
  }
  if (audioSources.length === 0) {
    audioSources = [
      `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${word}--_us_1.mp3`,
      `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${word}--_gb_1.mp3`,
      `https://ssl.gstatic.com/dictionary/static/sounds/20220808/${word}--_us_1.mp3`,
      `https://ssl.gstatic.com/dictionary/static/sounds/20220808/${word}--_us_1_rr.mp3`,
      `https://ssl.gstatic.com/dictionary/static/sounds/20220808/${word}--_us_2.mp3`,
      `https://audio.vocab.com/1.0/us/${word.charAt(0).toUpperCase() + word.slice(1)}.mp3`
    ];
  }
  let audioData = null;
  let audioUrl = "";
  for (const url of audioSources) {
    try {
      const resp = await fetch(url);
      if (resp.status === 200) {
        audioUrl = url;
        audioData = await resp.arrayBuffer();
        break;
      }
    } catch { }
  }
  if (!audioData) {
    console.warn("Could not download audio from any source for:", word);
    return "";
  }

  console.log("Downloaded audio data for word:", word, "from:", audioUrl);
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(word));
  const hashHex = Array.from(new Uint8Array(hashBuffer)).slice(0, 4).map(b => b.toString(16).padStart(2, "0")).join("");
  const filename = `vocab_${word}_${hashHex}.mp3`;
  const base64Data = btoa(String.fromCharCode(...new Uint8Array(audioData)));
  const params = {
    filename: filename,
    data: base64Data
  };
  try {
    const res = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storeMediaFile",
        version: 6,
        params: params
      })
    });
    const data = await res.json();
    console.debug("AnkiConnect storeMediaFile response:", data);
    if (data.error) {
      throw new Error(data.error);
    }
    return filename;
  } catch (err) {
    console.error("Failed to store audio file in Anki:", err);
    return "";
  }
}
/**
 * Normalize a word to its base/lemma form using compromise
 * - Verbs -> infinitive (e.g., "running" -> "run")
 * - Nouns -> singular (e.g., "cars" -> "car")
 *
 * @param {string} word - Input word
 * @returns {Promise<string>} - Normalized word
 */
async function normalizeWord(tabId, word) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId },
      func: (selectedWord) => {
        const lowercaseWord = selectedWord.toLowerCase();

        let result = {
          original: selectedWord,
          normalized: lowercaseWord,
          log: []
        };

        if (lowercaseWord.trim().split(/\s+/).length > 1) {
          result.log.push("Input is a sentence, skipping normalization.");
          result.normalized = selectedWord;
          return result;
        }

        if (typeof nlp === "undefined") {
          result.log.push("compromise_nlp is not loaded!");
          return result;
        }
        let doc = nlp(lowercaseWord);

        if (doc.verbs().out('array').length > 0) {
          let form = doc.verbs().toInfinitive().out('array');
          result.normalized = form[0] || lowercaseWord;
          result.log.push("Verb detected, infinitive: " + result.normalized);
          return result;
        }

        if (doc.nouns().out('array').length > 0) {
          let form = doc.nouns().toSingular().out('array');
          result.normalized = form[0] || lowercaseWord;
          result.log.push("Noun detected, singular: " + result.normalized);
          return result;
        }

        result.log.push("No verb, noun or adjective found, returning original word: " + selectedWord);
        return result;
      },
      args: [word]
    }).then(results => {
      if (results && results[0] && typeof results[0].result === "object") {
        console.log("normalizeWord debug:", results[0].result);
        resolve(results[0].result.normalized);
      } else {
        console.log("normalizeWord fallback:", results);
        resolve(word);
      }
    }).catch((err) => {
      console.log("normalizeWord error:", err);
      resolve(word);
    });
  });
}

/**
 * Prompt the user for Vietnamese meaning using a popup input injected into the page.
 * @param {number} tabId
 * @param {string} word
 * @returns {Promise<string>} - User input or empty string if cancelled
 */
function promptForVietnamese(tabId, word) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (selectedWord) => {
      return new Promise((resolve) => {
        // Remove any previous popup
        const oldPopup = document.getElementById("ankihelper-vn-popup");
        if (oldPopup) oldPopup.remove();

        // Create popup container
        const popup = document.createElement("div");
        popup.id = "ankihelper-vn-popup";
        popup.style.position = "fixed";
        popup.style.top = "50%";
        popup.style.left = "50%";
        popup.style.transform = "translate(-50%, -50%)";
        popup.style.zIndex = 99999;
        popup.style.background = "#fff";
        popup.style.border = "2px solid #1565c0";
        popup.style.borderRadius = "10px";
        popup.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)";
        popup.style.padding = "28px 24px";
        popup.style.fontSize = "18px";
        popup.style.color = "#222";
        popup.style.textAlign = "center";
        popup.innerHTML = `
          <div style="margin-bottom: 12px;">
            <strong>Chỉnh sửa từ tiếng Anh (nếu cần):</strong><br>
            <input id="ankihelper-en-input" type="text" value="${selectedWord}" style="width:90%;padding:8px;font-size:18px;border-radius:6px;border:1px solid #1976d2;margin-bottom:16px;" />
          </div>
          <div style="margin-bottom: 12px;">
            <strong>Nhập nghĩa tiếng Việt cho:</strong><br>
            <input id="ankihelper-vn-input" type="text" style="width:90%;padding:8px;font-size:18px;border-radius:6px;border:1px solid #ccc;" />
          </div>
          <div style="margin-top:18px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            <button id="ankihelper-vn-ok" style="background:#388e3c;color:#fff;padding:8px 18px;border:none;border-radius:6px;font-size:18px;cursor:pointer;">OK</button>
            <button id="ankihelper-vn-default" style="background:#1976d2;color:#fff;padding:8px 18px;border:none;border-radius:6px;font-size:18px;cursor:pointer;">✨ Auto</button>
            <button id="ankihelper-vn-cancel" style="background:#c62828;color:#fff;padding:8px 18px;border:none;border-radius:6px;font-size:18px;cursor:pointer;">Cancel</button>
          </div>
        `;
        document.body.appendChild(popup);

        const enInput = document.getElementById("ankihelper-en-input");
        const vnInput = document.getElementById("ankihelper-vn-input");
        vnInput.focus();

        function cleanup() {
          popup.remove();
        }

        document.getElementById("ankihelper-vn-ok").onclick = () => {
          const enValue = enInput.value.trim();
          const vnValue = vnInput.value.trim();
          cleanup();
          resolve({ english: enValue, vietnamese: vnValue });
        };
        document.getElementById("ankihelper-vn-default").onclick = () => {
          const enValue = enInput.value.trim();
          cleanup();
          resolve({ english: enValue, vietnamese: "__default__" });
        };
        document.getElementById("ankihelper-vn-cancel").onclick = () => {
          cleanup();
          resolve({ english: null, vietnamese: "" });
        };
        vnInput.onkeydown = (e) => {
          if (e.key === "Enter") {
            document.getElementById("ankihelper-vn-ok").click();
          }
          if (e.key === "Escape") {
            document.getElementById("ankihelper-vn-cancel").click();
          }
        };
        enInput.onkeydown = (e) => {
          if (e.key === "Enter") {
            vnInput.focus();
          }
          if (e.key === "Escape") {
            document.getElementById("ankihelper-vn-cancel").click();
          }
        };
      });
    },
    args: [word],
  }).then(results => {
    // results[0].result is an object: { english, vietnamese }
    return results && results[0] && typeof results[0].result === "object" ? results[0].result : { english: word, vietnamese: "" };
  });
}

/**
 * Show flashcard selection modal by injecting script directly into page
 * @param {number} tabId
 * @param {Array} flashcards - Array of flashcard objects
 */
function showFlashcardSelectionModal(tabId, flashcards) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (flashcardsData) => {
      return new Promise((resolve) => {
        // Remove any existing modal
        const oldModal = document.getElementById("ankihelper-flashcard-modal");
        if (oldModal) oldModal.remove();

        const notes = flashcardsData;

        // Create modal overlay
        const modal = document.createElement("div");
        modal.id = "ankihelper-flashcard-modal";
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(4px);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.2s ease-out;
        `;

        // Add keyframe animation
        const style = document.createElement('style');
        style.textContent = `
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        `;
        document.head.appendChild(style);

        // Modal content container
        const content = document.createElement("div");
        content.style.cssText = `
          background: #ffffff;
          border-radius: 12px;
          padding: 0;
          max-width: 700px;
          width: 90%;
          max-height: 85vh;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
          border: 1px solid rgba(148, 163, 184, 0.35);
          display: flex;
          flex-direction: column;
          animation: slideUp 0.3s ease-out;
        `;

        // Header
        const header = document.createElement("div");
        header.style.cssText = `
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
          background: linear-gradient(180deg, #3b82f6, #2563eb);
          border-radius: 12px 12px 0 0;
        `;
        const title = document.createElement("h2");
        title.textContent = "📚 Select Flashcards to Import";
        title.style.cssText = `
          margin: 0 0 6px 0;
          font-size: 20px;
          font-weight: 650;
          color: #ffffff;
        `;
        const subtitle = document.createElement("p");
        subtitle.textContent = `${notes.length} flashcard${notes.length > 1 ? 's' : ''} generated`;
        subtitle.style.cssText = `
          margin: 0;
          font-size: 13px;
          color: rgba(255,255,255,0.9);
        `;
        header.appendChild(title);
        header.appendChild(subtitle);

        // Body container (scrollable)
        const body = document.createElement("div");
        body.style.cssText = `
          padding: 20px 24px;
          overflow-y: auto;
          flex: 1;
          background: #f9fafb;
        `;

        // Deck input section
        const deckSection = document.createElement("div");
        deckSection.style.cssText = `
          margin-bottom: 16px;
          padding: 16px;
          background: #ffffff;
          border-radius: 8px;
          border: 1px solid #e0e4ec;
        `;
        const deckLabel = document.createElement("label");
        deckLabel.textContent = "Deck Name";
        deckLabel.style.cssText = `
          display: block;
          margin-bottom: 6px;
          font-weight: 600;
          font-size: 13px;
          color: #111827;
        `;
        const deckInput = document.createElement("input");
        deckInput.type = "text";
        deckInput.placeholder = "Enter deck name...";
        deckInput.value = "Gemini Flashcards";
        deckInput.style.cssText = `
          width: 100%;
          font-size: 13px;
          padding: 9px 10px;
          border-radius: 8px;
          border: 1px solid #e0e4ec;
          transition: all 0.15s;
          box-sizing: border-box;
          background-color: #f9fafb;
        `;
        deckInput.onfocus = () => {
          deckInput.style.borderColor = "#2563eb";
          deckInput.style.boxShadow = "0 0 0 1px rgba(37, 99, 235, 0.18)";
          deckInput.style.background = "#ffffff";
        };
        deckInput.onblur = () => {
          deckInput.style.borderColor = "#e0e4ec";
          deckInput.style.boxShadow = "none";
          deckInput.style.background = "#f9fafb";
        };
        deckSection.appendChild(deckLabel);
        deckSection.appendChild(deckInput);

        // Select all controls
        const controlsRow = document.createElement("div");
        controlsRow.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding: 10px 14px;
          background: #ffffff;
          border-radius: 8px;
          border: 1px solid #e0e4ec;
        `;
        const selectAllLabel = document.createElement("label");
        selectAllLabel.style.cssText = `
          display: flex;
          align-items: center;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          color: #111827;
        `;
        const selectAllCheckbox = document.createElement("input");
        selectAllCheckbox.type = "checkbox";
        selectAllCheckbox.checked = true;
        selectAllCheckbox.style.cssText = `
          width: 18px;
          height: 18px;
          margin-right: 8px;
          cursor: pointer;
        `;
        const selectAllText = document.createElement("span");
        selectAllText.textContent = "Select All";
        selectAllLabel.appendChild(selectAllCheckbox);
        selectAllLabel.appendChild(selectAllText);
        
        const selectedCount = document.createElement("span");
        selectedCount.style.cssText = `
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        `;
        selectedCount.textContent = `${notes.length} selected`;
        
        controlsRow.appendChild(selectAllLabel);
        controlsRow.appendChild(selectedCount);

        // Flashcard list
        const list = document.createElement("div");
        list.style.cssText = `margin-bottom: 0;`;

        // Function to update count
        const updateCount = () => {
          const checkedCount = list.querySelectorAll('input[type="checkbox"]:checked').length;
          selectedCount.textContent = `${checkedCount} selected`;
          selectAllCheckbox.checked = checkedCount === notes.length;
        };

        // Select all handler
        selectAllCheckbox.onchange = () => {
          const checkboxes = list.querySelectorAll('input[type="checkbox"]');
          checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
          updateCount();
        };

        // Render flashcards
        notes.forEach((note, idx) => {
          const cardDiv = document.createElement("div");
          cardDiv.style.cssText = `
            border: 1px solid #e0e4ec;
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 10px;
            background: #ffffff;
            display: flex;
            gap: 12px;
            transition: all 0.15s;
            cursor: pointer;
          `;
          cardDiv.onmouseover = () => {
            cardDiv.style.borderColor = "#2563eb";
            cardDiv.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.12)";
          };
          cardDiv.onmouseout = () => {
            cardDiv.style.borderColor = "#e0e4ec";
            cardDiv.style.boxShadow = "none";
          };

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = true;
          checkbox.dataset.idx = idx;
          checkbox.style.cssText = `
            width: 20px;
            height: 20px;
            margin-top: 2px;
            cursor: pointer;
            flex-shrink: 0;
          `;
          checkbox.onchange = updateCount;

          const cardContent = document.createElement("div");
          cardContent.style.cssText = `flex: 1; line-height: 1.6;`;
          
          const questionDiv = document.createElement("div");
          questionDiv.style.cssText = `
            font-weight: 600;
            font-size: 15px;
            color: #111827;
            margin-bottom: 8px;
          `;
          questionDiv.innerHTML = `
            <div style="margin-bottom: 4px;">${note.question}</div>
            ${note.question_vi ? `<div style="color: #6b7280; font-weight: 500;">${note.question_vi}</div>` : ''}
          `;
          
          const optionsDiv = document.createElement("div");
          optionsDiv.style.cssText = `
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 6px;
          `;
          const optionsHtml = note.options.map((opt, i) => {
            const optVi = note.options_vi && note.options_vi[i] ? `<br><span style="font-size: 13px; color: #9ca3af;">${note.options_vi[i]}</span>` : '';
            return `<span style="display: inline-block; margin-right: 8px; margin-bottom: 6px; padding: 4px 10px; background: #f3f4f6; border-radius: 4px;">${String.fromCharCode(65+i)}. ${opt}${optVi}</span>`;
          }).join('');
          optionsDiv.innerHTML = optionsHtml;
          
          const answerDiv = document.createElement("div");
          answerDiv.style.cssText = `
            font-size: 14px;
            color: #059669;
            font-weight: 500;
          `;
          const answerVi = note.answer_vi ? ` / ${note.answer_vi}` : '';
          answerDiv.innerHTML = `✓ Answer: ${note.answer}${answerVi}`;

          cardContent.appendChild(questionDiv);
          cardContent.appendChild(optionsDiv);
          cardContent.appendChild(answerDiv);

          // Add explanation if available
          if (note.explanation || note.explanation_vi) {
            const explanationDiv = document.createElement("div");
            explanationDiv.style.cssText = `
              margin-top: 8px;
              padding: 8px 12px;
              background: #eff6ff;
              border-left: 3px solid #3b82f6;
              border-radius: 4px;
              font-size: 13px;
              color: #1e40af;
              line-height: 1.5;
            `;
            let expContent = '';
            if (note.explanation) {
              expContent = `<div style="margin-bottom: ${note.explanation_vi ? '4px' : '0'};">💡 ${note.explanation}</div>`;
            }
            if (note.explanation_vi) {
              expContent += `<div style="color: #3730a3; font-weight: 500;">💡 ${note.explanation_vi}</div>`;
            }
            explanationDiv.innerHTML = expContent;
            cardContent.appendChild(explanationDiv);
          }

          cardDiv.appendChild(checkbox);
          cardDiv.appendChild(cardContent);
          
          // Click card to toggle checkbox
          cardDiv.onclick = (e) => {
            if (e.target !== checkbox) {
              checkbox.checked = !checkbox.checked;
              updateCount();
            }
          };

          list.appendChild(cardDiv);
        });

        body.appendChild(deckSection);
        body.appendChild(controlsRow);
        body.appendChild(list);

        // Footer with buttons
        const footer = document.createElement("div");
        footer.style.cssText = `
          padding: 16px 24px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          background: #ffffff;
          border-radius: 0 0 12px 12px;
        `;

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.cssText = `
          padding: 8px 16px;
          border-radius: 999px;
          border: 1px solid #d1d5db;
          background: #f9fafb;
          color: #374151;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.12s;
        `;
        cancelBtn.onmouseover = () => {
          cancelBtn.style.background = "#eef2ff";
          cancelBtn.style.borderColor = "#c7d2fe";
          cancelBtn.style.transform = "translateY(-0.5px)";
        };
        cancelBtn.onmouseout = () => {
          cancelBtn.style.background = "#f9fafb";
          cancelBtn.style.borderColor = "#d1d5db";
          cancelBtn.style.transform = "translateY(0)";
        };

        const importBtn = document.createElement("button");
        importBtn.textContent = "Import to Anki";
        importBtn.style.cssText = `
          padding: 8px 16px;
          border-radius: 999px;
          border: none;
          background: #2563eb;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.25);
        `;
        importBtn.onmouseover = () => {
          importBtn.style.background = "#1d4ed8";
          importBtn.style.transform = "translateY(-1px)";
          importBtn.style.boxShadow = "0 10px 24px rgba(37, 99, 235, 0.35)";
        };
        importBtn.onmouseout = () => {
          importBtn.style.background = "#2563eb";
          importBtn.style.transform = "translateY(0)";
          importBtn.style.boxShadow = "0 8px 18px rgba(37, 99, 235, 0.25)";
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(importBtn);

        // Assemble modal
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Event handlers
        cancelBtn.onclick = () => {
          modal.remove();
          resolve({ cancelled: true });
        };

        importBtn.onclick = () => {
          const selected = [];
          list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.checked) selected.push(notes[cb.dataset.idx]);
          });
          if (selected.length === 0) {
            alert("Please select at least one flashcard to import.");
            return;
          }
          
          importBtn.textContent = "Importing...";
          importBtn.disabled = true;
          importBtn.style.opacity = "0.7";
          
          chrome.runtime.sendMessage({
            type: "ankihelper_import_flashcards",
            deckName: deckInput.value.trim() || "Gemini Flashcards",
            notes: selected
          });
          
          setTimeout(() => modal.remove(), 500);
          resolve({ imported: true, count: selected.length });
        };

        // Close on overlay click
        modal.onclick = (e) => {
          if (e.target === modal) {
            modal.remove();
            resolve({ cancelled: true });
          }
        };
      });
    },
    args: [flashcards]
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if ((info.menuItemId === "add-to-anki" || info.menuItemId === "add-to-anki-custom-meaning") && info.selectionText) {
    normalizeWord(tab.id, info.selectionText).then(infinitiveWord => {
      console.log("Infinitive word:", infinitiveWord);
      const loadingId = "ankihelper-loading-notify";
      notify(tab.id, "Đang thêm vào Anki...", true, loadingId);

      getGeminiApiKeyFromPool().then(apiKey => {
        if (!apiKey) {
          removeNotify(tab.id, loadingId);
          notify(tab.id, "Vui lòng nhập Gemini API Key trong phần cài đặt extension!", false);
          return;
        }
        if (info.menuItemId === "add-to-anki") {
          addToAnki(infinitiveWord).then(result => {
            removeNotify(tab.id, loadingId);
            if (result.success) {
              notify(tab.id, `Đã thêm vào Anki: ${infinitiveWord} (${result.vietnameseTranslation})`, true);
            } else {
              notify(tab.id, "Thêm vào Anki thất bại.", false);
            }
          });
        } else if (info.menuItemId === "add-to-anki-custom-meaning") {
          promptForVietnamese(tab.id, infinitiveWord).then(({ english, vietnamese }) => {
            // If user cancels, english will be null
            if (english === null) {
              removeNotify(tab.id, loadingId);
              return;
            }
            if (!vietnamese) {
              removeNotify(tab.id, loadingId);
              notify(tab.id, "Bạn chưa nhập nghĩa tiếng Việt!", false);
              return;
            }
            if (vietnamese === "__default__") {
              addToAnki(english).then(result => {
                removeNotify(tab.id, loadingId);
                if (result.success) {
                  notify(tab.id, `Đã thêm vào Anki: ${english} (${result.vietnameseTranslation})`, true);
                } else {
                  notify(tab.id, "Thêm vào Anki thất bại.", false);
                }
              });
              return;
            }
            addToAnkiWithCustomMeaning(english, vietnamese).then(result => {
              removeNotify(tab.id, loadingId);
              if (result.success) {
                notify(tab.id, `Đã thêm vào Anki: ${english} (${vietnamese})`, true);
              } else {
                notify(tab.id, "Thêm vào Anki thất bại.", false);
              }
            });
          });
        }
      });
    });
  } else if (info.menuItemId === "ankihelper_read_page_content") {
    // Show loading indicator
    showLoadingOverlay(tab.id, "Generating flashcards with Gemini AI...");
    // Send message to content script to get page content, title, and SEO meta
    chrome.tabs.sendMessage(tab.id, { type: "ankihelper_read_page_content" });
  } else if (info.menuItemId === "ankihelper_read_selection_content" && info.selectionText) {
    // Show loading indicator
    showLoadingOverlay(tab.id, "Generating flashcards with Gemini AI...");
    // Send message to content script to get selected content, title, and SEO meta
    chrome.tabs.sendMessage(tab.id, { type: "ankihelper_read_selection_content", selection: info.selectionText });
  }
});

// =======================
// Listen for floating button message from content.js
// =======================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ankihelper_add_to_anki" && msg.text) {
    const tabId = sender.tab ? sender.tab.id : undefined;
    if (!tabId) return;
    normalizeWord(tabId, msg.text).then(infinitiveWord => {
      const loadingId = "ankihelper-loading-notify";
      notify(tabId, "Đang thêm vào Anki...", true, loadingId);
      getGeminiApiKeyFromPool().then(apiKey => {
        if (!apiKey) {
          removeNotify(tabId, loadingId);
          notify(tabId, "Vui lòng nhập Gemini API Key trong phần cài đặt extension!", false);
          return;
        }
        promptForVietnamese(tabId, infinitiveWord).then(({ english, vietnamese }) => {
          // If user cancels, english will be null
          if (english === null) {
            removeNotify(tabId, loadingId);
            return;
          }
          if (vietnamese === "__default__") {
            addToAnki(english).then(result => {
              removeNotify(tabId, loadingId);
              if (result.success) {
                notify(tabId, `Đã thêm vào Anki: ${english} (${result.vietnameseTranslation})`, true);
              } else {
                notify(tabId, "Thêm vào Anki thất bại.", false);
              }
            });
            return;
          }
          if (!vietnamese) {
            removeNotify(tabId, loadingId);
            notify(tabId, "Bạn chưa nhập nghĩa tiếng Việt!", false);
            return;
          }
          addToAnkiWithCustomMeaning(english, vietnamese).then(result => {
            removeNotify(tabId, loadingId);
            if (result.success) {
              notify(tabId, `Đã thêm vào Anki: ${english} (${vietnamese})`, true);
            } else {
              notify(tabId, "Thêm vào Anki thất bại.", false);
            }
          });
        });
      });
    });
  }

  // Handle import of selected flashcards to Anki
  if (msg.type === "ankihelper_import_flashcards" && Array.isArray(msg.notes) && msg.notes.length > 0) {
    const tabId = sender.tab ? sender.tab.id : undefined;
    if (!tabId) return;
    const deckName = msg.deckName || "Gemini Flashcards";
    const modelName = "Multiple Choice With Explanation Model";

    // For each note, add to Anki using AnkiConnect
    (async () => {
      // Ensure deck exists
      await ensureDeckExists(deckName);

      // Define model fields and template
      const inOrderFields = [
        "question",
        "question_vi",
        "answer_1",
        "answer_1_vi",
        "answer_2",
        "answer_2_vi",
        "answer_3",
        "answer_3_vi",
        "answer_4",
        "answer_4_vi",
        "correct_answer_flag_1",
        "correct_answer_flag_2",
        "correct_answer_flag_3",
        "correct_answer_flag_4",
        "explanation",
        "explanation_vi"
      ];

      // Ensure model exists with proper template
      await ensureMultipleChoiceModelExists(modelName, inOrderFields);

      for (const note of msg.notes) {
        // Map note to Anki fields (multi-choice template with bilingual support)
        const correctIdx = note.options.findIndex(opt => opt === note.answer);
        const fields = [
          note.question,
          note.question_vi || "",
          note.options[0],
          note.options_vi && note.options_vi[0] || "",
          note.options[1],
          note.options_vi && note.options_vi[1] || "",
          note.options[2],
          note.options_vi && note.options_vi[2] || "",
          note.options[3],
          note.options_vi && note.options_vi[3] || "",
          correctIdx === 0 ? "True" : "False",
          correctIdx === 1 ? "True" : "False",
          correctIdx === 2 ? "True" : "False",
          correctIdx === 3 ? "True" : "False",
          note.explanation || "",
          note.explanation_vi || ""
        ];
        const ankiNote = {
          deckName,
          modelName: "Multiple Choice With Explanation Model",
          fields: {
            question: fields[0],
            question_vi: fields[1],
            answer_1: fields[2],
            answer_1_vi: fields[3],
            answer_2: fields[4],
            answer_2_vi: fields[5],
            answer_3: fields[6],
            answer_3_vi: fields[7],
            answer_4: fields[8],
            answer_4_vi: fields[9],
            correct_answer_flag_1: fields[10],
            correct_answer_flag_2: fields[11],
            correct_answer_flag_3: fields[12],
            correct_answer_flag_4: fields[13],
            explanation: fields[14],
            explanation_vi: fields[15]
          },
          tags: ["multi-choice"]
        };
        const payload = {
          action: "addNote",
          version: 6,
          params: { note: ankiNote }
        };
        try {
          await fetch("http://localhost:8765", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        } catch (err) {
          console.error("Error adding note to Anki:", err);
        }
      }
      // Notify user
      notify(tabId, "Đã nhập flashcards vào Anki!", true);
    })();
  }

  // Handle page/selection content for Gemini flashcard generation
  if ((msg.type === "ankihelper_page_content_result" || msg.type === "ankihelper_selection_content_result") && msg.data) {
    const tabId = sender.tab ? sender.tab.id : undefined;
    if (!tabId) return;
    const { title, metaDescription, metaKeywords, mainContent } = msg.data;
    getGeminiApiKeyFromPool().then(async (apiKey) => {
      if (!apiKey) {
        hideLoadingOverlay(tabId);
        notify(tabId, "Vui lòng nhập Gemini API Key trong phần cài đặt extension!", false);
        return;
      }
      const model = await getGeminiModel();
      const prompt = `For the content "${mainContent}" with topic ${title} - ${metaDescription} - ${metaKeywords}, generate bilingual (English-Vietnamese) flashcards in the following JSON format. The number of flashcards depends on the content length and must help me have comprehensive knowledge about it.
      Currently, only support multiple-choice flashcards with 4 options each.
      IMPORTANT: Provide BOTH English and Vietnamese for question, options, answer, AND explanation.
[{"type":"multi-choice","question":"What is Kubernetes?","question_vi":"Kubernetes là gì?","options":["A container orchestration tool","A programming language","A cloud provider","A database"],"options_vi":["Công cụ điều phối container","Ngôn ngữ lập trình","Nhà cung cấp đám mây","Cơ sở dữ liệu"],"answer":"A container orchestration tool","answer_vi":"Công cụ điều phối container","explanation":"Kubernetes is an open-source platform designed to automate deploying, scaling, and operating containerized applications. It orchestrates computing, networking, and storage infrastructure on behalf of user workloads.","explanation_vi":"Kubernetes là nền tảng mã nguồn mở được thiết kế để tự động hóa việc triển khai, mở rộng và vận hành các ứng dụng được đóng gói trong container. Nó điều phối cơ sở hạ tầng tính toán, mạng và lưu trữ thay mặt cho khối lượng công việc của người dùng."}]
Only output valid JSON, no explanation, no extra text.`;
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` + apiKey,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          }
        );
        const data = await res.json();
        console.log("Gemini flashcard generation response:", data);
        let respText = "";
        if (data && data.candidates && data.candidates.length > 0) {
          const parts = data.candidates[0].content.parts;
          if (parts && parts.length > 0 && parts[0].text) {
            respText = parts[0].text;
          }
        }
        console.log("Gemini flashcard generation text:", respText);

        // Remove code block markers if present
        let cleaned = respText.trim();
        if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
        if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
        if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
        cleaned = cleaned.trim();

        // Try to parse as array or object
        let flashcardJson = null;
        try {
          flashcardJson = JSON.parse(cleaned);
        } catch (e) {
          console.error("[AnkiHelper] JSON parse error:", e);
          console.log("[AnkiHelper] Attempted to parse:", cleaned.substring(0, 500));
          // Try to extract array if still fails
          const arrStart = cleaned.indexOf("[");
          const arrEnd = cleaned.lastIndexOf("]");
          if (arrStart >= 0 && arrEnd > arrStart) {
            try {
              flashcardJson = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
            } catch (e2) {
              console.error("[AnkiHelper] Array extraction also failed:", e2);
              hideLoadingOverlay(tabId);
              notify(tabId, "Lỗi: Gemini trả về JSON không hợp lệ. Vui lòng thử lại!", false);
              return;
            }
          } else {
            hideLoadingOverlay(tabId);
            notify(tabId, "Gemini không trả về dữ liệu hợp lệ!", false);
            return;
          }
        }
        // Show flashcard selection modal by injecting script directly into page
        hideLoadingOverlay(tabId);
        notify(tabId, "Đã tạo flashcards! Hãy chọn để nhập vào Anki.", true);
        showFlashcardSelectionModal(tabId, flashcardJson);
      } catch (err) {
        hideLoadingOverlay(tabId);
        notify(tabId, "Lỗi khi gọi Gemini API!", false);
      }
    });
  }
});