// chrome.topSites API로 자주 방문한 사이트를 추천합니다.
// 이미 바로가기에 등록된 사이트는 목록에서 제외하고, 각 항목은
// 클릭 시 바로 이동 / + 버튼 클릭 시 바로가기에 추가할 수 있습니다.
(function () {
  const SHORTCUTS_KEY = "shortcuts";
  const MAX_ITEMS = 8;

  const listEl = document.getElementById("most-visited-list");
  const countEl = document.getElementById("most-visited-count");

  function hostnameOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function renderMessage(text) {
    listEl.innerHTML = "";
    const li = document.createElement("li");
    li.className = "most-visited-empty";
    li.textContent = text;
    listEl.appendChild(li);
    countEl.textContent = "";
  }

  function render(sites) {
    if (!sites.length) {
      renderMessage("추천할 사이트가 없습니다");
      return;
    }

    listEl.innerHTML = "";
    countEl.textContent = String(sites.length);

    sites.forEach((site) => {
      const li = document.createElement("li");
      li.className = "most-visited-item";

      const link = document.createElement("a");
      link.className = "most-visited-link";
      link.href = site.url;
      link.title = site.url;

      const icon = document.createElement("span");
      icon.className = "most-visited-icon";

      const favicon = document.createElement("img");
      favicon.className = "most-visited-favicon";
      favicon.alt = "";
      favicon.draggable = false;
      favicon.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
        site.hostname
      )}`;
      favicon.addEventListener("error", () => {
        favicon.remove();
        icon.textContent = (site.title || site.hostname || "?").trim().charAt(0).toUpperCase();
      });
      icon.appendChild(favicon);

      const label = document.createElement("span");
      label.className = "most-visited-label";
      label.textContent = site.title || site.hostname;

      link.appendChild(icon);
      link.appendChild(label);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "most-visited-add";
      addBtn.textContent = "+";
      addBtn.title = "바로가기에 추가";
      addBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const shortcuts = await Store.get(SHORTCUTS_KEY, []);
        shortcuts.push({ name: site.title || site.hostname, url: site.url });
        await Store.set(SHORTCUTS_KEY, shortcuts);
        li.remove();
        countEl.textContent = String(listEl.children.length);
        if (!listEl.children.length) renderMessage("추천할 사이트가 없습니다");
      });

      li.appendChild(link);
      li.appendChild(addBtn);
      listEl.appendChild(li);
    });
  }

  function getTopSites() {
    return new Promise((resolve) => {
      if (!chrome.topSites || !chrome.topSites.get) {
        resolve([]);
        return;
      }
      chrome.topSites.get((sites) => resolve(sites || []));
    });
  }

  async function load() {
    const [topSites, shortcuts] = await Promise.all([
      getTopSites(),
      Store.get(SHORTCUTS_KEY, []),
    ]);

    const existingHosts = new Set(
      shortcuts.map((s) => hostnameOf(s.url)).filter(Boolean)
    );

    const filtered = topSites
      .map((s) => ({ ...s, hostname: hostnameOf(s.url) }))
      .filter((s) => s.hostname && !existingHosts.has(s.hostname))
      .slice(0, MAX_ITEMS);

    render(filtered);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SHORTCUTS_KEY]) load();
  });

  load();
})();
