// 小红书一键搜索 - Background Service Worker

const XHS_SEARCH_URL = "https://www.xiaohongshu.com/search_result?keyword=";
const MAX_HISTORY = 20;

// 记录分屏状态：searchWindowId → { originalWindowId, originalWidth, originalHeight, originalLeft, originalTop }
const splitStates = new Map();

// 悬浮小窗默认尺寸
const POPUP_WIN_WIDTH = 480;
const POPUP_WIN_HEIGHT = 640;

// 读取用户选择的搜索模式："split"（分屏，默认）| "popup"（悬浮小窗）
function getSearchMode(callback) {
  chrome.storage.local.get(["searchMode"], (result) => {
    callback(result.searchMode || "split");
  });
}

// 根据模式触发搜索
function triggerSearch(keyword, windowId) {
  getSearchMode((mode) => {
    if (mode === "popup") {
      openPopupWindow(keyword);
    } else {
      openSplitScreen(keyword, windowId);
    }
  });
}

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "xhs-search-text",
    title: "在小红书搜索「%s」",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "xhs-search-link",
    title: "在小红书搜索此链接内容",
    contexts: ["link"],
  });

  console.log("[XHS Search] 右键菜单已创建");
});

// 监听窗口关闭：如果关的是搜索窗口，恢复原窗口尺寸
chrome.windows.onRemoved.addListener((closedWindowId) => {
  console.log("[XHS Search] 窗口被关闭:", closedWindowId);

  if (splitStates.has(closedWindowId)) {
    const state = splitStates.get(closedWindowId);
    console.log("[XHS Search] 恢复原窗口:", state);

    chrome.windows.update(state.originalWindowId, {
      width: state.originalWidth,
      height: state.originalHeight,
      left: state.originalLeft,
      top: state.originalTop,
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("[XHS Search] 恢复窗口失败:", chrome.runtime.lastError.message);
      } else {
        console.log("[XHS Search] 原窗口已恢复");
      }
    });

    splitStates.delete(closedWindowId);
  }
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "xhs-search-text") {
    const keyword = info.selectionText.trim();
    if (keyword && tab?.id) {
      saveHistory(keyword);
      chrome.tabs.sendMessage(tab.id, { action: "searchTriggered", keyword: keyword });
      triggerSearch(keyword, tab.windowId);
    }
  } else if (info.menuItemId === "xhs-search-link") {
    const linkUrl = info.linkUrl || "";
    if (linkUrl && tab?.id) {
      saveHistory(linkUrl);
      chrome.tabs.sendMessage(tab.id, { action: "searchTriggered", keyword: linkUrl });
      triggerSearch(linkUrl, tab.windowId);
    }
  }
});

// 处理来自 content script / popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "search" && message.keyword) {
    saveHistory(message.keyword);
    chrome.windows.getLastFocused((win) => {
      triggerSearch(message.keyword, win.id);
    });
    sendResponse({ ok: true });
  } else if (message.action === "getHistory") {
    chrome.storage.local.get(["searchHistory"], (result) => {
      sendResponse({ history: result.searchHistory || [] });
    });
    return true;
  } else if (message.action === "clearHistory") {
    chrome.storage.local.set({ searchHistory: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  } else if (message.action === "searchFromPopup" && message.keyword) {
    saveHistory(message.keyword);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "searchTriggered", keyword: message.keyword });
      }
      triggerSearch(message.keyword, tabs[0]?.windowId);
    });
    sendResponse({ ok: true });
  } else if (message.action === "getSearchMode") {
    getSearchMode((mode) => sendResponse({ mode }));
    return true;
  } else if (message.action === "setSearchMode") {
    chrome.storage.local.set({ searchMode: message.mode }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  return true;
});

// 分屏打开：当前窗口缩到左半边，搜索结果新窗口开在右半边
function openSplitScreen(keyword, windowId) {
  const url = XHS_SEARCH_URL + encodeURIComponent(keyword);

  chrome.windows.get(windowId, (win) => {
    if (chrome.runtime.lastError) {
      console.error("[XHS Search] 获取窗口失败:", chrome.runtime.lastError.message);
      chrome.tabs.create({ url: url });
      return;
    }

    // 保存原始窗口尺寸，用于关闭搜索窗口时恢复
    const originalState = {
      originalWindowId: windowId,
      originalWidth: win.width,
      originalHeight: win.height,
      originalLeft: win.left,
      originalTop: win.top,
    };

    const halfWidth = Math.floor(win.width / 2);
    const height = win.height;
    const top = win.top;
    const left = win.left;

    console.log("[XHS Search] 分屏参数:", { left, top, halfWidth, height });

    // 如果该原窗口已有分屏，先清理旧记录
    for (const [searchWinId, state] of splitStates.entries()) {
      if (state.originalWindowId === windowId) {
        splitStates.delete(searchWinId);
      }
    }

    // 当前窗口缩到左半边
    chrome.windows.update(windowId, {
      width: halfWidth,
      height: height,
      left: left,
      top: top,
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("[XHS Search] 缩小窗口失败:", chrome.runtime.lastError.message);
      } else {
        console.log("[XHS Search] 当前窗口已缩至左半边");
      }
    });

    // 新窗口开在右半边
    chrome.windows.create({
      url: url,
      width: halfWidth,
      height: height,
      left: left + halfWidth,
      top: top,
    }, (newWin) => {
      if (chrome.runtime.lastError) {
        console.error("[XHS Search] 创建新窗口失败:", chrome.runtime.lastError.message);
      } else {
        console.log("[XHS Search] 搜索窗口已开在右半边, windowId:", newWin.id);
        // 记录分屏状态，等这个窗口关闭时恢复
        splitStates.set(newWin.id, originalState);
      }
    });
  });
}

// 悬浮小窗模式：不改变主窗口尺寸，另开一个独立的小型悬浮窗口展示搜索结果
function openPopupWindow(keyword) {
  const url = XHS_SEARCH_URL + encodeURIComponent(keyword);

  chrome.windows.getLastFocused((win) => {
    // 小窗靠右侧展示，不遮挡主要内容区域
    const width = POPUP_WIN_WIDTH;
    const height = POPUP_WIN_HEIGHT;
    let left = (win?.left || 0) + (win?.width || width + 100) - width - 40;
    let top = (win?.top || 0) + 60;

    if (left < 0) left = 40;

    chrome.windows.create(
      {
        url: url,
        type: "popup",
        width: width,
        height: height,
        left: Math.round(left),
        top: Math.round(top),
        focused: true,
      },
      (newWin) => {
        if (chrome.runtime.lastError) {
          console.error("[XHS Search] 开悬浮小窗失败:", chrome.runtime.lastError.message);
          chrome.tabs.create({ url: url });
        } else {
          console.log("[XHS Search] 悬浮小窗已打开, windowId:", newWin.id);
        }
      }
    );
  });
}

// 保存搜索历史
function saveHistory(keyword) {
  chrome.storage.local.get(["searchHistory"], (result) => {
    let history = result.searchHistory || [];
    history = history.filter((item) => item.keyword !== keyword);
    history.unshift({ keyword: keyword, time: Date.now() });
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }
    chrome.storage.local.set({ searchHistory: history });
  });
}
