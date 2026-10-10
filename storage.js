// chrome.storage.local을 promise 기반으로 감싼 유틸리티
// 확장 프로그램을 새로고침한 직후 등, 이미 열려 있던 새 탭 페이지의 컨텍스트가
// 무효화(invalidated)된 상태에서 저장을 시도하면 chrome.storage 호출이 조용히
// 실패하거나 즉시 throw할 수 있습니다. 이 경우를 잡아서 최소한 콘솔에 남기고,
// set/remove는 성공 여부(boolean)를 반환해 호출 쪽에서 실패를 알 수 있게 합니다.
const Store = {
  async get(key, fallback) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(result[key] === undefined ? fallback : result[key]);
        });
      });
    } catch (err) {
      console.error("Store.get 실패:", key, err);
      return fallback;
    }
  },
  async set(key, value) {
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });
      return true;
    } catch (err) {
      console.error("Store.set 실패:", key, err);
      return false;
    }
  },
  async remove(key) {
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.local.remove([key], () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });
      return true;
    } catch (err) {
      console.error("Store.remove 실패:", key, err);
      return false;
    }
  },
};
