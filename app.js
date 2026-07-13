/* ==========================================================================
   AniStream — anime discovery & watch-tracker
   Vanilla JS SPA. Data via the free Jikan API (MyAnimeList). No API key.
   ========================================================================== */

const API = "https://api.jikan.moe/v4";
const app = document.getElementById("app");

/* ---------- tiny helpers ---------- */
const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* Jikan rate-limits (~3 req/s). Serialize + cache to stay friendly. */
const cache = new Map();
let chain = Promise.resolve();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path) {
  if (cache.has(path)) return cache.get(path);
  const run = chain.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(API + path);
      if (res.status === 429) {
        await wait(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      cache.set(path, json);
      return json;
    }
    throw new Error("Rate limited — please wait a moment.");
  });
  // spacing between calls
  chain = run.then(() => wait(380)).catch(() => wait(380));
  return run;
}

/* ---------- watchlist (localStorage) ---------- */
const STORE_KEY = "anistream.watchlist.v1";
const STATUSES = [
  { id: "watching", label: "Watching" },
  { id: "planning", label: "Plan to Watch" },
  { id: "completed", label: "Completed" },
];

const Watchlist = {
  data: loadStore(),
  save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    updateCount();
  },
  has(id) {
    return !!this.data[id];
  },
  get(id) {
    return this.data[id];
  },
  set(anime, status = "planning") {
    this.data[anime.mal_id] = {
      mal_id: anime.mal_id,
      title: anime.title,
      image: anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url || "",
      score: anime.score,
      type: anime.type,
      episodes: anime.episodes,
      year: anime.year || anime.aired?.prop?.from?.year || null,
      status,
      added: Date.now(),
    };
    this.save();
  },
  remove(id) {
    delete this.data[id];
    this.save();
  },
  toggle(anime) {
    if (this.has(anime.mal_id)) {
      this.remove(anime.mal_id);
      return false;
    }
    this.set(anime);
    return true;
  },
  byStatus(status) {
    return Object.values(this.data)
      .filter((a) => a.status === status)
      .sort((a, b) => b.added - a.added);
  },
  all() {
    return Object.values(this.data).sort((a, b) => b.added - a.added);
  },
};

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
function updateCount() {
  el("#watchlist-count").textContent = Object.keys(Watchlist.data).length;
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = el("#toast");
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => (t.hidden = true), 220);
  }, 2200);
}

/* ---------- card rendering ---------- */
function cardHTML(anime, opts = {}) {
  const id = anime.mal_id;
  const img =
    anime.image ||
    anime.images?.jpg?.large_image_url ||
    anime.images?.jpg?.image_url ||
    "";
  const score = anime.score ? Number(anime.score).toFixed(1) : null;
  const sub = [anime.type, anime.year, anime.episodes ? `${anime.episodes} ep` : null]
    .filter(Boolean)
    .join(" · ");
  const fav = Watchlist.has(id);
  return `
    <article class="card" data-id="${id}" tabindex="0" role="button" aria-label="${esc(anime.title)}">
      <div class="card-poster">
        <img loading="lazy" src="${esc(img)}" alt="${esc(anime.title)} poster" />
        ${opts.rank ? `<span class="card-rank">#${opts.rank}</span>` : ""}
        ${score ? `<span class="card-score">★ ${score}</span>` : ""}
        <button class="card-fav ${fav ? "active" : ""}" data-fav="${id}" aria-label="Toggle watchlist" title="Toggle watchlist">
          ${fav ? "✓" : "+"}
        </button>
      </div>
      <div class="card-info">
        <h3 class="card-title">${esc(anime.title)}</h3>
        <div class="card-sub">${esc(sub || "&nbsp;")}</div>
      </div>
    </article>`;
}

function gridHTML(list, opts = {}) {
  if (!list.length) return "";
  return `<div class="grid">${list
    .map((a, i) => cardHTML(a, { rank: opts.ranked ? i + 1 : null }))
    .join("")}</div>`;
}

function skeletonGrid(n = 12) {
  return `<div class="grid">${Array.from({ length: n })
    .map(
      () => `<div class="skel-card">
        <div class="skel-poster shimmer"></div>
        <div class="skel-line shimmer"></div>
        <div class="skel-line short shimmer"></div>
      </div>`
    )
    .join("")}</div>`;
}

function loadingState(text = "Loading anime…") {
  return `<div class="state"><div class="spinner"></div><p>${esc(text)}</p></div>`;
}
function errorState(msg) {
  return `<div class="state"><div class="emoji">😵</div><h3>Something went wrong</h3><p>${esc(
    msg
  )}</p></div>`;
}
function emptyState(emoji, title, text) {
  return `<div class="state"><div class="emoji">${emoji}</div><h3>${esc(
    title
  )}</h3><p>${esc(text)}</p></div>`;
}

function sectionHead(title, sub = "") {
  return `<div class="section-head">
    <h2><span class="accent-bar"></span>${esc(title)}</h2>
    ${sub ? `<span class="sub">${esc(sub)}</span>` : ""}
  </div>`;
}

/* ==========================================================================
   VIEWS
   ========================================================================== */

async function viewHome(token) {
  app.innerHTML =
    `<div id="hero-slot"></div>` +
    sectionHead("Airing Now", "Popular this season") +
    `<div id="airing-slot">${skeletonGrid(6)}</div>` +
    sectionHead("Top Rated", "All-time favourites") +
    `<div id="top-slot">${skeletonGrid(6)}</div>`;

  try {
    const [season, top] = await Promise.all([
      api("/seasons/now?limit=14&sfw"),
      api("/top/anime?limit=10&sfw"),
    ]);
    if (!live(token)) return;

    // Hero from top #1
    const feat = top.data?.[0];
    if (feat) el("#hero-slot").innerHTML = heroHTML(feat);

    el("#airing-slot").innerHTML =
      gridHTML(dedupe(season.data).slice(0, 12)) ||
      emptyState("📺", "Nothing airing", "No seasonal titles found right now.");
    el("#top-slot").innerHTML = gridHTML(top.data.slice(0, 10), { ranked: true });
  } catch (e) {
    if (live(token)) app.innerHTML = errorState(e.message);
  }
}

function heroHTML(a) {
  const img = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "";
  const meta = [
    a.score ? `★ ${a.score}` : null,
    a.type,
    a.episodes ? `${a.episodes} eps` : null,
    a.year || a.aired?.prop?.from?.year,
  ]
    .filter(Boolean)
    .join("  •  ");
  return `<section class="hero">
    <div class="hero-bg" style="background-image:url('${esc(img)}')"></div>
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <span class="hero-tag">#1 Top Rated</span>
      <h1>${esc(a.title)}</h1>
      <div class="meta">${esc(meta)}</div>
      <p class="synopsis">${esc(a.synopsis || "No synopsis available.")}</p>
      <div class="hero-actions">
        <button class="btn btn-primary" data-id="${a.mal_id}">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
          View Details
        </button>
        <button class="btn btn-ghost" data-fav="${a.mal_id}">
          ${Watchlist.has(a.mal_id) ? "✓ In My List" : "+ Add to List"}
        </button>
      </div>
    </div>
  </section>`;
}

async function viewTop(page = 1, token) {
  app.innerHTML = sectionHead("Top Anime", "Highest rated on MyAnimeList") + skeletonGrid(24);
  try {
    const res = await api(`/top/anime?limit=24&page=${page}&sfw`);
    if (!live(token)) return;
    const startRank = (page - 1) * 24;
    const grid = res.data
      .map((a, i) => cardHTML(a, { rank: startRank + i + 1 }))
      .join("");
    const hasNext = res.pagination?.has_next_page;
    app.innerHTML =
      sectionHead("Top Anime", "Highest rated on MyAnimeList") +
      `<div class="grid">${grid}</div>` +
      `<div class="pagination">
        <button class="btn" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>← Prev</button>
        <span>Page ${page}</span>
        <button class="btn" data-page="${page + 1}" ${hasNext ? "" : "disabled"}>Next →</button>
      </div>`;
    els("[data-page]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = Number(b.dataset.page);
        if (p >= 1) {
          location.hash = `#/top/${p}`;
        }
      })
    );
    window.scrollTo({ top: 0 });
  } catch (e) {
    if (live(token)) app.innerHTML = errorState(e.message);
  }
}

async function viewSeason(token) {
  app.innerHTML = sectionHead("This Season", "Currently airing") + skeletonGrid(24);
  try {
    const res = await api("/seasons/now?limit=24&sfw");
    if (!live(token)) return;
    const list = dedupe(res.data);
    app.innerHTML =
      sectionHead("This Season", `${list.length} currently airing titles`) +
      (gridHTML(list) || emptyState("📺", "Nothing here", "No seasonal anime found."));
  } catch (e) {
    if (live(token)) app.innerHTML = errorState(e.message);
  }
}

const GENRES = [
  { id: 1, name: "Action" },
  { id: 2, name: "Adventure" },
  { id: 4, name: "Comedy" },
  { id: 8, name: "Drama" },
  { id: 10, name: "Fantasy" },
  { id: 14, name: "Horror" },
  { id: 7, name: "Mystery" },
  { id: 22, name: "Romance" },
  { id: 24, name: "Sci-Fi" },
  { id: 36, name: "Slice of Life" },
  { id: 30, name: "Sports" },
  { id: 37, name: "Supernatural" },
];

async function viewSearch(query, genreId, token) {
  const chips = `<div class="chips">
    <button class="chip ${!genreId ? "active" : ""}" data-genre="">All</button>
    ${GENRES.map(
      (g) =>
        `<button class="chip ${Number(genreId) === g.id ? "active" : ""}" data-genre="${g.id}">${g.name}</button>`
    ).join("")}
  </div>`;

  const heading = query
    ? sectionHead(`Results for “${query}”`)
    : genreId
    ? sectionHead(`${GENRES.find((g) => g.id === Number(genreId))?.name || "Genre"} anime`)
    : sectionHead("Browse", "Search or pick a genre");

  app.innerHTML = heading + chips + `<div id="results-slot">${skeletonGrid(18)}</div>`;

  bindGenreChips(query);

  try {
    let path;
    if (query) {
      path = `/anime?q=${encodeURIComponent(query)}&limit=24&order_by=score&sort=desc&sfw`;
    } else if (genreId) {
      path = `/anime?genres=${genreId}&limit=24&order_by=score&sort=desc&sfw`;
    } else {
      path = `/top/anime?limit=24&sfw`;
    }
    const res = await api(path);
    if (!live(token)) return;
    const list = dedupe(res.data);
    el("#results-slot").innerHTML =
      list.length
        ? gridHTML(list)
        : emptyState("🔍", "No results", "Try a different title or genre.");
    syncFavButtons();
  } catch (e) {
    if (live(token)) el("#results-slot").innerHTML = errorState(e.message);
  }
}

function bindGenreChips(query) {
  els("[data-genre]").forEach((c) =>
    c.addEventListener("click", () => {
      const g = c.dataset.genre;
      location.hash = g ? `#/genre/${g}` : query ? `#/search/${encodeURIComponent(query)}` : "#/browse";
    })
  );
}

function viewWatchlist(tab = "all") {
  const counts = {
    all: Watchlist.all().length,
    ...Object.fromEntries(STATUSES.map((s) => [s.id, Watchlist.byStatus(s.id).length])),
  };
  const tabs = [
    { id: "all", label: "All" },
    ...STATUSES,
  ];
  const tabsHTML = `<div class="wl-tabs">${tabs
    .map(
      (t) =>
        `<button class="wl-tab ${tab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label} (${
          counts[t.id] || 0
        })</button>`
    )
    .join("")}</div>`;

  const list = tab === "all" ? Watchlist.all() : Watchlist.byStatus(tab);

  app.innerHTML =
    sectionHead("My List", "Saved locally in your browser") +
    tabsHTML +
    (list.length
      ? gridHTML(list)
      : emptyState(
          "🌱",
          "Nothing here yet",
          "Add anime to your list with the + button on any card."
        ));

  els("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => (location.hash = `#/watchlist/${b.dataset.tab}`))
  );
}

/* ---------- detail modal ---------- */
async function openDetail(id) {
  const modal = el("#modal");
  const body = el("#modal-body");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  body.innerHTML = loadingState("Loading details…");

  try {
    const res = await api(`/anime/${id}/full`);
    const a = res.data;
    body.innerHTML = detailHTML(a);
    bindDetail(a);
  } catch (e) {
    body.innerHTML = errorState(e.message);
  }
}

function detailHTML(a) {
  const img = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "";
  const trailerId = a.trailer?.youtube_id;
  const banner = trailerId
    ? `<div class="detail-trailer">
         <iframe src="https://www.youtube-nocookie.com/embed/${esc(trailerId)}?rel=0"
           title="Trailer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
           allowfullscreen loading="lazy"></iframe>
       </div>`
    : `<div class="detail-banner"><img src="${esc(img)}" alt="" /></div>`;

  const genres = (a.genres || []).concat(a.themes || []);
  const info = [
    ["Type", a.type],
    ["Episodes", a.episodes],
    ["Status", a.status],
    ["Aired", a.aired?.string],
    ["Season", a.season ? `${cap(a.season)} ${a.year || ""}`.trim() : null],
    ["Studio", (a.studios || []).map((s) => s.name).join(", ")],
    ["Source", a.source],
    ["Duration", a.duration],
    ["Rating", a.rating],
  ].filter(([, v]) => v);

  const inList = Watchlist.has(a.mal_id);
  const current = Watchlist.get(a.mal_id)?.status;

  return `
    <div class="detail-hero">${banner}</div>
    <div class="detail-body">
      <div class="detail-top">
        <div class="detail-poster"><img src="${esc(img)}" alt="${esc(a.title)} poster" /></div>
        <div class="detail-head">
          <h2>${esc(a.title)}</h2>
          ${a.title_japanese ? `<p class="jp">${esc(a.title_japanese)}</p>` : ""}
          <div class="detail-stats">
            ${
              a.score
                ? `<div class="stat"><div class="num star">★ ${a.score}</div><div class="lbl">Score</div></div>`
                : ""
            }
            ${
              a.rank
                ? `<div class="stat"><div class="num">#${a.rank}</div><div class="lbl">Ranked</div></div>`
                : ""
            }
            ${
              a.popularity
                ? `<div class="stat"><div class="num">#${a.popularity}</div><div class="lbl">Popularity</div></div>`
                : ""
            }
            ${
              a.members
                ? `<div class="stat"><div class="num">${fmtNum(a.members)}</div><div class="lbl">Members</div></div>`
                : ""
            }
          </div>
          <div class="detail-actions">
            ${
              a.url
                ? `<a class="btn btn-ghost" href="${esc(a.url)}" target="_blank" rel="noopener">MyAnimeList ↗</a>`
                : ""
            }
            ${
              a.trailer?.url
                ? `<a class="btn btn-ghost" href="${esc(a.trailer.url)}" target="_blank" rel="noopener">▶ Trailer ↗</a>`
                : ""
            }
          </div>
        </div>
      </div>

      ${
        genres.length
          ? `<div class="detail-genres">${genres
              .map((g) => `<span class="genre-tag">${esc(g.name)}</span>`)
              .join("")}</div>`
          : ""
      }

      <p class="detail-synopsis">${esc(a.synopsis || "No synopsis available.")}</p>

      <div class="detail-info-grid">
        ${info
          .map(
            ([k, v]) => `<div class="info-row"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`
          )
          .join("")}
      </div>

      <div>
        <div class="k" style="font-size:.74rem;color:var(--text-faint);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">My list</div>
        <div class="status-picker" data-mal="${a.mal_id}">
          ${STATUSES.map(
            (s) =>
              `<button data-status="${s.id}" class="${
                inList && current === s.id ? "active" : ""
              }">${s.label}</button>`
          ).join("")}
          <button data-status="remove" style="color:var(--accent)">${
            inList ? "✕ Remove" : ""
          }</button>
        </div>
      </div>
    </div>`;
}

function bindDetail(a) {
  const picker = el(".status-picker");
  if (!picker) return;
  picker.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-status]");
    if (!btn) return;
    const status = btn.dataset.status;
    if (status === "remove") {
      Watchlist.remove(a.mal_id);
      toast("Removed from your list");
    } else {
      Watchlist.set(a, status);
      toast(`Saved as “${STATUSES.find((s) => s.id === status).label}”`);
    }
    // refresh picker state
    els("[data-status]", picker).forEach((b) =>
      b.classList.toggle("active", b.dataset.status === Watchlist.get(a.mal_id)?.status)
    );
    el('[data-status="remove"]', picker).textContent = Watchlist.has(a.mal_id) ? "✕ Remove" : "";
    syncFavButtons();
  });
}

function closeModal() {
  const modal = el("#modal");
  el("#modal-body").innerHTML = ""; // stops trailer playback
  modal.hidden = true;
  document.body.style.overflow = "";
}

/* ==========================================================================
   utils
   ========================================================================== */
function dedupe(list = []) {
  const seen = new Set();
  return list.filter((a) => {
    if (seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fmtNum = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(n);

/* keep every visible + button in sync with the store */
function syncFavButtons() {
  els("[data-fav]").forEach((b) => {
    const inList = Watchlist.has(Number(b.dataset.fav));
    if (b.classList.contains("card-fav")) {
      b.classList.toggle("active", inList);
      b.textContent = inList ? "✓" : "+";
    } else {
      b.textContent = inList ? "✓ In My List" : "+ Add to List";
    }
  });
}

/* ==========================================================================
   events (delegation)
   ========================================================================== */

// Card / detail open + favourite toggle
app.addEventListener("click", async (e) => {
  const fav = e.target.closest("[data-fav]");
  if (fav) {
    e.stopPropagation();
    const id = Number(fav.dataset.fav);
    // Try to use data we already have; else fetch minimal.
    let anime = findLoadedAnime(id);
    if (!anime) {
      try {
        anime = (await api(`/anime/${id}`)).data;
      } catch {
        return;
      }
    }
    const added = Watchlist.toggle(anime);
    toast(added ? "Added to your list" : "Removed from your list");
    syncFavButtons();
    if (location.hash.startsWith("#/watchlist")) route();
    return;
  }
  const card = e.target.closest("[data-id]");
  if (card) openDetail(Number(card.dataset.id));
});

app.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("card")) {
    e.preventDefault();
    openDetail(Number(e.target.dataset.id));
  }
});

// find anime data among already-fetched responses so a fav toggle
// doesn't need an extra request
function findLoadedAnime(id) {
  for (const json of cache.values()) {
    const arr = json?.data;
    if (Array.isArray(arr)) {
      const hit = arr.find((a) => a.mal_id === id);
      if (hit) return hit;
    } else if (arr?.mal_id === id) {
      return arr;
    }
  }
  // watchlist fallback (already normalized)
  return Watchlist.get(id);
}

// Modal close
el("#modal").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el("#modal").hidden) closeModal();
});

// Search
el("#search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = el("#search-input").value.trim();
  if (q) location.hash = `#/search/${encodeURIComponent(q)}`;
});

// Mobile nav
el("#nav-toggle").addEventListener("click", () => {
  const nav = el(".main-nav");
  const open = nav.classList.toggle("open");
  el("#nav-toggle").setAttribute("aria-expanded", open);
});
els(".main-nav a").forEach((a) =>
  a.addEventListener("click", () => el(".main-nav").classList.remove("open"))
);

/* ==========================================================================
   router
   ========================================================================== */
function setActiveNav(name) {
  els(".main-nav a").forEach((a) =>
    a.classList.toggle("active", a.dataset.nav === name)
  );
}

/* navigation token: async views only write to the DOM if they're still
   the active route, so a slow/failed request can't clobber a newer view. */
let navToken = 0;
const live = (token) => token === navToken;

async function route() {
  const token = ++navToken;
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);
  const [seg, arg] = parts;

  // close any open modal on navigation
  if (!el("#modal").hidden) closeModal();

  switch (seg) {
    case undefined:
    case "":
      setActiveNav("home");
      await viewHome(token);
      break;
    case "top":
      setActiveNav("top");
      await viewTop(Number(arg) || 1, token);
      break;
    case "season":
      setActiveNav("season");
      await viewSeason(token);
      break;
    case "watchlist":
      setActiveNav("watchlist");
      viewWatchlist(arg || "all");
      break;
    case "search":
      setActiveNav(null);
      el("#search-input").value = decodeURIComponent(arg || "");
      await viewSearch(decodeURIComponent(arg || ""), null, token);
      break;
    case "genre":
      setActiveNav(null);
      await viewSearch(null, arg, token);
      break;
    case "browse":
      setActiveNav(null);
      await viewSearch(null, null, token);
      break;
    default:
      setActiveNav("home");
      await viewHome(token);
  }
  if (live(token)) syncFavButtons();
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  updateCount();
  route();
});

// If DOM already ready (defer), kick off
if (document.readyState !== "loading") {
  updateCount();
  route();
}
