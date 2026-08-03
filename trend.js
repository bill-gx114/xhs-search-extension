// 小红书一键搜索 - 趋势总结 (仅在搜索结果页运行)
// 在页面右下角加一个「AI 总结趋势」悬浮按钮，抓取当前页笔记 → 发到 Cowork 后端 → 展示趋势卡片

const BACKEND_URL = "https://cowork.xiaohongshu.com/s/xhs-search/api/analyze";

console.log("[XHS Trend] 趋势总结脚本已加载");

// 等页面笔记加载出来再插入按钮
setTimeout(injectButton, 2000);

function injectButton() {
  if (document.getElementById("xhs-trend-btn")) return;

  const btn = document.createElement("div");
  btn.id = "xhs-trend-btn";
  btn.innerHTML = `<span style="font-size:18px;">📈</span><span>AI 总结趋势</span>`;
  btn.style.cssText = `
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 2147483646;
    background: #FF2442;
    color: white;
    padding: 12px 20px;
    border-radius: 30px;
    font-size: 14px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    box-shadow: 0 6px 20px rgba(255,36,66,0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "translateY(-2px)";
    btn.style.boxShadow = "0 8px 24px rgba(255,36,66,0.5)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "translateY(0)";
    btn.style.boxShadow = "0 6px 20px rgba(255,36,66,0.4)";
  });
  btn.addEventListener("click", onAnalyze);

  document.body.appendChild(btn);
}

// 抓取当前页搜索结果笔记
function scrapeNotes() {
  const notes = [];
  // 小红书搜索结果卡片，用多种选择器兼容 DOM 变化
  const cards = document.querySelectorAll(
    'section.note-item, div.note-item, [class*="note-item"], a[href*="/explore/"], a[href*="/search_result/"]'
  );

  const seen = new Set();

  cards.forEach((card) => {
    // 标题
    let title = "";
    const titleEl = card.querySelector(
      '[class*="title"], .title, span.title, div.title, footer span'
    );
    if (titleEl) title = titleEl.textContent.trim();

    // 有些卡片标题在 a 标签本身
    if (!title) {
      const link = card.tagName === "A" ? card : card.querySelector("a");
      if (link) title = (link.getAttribute("title") || link.textContent || "").trim();
    }

    if (!title || title.length < 2) return;
    if (seen.has(title)) return;
    seen.add(title);

    // 点赞数
    let likes = "";
    const likeEl = card.querySelector(
      '[class*="like"], .like-wrapper .count, span.count, [class*="count"]'
    );
    if (likeEl) likes = likeEl.textContent.trim();

    // 标签（从标题里提取 #xxx，或专门的 tag 元素）
    const tags = [];
    const tagEls = card.querySelectorAll('[class*="tag"], a[href*="tag"]');
    tagEls.forEach((t) => {
      const txt = t.textContent.trim().replace(/^#/, "");
      if (txt && txt.length < 20) tags.push(txt);
    });
    // 从标题里正则抠 #标签
    const hashMatches = title.match(/#([^\s#]+)/g);
    if (hashMatches) {
      hashMatches.forEach((h) => tags.push(h.replace("#", "")));
    }

    notes.push({ title: title.slice(0, 80), likes, tags: [...new Set(tags)].slice(0, 5) });
  });

  return notes;
}

async function onAnalyze() {
  const btn = document.getElementById("xhs-trend-btn");

  // 抓取当前搜索关键词
  const params = new URLSearchParams(window.location.search);
  const keyword = params.get("keyword") || document.querySelector('input[type="text"]')?.value || "";

  const notes = scrapeNotes();

  if (notes.length === 0) {
    showPanel("😔 没有抓取到笔记数据", "可能是页面还没加载完，或小红书页面结构有变化。请滚动加载更多笔记后重试。");
    return;
  }

  // loading 状态
  showPanel(`📈 正在分析「${keyword}」`, `<div style="text-align:center;padding:20px 0;"><div class="xhs-spinner"></div><div style="margin-top:12px;color:#999;">已抓取 ${notes.length} 条笔记，AI 总结中…</div></div>`);

  try {
    // 通过 background 代发请求（background 有 host_permissions，能绕过 CORS）
    const data = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "analyzeTrend", keyword, notes },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.ok) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || "未知错误"));
          }
        }
      );
    });

    showPanel(`「${data.keyword}」趋势总结`, renderTrend(data.data), data.count);
  } catch (e) {
    showPanel("⚠️ 分析失败", `<div style="color:#e05260;padding:8px 0;">无法完成分析：${escapeHtml(e.message)}</div>`);
  }
}

// 展示结果面板
function showPanel(title, contentHtml, count) {
  let panel = document.getElementById("xhs-trend-panel");
  if (panel) panel.remove();

  panel = document.createElement("div");
  panel.id = "xhs-trend-panel";
  panel.style.cssText = `
    position: fixed;
    right: 24px;
    bottom: 84px;
    z-index: 2147483647;
    width: 380px;
    max-height: 70vh;
    background: white;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  const countBadge = count ? `<span style="font-size:11px;color:rgba(255,255,255,0.85);font-weight:400;">基于 ${count} 条笔记</span>` : "";

  panel.innerHTML = `
    <div style="background:#FF2442;padding:14px 18px;display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <div style="flex:1;color:white;font-size:15px;font-weight:700;line-height:1.3;">${escapeHtml(title)}<br>${countBadge}</div>
      <div id="xhs-trend-close" style="cursor:pointer;color:white;font-size:18px;padding:2px 6px;border-radius:6px;">✕</div>
    </div>
    <div style="padding:14px 16px;overflow-y:auto;font-size:14px;line-height:1.6;color:#333;background:#faf9f9;">${contentHtml}</div>
    <style>
      .xhs-spinner { width:28px;height:28px;border:3px solid #eee;border-top-color:#FF2442;border-radius:50%;animation:xhs-spin 0.8s linear infinite;margin:0 auto; }
      @keyframes xhs-spin { to { transform: rotate(360deg); } }
      /* 分区卡片 */
      .xt-block { background:white;border-radius:12px;padding:12px 14px;margin-bottom:10px;border:1px solid #f0e6e8; }
      .xt-block:last-child { margin-bottom:0; }
      .xt-block-title { display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:10px; }
      .xt-block-title .xt-ico { font-size:15px; }
      /* 角度 / 套路条目 */
      .xt-item { display:flex;gap:8px;margin-bottom:9px;align-items:flex-start; }
      .xt-item:last-child { margin-bottom:0; }
      .xt-item-name { flex-shrink:0;background:#fff0f2;color:#FF2442;font-size:12px;font-weight:600;padding:2px 9px;border-radius:6px;line-height:1.5;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis; }
      .xt-item-desc { flex:1;font-size:12.5px;color:#555;line-height:1.55; }
      /* 关键词分组 */
      .xt-kw-group { margin-bottom:10px; }
      .xt-kw-group:last-child { margin-bottom:0; }
      .xt-kw-cat { font-size:11.5px;color:#999;margin-bottom:5px; }
      .xt-tags { display:flex;flex-wrap:wrap;gap:6px; }
      .xt-tag { background:#f4f4f5;color:#444;font-size:12px;padding:3px 10px;border-radius:20px;line-height:1.5; }
      /* 建议高亮框 */
      .xt-suggest { background:linear-gradient(135deg,#fff0f2,#ffe4e8);border-radius:12px;padding:13px 15px;border:1px solid #ffd0d8; }
      .xt-suggest-label { font-size:12px;font-weight:700;color:#FF2442;margin-bottom:6px;display:flex;align-items:center;gap:5px; }
      .xt-suggest-text { font-size:13px;color:#333;line-height:1.6; }
    </style>
  `;

  document.body.appendChild(panel);
  panel.querySelector("#xhs-trend-close").addEventListener("click", () => panel.remove());
}

// 结构化趋势数据 → 分区卡片 HTML
function renderTrend(d) {
  if (!d) return `<div style="color:#999;">无数据</div>`;

  // 降级兵底：只有 suggestion 且其他为空（JSON 解析失败时）
  const noStruct =
    (!d.angles || !d.angles.length) &&
    (!d.patterns || !d.patterns.length) &&
    (!d.keywords || !d.keywords.length);
  if (noStruct && d.suggestion) {
    return `<div class="xt-block"><div style="font-size:13px;color:#555;line-height:1.7;white-space:pre-wrap;">${escapeHtml(d.suggestion)}</div></div>`;
  }

  let html = "";

  // 【热门角度】
  if (d.angles && d.angles.length) {
    const items = d.angles
      .map(
        (a) =>
          `<div class="xt-item"><span class="xt-item-name">${escapeHtml(a.name)}</span><span class="xt-item-desc">${escapeHtml(a.desc || "")}</span></div>`
      )
      .join("");
    html += `<div class="xt-block"><div class="xt-block-title"><span class="xt-ico">🔥</span>热门角度</div>${items}</div>`;
  }

  // 【爆款共性】
  if (d.patterns && d.patterns.length) {
    const items = d.patterns
      .map(
        (p) =>
          `<div class="xt-item"><span class="xt-item-name">${escapeHtml(p.name)}</span><span class="xt-item-desc">${escapeHtml(p.desc || "")}</span></div>`
      )
      .join("");
    html += `<div class="xt-block"><div class="xt-block-title"><span class="xt-ico">✨</span>爆款共性</div>${items}</div>`;
  }

  // 【高频关键词】
  if (d.keywords && d.keywords.length) {
    const groups = d.keywords
      .map((g) => {
        const tags = (g.words || [])
          .map((w) => `<span class="xt-tag">${escapeHtml(w)}</span>`)
          .join("");
        return `<div class="xt-kw-group"><div class="xt-kw-cat">${escapeHtml(g.category || "")}</div><div class="xt-tags">${tags}</div></div>`;
      })
      .join("");
    html += `<div class="xt-block"><div class="xt-block-title"><span class="xt-ico">🏷️</span>高频关键词</div>${groups}</div>`;
  }

  // 【一句话建议】
  if (d.suggestion) {
    html += `<div class="xt-suggest"><div class="xt-suggest-label"><span>💡</span>一句话建议</div><div class="xt-suggest-text">${escapeHtml(d.suggestion)}</div></div>`;
  }

  return html || `<div style="color:#999;">暂无内容</div>`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}
