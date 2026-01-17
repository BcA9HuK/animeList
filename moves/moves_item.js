const params = new URLSearchParams(location.search);
const rowParam = Number(params.get("row"));
const NICKNAME = "BcA9HuK"; // должно совпадать с main.js/moves.js
const SHEET_CSV_URL_MOVES =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZIa3uuVG-3ZjUWMPJLhnZ6xf0fMs0TabxYE3QRe2Thksz5ILHDv31A3qqJLIl4bZyYKYz5JJZfeK2/pub?gid=1861671541&single=true&output=csv";

/* --- тема --- */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.classList.toggle("theme-light", isLight);
}

// Уникальный ключ темы на основе пути страницы
function getThemeKey() {
  const path = window.location.pathname;
  // Извлекаем имя проекта из пути (например, /animeList/ -> animeList)
  const match = path.match(/\/([^\/]+)/);
  const projectName = match ? match[1] : 'default';
  return `theme-${projectName}`;
}

const themeKey = getThemeKey();
applyTheme(localStorage.getItem(themeKey) === "light" ? "light" : "dark");

/* --- CSV-парсер (упрощённая версия из moves.js) --- */
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

async function loadMovesRow(rowIndex) {
  // rowIndex должен быть >= 2, так как данные начинаются с третьей строки (индекс 2)
  if (!Number.isFinite(rowIndex) || rowIndex < 2) {
    throw new Error("Некорректный параметр row");
  }

  const res = await fetch(SHEET_CSV_URL_MOVES);
  if (!res.ok) {
    throw new Error("Ошибка загрузки таблицы: " + res.status);
  }

  const text = await res.text();
  const rows = parseCsv(text);
  if (!rows.length) {
    throw new Error("Таблица пуста");
  }

  const header = rows[0].map(normalizeHeader);
  // rowIndex должен быть >= 2, так как данные начинаются с третьей строки (индекс 2)
  // индекс 0 - заголовки, индекс 1 - пустая строка, индекс 2 - первая строка с данными
  if (rowIndex < 2 || rowIndex >= rows.length) {
    throw new Error("Строка не найдена");
  }

  const row = rows[rowIndex];

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

  const get = (idxKey) => {
    const j = idx[idxKey];
    const value = j >= 0 && row[j] ? (row[j] || "").trim() : "";
    // Не возвращаем прочерки
    return value === "-" ? "" : value;
  };

  return {
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
    descriptionText: get("description")
  };
}

function renderMovesPage(item) {
  const container = document.getElementById("moves");
  if (!container) return;

  const placeholder = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'>
       <rect width='100%' height='100%' fill='#2b2b2b'/>
       <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
             font-size='20' fill='#999'>No image</text>
     </svg>`
  )}`;

  const posterUrl = item.poster || placeholder;
  const title = item.nameRu || item.nameOrig || "—";
  const subtitle = item.nameOrig || "";

  const year = item.year || "—";
  const type = item.type || "—";
  const duration = item.duration || "—";
  const country = item.country || "";
  const rating = item.rating || "";
  const myScore = item.myScore != null ? item.myScore : "—";
  const score = item.score != null ? item.score.toFixed(2) : "—";
  const ageBadge = item.rating
    ? `<span class="badge badge-age">${item.rating}</span>`
    : "";
  const countryBadge = country
    ? `<span class="badge">${country}</span>`
    : "";

  const genresHtml = (item.genresText || "")
    .split(",")
    .map(g => g.trim())
    .filter(Boolean)
    .map(g => `<span class="tag">${g}</span>`)
    .join("");

  const statusTags = [];
  if (item.status) statusTags.push(`<span class="tag">${item.status}</span>`);
  if (item.date) statusTags.push(`<span class="tag">Дата: ${item.date}</span>`);
  if (item.voiceover) statusTags.push(`<span class="tag">Озвучка: ${item.voiceover}</span>`);
  // Оценка пользователя
  statusTags.push(`<span class="tag">Оценка ${NICKNAME}: ${myScore}</span>`);
  // Note всегда с классом zakom для особого выделения, идёт последним
  if (item.note) {
    statusTags.push(`<span class="tag zakom">${item.note}</span>`);
  }

  // Описание из таблицы
  let finalDescriptionHtml = null;
  if (item.descriptionText) {
    const escaped = item.descriptionText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/\n/g, "<br>");
    finalDescriptionHtml = escaped;
  }

  const descriptionBlock = finalDescriptionHtml
    ? `<div class="description">${finalDescriptionHtml}</div>`
    : `<div class="description">Описание недоступно.</div>`;

  container.innerHTML = `
    <div class="poster-wrapper">
      <div class="poster">
        <a class="back back-on-poster" href="moves.html">Назад</a>
        <img src="${posterUrl}" alt="${title}" onerror="this.src='${placeholder}'; this.onerror=null;">
      </div>
    </div>

    <div class="info">
      <div class="top-actions">
        <a class="back back-in-actions" href="moves.html">← Назад</a>
      </div>

      <h1>${title}</h1>
      <div class="subtitle">${subtitle}</div>

      <div>
        <span class="badge">⭐ ${score}</span>
        <span class="badge">${type}</span>
        <span class="badge">${duration}</span>
        <span class="badge">${year}</span>
        ${countryBadge}
        ${ageBadge}
      </div>

      ${statusTags.length ? `<h3>Статус</h3><div class="tags">${statusTags.join("")}</div>` : ""}

      ${genresHtml ? `<h3>Жанры</h3><div class="tags">${genresHtml}</div>` : ""}

      ${descriptionBlock}
    </div>
  `;
}

async function initMovesItem() {
  const container = document.getElementById("moves");
  if (!container) return;

  if (!Number.isFinite(rowParam) || rowParam < 1) {
    container.textContent = "Некорректный параметр в ссылке.";
    return;
  }

  try {
    container.textContent = "Загружаю...";
    const item = await loadMovesRow(rowParam);
    renderMovesPage(item);
  } catch (e) {
    console.error(e);
    container.textContent = "Ошибка при загрузке: " + e.message;
  }
}

document.title = `Фильм/сериал — ${NICKNAME}`;

initMovesItem();
