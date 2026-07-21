const CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 120;
const MODE_PAGE_BLOCK_SIZE = 10;

const cache = new Map();

const removeExpiredEntries = (now = Date.now()) => {
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(key);
    }
};

const enforceCacheLimit = () => {
    while (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
};

const getCatalogCacheValue = async (key, loader) => {
    const now = Date.now();
    const existing = cache.get(key);

    if (existing && existing.expiresAt > now) {
        return existing.value;
    }

    if (existing) cache.delete(key);

    const pendingValue = Promise.resolve().then(loader);
    cache.set(key, {
        expiresAt: now + CACHE_TTL_MS,
        value: pendingValue,
    });

    try {
        const value = await pendingValue;
        const currentEntry = cache.get(key);

        // Una invalidación puede ocurrir mientras la consulta sigue en curso.
        if (currentEntry && currentEntry.value === pendingValue) {
            cache.set(key, {
                expiresAt: Date.now() + CACHE_TTL_MS,
                value,
            });
            removeExpiredEntries();
            enforceCacheLimit();
        }

        return value;
    } catch (error) {
        const currentEntry = cache.get(key);
        if (currentEntry && currentEntry.value === pendingValue) cache.delete(key);
        throw error;
    }
};

const clearCatalogPageCache = () => {
    cache.clear();
};

module.exports = {
    MODE_PAGE_BLOCK_SIZE,
    clearCatalogPageCache,
    getCatalogCacheValue,
};
