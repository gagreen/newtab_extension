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
        class="module-hide"
        aria-label="메모 삭제"
        title="메모 삭제"
      >×</button>
      <div class="card-head">
        <h2 class="note-title" contenteditable="true" spellcheck="false"></h2>
        <span class="card-sub note-status">저장됨</span>
      </div>
      <textarea class="note-area" placeholder="생각나는 것을 적어두세요"></textarea>
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
      await Store.set(id, {
        title: titleEl.textContent.trim() || TITLE_DEFAULT,
        content: area.value,
      });
    }

    area.addEventListener("input", () => {
      statusEl.textContent = "입력 중…";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        await save();
        statusEl.textContent = "저장됨";
      }, 500);
    });

    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        titleEl.blur();
      }
    });

    titleEl.addEventListener("blur", () => {
      if (!titleEl.textContent.trim()) titleEl.textContent = TITLE_DEFAULT;
      save();
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
