chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ankihelper_result") {
    let div = document.createElement("div");
    div.textContent = msg.message;
    div.style.position = "fixed";
    div.style.top = "20px";
    div.style.right = "20px";
    div.style.zIndex = 9999;
    div.style.background = msg.success ? "#388e3c" : "#c62828";
    div.style.color = "#fff";
    div.style.padding = "12px 24px";
    div.style.borderRadius = "8px";
    div.style.fontSize = "18px";
    div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }
});

console.log("✅ Compromise loaded:", typeof nlp);

// =======================
// Floating Button for Selection
// =======================
let selectionButton = null;
let lastSelection = "";

function removeSelectionButton() {
  if (selectionButton) {
    selectionButton.remove();
    selectionButton = null;
  }
}

function showSelectionButton(text, rect) {
  removeSelectionButton();
  selectionButton = document.createElement("button");
  selectionButton.textContent = "+";
  selectionButton.title = "Thêm vào Anki";
  selectionButton.style.position = "absolute";
  selectionButton.style.left = `${rect.right + window.scrollX + 6}px`;
  selectionButton.style.top = `${rect.top + window.scrollY - 2}px`;
  selectionButton.style.zIndex = 99999;
  selectionButton.style.background = "#1976d2";
  selectionButton.style.color = "#fff";
  selectionButton.style.border = "none";
  selectionButton.style.borderRadius = "50%";
  selectionButton.style.width = "20px";
  selectionButton.style.height = "20px";
  selectionButton.style.display = "flex";
  selectionButton.style.alignItems = "center";
  selectionButton.style.justifyContent = "center";
  selectionButton.style.fontSize = "14px";
  selectionButton.style.lineHeight = "20px";
  selectionButton.style.boxShadow = "0 2px 8px rgba(25, 118, 210, 0.18)";
  selectionButton.style.cursor = "pointer";
  selectionButton.style.transition = "box-shadow 0.2s, background 0.2s";
  selectionButton.style.opacity = "0.96";
  selectionButton.onmouseover = () => {
    selectionButton.style.background = "#1565c0";
    selectionButton.style.boxShadow = "0 4px 16px rgba(21, 101, 192, 0.22)";
  };
  selectionButton.onmouseout = () => {
    selectionButton.style.background = "#1976d2";
    selectionButton.style.boxShadow = "0 2px 8px rgba(25, 118, 210, 0.18)";
  };
  selectionButton.onmousedown = (e) => e.preventDefault();
  selectionButton.onclick = () => {
    chrome.runtime.sendMessage({ type: "ankihelper_add_to_anki", text });
    removeSelectionButton();
  };
  document.body.appendChild(selectionButton);
}

function handleSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) {
    removeSelectionButton();
    lastSelection = "";
    return;
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const text = sel.toString().trim();
  if (text === lastSelection) return;
  lastSelection = text;
  showSelectionButton(text, rect);
}

document.addEventListener("selectionchange", () => {
  setTimeout(handleSelection, 10);
});
document.addEventListener("mousedown", (e) => {
  if (selectionButton && !selectionButton.contains(e.target)) {
    removeSelectionButton();
  }
});
window.addEventListener("scroll", () => {
  if (selectionButton) {
    removeSelectionButton();
  }
});