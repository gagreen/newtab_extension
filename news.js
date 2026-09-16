(function () {
  const PREF_KEY = "news_pref_topics";
  const CACHE_PREFIX = "news_cache:";
  const CACHE_MS = 15 * 60 * 1000; // 15분
  const MAX_ITEMS = 8;

  const AI_KEY_STORAGE = "news_ai_dongguk_key";
  const SUMMARY_CACHE_KEY = "news_ai_summary_cache";
  const DONGGUK_MODEL = "claude-sonnet-5";
  const DONGGUK_API_URL =
    "https://factchat-cloud.mindlogic.ai/v1/gateway/claude/v1/messages/";

  const SUMMARY_SYSTEM_PROMPT = `당신은 20대 사회초년생을 위한 아침 뉴스 브리핑 어시스턴트입니다.
반드시 web_search로 최근(대략 1주일 내) 한국 뉴스를 검색해 답하고, 기억이나 추정으로 답하지 마세요.
웹 검색은 최대 5회까지 가능합니다. 카테고리마다 따로 검색하지 말고, 넓은 질의 1~2개로 여러 카테고리를 한 번에 다루도록 계획한 뒤 검색하세요.

아래 4개 카테고리 순서대로 각 최대 3건, 중요도순으로 정리하세요:
1. 취업/노동시장(채용·공채·최저임금·근로기준법)
2. 부동산/주거
3. 재테크/금융(금리·정책금융·주식)
4. IT/AI 산업

항목마다: 헤드라인 한 줄 / 핵심 내용 2문장 / 왜 중요한가 1문장(사회초년생 관점) / 출처(매체명).
해당 카테고리에 뉴스가 없으면 "특이사항 없음"만 적고 억지로 채우지 마세요.
사실과 추측을 구분하고(추측은 "추정"으로 표시), 과장 없이 정보 위주로, 전체 500~800자로 작성하세요.`;

  const TOPICS = [
    { id: "ALL", label: "전체" },
    { id: "NATION", label: "대한민국" },
    { id: "WORLD", label: "세계" },
    { id: "BUSINESS", label: "경제" },
    { id: "TECHNOLOGY", label: "IT/과학" },
    { id: "ENTERTAINMENT", label: "연예" },
    { id: "SPORTS", label: "스포츠" },
    { id: "HEALTH", label: "건강" },
  ];

  function feedUrlFor(topicId) {
    if (topicId === "ALL") {
      return "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko";
    }
    return `https://news.google.com/rss/headlines/section/topic/${topicId}?hl=ko&gl=KR&ceid=KR:ko`;
  }

  const listEl = document.getElementById("news-list");
  const topicsEl = document.getElementById("news-topics");
  const refreshBtn = document.getElementById("news-refresh");
  const summarizeBtn = document.getElementById("news-summarize");
  const summaryEl = document.getElementById("news-summary");

  const keyModal = document.getElementById("ai-key-modal");
  const keyForm = document.getElementById("ai-key-form");
  const keyInput = document.getElementById("ai-key-input");
  const keyCancelBtn = document.getElementById("ai-key-cancel");
  const keyClearBtn = document.getElementById("ai-key-clear");

  let selectedTopics = ["ALL"];

  function cacheKey(topics) {
    return CACHE_PREFIX + topics.slice().sort().join(",");
  }

  function renderTopics() {
    topicsEl.innerHTML = "";
    TOPICS.forEach((topic) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "news-topic-chip";
      btn.textContent = topic.label;
      btn.dataset.topic = topic.id;
      if (selectedTopics.includes(topic.id)) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => onTopicClick(topic.id));
      topicsEl.appendChild(btn);
    });
  }

  function onTopicClick(topicId) {
    if (topicId === "ALL") {
      selectedTopics = ["ALL"];
    } else if (selectedTopics.includes(topicId)) {
      selectedTopics = selectedTopics.filter((t) => t !== topicId);
      if (selectedTopics.length === 0) selectedTopics = ["ALL"];
    } else {
      selectedTopics = selectedTopics
        .filter((t) => t !== "ALL")
        .concat(topicId);
    }
    renderTopics();
    Store.set(PREF_KEY, selectedTopics);
    fetchFeed();
  }

  function renderLoading() {
    listEl.innerHTML = '<li class="news-loading">불러오는 중…</li>';
  }

  function renderError() {
    listEl.innerHTML =
      '<li class="news-error">뉴스를 불러오지 못했습니다. 새로고침을 눌러 다시 시도하세요.</li>';
  }

  function faviconUrl(sourceHomeUrl) {
    return (
      "https://www.google.com/s2/favicons?sz=64&domain_url=" +
      encodeURIComponent(sourceHomeUrl)
    );
  }

  function renderItems(items) {
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.innerHTML = '<li class="news-error">표시할 뉴스가 없습니다.</li>';
      return;
    }
    items.slice(0, MAX_ITEMS).forEach((item) => {
      const li = document.createElement("li");

      if (item.sourceUrl) {
        const thumb = document.createElement("img");
        thumb.className = "news-thumb";
        thumb.src = faviconUrl(item.sourceUrl);
        thumb.alt = "";
        thumb.loading = "lazy";
        thumb.addEventListener("error", () => thumb.remove());
        li.appendChild(thumb);
      }

      const a = document.createElement("a");
      a.href = item.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.title;

      const source = document.createElement("span");
      source.className = "news-source";
      source.textContent = item.source || "Google 뉴스";

      a.appendChild(source);
      li.appendChild(a);
      listEl.appendChild(li);
    });
  }

  function parseFeed(xmlText, topicId) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const entries = Array.from(doc.querySelectorAll("item"));
    return entries.map((entry) => {
      const rawTitle = entry.querySelector("title")?.textContent || "";
      // Google 뉴스 RSS 제목은 보통 "기사 제목 - 출처" 형식
      const dashIdx = rawTitle.lastIndexOf(" - ");
      const title = dashIdx > -1 ? rawTitle.slice(0, dashIdx) : rawTitle;
      const sourceEl = entry.querySelector("source");
      const source =
        dashIdx > -1
          ? rawTitle.slice(dashIdx + 3)
          : sourceEl?.textContent || "";
      return {
        title,
        source,
        sourceUrl: sourceEl?.getAttribute("url") || "",
        link: entry.querySelector("link")?.textContent || "#",
        pubDate: entry.querySelector("pubDate")?.textContent || "",
        topicId,
      };
    });
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = item.title || item.link;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchTopicFeed(topicId) {
    const res = await fetch(feedUrlFor(topicId));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    return parseFeed(text, topicId);
  }

  async function fetchFeed() {
    renderLoading();
    const topics = selectedTopics;
    try {
      const results = await Promise.allSettled(topics.map(fetchTopicFeed));
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      if (!fulfilled.length) throw new Error("모든 피드 로드 실패");

      let items = fulfilled.flatMap((r) => r.value);
      items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      items = dedupe(items);

      renderItems(items);
      await Store.set(cacheKey(topics), { items, fetchedAt: Date.now() });
    } catch (err) {
      console.error("뉴스 로드 실패:", err);
      renderError();
    }
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderInline(line) {
    const bold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return bold.replace(
      /(https?:\/\/[^\s<>"')]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
    );
  }

  // 마크다운의 부분집합만 지원합니다: 제목(#~######), **굵게**, URL 링크, 줄바꿈.
  function markdownToHtml(text) {
    return text
      .split("\n")
      .map((line) => {
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
          return `<div class="news-summary-heading">${renderInline(escapeHtml(heading[1]))}</div>`;
        }
        if (!line.trim()) return "<br>";
        return renderInline(escapeHtml(line)) + "<br>";
      })
      .join("");
  }

  function hideSummary() {
    summaryEl.hidden = true;
    summaryEl.innerHTML = "";
    summaryEl.classList.remove("news-summary-loading", "news-summary-error");
  }

  function renderSummaryLoading() {
    summaryEl.hidden = false;
    summaryEl.textContent = "AI가 오늘의 뉴스를 검색하는 중…";
    summaryEl.classList.add("news-summary-loading");
    summaryEl.classList.remove("news-summary-error");
  }

  function renderSummaryError(message) {
    summaryEl.hidden = false;
    summaryEl.textContent = message || "요약을 불러오지 못했습니다.";
    summaryEl.classList.add("news-summary-error");
    summaryEl.classList.remove("news-summary-loading");
  }

  function renderSummary(text) {
    summaryEl.hidden = false;
    summaryEl.innerHTML = markdownToHtml(text);
    summaryEl.classList.remove("news-summary-loading", "news-summary-error");
  }

  async function loadCachedSummary() {
    const cached = await Store.get(SUMMARY_CACHE_KEY, null);
    if (cached && cached.date === todayStr()) {
      renderSummary(cached.text);
      summarizeBtn.hidden = true;
    }
  }

  function openKeyModal() {
    keyModal.hidden = false;
    keyInput.value = "";
    keyInput.focus();
  }

  function closeKeyModal() {
    keyModal.hidden = true;
  }

  // 동국 AI CHAT API Gateway를 통해 Claude의 네이티브 web_search 도구를 사용합니다.
  // (Anthropic Messages API 형식 — system은 최상위 필드, tools에 web_search를 넣으면
  // Claude가 필요하다고 판단할 때 서버 사이드에서 직접 검색을 수행합니다.)
  async function callDongguk(apiKey) {
    const res = await fetch(DONGGUK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DONGGUK_MODEL,
        max_tokens: 4096,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: "오늘의 브리핑을 작성해줘." },
        ],
        // 기본 web_search(다이나믹 필터링 없음)가 이 작업에서 더 빠르고 저렴하며
        // 안정적으로 완결된 응답을 반환합니다(실측: 비용 1/5, 속도 2.7배).
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      }),
      // 검색 도구 버전에 따라 게이트웨이가 응답 없이 멈추는 경우가 있어 타임아웃을 둡니다.
      signal: AbortSignal.timeout(90000),
    });

    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.detail?.message || "HTTP " + res.status);
      err.status = data.detail?.code || res.status;
      throw err;
    }

    const blocks = data.content || [];
    let text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("")
      .trim();

    // 검색 도구 호출에 토큰을 다 쓰고 최종 답변 전에 잘린 경우, 재시도를 유도합니다
    // (성공으로 취급해 캐시/버튼 숨김 처리되지 않도록 에러로 던집니다).
    if (!text && data.stop_reason === "max_tokens") {
      const err = new Error("응답이 도중에 잘렸습니다.");
      err.truncated = true;
      throw err;
    }

    const seen = new Set();
    const sources = [];
    blocks.forEach((b) => {
      (b.citations || []).forEach((c) => {
        if (!c.url || seen.has(c.url)) return;
        seen.add(c.url);
        sources.push(`- ${c.title || c.url} (${c.url})`);
      });
    });
    if (sources.length) {
      text += "\n\n참고 자료:\n" + sources.join("\n");
    }

    return text;
  }

  async function summarizeNews() {
    const apiKey = await Store.get(AI_KEY_STORAGE, "");
    if (!apiKey) {
      openKeyModal();
      return;
    }

    renderSummaryLoading();
    try {
      const summary = await callDongguk(apiKey);
      if (summary) {
        renderSummary(summary);
        await Store.set(SUMMARY_CACHE_KEY, { date: todayStr(), text: summary });
        summarizeBtn.hidden = true;
      } else {
        renderSummary("요약할 내용이 없습니다.");
      }
    } catch (err) {
      console.error("AI 요약 실패:", err);
      if (err.truncated) {
        renderSummaryError("응답이 도중에 잘렸습니다. 다시 시도해주세요.");
      } else if (err.name === "TimeoutError" || err.name === "AbortError") {
        renderSummaryError(
          "응답 시간이 너무 오래 걸려 요청을 취소했습니다. 다시 시도해주세요.",
        );
      } else if (err.status === 401) {
        renderSummaryError(
          "API 키가 유효하지 않습니다. 키를 다시 입력해주세요.",
        );
        openKeyModal();
      } else if (err.status === 402) {
        renderSummaryError("크레딧이 부족합니다. 계정 크레딧을 확인해주세요.");
      } else if (err.status === 403) {
        renderSummaryError("이 모델을 사용할 권한이 없습니다.");
      } else if (err.status === 429) {
        renderSummaryError(
          "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.",
        );
      } else {
        renderSummaryError();
      }
    }
  }

  summarizeBtn.addEventListener("click", summarizeNews);

  keyCancelBtn.addEventListener("click", closeKeyModal);
  keyModal.addEventListener("click", (e) => {
    if (e.target === keyModal) closeKeyModal();
  });

  keyClearBtn.addEventListener("click", async () => {
    await Store.set(AI_KEY_STORAGE, "");
    closeKeyModal();
    hideSummary();
  });

  keyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = keyInput.value.trim();
    if (!key) return;
    await Store.set(AI_KEY_STORAGE, key);
    closeKeyModal();
    summarizeNews();
  });

  refreshBtn.addEventListener("click", fetchFeed);

  (async function init() {
    selectedTopics = await Store.get(PREF_KEY, ["ALL"]);
    if (!selectedTopics || !selectedTopics.length) selectedTopics = ["ALL"];
    renderTopics();

    const cached = await Store.get(cacheKey(selectedTopics), null);
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
      renderItems(cached.items);
    } else {
      fetchFeed();
    }

    await loadCachedSummary();
  })();
})();
