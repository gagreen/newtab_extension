(function () {
  const STORAGE_KEY = "habits";
  const listEl = document.getElementById("habit-list");
  const form = document.getElementById("habit-form");
  const input = document.getElementById("habit-input");
  const countEl = document.getElementById("habit-count");

  const modal = document.getElementById("habit-modal");
  const modalTitle = document.getElementById("habit-detail-title");
  const modalStreak = document.getElementById("habit-detail-streak");
  const modalMonthLabel = document.getElementById("habit-detail-month-label");
  const heatmapEl = document.getElementById("habit-heatmap");
  const prevMonthBtn = document.getElementById("habit-prev-month");
  const nextMonthBtn = document.getElementById("habit-next-month");
  const closeBtn = document.getElementById("habit-detail-close");

  let habits = []; // { id, name, checkins: { "YYYY-MM-DD": true } }
  let activeHabitId = null;
  let viewYear, viewMonth; // 상세 모달에서 보고 있는 연/월 (month는 0-based)

  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  // 오늘 체크가 안 되어 있어도 어제까지의 연속 기록은 그대로 보여줍니다.
  function currentStreak(habit) {
    let streak = 0;
    const cursor = new Date();
    if (!habit.checkins[dateKey(cursor)]) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (habit.checkins[dateKey(cursor)]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function last7Days() {
    const days = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      days.push(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  async function persist() {
    await Store.set(STORAGE_KEY, habits);
  }

  function updateCount() {
    countEl.textContent = habits.length ? `${habits.length}개` : "";
  }

  // ---- 습관 항목 순서 변경 (shortcuts.js와 동일한 포인터 기반 드래그 방식) ----

  function habitRowEls() {
    return Array.from(listEl.querySelectorAll(".habit-row"));
  }

  function clearDragIndicators() {
    habitRowEls().forEach((el) =>
      el.classList.remove("drag-over-before", "drag-over-after")
    );
  }

  // 커서 y좌표에서 가장 가까운 habit-row와, 그 위/아래 중 어디에 놓일지 계산
  function getDropTarget(y, excludeEl) {
    const items = habitRowEls().filter((el) => el !== excludeEl);
    let closestEl = null;
    let closestDist = Infinity;
    let insertAfter = false;

    items.forEach((el) => {
      const box = el.getBoundingClientRect();
      const cy = box.top + box.height / 2;
      const dist = Math.abs(y - cy);
      if (dist < closestDist) {
        closestDist = dist;
        closestEl = el;
        insertAfter = y > cy;
      }
    });

    return { items, closestEl, insertAfter };
  }

  function bindDragHandle(handle, li, habit) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;

      const startY = e.clientY;
      let moved = false;

      const onMove = (ev) => {
        const dy = ev.clientY - startY;

        if (!moved) {
          if (Math.abs(dy) < 4) return;
          moved = true;
          li.classList.add("dragging");
          li.style.zIndex = "5";
          li.style.pointerEvents = "none";
        }

        li.style.transform = `translateY(${dy}px)`;
        clearDragIndicators();
        const { closestEl, insertAfter } = getDropTarget(ev.clientY, li);
        if (closestEl) {
          closestEl.classList.add(
            insertAfter ? "drag-over-after" : "drag-over-before"
          );
        }
      };

      const onUp = async (ev) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);

        li.style.transform = "";
        li.style.zIndex = "";
        li.style.pointerEvents = "";
        li.classList.remove("dragging");
        clearDragIndicators();

        if (!moved) return;

        const { items, closestEl, insertAfter } = getDropTarget(
          ev.clientY,
          li
        );
        const dropIndex = closestEl
          ? items.indexOf(closestEl) + (insertAfter ? 1 : 0)
          : items.length;

        const fromIdx = habits.findIndex((h) => h.id === habit.id);
        if (fromIdx === -1) return;
        const [movedHabit] = habits.splice(fromIdx, 1);
        habits.splice(dropIndex, 0, movedHabit);
        await persist();
        render();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  function render() {
    listEl.innerHTML = "";

    if (!habits.length) {
      const empty = document.createElement("li");
      empty.className = "habit-empty";
      empty.textContent = "습관이 없습니다";
      listEl.appendChild(empty);
      updateCount();
      return;
    }

    const today = todayKey();

    habits.forEach((habit) => {
      const li = document.createElement("li");
      li.className = "habit-row";

      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "habit-drag-handle";
      handle.setAttribute("aria-label", "습관 순서 변경");
      handle.title = "드래그해서 순서 변경";
      handle.textContent = "⠿";
      bindDragHandle(handle, li, habit);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!habit.checkins[today];
      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) {
          habit.checkins[today] = true;
        } else {
          delete habit.checkins[today];
        }
        await persist();
        render();
      });

      const name = document.createElement("button");
      name.type = "button";
      name.className = "habit-name";
      name.textContent = habit.name;
      name.title = "클릭하면 월간 기록을 볼 수 있어요";
      name.addEventListener("click", () => openDetail(habit.id));

      const dots = document.createElement("span");
      dots.className = "habit-dots";
      last7Days().forEach((key) => {
        const dot = document.createElement("span");
        dot.className = "habit-dot" + (habit.checkins[key] ? " checked" : "");
        dots.appendChild(dot);
      });

      const streak = document.createElement("span");
      streak.className = "habit-streak";
      const s = currentStreak(habit);
      streak.textContent = s > 0 ? `🔥${s}` : "";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "habit-remove";
      removeBtn.textContent = "삭제";
      removeBtn.addEventListener("click", async () => {
        habits = habits.filter((h) => h.id !== habit.id);
        await persist();
        render();
      });

      li.appendChild(handle);
      li.appendChild(checkbox);
      li.appendChild(name);
      li.appendChild(dots);
      li.appendChild(streak);
      li.appendChild(removeBtn);
      listEl.appendChild(li);
    });

    updateCount();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    habits.push({ id: Date.now(), name, checkins: {} });
    input.value = "";
    await persist();
    render();
  });

  // ---- 상세 모달 (월간 히트맵) ----

  function isCurrentMonth() {
    const now = new Date();
    return viewYear === now.getFullYear() && viewMonth === now.getMonth();
  }

  function renderDetail() {
    const habit = habits.find((h) => h.id === activeHabitId);
    if (!habit) {
      closeDetail();
      return;
    }

    modalTitle.textContent = habit.name;
    const s = currentStreak(habit);
    modalStreak.textContent =
      s > 0 ? `🔥 ${s}일째 연속` : "오늘부터 시작해보세요";
    modalMonthLabel.textContent = `${viewYear}년 ${viewMonth + 1}월`;
    nextMonthBtn.disabled = isCurrentMonth();

    heatmapEl.innerHTML = "";
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const leadingBlanks = firstDay.getDay(); // 0=일요일

    for (let i = 0; i < leadingBlanks; i++) {
      const blank = document.createElement("span");
      blank.className = "habit-heatmap-cell blank";
      heatmapEl.appendChild(blank);
    }

    const today = todayKey();
    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(new Date(viewYear, viewMonth, day));
      const cell = document.createElement("span");
      cell.className =
        "habit-heatmap-cell" + (habit.checkins[key] ? " checked" : "");
      if (key === today) cell.classList.add("today");
      cell.textContent = day;
      heatmapEl.appendChild(cell);
    }
  }

  function openDetail(id) {
    activeHabitId = id;
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    renderDetail();
    modal.hidden = false;
  }

  function closeDetail() {
    modal.hidden = true;
    activeHabitId = null;
  }

  prevMonthBtn.addEventListener("click", () => {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    renderDetail();
  });

  nextMonthBtn.addEventListener("click", () => {
    if (isCurrentMonth()) return;
    viewMonth += 1;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    renderDetail();
  });

  closeBtn.addEventListener("click", closeDetail);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDetail();
  });

  (async function init() {
    habits = await Store.get(STORAGE_KEY, []);
    render();
  })();
})();
