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