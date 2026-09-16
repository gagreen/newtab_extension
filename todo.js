(function () {
  const STORAGE_KEY = "todos";
  const form = document.getElementById("todo-form");
  const input = document.getElementById("todo-input");
  const listEl = document.getElementById("todo-list");
  const countEl = document.getElementById("todo-count");

  let todos = []; // { id, text, done }

  function updateCount() {
    const remaining = todos.filter((t) => !t.done).length;
    countEl.textContent = todos.length ? `${remaining}개 남음` : "";
  }

  function render() {
    listEl.innerHTML = "";

    if (!todos.length) {
      const empty = document.createElement("li");
      empty.className = "todo-empty";
      empty.textContent = "할 일이 없습니다";
      listEl.appendChild(empty);
      updateCount();
      return;
    }

    todos.forEach((todo) => {
      const li = document.createElement("li");
      if (todo.done) li.classList.add("done");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = todo.done;
      checkbox.addEventListener("change", async () => {
        todo.done = checkbox.checked;
        await Store.set(STORAGE_KEY, todos);
        render();
      });

      const span = document.createElement("span");
      span.textContent = todo.text;

      const removeBtn = document.createElement("button");
      removeBtn.className = "todo-remove";
      removeBtn.textContent = "삭제";
      removeBtn.addEventListener("click", async () => {
        todos = todos.filter((t) => t.id !== todo.id);
        await Store.set(STORAGE_KEY, todos);
        render();
      });

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(removeBtn);
      listEl.appendChild(li);
    });

    updateCount();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    todos.push({ id: Date.now(), text, done: false });
    input.value = "";
    await Store.set(STORAGE_KEY, todos);
    render();
  });

  (async function init() {
    todos = await Store.get(STORAGE_KEY, []);
    render();
  })();
})();
