const params = new URLSearchParams(location.search);
const id = params.get("id");
const NICKNAME = "BcA9HuK"; // должно совпадать с main.js
const user = NICKNAME;
const USER_AGENT = "AnimeLibrary/1.0"; // User-Agent для Shikimori API (требуется по документации)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQZIa3uuVG-3ZjUWMPJLhnZ6xf0fMs0TabxYE3QRe2Thksz5ILHDv31A3qqJLIl4bZyYKYz5JJZfeK2/pub?gid=788506476&single=true&output=csv";
let SHEET_CACHE = null; // { ready: Promise<Map> }

/* --- тема --- */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.classList.toggle("theme-light", isLight);
}

// применяем сразу сохранённую тему, чтобы не мигало
applyTheme(localStorage.getItem("theme") === "light" ? "light" : "dark");

function isShikiPlaceholderPath(pathOrUrl) {
  return typeof pathOrUrl === "string" && pathOrUrl.includes("/assets/globals/missing_original");
}

// Извлекает YouTube ID из URL
function getYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function fetchGraphQL(query, variables = {}) {
  const res = await fetch("https://shikimori.one/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    throw new Error("GraphQL error: " + res.status);
  }

  const json = await res.json();
  if (json.errors) {
    console.error("GraphQL errors:", json.errors);
    throw new Error("GraphQL returned errors");
  }
  return json.data;
}

// Получаем данные через GraphQL: постер + жанры + студии (без описания)
async function getGraphqlAnimeInfo(animeId) {
  const query = `
    query ($ids: String!) {
      animes(ids: $ids) {
        id
        poster {
          mainUrl
          originalUrl
        }
        genres {
          name
          russian
        }
        studios {
          name
        }
      }
    }
  `;
  const data = await fetchGraphQL(query, { ids: String(animeId) });
  const list = data?.animes || [];
  const first = list[0];
  if (!first) return null;

  const rawUrl = first.poster?.mainUrl || first.poster?.originalUrl || null;
  const posterUrl = (!rawUrl || isShikiPlaceholderPath(rawUrl)) ? null : rawUrl;

  return {
    posterUrl,
    genres: Array.isArray(first.genres) ? first.genres : [],
    studios: Array.isArray(first.studios) ? first.studios : []
  };
}

// Простой CSV-парсер с поддержкой кавычек
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' ) {
      if (inQuotes && next === '"') {
        cell += '"'; // экранированная кавычка
        i++; // пропускаем двойную
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
      // завершаем строку
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
  // последний хвост
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(cell) {
  return cell.replace(/\s+/g, " ").trim().toLowerCase();
}

async function loadSheetMap() {
  if (SHEET_CACHE?.ready) return SHEET_CACHE.ready;
  const ready = (async () => {
    try {
      const res = await fetch(`${SHEET_CSV_URL}&cachebust=${Math.floor(Date.now() / 60000)}`);
      const text = await res.text();
      const rows = parseCsv(text);
      if (!rows.length) return new Map();

      // ищем строку заголовков
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
      if (!header) return new Map();

      const idIdx = header.findIndex(c => c.includes("id"));
      const rewatchIdx = header.findIndex(c => c.includes("пересмотр"));
      const dateIdx = header.findIndex(c => c.includes("дата"));
      const voiceIdx = header.findIndex(c => c.includes("озвучк"));
      const zakomIdx = header.findIndex(c => c.includes("коммент"));

      const map = new Map();
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row.length) continue;
        const rawId = (row[idIdx] || "").trim();
        if (!rawId || rawId === "-") continue;
        const numId = Number(rawId);
        if (!Number.isFinite(numId)) continue;

        const norm = (v) => {
          if (typeof v !== "string") return null;
          const t = v.trim();
          return t ? t : null;
        };

        const rewatch = norm(row[rewatchIdx]);
        const date = norm(row[dateIdx]);
        const voice = norm(row[voiceIdx]);
        const zakomRaw = norm(row[zakomIdx]);
        const hasZakom = zakomRaw ? /с\s*заком/i.test(zakomRaw) : false;
        // Онгоинг: ищем слово по всей строке (в т.ч. "Зима 24 (онгоинг)")
        const hasOngoing = row.some(cell => /онгоинг/i.test(cell || ""));

        map.set(String(numId), {
          rewatch,
          date,
          voice,
          zakom: hasZakom,
          ongoing: hasOngoing
        });
      }
      return map;
    } catch (e) {
      console.warn("Failed to load custom sheet", e);
      return new Map();
    }
  })();
  SHEET_CACHE = { ready };
  return ready;
}

async function getCustomData(shikiId) {
  const map = await loadSheetMap();
  return map.get(String(shikiId)) || null;
}

// Поддержка больших списков: пагинируем по 500 элементов, пока не найдём запись
async function loadRate(id) {
  const LIMIT = 500;
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://shikimori.one/api/users/${user}/anime_rates?limit=${LIMIT}&page=${page}`,
      {
        headers: {
          "User-Agent": USER_AGENT
        }
      }
    );
    if (!res.ok) {
      console.warn("Failed to load rates page", page, res.status);
      break;
    }
    const rates = await res.json();
    const found = rates.find(r => r.anime.id == id);
    if (found) return found;
    if (rates.length < LIMIT) break; // достигли конца
    page++;
  }
  return null;
}

async function loadAnime() {
    // Ручные постеры для страницы тайтла (id -> URL), если нужно принудительно заменить
    const POSTER_OVERRIDES = {
      // Пример: 59986: "https://shikimori.one/uploads/poster/animes/59986/main-f58f92d4adc6e336d2cce149dcaaedac.webp",
      56907: "https://shikimori.one/uploads/poster/animes/56907/d440571f2132e74a76781ca457187c79.jpeg",
      48962: "https://shikimori.one/uploads/poster/animes/48962/main-70c6648952fb23b1014a6888b5965c8f.webp",
      56774: "https://shikimori.one/uploads/poster/animes/56774/main-126444114f0f3478ae877707750fccd2.webp",
      55791: "https://shikimori.one/uploads/poster/animes/55791/main-bab756dc3eebe56bcc3aea2107cb41ec.webp",
      59424: "https://shikimori.one/uploads/poster/animes/59424/d2c95cfc56e448c1bd68440c06fb54fe.jpeg",
      52709: "https://shikimori.one/uploads/poster/animes/52709/main-bd54103165cb7ce8486939e8328a236e.webp",
      54284: "https://shikimori.one/uploads/poster/animes/54284/main-e07db78ddc9e6b6d5c369bf258671dda.webp",
      52962: "https://shikimori.one/uploads/poster/animes/52962/main-ece812da3f560cc3d1ccf0d2ebaaaa3d.webp",
      4224: "https://shikimori.one/uploads/poster/animes/4224/main-52f8a82ffd8cb7d6ec1a7596435138c1.webp"
    };

    const res = await fetch(`https://shikimori.one/api/animes/${id}`, {
      headers: {
        "User-Agent": USER_AGENT
      }
    });
    const anime = await res.json();

    // базовые данные из REST
    let posterUrl = POSTER_OVERRIDES[anime.id] || (anime.image?.original ? `https://shikimori.one${anime.image.original}` : null);
    let restGenres = Array.isArray(anime.genres) ? anime.genres : [];
    let restStudios = Array.isArray(anime.studios) ? anime.studios : [];

    // пробуем дополнить/заменить данные через GraphQL (один запрос)
    let gqlInfo = null;
    try {
      gqlInfo = await getGraphqlAnimeInfo(id);
    } catch (e) {
      console.warn("GraphQL anime info for anime page failed", id, e);
    }

    // постер: если REST дал заглушку или ничего — берём из GraphQL
    if ((!posterUrl || isShikiPlaceholderPath(anime.image?.original)) && gqlInfo?.posterUrl) {
      posterUrl = gqlInfo.posterUrl;
    }

    // жанры: если в REST пусто — берём из GraphQL
    if (!restGenres.length && gqlInfo?.genres?.length) {
      restGenres = gqlInfo.genres;
    }

    // студии: если в REST пусто — берём из GraphQL
    if (!restStudios.length && gqlInfo?.studios?.length) {
      restStudios = gqlInfo.studios;
    }

    // загружаем трейлеры
    let videos = [];
    // videos уже есть в основном ответе anime.videos
    if (Array.isArray(anime.videos)) {
      videos = anime.videos;
    }

    const [rate, custom] = await Promise.all([loadRate(id), getCustomData(id)]);
    const userScore = rate ? rate.score : "—";
    let customBlocks = "";
    if (custom) {
      const tags = [];
      if (custom.rewatch) tags.push(`<span class="tag">Смотрел ${custom.rewatch} раз(а)</span>`);
      if (custom.date) tags.push(`<span class="tag">Дата: ${custom.date}</span>`);
      if (custom.voice) tags.push(`<span class="tag">Озвучка: ${custom.voice}</span>`);
      if (custom.zakom) tags.push(`<span class="tag zakom">С Заком</span>`);
      if (custom.ongoing) tags.push(`<span class="tag ongoing">В онгоинге</span>`);
      if (tags.length) {
        customBlocks = `
          <h3>Мои заметки</h3>
          <div class="tags">${tags.join("")}</div>
        `;
      }
    }

    // год
    const year = anime.aired_on ? anime.aired_on.slice(0, 4) : "—";

    // стилизованные жанры (REST либо GraphQL)
    const genres = restGenres
        .map(g => `<span class="tag">${g.russian || g.name}</span>`)
        .join("");

    // студии (REST либо GraphQL)
    const studios = restStudios
        .map(s => `<span class="tag studio">${s.name}</span>`)
        .join("");

    // тип (TV / Movie / OVA)
    const type = anime.kind ? anime.kind.toUpperCase() : "—";

    const description = anime.description_html || "";

    // трейлеры - кнопки для открытия в модальном окне
    const videosHtml = videos.length > 0 ? videos
      .filter(v => v.url)
      .map((v, index) => {
        const name = v.name || "Трейлер";
        const ytId = getYouTubeId(v.url);
        if (ytId) {
          // Кнопка с превью для YouTube - используем более надежный формат
          const thumbnailUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
          return `<button class="video-button" data-video-id="${ytId}" data-video-name="${name}" data-video-url="${v.url}">
            <div class="video-thumbnail">
              <img src="${thumbnailUrl}" alt="${name}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              <div class="video-thumbnail-fallback" style="display: none;">
                <div class="video-play-icon">▶</div>
              </div>
              <div class="video-play-icon">▶</div>
            </div>
            <div class="video-button-title">${name}</div>
          </button>`;
        } else {
          // Если не YouTube - обычная ссылка
          return `<a href="${v.url}" target="_blank" class="video-link">${name}</a>`;
        }
      })
      .join("") : "";

    document.getElementById("anime").innerHTML = `
      <div class="poster-wrapper">
        <div class="poster">
          <a class="back back-on-poster" href="../index.html">Назад</a>
          <img src="${posterUrl}" alt="${anime.name}">
        </div>
      </div>

      <div class="info">
        <div class="top-actions">
          <a class="back back-in-actions" href="../index.html">← Назад</a>
          <a class="link" href="https://shikimori.one/animes/${anime.id}" target="_blank" rel="noopener">
            Открыть на Shikimori
          </a>
          <a class="link" href="https://reyohoho-gitlab.vercel.app/#shiki${anime.id}" target="_blank" rel="noopener">
            ▶ Смотреть на Reyohoho
          </a>
        </div>

        <h1>${anime.russian || anime.name}</h1>
        <div class="subtitle">${anime.name}</div>

        <div>
          <span class="badge">⭐ ${anime.score}</span>
          <span class="badge">Оценка ${NICKNAME}: ${userScore}</span>
          <span class="badge">${type}</span>
          <span class="badge">${year}</span>
          <span class="badge">${anime.episodes} эп.</span>
        </div>

        ${customBlocks}

        <h3>Жанры</h3>
        <div class="tags">${genres}</div>

        <h3>Студии</h3>
        <div class="tags">${studios}</div>

        <div class="description">${description}</div>

        ${videosHtml ? `<h3>Трейлеры</h3><div class="videos">${videosHtml}</div>` : ""}
      </div>

      <!-- Модальное окно для видео -->
      <div id="video-modal" class="video-modal" style="display: none;">
        <div class="video-modal-overlay"></div>
        <div class="video-modal-content">
          <button class="video-modal-close">×</button>
          <div class="video-modal-title"></div>
          <div class="video-modal-player"></div>
        </div>
      </div>
    `;

    // Обработчики для модального окна с видео
    const modal = document.getElementById("video-modal");
    const modalTitle = modal.querySelector(".video-modal-title");
    const modalPlayer = modal.querySelector(".video-modal-player");
    const modalClose = modal.querySelector(".video-modal-close");
    const modalOverlay = modal.querySelector(".video-modal-overlay");

    function openVideoModal(ytId, name, url) {
      modalTitle.textContent = name;
      modalPlayer.innerHTML = `<iframe 
        src="https://www.youtube.com/embed/${ytId}?autoplay=1" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen>
      </iframe>`;
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";
    }

    function closeVideoModal() {
      modal.style.display = "none";
      modalPlayer.innerHTML = "";
      document.body.style.overflow = "";
    }

    modalClose.addEventListener("click", closeVideoModal);
    modalOverlay.addEventListener("click", closeVideoModal);

    // Обработчики для кнопок видео
    document.querySelectorAll(".video-button").forEach(btn => {
      btn.addEventListener("click", () => {
        const ytId = btn.dataset.videoId;
        const name = btn.dataset.videoName;
        const url = btn.dataset.videoUrl;
        if (ytId) {
          openVideoModal(ytId, name, url);
        }
      });
    });

    // Закрытие по Escape
    // Не копим обработчики при повторных инициализациях
    if (window.__animeEscHandler) {
      document.removeEventListener("keydown", window.__animeEscHandler);
    }
    window.__animeEscHandler = (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") {
        closeVideoModal();
      }
    };
    document.addEventListener("keydown", window.__animeEscHandler);
}

loadAnime();

