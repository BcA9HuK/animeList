// Настройки
const NICKNAME = "BcA9HuK"; // для возможного будущего использования
const USER_AGENT = "AnimeLibrary/1.0"; // User-Agent для Shikimori API
const SHEET_CSV_URL_MANGA =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZIa3uuVG-3ZjUWMPJLhnZ6xf0fMs0TabxYE3QRe2Thksz5ILHDv31A3qqJLIl4bZyYKYz5JJZfeK2/pub?gid=326412417&single=true&output=csv";
const CACHE_TTL = 60 * 60 * 1000; // 1 час

const grid = document.getElementById("grid");
const stats = document.getElementById("stats");
const tpl = document.getElementById("card-tpl");
const qInput = document.getElementById("q");
const sortSel = document.getElementById("sort");
const reloadBtn = document.getElementById("reload");
const empty = document.getElementById("empty");
const themeBtn = document.getElementById("theme-toggle");

let ALL = []; // массив всех записей манги

/* --- тема (та же логика, что и на главной странице) --- */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.classList.toggle("theme-light", isLight);
  if (themeBtn) {
    themeBtn.textContent = isLight ? "Тёмная тема" : "Светлая тема";
  }
}

function initTheme() {
  const saved = localStorage.getItem("theme") === "light" ? "light" : "dark";
  applyTheme(saved);
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("theme-light") ? "dark" : "light";
      localStorage.setItem("theme", next);
      applyTheme(next);
    });
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

/* --- CSV-парсер (как в anime.js) --- */
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

/* --- загрузка таблицы манги --- */
async function loadMangaFromSheet(useCache = true) {
  const cacheKey = "manga_sheet_data";
  if (useCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      // На всякий случай досчитываем firstDateTs, если его не было в старой версии кэша
      cached.forEach(item => {
        if (typeof item.firstDateTs !== "number") {
          item.firstDateTs = parseFirstDateTs(item.date);
        }
      });
      stats.textContent = `Загружено из кэша: ${cached.length} записей манги`;
      return cached;
    }
  }

  stats.textContent = "Загружаю список манги из Google Sheets...";
  const res = await fetch(`${SHEET_CSV_URL_MANGA}&cachebust=${Math.floor(Date.now() / 60000)}`);
  if (!res.ok) {
    throw new Error("Ошибка загрузки таблицы манги: " + res.status);
  }

  const text = await res.text();
  const rows = parseCsv(text);
  if (!rows.length) return [];

  const header = rows[0].map(normalizeHeader);

  const idx = {
    idShiki: header.indexOf("id_shiki"),
    nameRu: header.indexOf("name_ru"),
    nameOrig: header.indexOf("name_orig"),
    type: header.indexOf("type"),
    year: header.indexOf("year"),
    releaseStatus: header.indexOf("release status"),
    chapters: header.indexOf("chapters"),
    poster: header.indexOf("poster"),
    genres: header.indexOf("genres"),
    ageRating: header.indexOf("rating"),
    status: header.indexOf("status"),
    date: header.indexOf("date"),
    myScore: header.indexOf("myscore"),
    score: header.indexOf("score"),
    animeAdaptation: header.indexOf("anime adaptation")
  };

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every(c => !c)) continue;

    const get = (idxKey) => {
      const j = idx[idxKey];
      return j >= 0 ? (row[j] || "").trim() : "";
    };

    const idShikiRaw = get("idShiki");
    const idShiki = idShikiRaw && idShikiRaw !== "-" ? Number(idShikiRaw) : null;

    const animeAdaptRaw = get("animeAdaptation");
    const animeAdaptId = animeAdaptRaw && animeAdaptRaw !== "-" ? Number(animeAdaptRaw) : null;

    const item = {
      rowIndex: i, // индекс строки в таблице (для ссылок на подробную страницу)
      idShiki,
      nameRu: get("nameRu"),
      nameOrig: get("nameOrig"),
      type: get("type"),
      year: get("year"),
      releaseStatus: get("releaseStatus"),
      chapters: get("chapters"),
      poster: get("poster"),
      genresText: get("genres"),
      ageRating: get("ageRating"),
      status: get("status"),
      date: get("date"),
      myScore: Number(get("myScore")) || null,
      score: Number(get("score")) || null,
      animeAdaptId,
      descriptionHtml: null,
      firstDateTs: parseFirstDateTs(get("date"))
    };

    items.push(item);
  }

  setCached(cacheKey, items);
  return items;
}

/* --- загрузка описания с Shikimori --- */
async function loadDescriptionFromShiki(id) {
  if (!id) return null;
  try {
    const res = await fetch(`https://shikimori.one/api/mangas/${id}`, {
      headers: {
        "User-Agent": USER_AGENT
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.description_html || null;
  } catch (e) {
    console.warn("Не удалось загрузить описание с Shikimori для манги", id, e);
    return null;
  }
}

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/* --- создатель карточки --- */
function renderCard(item) {
  const node = tpl.content.cloneNode(true);
  const el = node.querySelector(".card");
  const img = node.querySelector(".cover");
  const title = node.querySelector(".title");
  const type = node.querySelector(".type");
  const chapters = node.querySelector(".chapters");
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

  img.src = item.poster || placeholder;
  img.alt = item.nameRu || item.nameOrig || "Manga";

  title.textContent = item.nameRu || item.nameOrig || "—";
  type.textContent = item.type || "";
  chapters.textContent = item.chapters ? `${item.chapters} гл.` : "";
  yearEl.textContent = item.year || "";

  if (item.myScore != null) {
    scoreEl.textContent = `Оценка: ${item.myScore}`;
  } else {
    scoreEl.textContent = "Оценка: —";
  }

  if (item.score != null) {
    ratingEl.textContent = `⭐ ${item.score}`;
  } else {
    ratingEl.textContent = "⭐ —";
  }

  // Оборачиваем карточку в ссылку на подробную страницу манги
  const link = document.createElement("a");
  link.href = `manga_item.html?row=${item.rowIndex}`;
  link.className = "card-link";
  link.style.textDecoration = "none";
  link.style.display = "block";
  link.appendChild(el);

  return link;
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

  const typeFilter = document.getElementById("filter-type").value;
  if (typeFilter) {
    list = list.filter(item => (item.type || "").toLowerCase() === typeFilter.toLowerCase());
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
  stats.textContent = `Показано ${list.length} тайтлов манги.`;
}

/* --- инициализация --- */
async function init() {
  initTheme();

  try {
    reloadBtn.disabled = true;
    ALL = await loadMangaFromSheet(true);

    // Описания с Shikimori будем подгружать на подробной странице,
    // чтобы не словить лимиты/429 на общем списке.
    filterAndRender();
  } catch (err) {
    console.error(err);
    stats.textContent = "Ошибка при загрузке манги: " + err.message;
  } finally {
    reloadBtn.disabled = false;
  }
}

/* события UI */
qInput.addEventListener("input", debounce(filterAndRender, 160));
sortSel.addEventListener("change", filterAndRender);
document.getElementById("filter-type").addEventListener("change", filterAndRender);
reloadBtn.addEventListener("click", () => {
  ALL = [];
  const cacheKey = "manga_sheet_data";
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
document.title = `Библиотека манги ${NICKNAME}`;
const titleManga = document.getElementById("page-title-manga");
if (titleManga) {
  titleManga.textContent = `Библиотека манги ${NICKNAME}`;
}

init();


