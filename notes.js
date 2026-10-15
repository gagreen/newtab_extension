// 메모 모듈: 하나 이상의 독립된 메모 카드를 생성/저장합니다.
// 카드 DOM 생성과 layout.js와의 연동(순서 변경/삭제)은 layout.js가 담당하고,
// 이 파일은 카드 마크업 생성과 제목/본문 자동저장만 담당합니다.
(function () {
  const TITLE_DEFAULT = "메모";

  function buildCard(id) {
    const el = document.createElement("div");
    el.className = "module-block card card-note";
    el.dataset.module = id;
    el.innerHTML = `
      <button
        type="button"
        class="module-drag-handle"
        aria-label="메모 모듈 순서 변경"
        title="드래그해서 순서 변경"
      >⠿</button>
      <button
        type="button"
        class="module-minimize"
        aria-label="메모 보관"
        title="보관 (오른쪽 아래 + 메뉴에서 다시 열기)"
      >–</button>
      <button
        type="button"
        class="module-hide"
        aria-label="메모 삭제"
        title="메모 삭제"
      >×</button>
      <div class="card-body">
        <div class="card-head">
          <h2 class="note-title" contenteditable="true" spellcheck="false"></h2>
          <span class="card-sub note-status">저장됨</span>
        </div>
        <textarea class="note-area" placeholder="생각나는 것을 적어두세요"></textarea>
      </div>
    `;
    bindCard(el, id);
    return el;
  }

  function bindCard(el, id) {
    const titleEl = el.querySelector(".note-title");
    const statusEl = el.querySelector(".note-status");
    const area = el.querySelector(".note-area");
    let saveTimer = null;

    async function save() {
      return Store.set(id, {
        title: titleEl.textContent.trim() || TITLE_DEFAULT,
        content: area.value,
      });
    }

    // Tab/Shift+Tab 들여쓰기: 선택 영역이 여러 줄에 걸치면 각 줄 앞에 스페이스 4칸을
    // 추가/제거합니다. 선택이 없거나 한 줄 안에서만 있으면(기존 동작) 그대로 둡니다.
    function indentLines(outdent) {
      const { value, selectionStart, selectionEnd } = area;
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const searchFrom = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
      let lineEnd = value.indexOf("\n", searchFrom);
      if (lineEnd === -1) lineEnd = value.length;

      let firstDelta = 0;
      const newLines = value
        .slice(lineStart, lineEnd)
        .split("\n")
        .map((line, i) => {
          if (outdent) {
            const removed = (line.match(/^ {1,4}/) || [""])[0].length;
            if (i === 0) firstDelta = -removed;
            return line.slice(removed);
          }
          if (i === 0) firstDelta = 4;
          return "    " + line;
        });

      const replacement = newLines.join("\n");
      area.setRangeText(replacement, lineStart, lineEnd, "preserve");
      const totalDelta = replacement.length - (lineEnd - lineStart);
      area.selectionStart = Math.max(lineStart, selectionStart + firstDelta);
      area.selectionEnd = selectionEnd + totalDelta;
      area.dispatchEvent(new Event("input"));
    }

    area.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      if (e.shiftKey) {
        indentLines(true);
        return;
      }
      const isMultiLine = area.value
        .slice(area.selectionStart, area.selectionEnd)
        .includes("\n");
      if (isMultiLine) {
        indentLines(false);
        return;
      }
      const { selectionStart: s, selectionEnd: en } = area;
      area.setRangeText("    ", s, en, "end");
      area.dispatchEvent(new Event("input"));
    });

    area.addEventListener("input", () => {
      statusEl.textContent = "입력 중…";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const ok = await save();
        statusEl.textContent = ok
          ? "저장됨"
          : "저장 실패 · 새로고침 후 다시 시도하세요";
      }, 500);
    });

    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        titleEl.blur();
      }
    });

    titleEl.addEventListener("blur", async () => {
      if (!titleEl.textContent.trim()) titleEl.textContent = TITLE_DEFAULT;
      const ok = await save();
      statusEl.textContent = ok
        ? "저장됨"
        : "저장 실패 · 새로고침 후 다시 시도하세요";
    });

    (async function init() {
      const data = await Store.get(id, { title: TITLE_DEFAULT, content: "" });
      titleEl.textContent = data.title || TITLE_DEFAULT;
      area.value = data.content || "";
    })();
  }

  window.NotesModule = {
    createCard: buildCard,
  };
})();
