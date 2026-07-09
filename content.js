// 小红书一键搜索 - Content Script
// 监听键盘快捷键 + Toast 反馈

console.log("[XHS Search] content script 已加载 on:", window.location.href);

// ── 快捷键监听 ──
document.addEventListener("keydown", (e) => {
  if (e.altKey && e.shiftKey && e.key === "Enter") {
    const keyword = window.getSelection().toString().trim();
    if (keyword) {
      e.preventDefault();
      e.stopPropagation();
      // 通知 background 做分屏 + 存历史
      chrome.runtime.sendMessage({ action: "search", keyword: keyword });
      // 页面上显示 toast
      showToast(keyword);
    }
  }
}, true);

// ── 监听来自 background 的消息（右键 / popup 触发）──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "searchTriggered" && message.keyword) {
    showToast(message.keyword);
  }
  return true;
});

// ── Toast 提示 ──
function showToast(keyword) {
  const display = keyword.length > 30 ? keyword.slice(0, 30) + "…" : keyword;

  const toast = document.createElement("div");
  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;">🔍</span>
      <span>正在搜索：<b style="color:#FF2442;">${escapeHtml(display)}</b></span>
      <span style="margin-left:8px;font-size:12px;color:#999;">已分屏打开 →</span>
    </div>
  `;
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: white;
    color: #333;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04);
    max-width: 480px;
    line-height: 1.5;
    transition: opacity 0.3s, transform 0.3s;
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-10px)";
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
