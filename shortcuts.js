(function () {
  const STORAGE_KEY = "shortcuts";
  const listEl = document.getElementById("shortcuts");
  const modal = document.getElementById("shortcut-modal");
  const form = document.getElementById("shortcut-form");
  const nameInput = document.getElementById("shortcut-name");
  const urlInput = document.getElementById("shortcut-url");
  const cancelBtn = document.getElementById("shortcut-cancel");

  const DEFAULTS = [
    { name: "Gmail", url: "https://mail.google.com" },
    { name: "Notion", url: "https://notion.so" },
    { name: "GitHub", url: "https://github.com" },
  ];

  let shortcuts = [];
  let draggedIndex = null;
  let draggedEl = null;
  let suppressClick = false;

  function clearDragIndicators() {
    listEl
      .querySelectorAll(".drag-over-before, .drag-over-after")
      .forEach((el) => el.classList.remove("drag-over-before", "drag-over-after"));
  }

  // 커서 좌표에서 가장 가까운 shortcut-item과, 그 앞/뒤 중 어디에 놓일지 계산
  function getDropTarget(x, y) {
    const items = Array.from(listEl.querySelectorAll(".shortcut-item")).filter(
      (el) => el !== draggedEl
    );
    let closestEl = null;
    let closestDist = Infinity;
    let insertAfter = false;

    items.forEach((el) => {
      const box = el.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < closestDist) {
        closestDist = dist;
        closestEl = el;
        insertAfter = x > cx;
      }
    });

    return { items, closestEl, insertAfter };
  }

  function normalizeUrl(raw) {
    try {
      const u = new URL(raw);
      return u.href;
    } catch {
      return "https://" + raw;
    }
  }

  function render() {
    listEl.innerHTML = "";

    shortcuts.forEach((s, idx) => {
      const item = document.createElement("button");
      item.className = "shortcut-item";
      item.title = s.url;

      const icon = document.createElement("span");
      icon.className = "shortcut-icon";

      let hostname = "";
      try {
        hostname = new URL(s.url).hostname;
      } catch {
        hostname = "";
      }

      const fallbackLetter = () => {
        icon.textContent = (s.name || "?").trim().charAt(0).toUpperCase();
      };

      if (hostname) {
        const favicon = document.createElement("img");
        favicon.className = "shortcut-favicon";
        favicon.alt = "";
        favicon.draggable = false;
        favicon.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
          hostname
        )}`;
        favicon.addEventListener("error", () => {
          favicon.remove();
          fallbackLetter();
        });
        icon.appendChild(favicon);
      } else {
        fallbackLetter();
      }

      const label = document.createElement("span");
      label.className = "shortcut-label";
      label.textContent = s.name;

      const removeBtn = document.createElement("span");
      removeBtn.className = "shortcut-remove";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        shortcuts.splice(idx, 1);
        await Store.set(STORAGE_KEY, shortcuts);
        render();
      });

      item.appendChild(removeBtn);
      item.appendChild(icon);
      item.appendChild(label);

      item.addEventListener("click", (e) => {
        if (suppressClick) {
          suppressClick = false;
          e.preventDefault();
          return;
        }
        window.location.href = s.url;
      });

      // 트랙패드에서 네이티브 HTML5 드래그(draggable 속성)가 dragstart 직후
      // 바로 dragend로 스냅백되는 경우가 많아, 포인터 이벤트로 직접 드래그를 구현합니다.
      item.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".shortcut-remove")) return;

        const startX = e.clientX;
        const startY = e.clientY;
        let moved = false;

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          if (!moved) {
            if (Math.hypot(dx, dy) < 4) return;
            moved = true;
            draggedIndex = idx;
            draggedEl = item;
            item.classList.add("dragging");
            item.style.zIndex = "5";
            item.style.pointerEvents = "none";
          }

          item.style.transform = `translate(${dx}px, ${dy}px)`;
          clearDragIndicators();
          const { closestEl, insertAfter } = getDropTarget(ev.clientX, ev.clientY);
          if (closestEl) {
            closestEl.classList.add(insertAfter ? "drag-over-after" : "drag-over-before");
          }
        };

        const onUp = async (ev) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);

          if (!moved) return;

          suppressClick = true;
          item.style.transform = "";
          item.style.zIndex = "";
          item.style.pointerEvents = "";
          item.classList.remove("dragging");
          clearDragIndicators();

          const { items, closestEl, insertAfter } = getDropTarget(ev.clientX, ev.clientY);
          const dropIndex = closestEl
            ? items.indexOf(closestEl) + (insertAfter ? 1 : 0)
            : items.length;

          draggedIndex = null;
          draggedEl = null;

          const [movedItem] = shortcuts.splice(idx, 1);
          shortcuts.splice(dropIndex, 0, movedItem);
          await Store.set(STORAGE_KEY, shortcuts);
          render();
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });

      listEl.appendChild(item);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "shortcut-add";
    addBtn.innerHTML =
      '<span class="shortcut-icon">+</span><span class="shortcut-label">추가</span>';
    addBtn.addEventListener("click", openModal);
    listEl.appendChild(addBtn);
  }

  function openModal() {
    modal.hidden = false;
    nameInput.value = "";
    urlInput.value = "";
    nameInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
  }

  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const url = normalizeUrl(urlInput.value.trim());
    if (!name || !url) return;
    shortcuts.push({ name, url });
    await Store.set(STORAGE_KEY, shortcuts);
    closeModal();
    render();
  });

  // 다른 모듈(자주 방문 추천 등)에서 바로가기 목록에 직접 항목을 추가할 수 있으므로
  // storage 변경을 감지해 화면을 최신 상태로 갱신합니다.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    shortcuts = changes[STORAGE_KEY].newValue || [];
    render();
  });

  (async function init() {
    shortcuts = await Store.get(STORAGE_KEY, DEFAULTS);
    render();
  })();
})();
