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
  }).catch(() => {});
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
function getGeminiApiKey() {
  return new Promise((resolve) => {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['geminiApiKey'], (result) => {
        resolve(result.geminiApiKey || "");
      });
    } else {
      resolve("");
    }
  });
}

async function geminiTranslate(word) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    console.error("Gemini API Key chưa được thiết lập.");
    return "";
  }
  const prompt = `Translate this to Vietnamese: "${word}". Only output the Vietnamese translation, no explanation, no extra text. Write the result in lowercase.`;

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
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
  "example": "<Give a simple, natural English sentence using the word \\"${word}\\". Do not use generic templates or mention the instruction itself.>",
  "exampleVN": "<Translate the example sentence to Vietnamese.>",
  "ipa": "<IPA transcription, e.g. /ˈwɜ:d/>",
  "type": "<word type: n, v, adj, adv, prep, pron, conj, interj>",
  "syllables": "<Split the word into syllables, separated by comma, e.g. pro, cras, ti, nate>"
}
Only output valid JSON, no explanation, no extra text.`;
}

async function getWordInfo(word, translation) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) return {};
  const prompt = getInfoPrompt(word, translation);
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
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
async function addToAnki(word) {
  const deckName = await getDeckName();
  const modelName = "English Vocab Cloze Template 1.0";
  const inOrderFields = [
    "EnglishWord", "EnglishCloze", "VietnameseTranslation", "VietnameseCloze",
    "IPA", "WordType", "ExampleSentence", "ExampleSentenceVN", "AudioFile", "Syllables"
  ];

  await ensureDeckExists(deckName);
  await ensureModelExists(modelName, inOrderFields, css, cardTemplates);

  const englishCloze = createCloze(word);
  const vietnameseTranslation = await geminiTranslate(word);
  const vietnameseCloze = createCloze(vietnameseTranslation);

  const [info, audioFile] = await Promise.all([
    getWordInfo(word, vietnameseTranslation),
    downloadAndStoreAudio(word)
  ]);
  console.log("Word info from Gemini:", info);
  console.log("Audio filename for word:", word, audioFile);

  const note = {
    deckName,
    modelName,
    fields: {
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
    "EnglishWord", "EnglishCloze", "VietnameseTranslation", "VietnameseCloze",
    "IPA", "WordType", "ExampleSentence", "ExampleSentenceVN", "AudioFile", "Syllables"
  ];

  await ensureDeckExists(deckName);
  await ensureModelExists(modelName, inOrderFields, css, cardTemplates);

  const englishCloze = createCloze(word);
  const vietnameseCloze = createCloze(vietnameseTranslation);

  const [info, audioFile] = await Promise.all([
    getWordInfo(word, vietnameseTranslation),
    downloadAndStoreAudio(word)
  ]);
  console.log("Word info from Gemini:", info);
  console.log("Audio filename for word:", word, audioFile);

  const note = {
    deckName,
    modelName,
    fields: {
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
    } catch {}
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
          result.log.push("Compromise (nlp) is not loaded!");
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
            <strong>Nhập nghĩa tiếng Việt cho:</strong><br>
            <span style="color:#1565c0;font-size:22px;">${selectedWord}</span>
          </div>
          <input id="ankihelper-vn-input" type="text" style="width:90%;padding:8px;font-size:18px;border-radius:6px;border:1px solid #ccc;" autofocus />
          <div style="margin-top:18px;">
            <button id="ankihelper-vn-ok" style="background:#388e3c;color:#fff;padding:8px 18px;border:none;border-radius:6px;font-size:18px;cursor:pointer;margin-right:10px;">OK</button>
            <button id="ankihelper-vn-cancel" style="background:#c62828;color:#fff;padding:8px 18px;border:none;border-radius:6px;font-size:18px;cursor:pointer;">Hủy</button>
          </div>
        `;
        document.body.appendChild(popup);

        const input = document.getElementById("ankihelper-vn-input");
        input.focus();

        function cleanup() {
          popup.remove();
        }

        document.getElementById("ankihelper-vn-ok").onclick = () => {
          const value = input.value.trim();
          cleanup();
          resolve(value);
        };
        document.getElementById("ankihelper-vn-cancel").onclick = () => {
          cleanup();
          resolve("");
        };
        input.onkeydown = (e) => {
          if (e.key === "Enter") {
            document.getElementById("ankihelper-vn-ok").click();
          }
          if (e.key === "Escape") {
            document.getElementById("ankihelper-vn-cancel").click();
          }
        };
      });
    },
    args: [word],
  }).then(results => {
    // results[0].result is the user input
    return results && results[0] && typeof results[0].result === "string" ? results[0].result : "";
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if ((info.menuItemId === "add-to-anki" || info.menuItemId === "add-to-anki-custom-meaning") && info.selectionText) {
    normalizeWord(tab.id, info.selectionText).then(infinitiveWord => {
      console.log("Infinitive word:", infinitiveWord);
      const loadingId = "ankihelper-loading-notify";
      notify(tab.id, "Đang thêm vào Anki...", true, loadingId);

      getGeminiApiKey().then(apiKey => {
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
          promptForVietnamese(tab.id, infinitiveWord).then(vietnameseTranslation => {
            if (!vietnameseTranslation) {
              removeNotify(tab.id, loadingId);
              notify(tab.id, "Bạn chưa nhập nghĩa tiếng Việt!", false);
              return;
            }
            addToAnkiWithCustomMeaning(infinitiveWord, vietnameseTranslation).then(result => {
              removeNotify(tab.id, loadingId);
              if (result.success) {
                notify(tab.id, `Đã thêm vào Anki: ${infinitiveWord} (${vietnameseTranslation})`, true);
              } else {
                notify(tab.id, "Thêm vào Anki thất bại.", false);
              }
            });
          });
        }
      });
    });
  }
});