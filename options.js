
document.addEventListener("DOMContentLoaded", () => {
  // Custom Tooltip Logic
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  document.body.appendChild(tooltip);

  function showTooltip(e) {
    const text = e.currentTarget.getAttribute('data-tooltip');
    if (!text) return;
    tooltip.textContent = text;
    tooltip.classList.add('active');
    positionTooltip(e);
  }

  function hideTooltip() {
    tooltip.classList.remove('active');
    tooltip.textContent = '';
  }

  function positionTooltip(e) {
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = mouseY + 16;
    let left = mouseX + 12;
    // Prevent overflow right
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }
    // Prevent overflow bottom
    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = mouseY - tooltipRect.height - 8;
    }
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  document.querySelectorAll('.tooltip-icon').forEach(el => {
    el.addEventListener('mouseenter', showTooltip);
    el.addEventListener('mousemove', positionTooltip);
    el.addEventListener('mouseleave', hideTooltip);
    // Move title to data-tooltip and remove native tooltip
    el.setAttribute('data-tooltip', el.getAttribute('title') || '');
    el.removeAttribute('title');
  });
  const apiKeyPoolContainer = document.getElementById("apiKeyPoolContainer");
  const addApiKeyBtn = document.getElementById("addApiKeyBtn");
  const inputDeck = document.getElementById("deckName");
  const selectModel = document.getElementById("geminiModel");
  const status = document.getElementById("status");

  function createApiKeyInput(value = "") {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.marginBottom = '6px';
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Gemini API Key';
    input.value = value;
    input.style.width = 'calc(100% - 32px)';
    input.style.padding = '8px';
    input.style.marginRight = '8px';
    input.autocomplete = 'off';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove this key';
    removeBtn.style.background = '#c62828';
    removeBtn.style.color = '#fff';
    removeBtn.style.border = 'none';
    removeBtn.style.borderRadius = '4px';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.fontSize = '16px';
    removeBtn.style.width = '32px';
    removeBtn.style.height = '32px';
    removeBtn.onclick = () => {
      apiKeyPoolContainer.removeChild(wrapper);
    };
    wrapper.appendChild(input);
    wrapper.appendChild(removeBtn);
    return wrapper;
  }

  function getApiKeysFromUI() {
    return Array.from(apiKeyPoolContainer.querySelectorAll('input[type="password"]'))
      .map(input => input.value.trim())
      .filter(val => val.length > 0);
  }

  addApiKeyBtn.onclick = () => {
    apiKeyPoolContainer.appendChild(createApiKeyInput());
  };

  // Load from storage on page load
  chrome.storage.local.get(['geminiApiKeyPool', 'deckName', 'geminiModel'], function(result) {
    apiKeyPoolContainer.innerHTML = '';
    let pool = result.geminiApiKeyPool;
    if (Array.isArray(pool) && pool.length > 0) {
      pool.forEach(key => apiKeyPoolContainer.appendChild(createApiKeyInput(key)));
    } else {
      apiKeyPoolContainer.appendChild(createApiKeyInput());
    }
    inputDeck.value = result && result.deckName ? result.deckName : "English Vocabulary";
    if (result && result.geminiModel) selectModel.value = result.geminiModel;
  });

  document.getElementById("saveBtn").onclick = () => {
      // Validate API Key inputs
      const apiKeyInputs = Array.from(apiKeyPoolContainer.querySelectorAll('input[type="password"]'));
      let hasEmpty = false;
      apiKeyInputs.forEach(input => {
        input.style.borderColor = '';
        if (!input.value.trim()) {
          input.style.borderColor = '#dc2626';
          hasEmpty = true;
        }
      });
      if (hasEmpty) {
        showPopup('API key must not be empty.', false);
        return;
      }
      const keys = apiKeyInputs.map(input => input.value.trim());
      const deck = inputDeck.value.trim() || "English Vocabulary";
      const model = selectModel.value;
      if (!keys.length) {
        showPopup("Please enter at least one Gemini API Key!", false);
        return;
      }
      chrome.storage.local.set({ geminiApiKeyPool: keys, deckName: deck, geminiModel: model }, function() {
        if (chrome.runtime && chrome.runtime.lastError) {
          showPopup("Save settings failed: " + chrome.runtime.lastError.message, false);
        } else {
          showPopup("Settings saved!", true);
        }
      });
  };

  function showPopup(msg, success) {
    status.textContent = msg;
    status.style.color = success ? "#388e3c" : "#c62828";
    status.style.fontWeight = "bold";
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