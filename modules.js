// 새 탭 모듈(바로가기/할 일/메모/뉴스)의 메타 정보와 설정 저장/조회 유틸리티

const MODULE_CONFIG_KEY = "moduleConfig";

const MODULE_DEFS = {
  shortcuts: {
    name: "바로가기",
    desc: "자주 가는 사이트 바로가기",
    icon: "🔗",
  },
  todo: {
    name: "할 일",
    desc: "할 일 목록을 관리합니다",
    icon: "✅",
  },
  habit: {
    name: "습관",
    desc: "매일 습관을 체크합니다",
    icon: "🔥",
  },
  notes: {
    name: "메모",
    desc: "자유롭게 적는 메모장",
    icon: "📝",
    // 메모는 여러 개를 동시에 추가할 수 있는 모듈입니다.
    multi: true,
  },
  news: {
    name: "뉴스",
    desc: "Google 뉴스 피드",
    icon: "📰",
  },
  mostVisited: {
    name: "자주 방문",
    desc: "자주 방문한 사이트를 추천합니다",
    icon: "⭐",
  },
};

const DEFAULT_MODULE_CONFIG = [
  { id: "shortcuts", enabled: true },
  { id: "todo", enabled: true },
  { id: "habit", enabled: false },
  { id: "notes:default", enabled: true },
  { id: "news", enabled: true },
  { id: "mostVisited", enabled: false },
];

// "notes:abc123"처럼 인스턴스 id가 붙은 모듈에서 기본 모듈 타입("notes")을 추출합니다.
function moduleBaseId(id) {
  const idx = id.indexOf(":");
  return idx === -1 ? id : id.slice(0, idx);
}

// multi 모듈의 새 인스턴스에 쓸 고유 id를 만듭니다.
function genInstanceId(baseId) {
  const rand =
    (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${baseId}:${rand}`;
}

// 저장된 설정을 읽어오되, 새로 추가된 모듈 타입이 있다면 뒤에 합쳐줍니다.
// 예전 버전의 단일 메모("notes")가 저장되어 있다면 새 다중 인스턴스 형식으로 옮겨줍니다.
async function getModuleConfig() {
  const saved = await Store.get(MODULE_CONFIG_KEY, null);
  if (!Array.isArray(saved) || !saved.length) {
    return DEFAULT_MODULE_CONFIG.map((m) => ({ ...m }));
  }

  const merged = [];
  let migrated = false;
  for (const m of saved) {
    if (m.id === "notes") {
      migrated = true;
      const newId = genInstanceId("notes");
      const legacyContent = await Store.get("note", "");
      await Store.set(newId, { title: "메모", content: legacyContent });
      await Store.remove("note");
      merged.push({ id: newId, enabled: true });
    } else if (MODULE_DEFS[moduleBaseId(m.id)]) {
      merged.push({ id: m.id, enabled: !!m.enabled });
    }
  }

  const known = new Set(merged.map((m) => m.id));
  DEFAULT_MODULE_CONFIG.forEach((def) => {
    // multi 모듈은 사용자가 전부 지웠을 수도 있으므로 기본값을 다시 채워넣지 않습니다.
    if (MODULE_DEFS[moduleBaseId(def.id)].multi) return;
    if (!known.has(def.id)) merged.push({ ...def });
  });

  // 마이그레이션이 일어났다면 새 인스턴스 id를 즉시 저장해서, 다음에 새 탭을 열 때
  // 같은 "notes" 항목을 또다시 새 메모로 마이그레이션(=빈 메모 중복 생성)하지 않도록 합니다.
  if (migrated) {
    await setModuleConfig(merged);
  }
  return merged;
}

async function setModuleConfig(config) {
  await Store.set(MODULE_CONFIG_KEY, config);
}
