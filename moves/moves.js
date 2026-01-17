// Настройки
const NICKNAME = "BcA9HuK"; // для возможного будущего использования
const SHEET_CSV_URL_MOVES =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZIa3uuVG-3ZjUWMPJLhnZ6xf0fMs0TabxYE3QRe2Thksz5ILHDv31A3qqJLIl4bZyYKYz5JJZfeK2/pub?gid=1861671541&single=true&output=csv";
const CACHE_TTL = 60 * 60 * 1000; // 1 час

const grid = document.getElementById("grid");
const stats = document.getElementById("stats");
const tpl = document.getElementById("card-tpl");
const qInput = document.getElementById("q");
const sortSel = document.getElementById("sort");
const reloadBtn = document.getElementById("reload");
const empty = document.getElementById("empty");
const themeBtn = document.getElementById("theme-toggle");
const filterType = document.getElementById("filter-type");

let ALL = []; // массив всех записей фильмов/сериалов/дорам/мультфильмов

/* --- тема (та же логика, что и на главной странице) --- */
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

/* --- CSV-парсер (как в manga.js) --- */
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

function normalizeHeader(cell) {
  return cell.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseFirstDateTs(str) {
  if (!str) return 0;
  const m = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return 0;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : 0;
}

/* --- загрузка таблицы фильмов/сериалов/дорам/мультфильмов --- */
async function loadMovesFromSheet(useCache = true) {
  const cacheKey = "moves_sheet_data";
  if (useCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      // На всякий случай досчитываем firstDateTs, если его не было в старой версии кэша
      cached.forEach(item => {
        if (typeof item.firstDateTs !== "number") {
          item.firstDateTs = parseFirstDateTs(item.date);
        }
      });
      stats.textContent = `Загружено из кэша: ${cached.length} записей`;
      return cached;
    }
  }

  stats.textContent = "Загружаю список из Google Sheets...";
  const res = await fetch(`${SHEET_CSV_URL_MOVES}&cachebust=${Math.floor(Date.now() / 60000)}`);
  if (!res.ok) {
    throw new Error("Ошибка загрузки таблицы: " + res.status);
  }

  const text = await res.text();
  const rows = parseCsv(text);
  if (!rows.length) return [];

  // Пропускаем первую строку (№), используем вторую как заголовки
  const header = rows[0].map(normalizeHeader);

  // Структура таблицы:
  // A: №, B: Name_ru, C: Name_Orig, D: Type, E: Country, F: Year, G: Duration/series, 
  // H: Poster, I: Genres, J: Rating, K: Status, L: Date, M: Voiceover, 
  // N: My Score, O: Score, P: Note, Q: Description
  const idx = {
    number: header.indexOf("№") >= 0 ? header.indexOf("№") : 0,
    nameRu: header.findIndex(h => h.includes("name_ru") || h.includes("name ru")),
    nameOrig: header.findIndex(h => h.includes("name_orig") || h.includes("name orig") || h.includes("name_original")),
    type: header.findIndex(h => h === "type"),
    country: header.findIndex(h => h === "country"),
    year: header.findIndex(h => h === "year"),
    duration: header.findIndex(h => h.includes("duration") || h.includes("series") || h.includes("серии")),
    poster: header.findIndex(h => h === "poster"),
    genres: header.findIndex(h => h === "genres"),
    rating: header.findIndex(h => h === "rating"),
    status: header.findIndex(h => h === "status"),
    date: header.findIndex(h => h === "date"),
    voiceover: header.findIndex(h => h === "voiceover"),
    myScore: header.findIndex(h => h.includes("my score") || h.includes("myscore")),
    score: header.findIndex(h => h === "score" && !h.includes("my")),
    note: header.findIndex(h => h === "note"),
    description: header.findIndex(h => h === "description")
  };

  const items = [];
  // Начинаем с третьей строки (индекс 2), так как:
  // индекс 0 - заголовки
  // индекс 1 - пустая/служебная строка
  // индекс 2 - первая строка с данными
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every(c => !c || c.trim() === "")) continue;

    const get = (idxKey) => {
      const j = idx[idxKey];
      const value = j >= 0 && row[j] ? (row[j] || "").trim() : "";
      // Не возвращаем прочерки
      return value === "-" ? "" : value;
    };

    const item = {
      rowIndex: i, // индекс строки в таблице (для ссылок на подробную страницу)
      nameRu: get("nameRu"),
      nameOrig: get("nameOrig"),
      type: get("type"),
      country: get("country"),
      year: get("year"),
      duration: get("duration"),
      poster: get("poster"),
      genresText: get("genres"),
      rating: get("rating"),
      status: get("status"),
      date: get("date"),
      voiceover: get("voiceover"),
      myScore: Number(get("myScore")) || null,
      score: get("score") ? parseFloat(get("score").replace(",", ".")) : null,
      note: get("note"),
      descriptionText: get("description"),
      firstDateTs: parseFirstDateTs(get("date"))
    };

    items.push(item);
  }

  setCached(cacheKey, items);
  return items;
}

/* --- создатель карточки --- */
function renderCard(item) {
  const node = tpl.content.cloneNode(true);
  const el = node.querySelector(".card");
  const img = node.querySelector(".cover");
  const title = node.querySelector(".title");
  const type = node.querySelector(".type");
  const chapters = node.querySelector(".chapters");
  const episodes = node.querySelector(".episodes");
  const yearEl = node.querySelector(".year");
  const scoreEl = node.querySelector(".score");
  const ratingEl = node.querySelector(".rating");

  const placeholder = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'>
       <rect width='100%' height='100%' fill='#2b2b2b'/>
       <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
             font-size='20' fill='#999'>No image</text>
     </svg>`
  )}`;

  // Обработка ошибок загрузки изображения
  img.onerror = function() {
    this.src = placeholder;
    this.onerror = null; // предотвращаем бесконечный цикл
  };
  img.src = item.poster || placeholder;
  img.alt = item.nameRu || item.nameOrig || "Title";

  title.textContent = item.nameRu || item.nameOrig || "—";
  type.textContent = item.type || "";
  
  // Скрываем chapters (не используется)
  if (chapters) chapters.textContent = "";
  
  // Для всех типов используем episodes для отображения duration/серий
  if (episodes) {
    episodes.textContent = item.duration || "";
    // Скрываем, если пустое
    if (!item.duration || item.duration === "-") {
      episodes.textContent = "";
    }
  }
  
  yearEl.textContent = item.year || "";
  // Скрываем элементы, если значения пустые или прочерки
  if (!item.year || item.year === "-") {
    yearEl.textContent = "";
  }
  if (!item.type || item.type === "-") {
    type.textContent = "";
  }

  if (item.myScore != null) {
    scoreEl.textContent = `Оценка: ${item.myScore}`;
  } else {
    scoreEl.textContent = "Оценка: —";
  }

  if (item.score != null) {
    ratingEl.textContent = `⭐ ${item.score.toFixed(2)}`;
  } else {
    ratingEl.textContent = "⭐ —";
  }

  // Оборачиваем карточку в ссылку на подробную страницу
  const link = document.createElement("a");
  link.href = `moves_item.html?row=${item.rowIndex}`;
  link.className = "card-link";
  link.style.textDecoration = "none";
  link.style.display = "block";
  link.appendChild(el);

  return link;
}

/* --- подсчёт статистики --- */
function calculateStats(list) {
  const stats = {
    films: 0,
    series: 0,
    dramas: 0,
    cartoons: 0,
    total: list.length
  };

  list.forEach(item => {
    const type = (item.type || "").toLowerCase();
    // Сначала проверяем мультфильмы, чтобы они не попали в фильмы
    if (type.includes("м/ф") || type.includes("cartoon") || type.includes("анимация")) {
      stats.cartoons++;
    } else if (type.includes("дорама") || type.includes("dorama") || type.includes("drama")) {
      stats.dramas++;
    } else if (type.includes("сериал") || type.includes("series") || type.includes("tv")) {
      stats.series++;
    } else if (type.includes("фильм") || type.includes("film") || type.includes("movie")) {
      stats.films++;
    }
  });

  return stats;
}

/* --- фильтрация и сортировка --- */
function filterAndRender() {
  let list = ALL.slice();

  const q = qInput.value.trim().toLowerCase();
  if (q) {
    list = list.filter(item => {
      const haystack = [
        item.nameRu || "",
        item.nameOrig || "",
        item.genresText || ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  const typeFilter = filterType.value;
  if (typeFilter) {
    list = list.filter(item => {
      const itemType = (item.type || "").toLowerCase();
      const filterTypeLower = typeFilter.toLowerCase();
      
      if (filterTypeLower === "фильмы" || filterTypeLower === "film" || filterTypeLower === "movie") {
        return itemType.includes("фильм") || itemType.includes("film") || itemType.includes("movie");
      } else if (filterTypeLower === "сериалы" || filterTypeLower === "series" || filterTypeLower === "tv") {
        return itemType.includes("сериал") || itemType.includes("series") || itemType.includes("tv");
      } else if (filterTypeLower === "дорамы" || filterTypeLower === "drama" || filterTypeLower === "dorama") {
        return itemType.includes("дорама") || itemType.includes("drama") || itemType.includes("dorama");
      } else if (filterTypeLower === "м/ф" || filterTypeLower === "cartoon") {
        return itemType.includes("м/ф") || itemType.includes("cartoon") || itemType.includes("анимация");
      }
      return (item.type || "").toLowerCase() === filterTypeLower;
    });
  }

  const mode = sortSel.value;
  list.sort((a, b) => {
    if (mode === "my_score_desc") return (b.myScore || 0) - (a.myScore || 0);
    if (mode === "my_score_asc") return (a.myScore || 0) - (b.myScore || 0);
    if (mode === "date_desc") return (b.firstDateTs || 0) - (a.firstDateTs || 0);
    if (mode === "date_asc") return (a.firstDateTs || 0) - (b.firstDateTs || 0);

    const A = (a.nameRu || a.nameOrig || "").toLowerCase();
    const B = (b.nameRu || b.nameOrig || "").toLowerCase();
    if (mode === "name_az") return A.localeCompare(B);
    if (mode === "name_za") return B.localeCompare(A);

    return 0;
  });

  grid.innerHTML = "";
  if (!list.length) {
    empty.hidden = false;
    stats.textContent = "Ничего не показано.";
    return;
  } else {
    empty.hidden = true;
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < list.length; i++) {
    const card = renderCard(list[i]);
    card.style.animationDelay = `${i * 0.03}s`;
    frag.appendChild(card);
  }
  grid.appendChild(frag);

  // Показываем статистику
  const statsData = calculateStats(list);
  stats.textContent = `Показано ${list.length} тайтлов. Фильмы: ${statsData.films}, Сериалы: ${statsData.series}, Дорамы: ${statsData.dramas}, Мультфильмы: ${statsData.cartoons}`;
}

/* --- инициализация --- */
async function init() {
  initTheme();

  try {
    reloadBtn.disabled = true;
    ALL = await loadMovesFromSheet(true);
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
  const cacheKey = "moves_sheet_data";
  localStorage.removeItem(cacheKey);
  init();
});

/* простая debounce */
function debounce(fn, time = 150) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), time);
  };
}

/* старт */
document.title = `Библиотека фильмов/сериалов ${NICKNAME}`;
const titleMoves = document.getElementById("page-title-manga");
if (titleMoves) {
  titleMoves.textContent = `Библиотека фильмов/сериалов ${NICKNAME}`;
}

init();
