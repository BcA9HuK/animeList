// Настройка — поменяй ник при необходимости
const NICKNAME = "BcA9HuK"; //введите свой ник с Шикимори
const USERNAME = NICKNAME; // для совместимости с API
const LIMIT = 500; // Shikimori max per page
const USER_AGENT = "AnimeLibrary/1.0"; // User-Agent для Shikimori API (требуется по документации)
const CACHE_TTL = 60 * 60 * 1000; // Кэш на 1 час (в миллисекундах)

const grid = document.getElementById("grid");
const stats = document.getElementById("stats");
const tpl = document.getElementById("card-tpl");
const qInput = document.getElementById("q");
const sortSel = document.getElementById("sort");
const reloadBtn = document.getElementById("reload");
const empty = document.getElementById("empty");
const themeBtn = document.getElementById("theme-toggle");
const filterType = document.getElementById("filter-type");

let ALL = []; // массив всех записей (rates)

/* --- тема --- */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.classList.toggle("theme-light", isLight);
  if (themeBtn) {
    themeBtn.textContent = isLight ? "Тёмная тема" : "Светлая тема";
  }
}

// Уникальный ключ темы на основе пути страницы
function getThemeKey() {
  const path = window.location.pathname;
  // Извлекаем имя проекта из пути (например, /animeList/ -> animeList)
  const match = path.match(/\/([^\/]+)/);
  const projectName = match ? match[1] : 'default';
  return `theme-${projectName}`;
}

// Обработчик переключения темы (вынесен отдельно, чтобы можно было удалить)
function handleThemeToggle() {
  const themeKey = getThemeKey();
  const next = document.documentElement.classList.contains("theme-light") ? "dark" : "light";
  localStorage.setItem(themeKey, next);
  applyTheme(next);
}

function initTheme() {
  const themeKey = getThemeKey();
  const saved = localStorage.getItem(themeKey) === "light" ? "light" : "dark";
  applyTheme(saved);
  if (themeBtn) {
    // Удаляем старый обработчик, если он был добавлен
    themeBtn.removeEventListener("click", handleThemeToggle);
    // Добавляем новый обработчик
    themeBtn.addEventListener("click", handleThemeToggle);
  }
}

/* --- кэширование --- */
function getCached(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { value, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return value;
  } catch (e) {
    return null;
  }
}

function setCached(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ value, timestamp: Date.now() }));
  } catch (e) {
    console.warn("Не удалось сохранить в кэш:", e);
  }
}

/* --- загрузка постеров из Google Sheets --- */
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZIa3uuVG-3ZjUWMPJLhnZ6xf0fMs0TabxYE3QRe2Thksz5ILHDv31A3qqJLIl4bZyYKYz5JJZfeK2/pub?gid=788506476&single=true&output=csv";
let POSTER_OVERRIDES_CACHE = null;

function normalizeHeader(cell) {
  return cell.replace(/\s+/g, " ").trim().toLowerCase();
}

// Простой CSV-парсер
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (cell.length || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      continue;
    }

    cell += ch;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function loadPosterOverrides() {
  if (POSTER_OVERRIDES_CACHE) return POSTER_OVERRIDES_CACHE;
  
  const cacheKey = "poster_overrides";
  if (getCached(cacheKey)) {
    POSTER_OVERRIDES_CACHE = getCached(cacheKey);
    return POSTER_OVERRIDES_CACHE;
  }

  try {
    const res = await fetch(`${SHEET_CSV_URL}&cachebust=${Math.floor(Date.now() / 60000)}`);
    const text = await res.text();
    const rows = parseCsv(text);
    if (!rows.length) {
      POSTER_OVERRIDES_CACHE = {};
      return {};
    }

    let header = null;
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const candidate = rows[i].map(normalizeHeader);
      if (candidate.some(c => c.includes("id"))) {
        header = candidate;
        headerIdx = i;
        break;
      }
    }
    if (!header) {
      POSTER_OVERRIDES_CACHE = {};
      return {};
    }

    const idIdx = header.findIndex(c => c.includes("id"));
    const posterIdx = header.findIndex(c => {
      const normalized = c.toLowerCase().trim();
      return normalized === "poster" || normalized === "постер" || normalized.includes("poster") || normalized.includes("постер");
    });

    const overrides = {};
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const rawId = (row[idIdx] || "").trim();
      if (!rawId || rawId === "-") continue;
      const numId = Number(rawId);
      if (!Number.isFinite(numId)) continue;

      const poster = (row[posterIdx] || "").trim();
      if (poster && poster !== "-") {
        overrides[numId] = poster;
      }
    }

    POSTER_OVERRIDES_CACHE = overrides;
    setCached(cacheKey, overrides);
    return overrides;
  } catch (e) {
    console.warn("Не удалось загрузить постеры из таблицы", e);
    POSTER_OVERRIDES_CACHE = {};
    return {};
  }
}

/* --- загрузка всех страниц списка completed --- */
async function loadAllRates(status = "completed", useCache = true) {
  const cacheKey = `anime_list_${USERNAME}_${status}`;
  
  // Проверяем кэш
  if (useCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      stats.textContent = `Загружено из кэша: ${cached.length} записей`;
      return cached;
    }
  }

  let page = 1;
  let all = [];

  stats.textContent = "Подгружаю список с Shikimori...";
  while (true) {
    const url = `https://shikimori.one/api/users/${USERNAME}/anime_rates?status=${status}&limit=${LIMIT}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT
      }
    });
    if (!res.ok) throw new Error(`Ошибка Shikimori: ${res.status}`);
    const data = await res.json();

    // 🔥 ДОБАВЛЯЕМ rate_id вручную (это ключевая часть!)
    data.forEach(rate => {
      rate.rate_id = rate.id; // чтобы удобнее использовать
    });

    all = all.concat(data);
    stats.textContent = `Получено ${all.length} записей... (страница ${page})`;
    if (data.length < LIMIT) break;
    page++;
  }
  
  // Сохраняем в кэш
  setCached(cacheKey, all);
  
  return all;
}

/* --- создатель карточки --- */
function renderCardWithOverrides(rate, POSTER_OVERRIDES) {
  const anime = rate.anime || {};
  const node = tpl.content.cloneNode(true);
  const el = node.querySelector(".card");
  const img = node.querySelector(".cover");
  const title = node.querySelector(".title");
  const type = node.querySelector(".type");
  const episodes = node.querySelector(".episodes");
  const yearEl = node.querySelector(".year");
  const score = node.querySelector(".score");
  const rating = node.querySelector(".rating");
  const genres = node.querySelector(".genres");

  // Выбор картинки: сначала ручной override, потом preview, потом original, иначе запасной
  const override = POSTER_OVERRIDES[anime.id];
  const imgPreview = anime.image?.preview ? `https://shikimori.one${anime.image.preview}` : null;
  const imgOrig = anime.image?.original ? `https://shikimori.one${anime.image.original}` : null;

  const placeholder = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'>
       <rect width='100%' height='100%' fill='#2b2b2b'/>
       <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
             font-size='20' fill='#999'>No image</text>
     </svg>`
  )}`;

  img.src = override || imgPreview || imgOrig || placeholder;
  img.alt = anime.russian || anime.name || "Anime";

  title.textContent = anime.russian || anime.name || "—";
  type.textContent = anime.kind ? anime.kind.toUpperCase() : "";
  episodes.textContent = anime.episodes ? `${anime.episodes} эп.` : "";
  const year = anime.aired_on ? anime.aired_on.slice(0, 4) : "";
  yearEl.textContent = year;
  score.textContent = rate.score ? `Оценка: ${rate.score}` : "Оценка: —";
  rating.textContent = anime.score ? `⭐ ${anime.score}` : "⭐ —";

  genres.textContent = anime.genres?.map(g => g.name).join(", ") || "";

  // Оборачиваем карточку в ссылку, чтобы СКМ/ctrl+click открывали в новой вкладке
  const link = document.createElement("a");
  link.href = `anime/anime.html?id=${anime.id}`;
  link.className = "card-link";
  link.style.textDecoration = "none";
  link.style.display = "block";
  link.appendChild(el);

  return link;
}

/* --- подсчёт статистики --- */
function calculateStats(list) {
  const stats = {
    tv: 0,
    movie: 0,
    ova: 0,
    ona: 0,
    special: 0,
    tv_special: 0,
    episodes: 0,
    days: 0,
    hours: 0
  };

  list.forEach(rate => {
    const anime = rate.anime || {};
    const kind = anime.kind ? anime.kind.toLowerCase() : "";
    const episodes = anime.episodes || 0;

    if (kind === "tv") stats.tv++;
    else if (kind === "movie") stats.movie++;
    else if (kind === "ova") stats.ova++;
    else if (kind === "ona") stats.ona++;
    else if (kind === "special") stats.special++;
    else if (kind === "tv_special") {
      stats.tv_special++;
      stats.special++; // учитываем в общем числе спецвыпусков
    }

    stats.episodes += episodes;
  });

  // Средняя длительность эпизода ~24 минуты.
  // Часы: эпизоды * 24 / 60. Дни: часы / 24.
  const hours = (stats.episodes * 24) / 60;
  stats.hours = hours.toFixed(1);
  stats.days = (hours / 24).toFixed(2);

  return stats;
}

/* --- рендер всех карточек с фильтрами --- */
async function renderAll(list) {
  grid.innerHTML = "";
  if (!list.length) {
    empty.hidden = false;
    stats.textContent = "Ничего не показано.";
    return;
  } else {
    empty.hidden = true;
  }

  const frag = document.createDocumentFragment();
  // Загружаем постеры один раз для всех карточек
  const POSTER_OVERRIDES = await loadPosterOverrides();
  
  for (let i = 0; i < list.length; i++) {
    const card = renderCardWithOverrides(list[i], POSTER_OVERRIDES);
    // Добавляем задержку для каждой карточки для эффекта каскада
    card.style.animationDelay = `${i * 0.03}s`;
    frag.appendChild(card);
  }
  grid.appendChild(frag);

  // Показываем статистику
  const statsData = calculateStats(list);
  const typeLabelMap = {
    "": "Тайтлов",
    tv: "Сериалов",
    movie: "Фильмов",
    ova: "OVA",
    ona: "ONA",
    special: "Спешлов",
    tv_special: "TV Special"
  };
  const currentType = (filterType.value || "").toLowerCase();
  const titleLabel = typeLabelMap[currentType] || "Тайтлов";
  const totalTitles =
    statsData.tv +
    statsData.movie +
    statsData.ova +
    statsData.ona +
    statsData.special;

  stats.innerHTML = `
    <span class="stats-item"><strong>${titleLabel}:</strong> ${totalTitles}</span>
    <span class="stats-separator">/</span>
    <span class="stats-item"><strong>Эпизодов:</strong> ${statsData.episodes}</span>
    <span class="stats-separator">/</span>
    <span class="stats-item"><strong>Дней:</strong> ${statsData.days} <span class="stats-muted">(≈ ${statsData.hours} ч)</span></span>
  `;
}


/* --- работа с URL параметрами --- */
function updateURL() {
  const params = new URLSearchParams();
  
  const q = qInput.value.trim();
  if (q) params.set("q", q);
  
  const type = filterType.value;
  if (type) params.set("type", type);
  
  const sort = sortSel.value;
  if (sort && sort !== "date") params.set("sort", sort);
  
  const newURL = params.toString() 
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  
  window.history.replaceState({}, "", newURL);
}

function loadFilters() {
  // Сначала пробуем загрузить из sessionStorage (при возврате со страницы аниме)
  const saved = sessionStorage.getItem("filters");
  if (saved) {
    try {
      const filters = JSON.parse(saved);
      if (filters.q) qInput.value = filters.q;
      if (filters.type) filterType.value = filters.type;
      if (filters.sort) sortSel.value = filters.sort;
      return;
    } catch (e) {
      // Если не получилось, пробуем URL
    }
  }
  
  // Если нет в sessionStorage, пробуем URL
  const params = new URLSearchParams(window.location.search);
  
  const q = params.get("q");
  if (q) qInput.value = q;
  
  const type = params.get("type");
  if (type) filterType.value = type;
  
  const sort = params.get("sort");
  if (sort) sortSel.value = sort;
}

/* --- клиентская фильтрация и сортировка --- */
async function filterAndRender() {
  let filtered = ALL.slice();

  // Поиск по названию
  const q = qInput.value.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(r => {
      const a = r.anime || {};
      const names = [
        a.russian || "",
        a.name || "",
        a.english || "",
        a.japanese || "",
        ...(a.synonyms || [])
      ].join(" ").toLowerCase();
      return names.includes(q);
    });
  }

  // Фильтр по типу
  const typeFilter = filterType.value;
  if (typeFilter) {
    filtered = filtered.filter(r => {
      const anime = r.anime || {};
      return anime.kind && anime.kind.toLowerCase() === typeFilter.toLowerCase();
    });
  }

  const mode = sortSel.value;

  filtered.sort((a, b) => {
    // 🔥 сортировка по оценке
    if (mode === "rate_desc") return (b.score || 0) - (a.score || 0);
    if (mode === "rate_asc") return (a.score || 0) - (b.score || 0);

    // 🔥 сортировка как на Shikimori → по rate_id (ID записи в списке)
    if (mode === "date") {
      return b.rate_id - a.rate_id;  // новые → старые
    }
    if (mode === "date_old") {
    return a.rate_id - b.rate_id; // старые → новые
}

    // 🔥 сортировка по имени
    const A = (a.anime.russian || a.anime.name || "").toLowerCase();
    const B = (b.anime.russian || b.anime.name || "").toLowerCase();
    if (mode === "name_az") return A.localeCompare(B);
    if (mode === "name_za") return B.localeCompare(A);

    return 0;
  });

  await renderAll(filtered);
  
  // Обновляем URL
  updateURL();
  
  // Сохраняем состояние фильтров в sessionStorage для восстановления при возврате
  sessionStorage.setItem("filters", JSON.stringify({
    q: qInput.value,
    type: filterType.value,
    sort: sortSel.value
  }));
}

/* --- инициализация --- */
async function init(resetFilters = false) {
  initTheme();
  
  // Загружаем состояние фильтров (из sessionStorage или URL), если не нужно сбрасывать
  if (!resetFilters) {
    loadFilters();
  } else {
    // Сбрасываем фильтры к значениям по умолчанию
    qInput.value = "";
    filterType.value = "";
    sortSel.value = "date";
  }
  
  try {
    reloadBtn.disabled = true;
    ALL = await loadAllRates("completed");
    filterAndRender();
  } catch (err) {
    console.error(err);
    stats.textContent = "Ошибка при загрузке: " + err.message;
  } finally {
    reloadBtn.disabled = false;
  }
}

/* события UI */
qInput.addEventListener("input", debounce(filterAndRender, 160));
sortSel.addEventListener("change", filterAndRender);
filterType.addEventListener("change", filterAndRender);
reloadBtn.addEventListener("click", () => { 
  ALL = []; 
  // Очищаем сохранённые фильтры
  sessionStorage.removeItem("filters");
  // Очищаем кэш и загружаем заново
  const cacheKey = `anime_list_${USERNAME}_completed`;
  localStorage.removeItem(cacheKey);
  // Очищаем кэш постеров
  localStorage.removeItem("poster_overrides");
  POSTER_OVERRIDES_CACHE = null;
  // Передаём флаг для сброса фильтров
  init(true); 
});

/* простая debounce */
function debounce(fn, time = 150) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), time);
  };
}

/* вставка никнейма в заголовки */
document.title = `Библиотека аниме ${NICKNAME}`;
const titleEl = document.getElementById("page-title");
if (titleEl) {
  titleEl.textContent = `Библиотека аниме ${NICKNAME}`;
}

/* старт */
init();
