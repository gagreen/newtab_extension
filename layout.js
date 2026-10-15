// 새 탭 화면의 모듈(바로가기/할 일/메모/뉴스) 순서·표시 여부를 관리합니다.
// shortcuts.js와 같은 방식(드래그 중 커서와 가장 가까운 항목의 앞/뒤로 끼워넣기)으로
// 페이지 안에서 바로 드래그앤드롭 순서 변경 및 숨기기/추가가 가능합니다.
(function () {
  const container = document.getElementById("modules");
  const addTile = document.getElementById("module-add-tile");
  const addBtn = document.getElementById("module-add-btn");
  const addMenu = document.getElementById("module-add-menu");

  // 그리드 단위 (style.css의 .modules/.module-block과 맞출 것).
  // 폭은 기본 DEFAULT_W·최소 MIN_W, 높이는 기본이 카드의 자연 높이(내용 높이)이고 최소는 MIN_H입니다.
  const COLS = 12;
  const ROW_PX = 8;
  const GAP = 18;
  const DEFAULT_W = 4;
  const MIN_W = 1;
  const MIN_H = 3; // 카드 높이 약 6px (span 3 × 8px − margin 18px)
  const MAX_H = 200;
  const KEY_STEP_H = 5;

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
        applySize(el, entry);
      } else {
        el.hidden = true;
      }
    });
    renderAddMenu();
  }

  function spanFor(px) {
    return Math.ceil((px + GAP) / ROW_PX);
  }

  // .sized를 잠시 떼고 내용 기준 높이를 잽니다 (같은 프레임 안이라 깜빡이지 않음)
  function naturalSpan(el) {
    const sized = el.classList.contains("sized");
    el.classList.remove("sized");
    const span = spanFor(el.offsetHeight);
    if (sized) el.classList.add("sized");
    return span;
  }

  // h가 없으면 내용 높이를 따르는 자동 높이 카드로 둡니다.
  function applySize(el, entry) {
    if (entry.id === "shortcuts") return;
    el.style.gridColumn = `span ${entry.w || DEFAULT_W}`;
    const sized = !!entry.h;
    el.classList.toggle("sized", sized);
    el.style.gridRow = `span ${sized ? entry.h : naturalSpan(el)}`;
  }

  // 자동 높이 카드는 내용이 바뀌면(뉴스 로딩, 할 일 추가 등) 행 span을 다시 맞춥니다.
  // align-items: start라 span 변경이 카드 높이에 영향을 주지 않으므로 루프가 생기지 않습니다.
  const autoHeight = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => {
      if (target.hidden || target.classList.contains("sized")) return;
      target.style.gridRow = `span ${spanFor(target.offsetHeight)}`;
    });
  });

  // 오른쪽 아래 핸들을 드래그(또는 방향키)해서 카드의 열/행 span을 조절합니다.
  function setupResize(el, id) {
    const grip = document.createElement("button");
    grip.type = "button";
    grip.className = "module-resize";
    grip.setAttribute("aria-label", "모듈 크기 조절 (방향키)");
    grip.title = "드래그해서 크기 조절";
    el.appendChild(grip);

    function setSize(w, h) {
      const entry = config.find((m) => m.id === id);
      if (!entry) return;
      entry.w = Math.min(COLS, Math.max(MIN_W, w));
      entry.h = Math.min(MAX_H, Math.max(MIN_H, h));
      applySize(el, entry);
    }

    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
      const colW = (container.clientWidth - gap * (COLS - 1)) / COLS;
      const onMove = (ev) => {
        setSize(
          Math.round((ev.clientX - rect.left + gap) / (colW + gap)),
          spanFor(ev.clientY - rect.top)
        );
      };
      const onUp = () => {
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onUp);
        grip.removeEventListener("pointercancel", onUp);
        persist();
      };
      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onUp);
      grip.addEventListener("pointercancel", onUp);
    });

    grip.addEventListener("keydown", (e) => {
      const entry = config.find((m) => m.id === id);
      if (!entry) return;
      const w = entry.w || DEFAULT_W;
      const h = entry.h || naturalSpan(el);
      const next = {
        ArrowRight: [w + 1, h],
        ArrowLeft: [w - 1, h],
        ArrowDown: [w, h + KEY_STEP_H],
        ArrowUp: [w, h - KEY_STEP_H],
      }[e.key];
      if (!next) return;
      e.preventDefault();
      setSize(...next);
      persist();
    });
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

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // 카드 중심을 + 버튼 중심으로 옮기며 작아지는 키프레임 (보관/복원 공용)
  function fabKeyframe(el) {
    const a = el.getBoundingClientRect();
    const b = addBtn.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    return { transform: `translate(${dx}px, ${dy}px) scale(0.05)`, opacity: 0 };
  }

  // 메모를 + 버튼으로 빨려 들어가게 한 뒤 숨깁니다.
  async function archiveNote(el, id) {
    if (!reduceMotion.matches) {
      el.style.zIndex = 10;
      el.style.pointerEvents = "none";
      const anim = el.animate([{ transform: "none", opacity: 1 }, fabKeyframe(el)], {
        duration: 350,
        easing: "cubic-bezier(0.55, 0, 0.75, 0.2)",
        fill: "forwards",
      });
      await anim.finished;
      setEnabled(id, false);
      anim.cancel(); // 숨긴 뒤에 해제해야 원래 자리에 한 프레임 깜빡이지 않습니다
      el.style.zIndex = "";
      el.style.pointerEvents = "";
      addBtn.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }],
        { duration: 250, easing: "ease-out" }
      );
      return;
    }
    setEnabled(id, false);
  }

  // 보관된 메모를 다시 켜고, + 버튼에서 최종 위치로 튀어나오게 합니다.
  function restoreNote(id) {
    setEnabled(id, true);
    const el = container.querySelector(`[data-module="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" }); // 맨 뒤에 붙으므로 화면 밖일 수 있음
    if (reduceMotion.matches) return;
    el.style.zIndex = 10;
    el.animate([fabKeyframe(el), { transform: "none", opacity: 1 }], {
      duration: 350,
      easing: "cubic-bezier(0.25, 0.8, 0.45, 1)",
    }).finished.then(() => {
      el.style.zIndex = "";
    });
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
    const minimizeBtn = el.querySelector(".module-minimize");
    const fixed = id === "shortcuts";

    el.draggable = !fixed && dndEnabled;
    if (!fixed) {
      setupResize(el, id);
      autoHeight.observe(el);
    }

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

    // 메모 보관: 내용은 남기고 숨겨서 + 메뉴의 "보관된 메모"에서 다시 엽니다.
    if (minimizeBtn) {
      minimizeBtn.addEventListener("click", () => archiveNote(el, id));
    }

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

    const notesDef = MODULE_DEFS.notes;
    // 메모는 숨기기/보이기가 아니라 항상 새 인스턴스를 추가하는 방식입니다.
    // "보관된 메모" 섹션보다 먼저 넣어야 보관 목록의 일부로 보이지 않습니다.
    const addNotesItem = document.createElement("button");
    addNotesItem.type = "button";
    addNotesItem.className = "module-add-option";
    addNotesItem.innerHTML = `<span class="module-add-icon">${notesDef.icon}</span>${notesDef.name}`;
    addNotesItem.addEventListener("click", () => {
      addNoteInstance();
      addMenu.hidden = true;
    });
    addMenu.appendChild(addNotesItem);

    const archived = config.filter((m) => !m.enabled && isMultiInstance(m.id));
    if (archived.length) {
      const label = document.createElement("div");
      label.className = "module-add-label";
      label.textContent = "보관된 메모";
      addMenu.appendChild(label);
    }
    archived.forEach((entry) => {
      const card = container.querySelector(`[data-module="${CSS.escape(entry.id)}"]`);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "module-add-option";
      item.innerHTML = `<span class="module-add-icon">${notesDef.icon}</span><span class="module-add-name"></span>`;
      // 제목은 사용자 입력이므로 textContent로만 넣습니다.
      item.querySelector(".module-add-name").textContent =
        card?.querySelector(".note-title")?.textContent.trim() || notesDef.name;
      item.addEventListener("click", () => {
        restoreNote(entry.id);
        addMenu.hidden = true;
      });
      addMenu.appendChild(item);
    });

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
