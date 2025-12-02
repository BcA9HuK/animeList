const params = new URLSearchParams(location.search);
const id = params.get("id");
const user = "BcA9HuK";

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
      "User-Agent": "MyAnimeT playground"
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

async function loadRate(id) {
    const res = await fetch(
        `https://shikimori.one/api/users/${user}/anime_rates?limit=5000`
    );
    const rates = await res.json();
    return rates.find(r => r.anime.id == id);
}

async function loadAnime() {
    const res = await fetch(`https://shikimori.one/api/animes/${id}`);
    const anime = await res.json();

    // базовые данные из REST
    let posterUrl = anime.image?.original ? `https://shikimori.one${anime.image.original}` : null;
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

    const rate = await loadRate(id);
    const userScore = rate ? rate.score : "—";

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
          <a class="back back-on-poster" href="index.html">Назад</a>
          <img src="${posterUrl}" alt="${anime.name}">
        </div>
      </div>

      <div class="info">
        <div class="top-actions">
          <a class="back back-in-actions" href="index.html">← Назад</a>
          <a class="link" href="https://shikimori.one/animes/${anime.id}" target="_blank">
            Открыть на Shikimori
          </a>
        </div>

        <h1>${anime.russian || anime.name}</h1>
        <div class="subtitle">${anime.name}</div>

        <div>
          <span class="badge">⭐ ${anime.score}</span>
          <span class="badge">Оценка BcA9HuK: ${userScore}</span>
          <span class="badge">${type}</span>
          <span class="badge">${year}</span>
          <span class="badge">${anime.episodes} эп.</span>
        </div>

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
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") {
        closeVideoModal();
      }
    });
}

loadAnime();
