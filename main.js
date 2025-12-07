// Настройка — поменяй ник при необходимости
const USERNAME = "BcA9HuK";
const LIMIT = 500; // Shikimori max per page

const grid = document.getElementById("grid");
const stats = document.getElementById("stats");
const tpl = document.getElementById("card-tpl");
const qInput = document.getElementById("q");
const sortSel = document.getElementById("sort");
const reloadBtn = document.getElementById("reload");
const empty = document.getElementById("empty");
const themeBtn = document.getElementById("theme-toggle");

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

/* --- загрузка всех страниц списка completed --- */
async function loadAllRates(status = "completed") {
  let page = 1;
  let all = [];

  stats.textContent = "Подгружаю список с Shikimori...";
  while (true) {
    const url = `https://shikimori.one/api/users/${USERNAME}/anime_rates?status=${status}&limit=${LIMIT}&page=${page}`;
    const res = await fetch(url);
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
  const genres = node.querySelector(".genres");

  // Выбор картинки: сначала preview (если есть), иначе original, иначе запасной
  const imgPreview = anime.image?.preview ? `https://shikimori.one${anime.image.preview}` : null;
  const imgOrig = anime.image?.original ? `https://shikimori.one${anime.image.original}` : null;

  const placeholder = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'>
       <rect width='100%' height='100%' fill='#2b2b2b'/>
       <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
             font-size='20' fill='#999'>No image</text>
     </svg>`
  )}`;

  img.src = imgPreview || imgOrig || placeholder;
  img.alt = anime.russian || anime.name || "Anime";

  title.textContent = anime.russian || anime.name || "—";
  type.textContent = anime.kind ? anime.kind.toUpperCase() : "";
  episodes.textContent = anime.episodes ? `${anime.episodes} эп.` : "";
  const year = anime.aired_on ? anime.aired_on.slice(0, 4) : "";
  yearEl.textContent = year;
  score.textContent = rate.score ? `Оценка: ${rate.score}` : "Оценка: —";

  genres.textContent = anime.genres?.map(g => g.name).join(", ") || "";

  el.addEventListener("click", () => {
    location.href = `anime.html?id=${anime.id}`;
  });

  return node;
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
  for (const rate of list) {
    frag.appendChild(renderCard(rate));
  }
  grid.appendChild(frag);
  stats.textContent = `Показано ${list.length} просмотренных тайтлов.`;
}

/* --- клиентская фильтрация и сортировка --- */
function filterAndRender() {
  let filtered = ALL.slice();

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
}

/* --- инициализация --- */
async function init() {
  initTheme();
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
reloadBtn.addEventListener("click", () => { ALL = []; init(); });

/* простая debounce */
function debounce(fn, time = 150) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), time);
  };
}

/* старт */
init();
