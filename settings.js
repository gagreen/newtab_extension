// 드래그앤드롭(모듈/바로가기 순서 변경) 기능을 껐다 켤 수 있는 전역 토글
(function () {
  const DND_ENABLED_KEY = "dndEnabled";
  const input = document.getElementById("dnd-toggle-input");

  async function getDndEnabled() {
    return await Store.get(DND_ENABLED_KEY, true);
  }

  function applyBodyClass(enabled) {
    document.body.classList.toggle("dnd-disabled", !enabled);
  }

  window.DndSettings = {
    getEnabled: getDndEnabled,
  };

  input.addEventListener("change", async () => {
    const enabled = input.checked;
    applyBodyClass(enabled);
    await Store.set(DND_ENABLED_KEY, enabled);
    document.dispatchEvent(
      new CustomEvent("dnd-setting-changed", { detail: { enabled } })
    );
  });

  (async function init() {
    const enabled = await getDndEnabled();
    input.checked = enabled;
    applyBodyClass(enabled);
  })();
})();
