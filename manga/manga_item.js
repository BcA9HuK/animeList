const params = new URLSearchParams(location.search);
const rowParam = Number(params.get("row"));
const NICKNAME = "BcA9HuK"; // должно совпадать с main.js/manga.js
const USER_AGENT = "AnimeLibrary/1.0"; // User-Agent для Shikimori API
const SHEET_CSV_URL_MANGA =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZIa3uuVG-3ZjUWMPJLhnZ6xf0fMs0TabxYE3QRe2Thksz5ILHDv31A3qqJLIl4bZyYKYz5JJZfeK2/pub?gid=326412417&single=true&output=csv";

/* --- тема --- */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.classList.toggle("theme-light", isLight);
}

applyTheme(localStorage.getItem("theme") === "light" ? "light" : "dark");

/* --- CSV-парсер (упрощённая версия из manga.js) --- */
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

async function loadMangaRow(rowIndex) {
  if (!Number.isFinite(rowIndex) || rowIndex < 1) {
    throw new Error("Некорректный параметр row");
  }

  const res = await fetch(SHEET_CSV_URL_MANGA);
  if (!res.ok) {
    throw new Error("Ошибка загрузки таблицы манги: " + res.status);
  }

  const text = await res.text();
  const rows = parseCsv(text);
  if (!rows.length) {
    throw new Error("Таблица манги пуста");
  }

  const header = rows[0].map(normalizeHeader);
  if (rowIndex >= rows.length) {
    throw new Error("Строка с мангой не найдена");
  }

  const row = rows[rowIndex];

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
    animeAdaptation: header.indexOf("anime adaptation"),
    description: header.indexOf("description")
  };

  const get = (idxKey) => {
    const j = idx[idxKey];
    return j >= 0 ? (row[j] || "").trim() : "";
  };

  const idShikiRaw = get("idShiki");
  const idShiki = idShikiRaw && idShikiRaw !== "-" ? Number(idShikiRaw) : null;

  const animeAdaptRaw = get("animeAdaptation");
  const animeAdaptId = animeAdaptRaw && animeAdaptRaw !== "-" ? Number(animeAdaptRaw) : null;

  return {
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
    descriptionText: get("description")
  };
}

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

function renderMangaPage(item, descriptionHtml) {
  const container = document.getElementById("manga");
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
  const chapters = item.chapters || "—";
  const releaseStatus = item.releaseStatus || "";
  const myScore = item.myScore != null ? item.myScore : "—";
  const score = item.score != null ? item.score : "—";
  const ageBadge = item.ageRating
    ? `<span class="badge badge-age">${item.ageRating}</span>`
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
  // Оценка BcA9HuK переносится в блок «Статус» и идёт последней
  statusTags.push(`<span class="tag">Оценка ${NICKNAME}: ${myScore}</span>`);

  // Если в таблице есть своё описание — оно в приоритете над Shikimori
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
  } else {
    finalDescriptionHtml = descriptionHtml;
  }

  const descriptionBlock = finalDescriptionHtml
    ? `<div class="description">${finalDescriptionHtml}</div>`
    : `<div class="description">Описание недоступно.</div>`;

  container.innerHTML = `
    <div class="poster-wrapper">
      <div class="poster">
        <a class="back back-on-poster" href="manga.html">Назад</a>
        <img src="${posterUrl}" alt="${title}">
      </div>
    </div>

    <div class="info">
      <div class="top-actions">
        <a class="back back-in-actions" href="manga.html">← Назад</a>
        ${item.idShiki ? `<a class="link" href="https://shikimori.one/mangas/${item.idShiki}" target="_blank" rel="noopener">Открыть на Shikimori</a>` : ""}
        ${item.animeAdaptId ? `<a class="link" href="../anime/anime.html?id=${item.animeAdaptId}" target="_blank" rel="noopener">Аниме‑адаптация</a>` : ""}
      </div>

      <h1>${title}</h1>
      <div class="subtitle">${subtitle}</div>

      <div>
        <span class="badge">⭐ ${score}</span>
        <span class="badge">${type}</span>
        <span class="badge">${chapters} гл.</span>
        <span class="badge">${year}</span>
        ${releaseStatus ? `<span class="badge">${releaseStatus}</span>` : ""}
        ${ageBadge}
      </div>

      ${statusTags.length ? `<h3>Статус</h3><div class="tags">${statusTags.join("")}</div>` : ""}

      ${genresHtml ? `<h3>Жанры</h3><div class="tags">${genresHtml}</div>` : ""}

      ${descriptionBlock}
    </div>
  `;
}

async function initMangaItem() {
  const container = document.getElementById("manga");
  if (!container) return;

  if (!Number.isFinite(rowParam) || rowParam < 1) {
    container.textContent = "Некорректный параметр в ссылке.";
    return;
  }

  try {
    container.textContent = "Загружаю мангу...";
    const item = await loadMangaRow(rowParam);
    const descriptionHtml = await loadDescriptionFromShiki(item.idShiki);
    renderMangaPage(item, descriptionHtml);
  } catch (e) {
    console.error(e);
    container.textContent = "Ошибка при загрузке манги: " + e.message;
  }
}

document.title = `Манга — ${NICKNAME}`;

initMangaItem();


