// chrome.readingList API로 크롬 읽기 목록의 안 읽은 항목을 보여줍니다.
// 항목은 추가된 순서(creationTime)대로 표시되고, 체크박스로 읽음 표시를 하면
// 크롬 읽기 목록에도 반영되면서 이 카드에서는 자동으로 사라집니다.
(function () {
  const listEl = document.getElementById("reading-list-list");
  const countEl = document.getElementById("reading-list-count");

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
    li.className = "reading-list-empty";
    li.textContent = text;
    listEl.appendChild(li);
    countEl.textContent = "";
  }

  function updateCount() {
    countEl.textContent = listEl.children.length
      ? `${listEl.children.length}개`
      : "";
  }

  function render(entries) {
    if (!entries.length) {
      renderMessage("읽을 항목이 없습니다");
      return;
    }

    listEl.innerHTML = "";

    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "reading-list-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.title = "읽음으로 표시";
      checkbox.addEventListener("change", async () => {
        if (!checkbox.checked) return;
        await chrome.readingList.updateEntry({
          url: entry.url,
          hasBeenRead: true,
        });
        li.remove();
        if (!listEl.children.length) renderMessage("읽을 항목이 없습니다");
        else updateCount();
      });

      const link = document.createElement("a");
      link.className = "reading-list-link";
      link.href = entry.url;
      link.title = entry.url;

      const icon = document.createElement("span");
      icon.className = "reading-list-icon";

      const favicon = document.createElement("img");
      favicon.className = "reading-list-favicon";
      favicon.alt = "";
      favicon.draggable = false;
      favicon.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
        hostnameOf(entry.url)
      )}`;
      favicon.addEventListener("error", () => {
        favicon.remove();
        icon.textContent = (entry.title || hostnameOf(entry.url) || "?")
          .trim()
          .charAt(0)
          .toUpperCase();
      });
      icon.appendChild(favicon);

      const label = document.createElement("span");
      label.className = "reading-list-label";
      label.textContent = entry.title || entry.url;

      link.appendChild(icon);
      link.appendChild(label);

      li.appendChild(checkbox);
      li.appendChild(link);
      listEl.appendChild(li);
    });

    updateCount();
  }

  async function load() {
    const entries = await chrome.readingList.query({ hasBeenRead: false });
    entries.sort((a, b) => a.creationTime - b.creationTime);
    render(entries);
  }

  if (!chrome.readingList) {
    renderMessage("이 브라우저에서는 읽기 목록 기능을 사용할 수 없습니다");
    return;
  }

  chrome.readingList.onEntryAdded.addListener(load);
  chrome.readingList.onEntryRemoved.addListener(load);
  chrome.readingList.onEntryUpdated.addListener(load);

  load();
})();
