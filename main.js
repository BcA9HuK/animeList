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
function renderCard(rate) {
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

  // Ручные исправления постеров: ключ — ID аниме на Shikimori
  const POSTER_OVERRIDES = {
    59986: "https://shikimori.one/uploads/poster/animes/59986/main-f58f92d4adc6e336d2cce149dcaaedac.webp",
    56907: "https://shikimori.one/uploads/poster/animes/56907/d440571f2132e74a76781ca457187c79.jpeg",
    60316: "https://shikimori.one/uploads/poster/animes/60316/main-4559dac7743c844ae22693303dad9138.webp",
    48962: "https://shikimori.one/uploads/poster/animes/48962/main-70c6648952fb23b1014a6888b5965c8f.webp",
    56774: "https://shikimori.one/uploads/poster/animes/56774/main-126444114f0f3478ae877707750fccd2.webp",
    55791: "https://shikimori.one/uploads/poster/animes/55791/main-bab756dc3eebe56bcc3aea2107cb41ec.webp",
    59177: "https://shikimori.one/uploads/poster/animes/59177/main-cd1cb38425ef4df60290cbbc830ab9df.webp",
    59207: "https://shikimori.one/uploads/poster/animes/59207/main-7e64f4351625d3bfc7958d7d6f72a5af.webp",
    59424: "https://shikimori.one/uploads/poster/animes/59424/d2c95cfc56e448c1bd68440c06fb54fe.jpeg",
    59205: "https://shikimori.one/uploads/poster/animes/59205/main-f8ec893f79ecfba886870acdc377dbbd.webp",
    60732: "https://shikimori.one/uploads/poster/animes/60732/main-05f8937b01b938b1f14ed41bc2c469f6.webp",
    59459: "https://shikimori.one/uploads/poster/animes/59459/main-475fc0a1a4aeeb790a2642c82750bd6c.webp",
    59421: "https://shikimori.one/uploads/poster/animes/59421/main-562853c0a2b44d0a4fed405e1ac119b7.webp",
    59845: "https://shikimori.one/uploads/poster/animes/59845/main-158d7102f71b7cedd6a23c22265dafa9.webp",
    59161: "https://shikimori.one/uploads/poster/animes/59161/main-10955fa4fb5153f7b5482a3a353cd8a1.webp",
    59130: "https://shikimori.one/uploads/poster/animes/59130/main-f2eb412e9b0bcacc9ebccf2bdebe1139.webp",
    59689: "https://shikimori.one/uploads/poster/animes/59689/main-ed4053f1f36c22a2dc7607a3864a0848.webp",
    59730: "https://shikimori.one/uploads/poster/animes/59730/main-b891bd01c179cf0d99c59176cf7638b9.webp",
    59935: "https://shikimori.one/uploads/poster/animes/59935/main-134a34f5bac2cbc357a78d68dd36de7b.webp",
    60146: "https://shikimori.one/uploads/poster/animes/60146/main-345827ea2f19b6a6086e3cef23d15e10.webp",
    52709: "https://shikimori.one/uploads/poster/animes/52709/main-bd54103165cb7ce8486939e8328a236e.webp",
    59452: "https://shikimori.one/uploads/poster/animes/59452/main-c870f2442e42aa5f14ce870441d15028.webp",
    60154: "https://shikimori.one/uploads/poster/animes/60154/main-10c374e2059ff9a765ef881ab4455192.webp",
    60140: "https://shikimori.one/uploads/poster/animes/60140/main-da656b440471b8bbd0bd44f333137b22.webp",
    59466: "https://shikimori.one/uploads/poster/animes/59466/main-abfce312483cae752e75ed2255b3237a.webp",
    60157: "https://shikimori.one/uploads/poster/animes/60157/main-3c439cb413d8282b49de36b000a11db0.webp",
    59833: "https://shikimori.one/uploads/poster/animes/59833/main-8d1635d8192e7bc53cf474c3152efe75.webp",
    60057: "https://shikimori.one/uploads/poster/animes/60057/main-1ccd7d70a5a353a53f2b12e8ea4e5046.webp",
    59425: "https://shikimori.one/uploads/poster/animes/59425/main-13fb5d686fa8c99e0b589a38fa10e9e0.webp",
    59989: "https://shikimori.one/uploads/poster/animes/59989/main-3dfe610aaa59cd0f41bcda9ff7f24d2a.webp",
    59135: "https://shikimori.one/uploads/poster/animes/59135/main-f60d52781936b927ee548c727fbfd9b2.webp",
    59361: "https://shikimori.one/uploads/poster/animes/59361/main-f330fa9f3cae8798a9b6693867c0ef14.webp",
    59142: "https://shikimori.one/uploads/poster/animes/59142/main-812b26da142e14eab7216dcee4d8aedb.webp",
    59265: "https://shikimori.one/uploads/poster/animes/59265/main-0e95eed8869ad78613cbcc7ff538ea17.webp",
    59561: "https://shikimori.one/uploads/poster/animes/59561/main-fd8ec565477ffccd6dbcbbfb06f206d0.webp",
    59144: "https://shikimori.one/uploads/poster/animes/59144/main-66e5d6594fbd1e9eb61746f7bc7fc59c.webp",
    54284: "https://shikimori.one/uploads/poster/animes/54284/main-e07db78ddc9e6b6d5c369bf258671dda.webp",
    52962: "https://shikimori.one/uploads/poster/animes/52962/main-ece812da3f560cc3d1ccf0d2ebaaaa3d.webp",
    4224: "https://shikimori.one/uploads/poster/animes/4224/main-52f8a82ffd8cb7d6ec1a7596435138c1.webp",
    60619: "https://shikimori.one/uploads/poster/animes/60619/main-0a1f2b5fb65340e2f6bb9579b18f61c9.webp",
    59644: "https://shikimori.one/uploads/poster/animes/59644/main-abb74d6c0956759e417669fe33b4ced1.webp",
    61174: "https://shikimori.one/uploads/poster/animes/61174/main-e28b28c40be9722d5fc403be786e71de.webp",
    60303: "https://shikimori.one/uploads/poster/animes/60303/main-30c61aff4385c15fcab29d79aad5e647.webp",
    61276: "https://shikimori.one/uploads/poster/animes/61276/main-35633873d27e797fe6303e7140559ae1.webp",
    57888: "https://shikimori.one/uploads/poster/animes/57888/main-b29176b1cc19e70aebbe29d49aa42ee1.webp",
    61209: "https://shikimori.one/uploads/poster/animes/61209/main-9dfb1984fae701a1158d794b586b9f27.webp",
    59846: "https://shikimori.one/uploads/poster/animes/59846/main-6f620460756124c59037f51a4e843a4d.webp",
    60531: "https://shikimori.one/uploads/poster/animes/60531/main-5eb5b0cd56d26db39b3f4ddec3b5d18b.webp",
    61026: "https://shikimori.one/uploads/poster/animes/61026/main-b40922096c5c15096ec70358c89fbd6b.webp",
    47158: "https://shikimori.one/uploads/poster/animes/47158/main-8efefd30614d183b9d66d7501e045d2f.webp",
    59957: "https://shikimori.one/uploads/poster/animes/59957/main-cf957b0cfaecfafceb4ce14cb6c49a29.webp",
    60326: "https://shikimori.one/uploads/poster/animes/60326/main-5cd7e3ee6c28b6bd0c9512c530fe8d52.webp",
    58146: "https://shikimori.one/uploads/poster/animes/58146/main-bdec98537a6666610f4f459131f8c798.webp"
  };

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
function renderAll(list) {
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
function filterAndRender() {
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

  renderAll(filtered);
  
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

