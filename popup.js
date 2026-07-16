// 小红书一键搜索 - Popup Script

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const historyList = document.getElementById("historyList");
const emptyState = document.getElementById("emptyState");
const clearBtn = document.getElementById("clearBtn");
const modeSplit = document.getElementById("modeSplit");
const modePopup = document.getElementById("modePopup");

// 初始化搜索模式选项卡片高亮
function renderModeUI(mode) {
  modeSplit.classList.toggle("active", mode === "split");
  modePopup.classList.toggle("active", mode === "popup");
}

chrome.runtime.sendMessage({ action: "getSearchMode" }, (response) => {
  renderModeUI(response?.mode || "split");
});

function setMode(mode) {
  chrome.runtime.sendMessage({ action: "setSearchMode", mode: mode }, () => {
    renderModeUI(mode);
  });
}

modeSplit.addEventListener("click", () => setMode("split"));
modePopup.addEventListener("click", () => setMode("popup"));

// 搜索
function doSearch(keyword) {
  const kw = keyword.trim();
  if (!kw) return;
  chrome.runtime.sendMessage({ action: "searchFromPopup", keyword: kw });
  window.close();
}

searchBtn.addEventListener("click", () => doSearch(searchInput.value));
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch(searchInput.value);
});

// 清空历史
clearBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "clearHistory" }, () => {
    renderHistory([]);
  });
});

// 格式化时间
function formatTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  if (hour < 24) return `${hour}小时前`;
  if (day < 7) return `${day}天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

// 渲染历史
function renderHistory(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = "";
    historyList.appendChild(emptyState);
    clearBtn.style.display = "none";
    return;
  }

  clearBtn.style.display = "block";
  emptyState.style.display = "none";

  historyList.innerHTML = "";
  history.forEach((item) => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <span class="icon">🕐</span>
      <span class="text"></span>
      <span class="time">${formatTime(item.time)}</span>
    `;
    // 用 textContent 防止 XSS
    div.querySelector(".text").textContent = item.keyword;
    div.addEventListener("click", () => doSearch(item.keyword));
    historyList.appendChild(div);
  });
}

// 加载历史
chrome.runtime.sendMessage({ action: "getHistory" }, (response) => {
  renderHistory(response?.history || []);
});

// 自动聚焦搜索框
searchInput.focus();
