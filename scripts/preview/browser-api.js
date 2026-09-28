/* Browser preview only. Isolated localStorage, never replaces extension APIs. */
if (!globalThis.chrome?.storage) {
  const listeners = new Set();
  const storageArea = (area) => ({
    async get(key) {
      return {
        [key]: JSON.parse(
          localStorage.getItem(`preview:${area}:${key}`) ?? "null",
        ),
      };
    },
    async set(values) {
      const changes = {};
      for (const [key, newValue] of Object.entries(values)) {
        const oldValue = JSON.parse(
          localStorage.getItem(`preview:${area}:${key}`) ?? "null",
        );
        localStorage.setItem(
          `preview:${area}:${key}`,
          JSON.stringify(newValue),
        );
        changes[key] = { oldValue, newValue };
      }
      listeners.forEach((fn) => fn(changes, area));
    },
    async remove(key) {
      localStorage.removeItem(`preview:${area}:${key}`);
    },
  });
  globalThis.chrome = {
    runtime: {
      getURL: (path) =>
        new URL(path.replace(/^\//, ""), location.origin + "/").href,
    },
    storage: {
      sync: storageArea("sync"),
      local: storageArea("local"),
      onChanged: { addListener: (fn) => listeners.add(fn) },
    },
  };
}
