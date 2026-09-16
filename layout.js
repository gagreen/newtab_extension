// 새 탭 화면의 모듈(바로가기/할 일/메모/뉴스) 순서·표시 여부를 관리합니다.
// shortcuts.js와 같은 방식(드래그 중 커서와 가장 가까운 항목의 앞/뒤로 끼워넣기)으로
// 페이지 안에서 바로 드래그앤드롭 순서 변경 및 숨기기/추가가 가능합니다.
(function () {
  const container = document.getElementById("modules");
  const addTile = document.getElementById("module-add-tile");
  const addBtn = document.getElementById("module-add-btn");
  const addMenu = document.getElementById("module-add-menu");

  let config = [];
  let draggedId = null;
  let allowDrag = false;
  let dndEnabled = true;

  function moduleEls() {
    return Array.from(container.querySelectorAll(".module-block"));
  }

  // shortcuts 모듈은 고정 위치이므로 드래그 대상/타겟 후보에서 항상 제외합니다.
  // 화면상 배치는 el.style.order(applyLayout이 부여)로 결정되므로, DOM 쿼리 순서가 아니라
  // 그 order 값 기준으로 정렬해야 드롭 인덱스 계산이 실제 화면 위치와 일치합니다.
  function visibleModuleEls(excludeId) {
    return moduleEls()
      .filter(
        (el) =>
          !el.hidden && el.dataset.module !== excludeId && el.dataset.module !== "shortcuts"
      )
      .sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0));
  }

  function clearDragIndicators() {
    moduleEls().forEach((el) =>
      el.classList.remove("drag-over-before", "drag-over-after")
    );
  }

  // 커서 좌표에서 가장 가까운 모듈과, 그 앞/뒤 중 어디에 놓일지 계산 (shortcuts.js와 동일한 방식)
  function getDropTarget(x, y) {
    const items = visibleModuleEls(draggedId);
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

  function applyLayout() {
    config.forEach((entry, idx) => {
      const el = container.querySelector(`[data-module="${entry.id}"]`);
      if (!el) return;
      if (entry.enabled) {
        el.hidden = false;
        el.style.order = idx;
      } else {
        el.hidden = true;
      }
    });
    renderAddMenu();
  }

  async function persist() {
    await setModuleConfig(config);
  }

  function setEnabled(id, enabled) {
    const entry = config.find((m) => m.id === id);
    if (!entry || entry.enabled === enabled) return;
    entry.enabled = enabled;
    if (enabled) {
      config = config.filter((m) => m.id !== id);
      if (id === "shortcuts") {
        // shortcuts는 항상 맨 앞 고정 위치를 유지합니다
        config.unshift(entry);
      } else {
        // 다시 켠 모듈은 맨 뒤로 보냅니다
        config.push(entry);
      }
    }
    applyLayout();
    persist();
  }

  // shortcuts는 고정 모듈이라 reorder 대상에서 제외하고, 항상 맨 앞에 유지합니다.
  function reorder(dropIndexAmongVisible) {
    const shortcutsEntry = config.find((m) => m.id === "shortcuts");
    const active = config.filter((m) => m.enabled && m.id !== "shortcuts");
    const disabled = config.filter((m) => !m.enabled && m.id !== "shortcuts");
    const fromIdx = active.findIndex((m) => m.id === draggedId);
    if (fromIdx === -1) return;
    const [moved] = active.splice(fromIdx, 1);
    active.splice(dropIndexAmongVisible, 0, moved);
    config = shortcutsEntry ? [shortcutsEntry, ...active, ...disabled] : [...active, ...disabled];
    applyLayout();
    persist();
  }

  // 메모처럼 여러 개를 추가할 수 있는 모듈의 인스턴스인지 확인합니다.
  function isMultiInstance(id) {
    const def = MODULE_DEFS[moduleBaseId(id)];
    return !!(def && def.multi);
  }

  async function removeInstance(id) {
    if (!confirm("이 메모를 삭제할까요? 내용도 함께 삭제됩니다.")) return;
    const el = container.querySelector(`[data-module="${CSS.escape(id)}"]`);
    config = config.filter((m) => m.id !== id);
    if (el) el.remove();
    await Store.remove(id);
    applyLayout();
    persist();
  }

  function addNoteInstance() {
    const id = genInstanceId("notes");
    config.push({ id, enabled: true });
    const el = window.NotesModule.createCard(id);
    container.insertBefore(el, addTile);
    setupBlock(el);
    applyLayout();
    persist();
  }

  function setupBlock(el) {
    const id = el.dataset.module;
    const handle = el.querySelector(".module-drag-handle");
    const hideBtn = el.querySelector(".module-hide");
    const fixed = id === "shortcuts";

    el.draggable = !fixed && dndEnabled;

    if (handle && !fixed) {
      handle.addEventListener("mousedown", () => {
        allowDrag = true;
      });
      handle.addEventListener(
        "touchstart",
        () => {
          allowDrag = true;
        },
        { passive: true }
      );
    }
    window.addEventListener("mouseup", () => {
      allowDrag = false;
    });

    el.addEventListener("dragstart", (e) => {
      if (fixed || !allowDrag || !dndEnabled) {
        e.preventDefault();
        return;
      }
      draggedId = id;
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    });

    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      clearDragIndicators();
      draggedId = null;
      allowDrag = false;
    });

    hideBtn.addEventListener("click", () => {
      if (isMultiInstance(id)) {
        removeInstance(id);
      } else {
        setEnabled(id, false);
      }
    });
  }

  container.addEventListener("dragover", (e) => {
    if (!draggedId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDragIndicators();
    const { closestEl, insertAfter } = getDropTarget(e.clientX, e.clientY);
    if (closestEl) {
      closestEl.classList.add(insertAfter ? "drag-over-after" : "drag-over-before");
    }
  });

  container.addEventListener("dragleave", (e) => {
    if (e.target === container) clearDragIndicators();
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    clearDragIndicators();
    if (!draggedId) return;
    const { items, closestEl, insertAfter } = getDropTarget(e.clientX, e.clientY);
    const dropIndex = closestEl
      ? items.indexOf(closestEl) + (insertAfter ? 1 : 0)
      : items.length;
    reorder(dropIndex);
    draggedId = null;
  });

  function renderAddMenu() {
    // 숨겨진 단일 모듈(바로가기/할 일/뉴스)은 다시 켜는 옵션으로 보여줍니다.
    const hiddenModules = config.filter((m) => !m.enabled && !isMultiInstance(m.id));
    addMenu.innerHTML = "";
    hiddenModules.forEach((entry) => {
      const def = MODULE_DEFS[entry.id];
      const item = document.createElement("button");
      item.type = "button";
      item.className = "module-add-option";
      item.innerHTML = `<span class="module-add-icon">${def.icon}</span>${def.name}`;
      item.addEventListener("click", () => {
        setEnabled(entry.id, true);
        addMenu.hidden = true;
      });
      addMenu.appendChild(item);
    });

    // 메모는 숨기기/보이기가 아니라 항상 새 인스턴스를 추가하는 방식입니다.
    const notesDef = MODULE_DEFS.notes;
    const addNotesItem = document.createElement("button");
    addNotesItem.type = "button";
    addNotesItem.className = "module-add-option";
    addNotesItem.innerHTML = `<span class="module-add-icon">${notesDef.icon}</span>${notesDef.name}`;
    addNotesItem.addEventListener("click", () => {
      addNoteInstance();
      addMenu.hidden = true;
    });
    addMenu.appendChild(addNotesItem);

    addTile.hidden = false;
  }

  addBtn.addEventListener("click", () => {
    addMenu.hidden = !addMenu.hidden;
  });

  document.addEventListener("click", (e) => {
    if (!addTile.contains(e.target)) addMenu.hidden = true;
  });

  document.addEventListener("dnd-setting-changed", (e) => {
    dndEnabled = e.detail.enabled;
    moduleEls().forEach((el) => {
      el.draggable = dndEnabled && el.dataset.module !== "shortcuts";
    });
  });

  (async function init() {
    dndEnabled = await window.DndSettings.getEnabled();
    config = await getModuleConfig();
    // 이전에 저장된 순서에서 shortcuts가 맨 앞이 아니었다면 맨 앞으로 되돌립니다
    const scIdx = config.findIndex((m) => m.id === "shortcuts");
    if (scIdx > 0) {
      const [scEntry] = config.splice(scIdx, 1);
      config.unshift(scEntry);
    }
    // 메모처럼 여러 인스턴스를 가질 수 있는 모듈은 정적 HTML에 없으므로, 저장된 설정에 맞춰 카드를 만들어줍니다.
    config.forEach((entry) => {
      if (!isMultiInstance(entry.id)) return;
      if (container.querySelector(`[data-module="${CSS.escape(entry.id)}"]`)) return;
      const el = window.NotesModule.createCard(entry.id);
      container.insertBefore(el, addTile);
    });
    moduleEls().forEach(setupBlock);
    applyLayout();
  })();
})();
