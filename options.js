document.addEventListener("DOMContentLoaded", () => {
  const inputKey = document.getElementById("geminiApiKey");
  const inputDeck = document.getElementById("deckName");
  const status = document.getElementById("status");

  // Lấy giá trị đã lưu (nếu có)
  chrome.storage.local.get(['geminiApiKey', 'deckName'], function(result) {
    if (result && result.geminiApiKey) inputKey.value = result.geminiApiKey;
    inputDeck.value = result && result.deckName ? result.deckName : "English Vocabulary";
  });

  document.getElementById("saveBtn").onclick = () => {
    const key = inputKey.value.trim();
    const deck = inputDeck.value.trim() || "English Vocabulary";
    if (!key) {
      showPopup("Vui lòng nhập Gemini API Key!", false);
      return;
    }
    chrome.storage.local.set({ geminiApiKey: key, deckName: deck }, function() {
      if (chrome.runtime && chrome.runtime.lastError) {
        showPopup("Lưu thất bại: " + chrome.runtime.lastError.message, false);
      } else {
        showPopup("Đã lưu cài đặt!", true);
      }
    });
  };

  function showPopup(msg, success) {
    status.textContent = msg;
    status.style.color = success ? "#388e3c" : "#c62828";
    status.style.fontWeight = "bold";
    status.style.background = "#fffbe7";
    status.style.padding = "8px 16px";
    status.style.borderRadius = "6px";
    setTimeout(() => {
      status.textContent = "";
      status.style.background = "";
      status.style.padding = "";
      status.style.borderRadius = "";
    }, 2000);
  }
});