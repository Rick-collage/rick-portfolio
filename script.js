const menuBtn = document.querySelector(".menu-btn");
const nav = document.querySelector("nav");

menuBtn.addEventListener("click", () => {
  nav.classList.toggle("open");
});

document.querySelectorAll("nav a").forEach(link => {
  link.addEventListener("click", () => nav.classList.remove("open"));
});

document.getElementById("year").textContent = new Date().getFullYear();


const mediaGrid = document.getElementById("mediaGrid");
const emptyMedia = document.getElementById("emptyMedia");
const mediaModal = document.getElementById("mediaModal");
const mediaForm = document.getElementById("mediaForm");
const addMediaBtn = document.getElementById("addMediaBtn");
const closeMediaModal = document.getElementById("closeMediaModal");
const cancelMedia = document.getElementById("cancelMedia");
const mediaTabs = document.querySelectorAll(".media-tab");
const mediaSearch = document.getElementById("mediaSearch");
const clearMediaSearch = document.getElementById("clearMediaSearch");
const mediaSort = document.getElementById("mediaSort");

let currentType = "movie";
let currentSearch = "";
let currentSort = "recent";
let mediaItems = [];
let collectionReady = false;
let imageObjectUrls = new Set();
let currentPage = 1;
const ITEMS_PER_PAGE = 8;

const mediaPagination = document.getElementById("mediaPagination");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");
const pageNumbers = document.getElementById("pageNumbers");

const DB_NAME = "rickPortfolioDB";
const DB_VERSION = 1;
const ITEMS_STORE = "mediaItems";
const IMAGES_STORE = "mediaImages";

/* Free OMDb API key — https://www.omdbapi.com/apikey.aspx (1,000 req/day) */
const OMDB_API_KEY = "3161b39f";

// Temporary poster blob from IMDb auto-fetch (used on Save if no file chosen)
let fetchedPosterBlob = null;
let fetchedPosterObjectUrl = null;

/* ===== Collection Trackers =====
 * Separate tracker views for Movies, Anime and Web Series.
 * Movies use the saved Parts value; Anime uses Jikan/MAL episode data;
 * Web Series use TVMaze season/episode data.
 */
const TRACKING_KEY = "rickMediaTrackers";
const NOTIFICATIONS_KEY = "rickReleaseNotifications";
let releaseNotifications = loadReleaseNotifications();

function loadReleaseNotifications() {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function saveReleaseNotifications() {
  try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(releaseNotifications)); } catch (_) {}
}

function escapeNotificationText(value) {
  return escapeHtml(String(value ?? ""));
}

function addReleaseNotification({ title, body, type = "anime", url = "", trackerId = "", releaseNumber = 0 }) {
  const notification = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: String(title || "Release update"),
    body: String(body || "A tracked title has a new update."),
    type,
    url: String(url || ""),
    trackerId: String(trackerId || ""),
    releaseNumber: Number(releaseNumber) || 0,
    createdAt: Date.now()
  };
  releaseNotifications.unshift(notification);
  // Keep a useful history without allowing the localStorage item to grow forever.
  releaseNotifications = releaseNotifications.slice(0, 100);
  saveReleaseNotifications();
  renderReleaseNotifications();
}

function renderReleaseNotifications() {
  const list = document.getElementById("notificationList");
  const empty = document.getElementById("notificationEmpty");
  const count = document.getElementById("notificationCount");
  const summary = document.getElementById("notificationSummary");
  if (!list || !empty) return;

  const total = releaseNotifications.length;
  if (count) {
    count.textContent = total > 99 ? "99+" : String(total);
    count.hidden = total === 0;
  }
  if (summary) summary.textContent = total ? `${total} saved alert${total === 1 ? "" : "s"}` : "Your new episode & season alerts stay here.";
  empty.hidden = total > 0;
  list.innerHTML = releaseNotifications.map(note => `
    <article class="notification-card" data-notification-id="${escapeNotificationText(note.id)}">
      <div class="notification-card-icon">${note.type === "movie" ? "🎬" : note.type === "anime" ? "🍥" : "📺"}</div>
      <div class="notification-card-main">
        <strong>${escapeNotificationText(note.title)}</strong>
        <p>${escapeNotificationText(note.body)}</p>
        <time>${new Date(note.createdAt).toLocaleString()}</time>
        ${note.url ? `<a href="${escapeNotificationText(note.url)}" target="_blank" rel="noopener">Open source ↗</a>` : ""}
      </div>
      <button type="button" class="notification-remove" data-remove-notification="${escapeNotificationText(note.id)}" aria-label="Delete notification">×</button>
    </article>
  `).join("");

  list.querySelectorAll("[data-remove-notification]").forEach(btn => btn.addEventListener("click", () => {
    releaseNotifications = releaseNotifications.filter(n => n.id !== btn.dataset.removeNotification);
    saveReleaseNotifications();
    renderReleaseNotifications();
  }));
}

function initNotificationBox() {
  const wrap = document.querySelector(".tracker-notification-wrap");
  const button = document.querySelector('[data-tracker-action="notifications"]');
  const box = document.getElementById("notificationBox");
  const clear = document.getElementById("clearNotifications");
  if (!wrap || !button || !box) return;

  renderReleaseNotifications();
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const opening = box.hidden;
    box.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
    if (opening) await requestTrackerNotifications(currentType);
  });
  box.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", () => {
    box.hidden = true;
    button.setAttribute("aria-expanded", "false");
  });
  clear?.addEventListener("click", () => {
    releaseNotifications = [];
    saveReleaseNotifications();
    renderReleaseNotifications();
  });
}
const TRACK_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
let trackedItems = loadTrackedItems();
let trackerCheckRunning = false;

function loadTrackedItems() {
  try {
    const raw = localStorage.getItem(TRACKING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function saveTrackedItems() {
  try { localStorage.setItem(TRACKING_KEY, JSON.stringify(trackedItems)); } catch (_) {}
}

function getTrackerStatusEl(type) {
  return document.querySelector(`[data-tracker-status="${type}"]`);
}

function trackerStatus(message, state = "", type = currentType) {
  const el = getTrackerStatusEl(type);
  if (!el) return;
  el.textContent = message;
  el.className = "tracker-status" + (state ? ` is-${state}` : "");
}

function isTracked(id) { return trackedItems.some(x => x.mediaId === id); }

async function requestTrackerNotifications(type = currentType) {
  if (!("Notification" in window)) {
    trackerStatus("This browser does not support desktop notifications.", "error", type);
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    trackerStatus("Notifications enabled. Release updates can now alert you.", "success", type);
    return true;
  }
  trackerStatus("Notifications are blocked. Allow them in your browser site settings.", "error", type);
  return false;
}

function showDesktopTrackerNotification(title, body, url = "", type = currentType) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, { body, icon: "favicon.svg", tag: `rick-tracker-${type}-${title}` });
      n.onclick = () => { window.focus(); if (url) window.open(url, "_blank", "noopener"); n.close(); };
      return true;
    } catch (_) {}
  }
  return false;
}

function notifyTracker(title, body, url = "", type = currentType, trackerId = "", releaseNumber = 0) {
  addReleaseNotification({ title, body, type, url, trackerId, releaseNumber });
  if (showDesktopTrackerNotification(title, body, url, type)) return;
  trackerStatus(`${title} — ${body}`, "success", type);
}

function normalizeTrackerTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(?:season|s|part)\s*\d{1,2}\b/gi, " ")
    .replace(/\b(?:season|part)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCollectionReleaseNumber(item) {
  const name = String(item?.name || "");
  const explicit = name.match(/\b(?:season|s|part)\s*(\d{1,2})\b/i);
  if (explicit) return Number(explicit[1]) || 0;
  return Number(item?.parts) || 0;
}

function getCollectionReleaseNumberForTracker(tracker) {
  const target = normalizeTrackerTitle(tracker.name);
  const candidates = mediaItems.filter(item =>
    item.type === tracker.type && normalizeTrackerTitle(item.name) === target
  );
  return candidates.reduce((max, item) => Math.max(max, getCollectionReleaseNumber(item)), 0);
}

function hasPendingReleaseNotification(trackerId, releaseNumber, type) {
  return releaseNotifications.some(note =>
    note.type === type && String(note.trackerId || "") === String(trackerId) && Number(note.releaseNumber) === Number(releaseNumber)
  );
}

function clearResolvedReleaseNotifications(trackerId, currentCollectionNumber, type) {
  const before = releaseNotifications.length;
  releaseNotifications = releaseNotifications.filter(note => !(
    note.type === type &&
    String(note.trackerId || "") === String(trackerId) &&
    Number(note.releaseNumber) > 0 &&
    Number(note.releaseNumber) <= Number(currentCollectionNumber)
  ));
  if (releaseNotifications.length !== before) {
    saveReleaseNotifications();
    renderReleaseNotifications();
  }
}

async function findTvMazeShow(name) {
  const res = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(name)}&embed[]=seasons&embed[]=episodes`);
  if (!res.ok) throw new Error("TVMaze lookup failed");
  const data = await res.json();
  const seasons = Array.isArray(data._embedded?.seasons) ? data._embedded.seasons : [];
  const episodes = Array.isArray(data._embedded?.episodes) ? data._embedded.episodes : [];
  return {
    sourceId: String(data.id),
    currentSeason: seasons.length ? Math.max(0, ...seasons.map(s => Number(s.number) || 0)) : 0,
    seasonNumber: seasons.length ? Math.max(0, ...seasons.map(s => Number(s.number) || 0)) : 0,
    currentEpisode: episodes.length ? Math.max(0, ...episodes.map(e => Number(e.number) || 0)) : 0,
    episodeTotal: episodes.length,
    latestEpisodeName: episodes.length ? episodes[episodes.length - 1].name : "",
    url: data.url || ""
  };
}

async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function anilistRequest(query, variables) {
  const res = await fetchWithTimeout("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const payload = await res.json();
  if (payload?.errors?.length) throw new Error(payload.errors[0]?.message || "AniList query failed");
  return payload?.data;
}

async function getAniListSeasonNumber(anime, cache = new Map()) {
  if (!anime?.id) return 1;
  if (cache.has(anime.id)) return cache.get(anime.id);

  // Most anime seasons are linked as SEQUEL -> PREQUEL. Walk backwards so
  // Solo Leveling S2 becomes season 2, S3 becomes season 3, etc.
  const query = `query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      format
      title { romaji english native }
      relations {
        edges {
          relationType
          node { id format title { romaji english native } }
        }
      }
    }
  }`;

  const walk = async (node, seen = new Set()) => {
    if (!node?.id || seen.has(node.id)) return 1;
    seen.add(node.id);
    const data = await anilistRequest(query, { id: Number(node.id) });
    const media = data?.Media;
    const prequel = media?.relations?.edges?.find(edge =>
      edge?.relationType === "PREQUEL" && edge?.node?.format === "TV"
    )?.node;
    if (!prequel) return 1;
    return 1 + await walk(prequel, seen);
  };

  try {
    const value = await walk(anime);
    cache.set(anime.id, value);
    return value;
  } catch (_) {
    // Safe fallback: parse explicit "Season N" from the title.
    const text = [anime.title?.romaji, anime.title?.english, anime.title?.native].filter(Boolean).join(" ");
    const match = text.match(/(?:season|s)\s*(\d{1,2})\b/i);
    const value = match ? Number(match[1]) : 1;
    cache.set(anime.id, value);
    return value;
  }
}

async function findAnimeFromAniList(name) {
  const query = `query ($search: String) {
    Page(perPage: 12) {
      media(search: $search, type: ANIME, format: TV, sort: SEARCH_MATCH) {
        id
        title { romaji english native }
        episodes
        season
        seasonYear
        status
        nextAiringEpisode { episode airingAt }
        siteUrl
      }
    }
  }`;

  const data = await anilistRequest(query, { search: name });
  const candidates = Array.isArray(data?.Page?.media) ? data.Page.media : [];
  if (!candidates.length) throw new Error(`Anime “${name}” was not found`);

  const wanted = String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const scored = candidates.map((anime, index) => {
    const titles = [anime.title?.romaji, anime.title?.english, anime.title?.native].filter(Boolean).map(v => String(v).toLowerCase());
    const exact = titles.some(t => t === wanted) ? 1000 : 0;
    const contains = titles.some(t => t.includes(wanted) || wanted.includes(t)) ? 300 : 0;
    const year = Number(anime.seasonYear) || 0;
    return { anime, score: exact + contains + year / 100000 - index / 1000000 };
  }).sort((a, b) => b.score - a.score);

  // Prefer the closest title first, then use the sequel chain to select the
  // latest actual TV season of that title rather than a random search result.
  const seasonCache = new Map();
  const inspected = [];
  for (const entry of scored.slice(0, 5)) {
    const seasonNumber = await getAniListSeasonNumber(entry.anime, seasonCache);
    inspected.push({ ...entry, seasonNumber });
  }

  inspected.sort((a, b) => {
    if (b.seasonNumber !== a.seasonNumber) return b.seasonNumber - a.seasonNumber;
    return b.score - a.score;
  });
  const anime = inspected[0]?.anime || candidates[0];
  const seasonNumber = inspected[0]?.seasonNumber || 1;
  const season = anime.season ? String(anime.season).toLowerCase() : "";
  const seasonYear = Number(anime.seasonYear) || 0;
  const seasonKey = String(seasonNumber);
  const next = anime.nextAiringEpisode;
  const nextEpisode = next?.episode ? Number(next.episode) : 0;
  const episodes = Number(anime.episodes) || Math.max(0, nextEpisode - 1);

  return {
    sourceId: String(anime.id),
    currentSeason: seasonKey,
    seasonNumber,
    currentEpisode: episodes,
    episodeTotal: episodes,
    nextEpisode,
    latestEpisodeName: episodes ? `Episode ${episodes}` : "",
    url: anime.siteUrl || "",
    status: anime.status || "",
    seasonYear
  };
}

async function findAnimeFromJikan(name) {
  // Jikan is kept as a fallback because it is occasionally rate-limited.
  const search = await fetchWithTimeout(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(name)}&limit=1`,
    {},
    15000
  );
  if (!search.ok) throw new Error(`Jikan HTTP ${search.status}`);
  const result = await search.json();
  const anime = result.data?.[0];
  if (!anime) throw new Error(`Anime “${name}” was not found`);

  const season = anime.season ? String(anime.season).toLowerCase() : "";
  const seasonYear = Number(anime.year) || Number(anime.aired?.from?.slice?.(0, 4)) || 0;
  const titleText = [anime.title, anime.title_english, anime.title_japanese].filter(Boolean).join(" ");
  const explicitSeason = titleText.match(/(?:season|s)\s*(\d{1,2})\b/i);
  const seasonNumber = explicitSeason ? Number(explicitSeason[1]) : 1;
  const seasonKey = String(seasonNumber);
  const episodes = Number(anime.episodes) || 0;

  return {
    sourceId: String(anime.mal_id),
    currentSeason: seasonKey,
    seasonNumber,
    currentEpisode: episodes,
    episodeTotal: episodes,
    nextEpisode: 0,
    latestEpisodeName: episodes ? `Episode ${episodes}` : "",
    url: anime.url || "",
    status: anime.status || ""
  };
}

async function findAnime(name) {
  let aniListError = null;
  try {
    return await findAnimeFromAniList(name);
  } catch (error) {
    aniListError = error;
    console.warn(`[Anime Tracker] AniList lookup failed for "${name}":`, error);
  }

  try {
    return await findAnimeFromJikan(name);
  } catch (jikanError) {
    console.warn(`[Anime Tracker] Jikan fallback failed for "${name}":`, jikanError);
    // Never block tracking just because an external API is unavailable.
    // The tracker is created from the local collection and will retry online
    // lookup during the next manual/automatic check.
    return {
      sourceId: `local-${slugify(name)}`,
      currentSeason: "local",
      seasonNumber: 0,
      currentEpisode: 0,
      episodeTotal: 0,
      nextEpisode: 0,
      latestEpisodeName: "",
      url: "",
      status: "Local baseline"
    };
  }
}
function slugify(value) {
  return String(value || "anime").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "anime";
}

function getMovieTrackerData(item) {
  return {
    sourceId: String(item.id),
    currentSeason: Number(item.parts) || 0,
    seasonNumber: Number(item.parts) || 0,
    currentEpisode: Number(item.parts) || 0,
    episodeTotal: Number(item.parts) || 0,
    latestEpisodeName: Number(item.parts) ? `Part ${Number(item.parts)}` : "",
    url: ""
  };
}

async function lookupTracker(item) {
  if (item.type === "movie") return getMovieTrackerData(item);
  if (item.type === "webseries") return findTvMazeShow(item.name);
  if (item.type === "anime") return findAnime(item.name);
  throw new Error("Unsupported tracker type");
}

function getTrackedItemsForType(type) {
  return trackedItems.filter(item => item.type === type);
}

async function trackMediaItem(id) {
  const item = mediaItems.find(x => x.id === id);
  if (!item) return;
  const type = item.type;

  if (isTracked(id)) {
    trackedItems = trackedItems.filter(x => x.mediaId !== id);
    saveTrackedItems();
    renderTrackerLists();
    await renderMedia();
    trackerStatus(`Stopped tracking ${item.name}.`, "", type);
    return;
  }

  trackerStatus(`Preparing ${item.name}…`, "loading", type);
  try {
    const latest = await lookupTracker(item);
    trackedItems.push({
      mediaId: id,
      name: item.name,
      type,
      sourceId: latest.sourceId,
      lastSeason: latest.currentSeason,
      lastSeasonNumber: Number(latest.seasonNumber) || 0,
      lastEpisode: latest.currentEpisode,
      lastParts: Number(item.parts) || 0,
      lastCheckedAt: Date.now()
    });
    saveTrackedItems();
    renderTrackerLists();
    await requestTrackerNotifications(type);
    await renderMedia();
    trackerStatus(`Now tracking ${item.name}. Future release changes will be checked.`, "success", type);
  } catch (error) {
    trackerStatus(`Could not start tracking ${item.name}: ${error.message}`, "error", type);
  }
}

async function checkTrackedItems(silent = false, onlyType = "") {
  if (trackerCheckRunning || !trackedItems.length) return;
  trackerCheckRunning = true;
  if (!silent && onlyType) trackerStatus(`Checking your ${getTypeLabel(onlyType).toLowerCase()} trackers…`, "loading", onlyType);
  let changed = 0;
  try {
    const targets = trackedItems.filter(t => !onlyType || t.type === onlyType);
    for (const tracker of [...targets]) {
      try {
        const latest = tracker.type === "movie"
          ? getMovieTrackerData(mediaItems.find(x => x.id === tracker.mediaId) || { id: tracker.mediaId, parts: tracker.lastParts })
          : await lookupTracker(tracker);

        const latestReleaseNumber = Number(latest.seasonNumber) || Number(latest.currentSeason) || 0;
        const oldReleaseNumber = Number(tracker.lastSeasonNumber) || 0;
        const collectionReleaseNumber = getCollectionReleaseNumberForTracker(tracker);

        // Once the user adds the released season/part to the website, the
        // pending alert is resolved and tracking advances to that release.
        if (latestReleaseNumber > 0 && collectionReleaseNumber >= latestReleaseNumber) {
          clearResolvedReleaseNotifications(tracker.mediaId, collectionReleaseNumber, tracker.type);
          if (latestReleaseNumber > oldReleaseNumber) {
            tracker.lastSeasonNumber = latestReleaseNumber;
            tracker.lastSeason = String(latestReleaseNumber);
            changed++;
          }
        } else if (latestReleaseNumber > oldReleaseNumber) {
          const title = `🔔 ${tracker.name}`;
          const label = tracker.type === "movie"
            ? `Part ${latestReleaseNumber} Released!`
            : `Season ${latestReleaseNumber} Released!`;

          // Keep the alert persistent: do not advance lastSeasonNumber until
          // the user actually adds that release to the website.
          if (!hasPendingReleaseNotification(tracker.mediaId, latestReleaseNumber, tracker.type)) {
            notifyTracker(title, label, latest.url, tracker.type, tracker.mediaId, latestReleaseNumber);
          } else {
            // On a page refresh/check, remind the user again without creating
            // duplicate cards in the notification inbox.
            showDesktopTrackerNotification(title, label, latest.url, tracker.type);
          }
        }

        tracker.lastCheckedAt = Date.now();
      } catch (error) {
        console.warn(`[Tracker] ${tracker.name}:`, error);
      }
    }
    saveTrackedItems();
    renderTrackerLists();
    if (!silent && onlyType) trackerStatus(changed ? `${changed} update${changed > 1 ? "s" : ""} found.` : "Everything is up to date.", changed ? "success" : "", onlyType);
  } finally {
    trackerCheckRunning = false;
  }
}

function renderTrackerLists() {
  ["movie", "anime", "webseries"].forEach(type => {
    const list = document.querySelector(`[data-tracker-list="${type}"]`);
    const count = document.querySelector(`[data-tracker-count="${type}"]`);
    if (!list) return;
    const items = getTrackedItemsForType(type);
    if (count) count.textContent = `${items.length} tracked`;
    if (!items.length) {
      list.innerHTML = `<div class="tracked-empty"><span>${type === "movie" ? "🎬" : type === "anime" ? "🍥" : "📺"}</span><div><strong>Nothing tracked yet</strong><small>Use the 🔔 button on a ${getTypeLabel(type).toLowerCase()} card to add it here.</small></div></div>`;
      return;
    }
    list.innerHTML = items.map(t => {
      const label = type === "movie"
        ? `${Number(t.lastParts || 0) || 0} part${Number(t.lastParts || 0) === 1 ? "" : "s"} saved`
        : type === "anime"
          ? `Season ${Number(t.lastSeasonNumber || t.lastSeason || 0) || "—"}`
          : `Season ${Number(t.lastSeasonNumber || t.lastSeason || 0) || "—"}`;
      return `<div class="tracked-item">
        <div class="tracked-item-main"><span class="tracked-type-badge">${type === "movie" ? "MOVIE" : type === "anime" ? "ANIME" : "SERIES"}</span><div><strong>${escapeHtml(t.name)}</strong><span>${label} · checked ${new Date(t.lastCheckedAt || Date.now()).toLocaleString()}</span></div></div>
        <button type="button" class="small-btn untrack-btn" data-id="${escapeHtml(t.mediaId)}" title="Stop tracking">×</button>
      </div>`;
    }).join("");
    list.querySelectorAll(".untrack-btn").forEach(btn => btn.addEventListener("click", () => trackMediaItem(btn.dataset.id)));
  });
}

function setActiveTracker(type) {
  document.querySelectorAll(".tracker-panel[data-tracker-type]").forEach(panel => panel.classList.toggle("is-active", panel.dataset.trackerType === type));
  document.getElementById("trackerShell")?.classList.toggle("is-movie", type === "movie");
  document.getElementById("trackerShell")?.classList.toggle("is-anime", type === "anime");
  document.getElementById("trackerShell")?.classList.toggle("is-webseries", type === "webseries");
}

function initTracker() {
  renderTrackerLists();
  initNotificationBox();
  setActiveTracker(currentType);
  document.querySelectorAll('[data-tracker-action="notifications"]').forEach(btn => btn.addEventListener("click", () => requestTrackerNotifications(currentType)));
  document.querySelectorAll(".tracker-check-btn").forEach(btn => btn.addEventListener("click", () => checkTrackedItems(false, btn.dataset.trackerType)));
  setTimeout(() => checkTrackedItems(true), 2500);
  setInterval(() => checkTrackedItems(true), TRACK_CHECK_INTERVAL);
}

function getTypeLabel(type) {
  return type === "movie" ? "Movie" : type === "anime" ? "Anime" : "Web Series";
}

function setImdbStatus(message, state = "") {
  const el = document.getElementById("imdbFetchStatus");
  if (!el) return;
  el.textContent = message || "";
  el.className = "imdb-fetch-status" + (state ? ` is-${state}` : "");
}

function clearFetchedPoster() {
  fetchedPosterBlob = null;
  if (fetchedPosterObjectUrl) {
    URL.revokeObjectURL(fetchedPosterObjectUrl);
    fetchedPosterObjectUrl = null;
  }
  const preview = document.getElementById("posterPreview");
  const img = document.getElementById("posterPreviewImg");
  if (preview) preview.hidden = true;
  if (img) img.removeAttribute("src");
}

function showFetchedPoster(blob) {
  clearFetchedPoster();
  if (!blob) return;
  fetchedPosterBlob = blob;
  fetchedPosterObjectUrl = URL.createObjectURL(blob);
  const preview = document.getElementById("posterPreview");
  const img = document.getElementById("posterPreviewImg");
  if (img) img.src = fetchedPosterObjectUrl;
  if (preview) preview.hidden = false;
}

function extractImdbId(input) {
  const value = String(input || "").trim();
  if (!value) return null;
  const urlMatch = value.match(/imdb\.com\/title\/(tt\d{5,})/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  const idMatch = value.match(/^(tt\d{5,})$/i);
  if (idMatch) return idMatch[1].toLowerCase();
  return null;
}

/** Parse Rotten Tomatoes URL → { title, year, mediaKind } */
function parseRottenTomatoesLink(input) {
  const value = String(input || "").trim();
  if (!value) return null;

  // /m/slug or /tv/slug or /tv/slug/s01
  const m = value.match(
    /rottentomatoes\.com\/(m|tv)\/([a-z0-9_]+)(?:\/s(\d+))?/i
  );
  if (!m) return null;

  const kind = m[1].toLowerCase(); // m | tv
  let slug = m[2];
  const season = m[3] ? String(parseInt(m[3], 10)) : "";

  // Trailing _YYYY year in slug
  let year = "";
  const yearMatch = slug.match(/_(\d{4})$/);
  if (yearMatch) {
    year = yearMatch[1];
    slug = slug.slice(0, -5);
  }

  // snake_case → Title Case words
  const title = slug
    .split("_")
    .filter(Boolean)
    .map(w => {
      // keep short all-caps tokens like "ai" optional; simple title case
      if (w.length <= 2) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");

  return {
    title,
    year,
    season,
    mediaKind: kind === "tv" ? "series" : "movie"
  };
}

function parseMediaLink(input) {
  const value = String(input || "").trim();
  if (!value) return { type: "empty" };

  const imdbId = extractImdbId(value);
  if (imdbId) return { type: "imdb", imdbId };

  const rt = parseRottenTomatoesLink(value);
  if (rt) return { type: "rt", ...rt };

  // Bare title fallback (no URL)
  if (!/^https?:\/\//i.test(value) && value.length >= 2) {
    return { type: "title", title: value };
  }

  return { type: "unknown" };
}

function mapImdbRatingToStars(imdbRating) {
  const n = parseFloat(imdbRating);
  if (!Number.isFinite(n)) return "";
  // Map IMDb 0–10 → 0–5 with one decimal (e.g. 8.6 → 4.3)
  const mapped = Math.round((n / 2) * 10) / 10;
  return String(Math.max(0, Math.min(5, mapped)));
}

async function fetchFromOmdbById(imdbId) {
  if (!OMDB_API_KEY) {
    throw new Error(
      "OMDb API key is missing. Get a free key at https://www.omdbapi.com/apikey.aspx and paste it into script.js (OMDB_API_KEY)."
    );
  }
  const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&plot=full&apikey=${encodeURIComponent(OMDB_API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OMDb request failed (${res.status}).`);
  const data = await res.json();
  if (data.Response === "False") throw new Error(data.Error || "Title not found on OMDb.");
  return data;
}

async function fetchFromOmdbByTitle(title, year = "", preferType = "") {
  if (!OMDB_API_KEY) {
    throw new Error(
      "OMDb API key is missing. Get a free key at https://www.omdbapi.com/apikey.aspx and paste it into script.js (OMDB_API_KEY)."
    );
  }

  const params = new URLSearchParams({
    t: title,
    plot: "full",
    apikey: OMDB_API_KEY
  });
  if (year) params.set("y", year);
  if (preferType === "series") params.set("type", "series");
  else if (preferType === "movie") params.set("type", "movie");

  const res = await fetch(`https://www.omdbapi.com/?${params.toString()}`);
  if (!res.ok) throw new Error(`OMDb request failed (${res.status}).`);
  const data = await res.json();

  if (data.Response === "False") {
    // Retry without year / type if first attempt failed
    const retryParams = new URLSearchParams({
      t: title,
      plot: "full",
      apikey: OMDB_API_KEY
    });
    const retry = await fetch(`https://www.omdbapi.com/?${retryParams.toString()}`);
    const retryData = await retry.json();
    if (retryData.Response === "False") {
      throw new Error(data.Error || `No match found for "${title}".`);
    }
    return retryData;
  }
  return data;
}


async function fetchPosterBlob(posterUrl) {
  if (!posterUrl || posterUrl === "N/A") return null;

  const tryFetch = async (url, mode) => {
    const res = await fetch(url, mode ? { mode } : undefined);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size < 100) return null;
    if (blob.type.startsWith("image/") || !blob.type || blob.type === "application/octet-stream") {
      return blob.type.startsWith("image/") ? blob : new Blob([blob], { type: "image/jpeg" });
    }
    return null;
  };

  // 1) Direct (Amazon CDN often allows CORS *)
  try {
    const blob = await tryFetch(posterUrl, "cors");
    if (blob) return blob;
  } catch (err) {
    console.warn("[Poster] Direct fetch failed:", err);
  }

  // 2) corsproxy.io
  try {
    const blob = await tryFetch("https://corsproxy.io/?" + encodeURIComponent(posterUrl));
    if (blob) return blob;
  } catch (err) {
    console.warn("[Poster] corsproxy failed:", err);
  }

  // 3) allorigins
  try {
    const blob = await tryFetch(
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(posterUrl)
    );
    if (blob) return blob;
  } catch (err) {
    console.warn("[Poster] allorigins failed:", err);
  }

  // 4) <img> + canvas fallback
  try {
    const blob = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = setTimeout(() => {
        reject(new Error("Poster image load timeout"));
      }, 12000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("No canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            b => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/jpeg",
            0.85
          );
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Image element failed to load poster"));
      };
      img.src = posterUrl;
    });
    if (blob) return blob;
  } catch (err) {
    console.warn("[Poster] canvas fallback failed:", err);
  }

  return null;
}

async function applyOmdbDataToForm(data, extras = {}) {
  document.getElementById("mediaName").value = data.Title || "";
  document.getElementById("mediaYear").value =
    (data.Year || extras.year || "").replace(/[^0-9].*$/, "") || "";
  document.getElementById("mediaGenre").value =
    data.Genre && data.Genre !== "N/A" ? normalizeGenres(data.Genre) : "";
  document.getElementById("mediaDescription").value =
    data.Plot && data.Plot !== "N/A" ? data.Plot : "";

  // Seasons: prefer OMDb totalSeasons, else RT season if provided
  let seasons = "";
  if (data.totalSeasons && data.totalSeasons !== "N/A") {
    seasons = data.totalSeasons;
  } else if (extras.season) {
    seasons = extras.season;
  }
  document.getElementById("mediaParts").value = seasons;
  document.getElementById("mediaRating").value = mapImdbRatingToStars(data.imdbRating);

  setImdbStatus("Downloading poster…", "loading");
  const posterBlob = await fetchPosterBlob(data.Poster);
  if (posterBlob) {
    try {
      const resized = await resizeImageFromBlob(posterBlob);
      showFetchedPoster(resized || posterBlob);
    } catch {
      showFetchedPoster(posterBlob);
    }
    setImdbStatus(`Filled: ${data.Title} (${data.Year || "n/a"}) · poster ready`, "success");
  } else {
    setImdbStatus(
      `Filled: ${data.Title} (${data.Year || "n/a"}) · poster unavailable (upload manually)`,
      "success"
    );
  }
}

async function handleImdbFetch() {
  const input = document.getElementById("imdbLink");
  const btn = document.getElementById("imdbFetchBtn");
  if (!input || !btn) return;

  const parsed = parseMediaLink(input.value);
  if (parsed.type === "empty") {
    setImdbStatus("Paste an IMDb or Rotten Tomatoes link (or an IMDb ID).", "error");
    input.focus();
    return;
  }
  if (parsed.type === "unknown") {
    setImdbStatus("Unrecognized link. Use IMDb, Rotten Tomatoes, or a title.", "error");
    input.focus();
    return;
  }

  btn.disabled = true;
  clearFetchedPoster();

  try {
    let data;

    if (parsed.type === "imdb") {
      setImdbStatus("Fetching from IMDb…", "loading");
      data = await fetchFromOmdbById(parsed.imdbId);
      await applyOmdbDataToForm(data);
    } else if (parsed.type === "rt") {
      setImdbStatus(`Looking up “${parsed.title}” from Rotten Tomatoes link…`, "loading");
      data = await fetchFromOmdbByTitle(parsed.title, parsed.year, parsed.mediaKind);
      await applyOmdbDataToForm(data, { year: parsed.year, season: parsed.season });
    } else if (parsed.type === "title") {
      setImdbStatus(`Searching “${parsed.title}”…`, "loading");
      data = await fetchFromOmdbByTitle(parsed.title, "", "");
      await applyOmdbDataToForm(data);
    }
  } catch (error) {
    console.error("[Media link] Fetch failed:", error);
    setImdbStatus(error.message || "Could not fetch media data.", "error");
  } finally {
    btn.disabled = false;
  }
}

function resizeImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(blob);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          result => {
            URL.revokeObjectURL(url);
            resolve(result || blob);
          },
          "image/jpeg",
          0.78
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode poster image."));
    };
    img.src = url;
  });
}

function showMediaError(message, error = null) {
  const detail = error?.message ? `\n\nTechnical detail: ${error.message}` : "";
  alert(`SAVE ERROR\n\n${message}${detail}`);
}

function stars(rating) {
  const n = parseFloat(rating);
  if (!Number.isFinite(n) || n <= 0) return "";

  const clamped = Math.max(0, Math.min(5, n));
  const full = Math.floor(clamped);
  const frac = clamped - full;
  let out = "★".repeat(full);

  // half star for .3 – .7 range, full for higher fraction
  if (frac >= 0.75 && full < 5) {
    out += "★";
  } else if (frac >= 0.25 && full < 5) {
    out += "½";
  }

  const empty = 5 - out.replace(/½/g, "★").length;
  // count visual slots: full stars + optional half = slots used
  const slots = full + (frac >= 0.25 && full < 5 ? 1 : 0);
  out += "☆".repeat(Math.max(0, 5 - slots));

  // show numeric value too, e.g. 4.3
  const shown = Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1);
  return `${out} ${shown}`;
}


function normalizeGenres(value) {
  return String(value || "")
    .split(",")
    .map(g => g.trim())
    .filter(Boolean)
    .join(", ");
}

function genreTagsHtml(genre) {
  const parts = String(genre || "")
    .split(",")
    .map(g => g.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return `<div class="genre-tags">${parts.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join("")}</div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function verifyPassword() {
  const password = prompt("Enter password to continue:");
  if (password === "186290") {
    return true;
  } else if (password !== null) {
    alert("Incorrect password!");
  }
  return false;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported by this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open browser database."));
  });
}

let dbPromise = openDatabase();

async function dbGetAllItems() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, "readonly");
    const request = tx.objectStore(ITEMS_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function dbPutItem(item) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, "readwrite");
    tx.objectStore(ITEMS_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Database transaction was aborted."));
  });
}

async function dbDeleteItem(id) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ITEMS_STORE, IMAGES_STORE], "readwrite");
    tx.objectStore(ITEMS_STORE).delete(id);
    tx.objectStore(IMAGES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Database transaction was aborted."));
  });
}

async function dbPutImage(id, blob) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE, "readwrite");
    tx.objectStore(IMAGES_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Database transaction was aborted."));
  });
}

async function dbGetImage(id) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGES_STORE, "readonly");
    const request = tx.objectStore(IMAGES_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const match = parts[0].match(/data:([^;]+);base64/);
  if (!match || !parts[1]) {
    throw new Error("Legacy poster data could not be converted.");
  }

  const mime = match[1];
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

/*
 * One-time migration:
 * Older versions stored poster Base64 strings in localStorage under
 * "rickMediaCollection". We move those posters into IndexedDB and keep
 * only lightweight metadata in the database.
 */
async function migrateLegacyCollection() {
  let raw = null;

  try {
    raw = localStorage.getItem("rickMediaCollection");
  } catch (error) {
    console.warn("[Collection] Could not read legacy localStorage data:", error);
    return;
  }

  if (!raw) return;

  let legacyItems;
  try {
    legacyItems = JSON.parse(raw);
    if (!Array.isArray(legacyItems)) {
      throw new Error("Legacy collection is not a valid list.");
    }
  } catch (error) {
    console.error("[Collection] Legacy collection could not be parsed:", error);
    return;
  }

  if (!legacyItems.length) {
    try { localStorage.removeItem("rickMediaCollection"); } catch (_) {}
    return;
  }

  try {
    for (const legacy of legacyItems) {
      const id = legacy.id || (
        crypto.randomUUID
          ? crypto.randomUUID()
          : `media-${Date.now()}-${Math.random().toString(16).slice(2)}`
      );

      const item = {
        id,
        type: legacy.type,
        name: legacy.name || "",
        year: legacy.year || "",
        genre: legacy.genre || "",
        parts: legacy.parts || "",
        rating: legacy.rating || "",
        description: legacy.description || "",
        imageKey: "",
        addedAt: Number(legacy.addedAt) || Date.now()
      };

      if (legacy.image && typeof legacy.image === "string") {
        try {
          const blob = dataUrlToBlob(legacy.image);
          await dbPutImage(id, blob);
          item.imageKey = id;
        } catch (imageError) {
          console.warn(`[Collection] Could not migrate poster for "${item.name}":`, imageError);
        }
      }

      await dbPutItem(item);
    }

    // Remove the old Base64 collection only after migration succeeds.
    localStorage.removeItem("rickMediaCollection");
    console.info("[Collection] Legacy collection migrated to IndexedDB.");
  } catch (error) {
    console.error("[Collection] Legacy migration failed:", error);
    throw new Error(
      "Your old collection could not be migrated completely. Your existing browser data was left untouched."
    );
  }
}

/* Starter collection — only used when the database is empty */
const SEED_ITEMS = [
  // Movies
  { id: "seed-movie-1", type: "movie", name: "Interstellar", year: "2014", genre: "Sci-Fi", parts: "1", rating: "5", description: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.", imageKey: "", addedAt: Date.now() - 900000 },
  { id: "seed-movie-2", type: "movie", name: "The Dark Knight", year: "2008", genre: "Action", parts: "1", rating: "5", description: "Batman faces the Joker, a criminal mastermind who plunges Gotham into chaos.", imageKey: "", addedAt: Date.now() - 800000 },
  { id: "seed-movie-3", type: "movie", name: "Inception", year: "2010", genre: "Sci-Fi", parts: "1", rating: "5", description: "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea.", imageKey: "", addedAt: Date.now() - 700000 },
  { id: "seed-movie-4", type: "movie", name: "Spirited Away", year: "2001", genre: "Fantasy", parts: "1", rating: "5", description: "A young girl enters a world of spirits and must find a way to free her parents and return home.", imageKey: "", addedAt: Date.now() - 600000 },
  { id: "seed-movie-5", type: "movie", name: "Dune", year: "2021", genre: "Sci-Fi", parts: "2", rating: "4", description: "Paul Atreides leads a rebellion on the desert planet Arrakis to avenge his family and fulfill his destiny.", imageKey: "", addedAt: Date.now() - 500000 },
  // Anime
  { id: "seed-anime-1", type: "anime", name: "Attack on Titan", year: "2013", genre: "Action", parts: "4", rating: "5", description: "Humanity fights for survival against giant humanoid Titans behind enormous walls.", imageKey: "", addedAt: Date.now() - 400000 },
  { id: "seed-anime-2", type: "anime", name: "Demon Slayer", year: "2019", genre: "Action", parts: "4", rating: "5", description: "Tanjiro joins the Demon Slayer Corps to avenge his family and cure his sister.", imageKey: "", addedAt: Date.now() - 350000 },
  { id: "seed-anime-3", type: "anime", name: "Jujutsu Kaisen", year: "2020", genre: "Action", parts: "2", rating: "5", description: "A boy swallows a cursed object and joins a secret organization of jujutsu sorcerers.", imageKey: "", addedAt: Date.now() - 300000 },
  { id: "seed-anime-4", type: "anime", name: "One Piece", year: "1999", genre: "Adventure", parts: "20", rating: "5", description: "Monkey D. Luffy and his crew search for the legendary One Piece treasure.", imageKey: "", addedAt: Date.now() - 250000 },
  { id: "seed-anime-5", type: "anime", name: "Death Note", year: "2006", genre: "Thriller", parts: "1", rating: "5", description: "A high school student finds a notebook that kills anyone whose name is written in it.", imageKey: "", addedAt: Date.now() - 200000 },
  // Web Series
  { id: "seed-series-1", type: "webseries", name: "Stranger Things", year: "2016", genre: "Sci-Fi", parts: "4", rating: "5", description: "Kids in a small town face supernatural forces and government secrets in the 1980s.", imageKey: "", addedAt: Date.now() - 150000 },
  { id: "seed-series-2", type: "webseries", name: "The Boys", year: "2019", genre: "Action", parts: "4", rating: "5", description: "A group of vigilantes take on corrupt superheroes who abuse their powers.", imageKey: "", addedAt: Date.now() - 120000 },
  { id: "seed-series-3", type: "webseries", name: "Dark", year: "2017", genre: "Mystery", parts: "3", rating: "5", description: "A missing child sets four families on a collision course across time in a German town.", imageKey: "", addedAt: Date.now() - 100000 },
  { id: "seed-series-4", type: "webseries", name: "Arcane", year: "2021", genre: "Fantasy", parts: "2", rating: "5", description: "The origins of two legendary sisters from the League of Legends universe.", imageKey: "", addedAt: Date.now() - 80000 },
  { id: "seed-series-5", type: "webseries", name: "Breaking Bad", year: "2008", genre: "Drama", parts: "5", rating: "5", description: "A chemistry teacher turns to cooking meth after a cancer diagnosis.", imageKey: "", addedAt: Date.now() - 60000 }
];

async function seedCollectionIfEmpty() {
  if (mediaItems.length > 0) return;
  try {
    for (const item of SEED_ITEMS) {
      await dbPutItem(item);
    }
    mediaItems = [...SEED_ITEMS];
    console.info("[Collection] Seeded starter movies, anime, and web series.");
  } catch (error) {
    console.warn("[Collection] Could not seed starter data:", error);
  }
}

async function loadMedia() {
  try {
    await migrateLegacyCollection();
    mediaItems = await dbGetAllItems();
    await seedCollectionIfEmpty();
    collectionReady = true;
  } catch (error) {
    collectionReady = false;
    console.error("[Collection] Failed to load:", error);
    showMediaError(
      "Could not load your collection from browser storage.",
      error
    );
  }
}

function revokeImageUrls() {
  imageObjectUrls.forEach(url => URL.revokeObjectURL(url));
  imageObjectUrls.clear();
}

function getMediaAddedAt(item) {
  const value = Number(item.addedAt);
  if (Number.isFinite(value) && value > 0) return value;

  // Older entries may not have an addedAt value. Use their ID timestamp when
  // available, otherwise keep them at the end of the Recently Added list.
  const match = String(item.id || "").match(/media-(\d+)-/);
  return match ? Number(match[1]) : 0;
}

function getMediaSortValue(item) {
  if (currentSort === "year") return Number(item.year) || 0;
  if (currentSort === "season") return Number(item.parts) || 0;
  if (currentSort === "name") return String(item.name || "").trim().toLocaleLowerCase();
  return getMediaAddedAt(item);
}

function sortMediaItems(items) {
  return [...items].sort((a, b) => {
    const av = getMediaSortValue(a);
    const bv = getMediaSortValue(b);

    if (currentSort === "name") {
      return av.localeCompare(bv, undefined, { sensitivity: "base" });
    }

    // Recently Added and Year show newest/highest first.
    if (currentSort === "recent" || currentSort === "year") {
      return bv - av || String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
    }

    // Season shows Season 1, Season 2, Season 3...
    return av - bv || String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
  });
}

function getSearchText(item) {
  return [item.name, item.genre, item.year, item.parts, item.description]
    .filter(value => value !== undefined && value !== null)
    .join(" ")
    .toLocaleLowerCase();
}

async function renderMedia() {
  revokeImageUrls();
  mediaGrid.innerHTML = "";

  if (!collectionReady) {
    emptyMedia.style.display = "block";
    emptyMedia.querySelector("h3").textContent = "Collection unavailable";
    emptyMedia.querySelector("p").textContent = "Refresh the page and try again.";
    return;
  }

  const typeItems = mediaItems.filter(item => item.type === currentType);
  const query = currentSearch.trim().toLocaleLowerCase();
  const searched = query
    ? typeItems.filter(item => getSearchText(item).includes(query))
    : typeItems;
  const filtered = sortMediaItems(searched);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

  emptyMedia.style.display = totalItems ? "none" : "block";

  if (!totalItems && query) {
    emptyMedia.querySelector("h3").textContent = "No results found";
    emptyMedia.querySelector("p").textContent = `Nothing matches “${currentSearch.trim()}”. Try another search.`;
  } else {
    emptyMedia.querySelector("h3").textContent = "No favorites yet";
    emptyMedia.querySelector("p").innerHTML =
      'Click <strong>Add New</strong> to add your first movie, anime, or series.';
  }

  updatePagination(totalItems, totalPages);

  for (const item of pageItems) {
    const card = document.createElement("article");
    card.className = "media-card";

    const posterWrap = document.createElement("div");
    posterWrap.className = "poster-wrap";

    if (item.imageKey) {
      const img = document.createElement("img");
      img.alt = `${item.name} poster`;

      try {
        const blob = await dbGetImage(item.imageKey);
        if (blob) {
          const url = URL.createObjectURL(blob);
          imageObjectUrls.add(url);
          img.src = url;
          posterWrap.appendChild(img);
        } else {
          throw new Error("Poster file was not found.");
        }
      } catch (error) {
        console.warn(`[Collection] Poster could not be loaded for "${item.name}":`, error);
        posterWrap.innerHTML = `<div class="poster-placeholder">${
          item.type === "movie" ? "🎬" : item.type === "anime" ? "🍿" : "📺"
        }</div>`;
      }
    } else {
      posterWrap.innerHTML = `<div class="poster-placeholder">${
        item.type === "movie" ? "🎬" : item.type === "anime" ? "🍿" : "📺"
      }</div>`;
    }

    const actions = document.createElement("div");
    actions.className = "media-actions";
    actions.innerHTML = `
      <button class="small-btn track-btn ${isTracked(item.id) ? "is-tracked" : ""}" data-id="${escapeHtml(item.id)}" title="${isTracked(item.id) ? "Stop tracking" : `Track ${getTypeLabel(item.type).toLowerCase()}`}">${isTracked(item.id) ? "✓" : "🔔"}</button>
      <button class="small-btn edit-btn" data-id="${escapeHtml(item.id)}" title="Edit">✎</button>
      <button class="small-btn delete-btn" data-id="${escapeHtml(item.id)}" title="Delete">🗑</button>
    `;
    posterWrap.appendChild(actions);

    const info = document.createElement("div");
    info.className = "media-info";

    const yearBit = item.year || "";
    const partsBit = item.parts
      ? `${escapeHtml(item.parts)} ${
          item.type === "movie"
            ? (Number(item.parts) === 1 ? "Part" : "Parts")
            : (Number(item.parts) === 1 ? "Season" : "Seasons")
        }`
      : "";
    const meta = [yearBit, partsBit].filter(Boolean).join(" • ");

    info.innerHTML = `
      <h3>${escapeHtml(item.name)}</h3>
      <p class="media-meta">${meta}</p>
      ${genreTagsHtml(item.genre)}
      ${item.rating ? `<div class="rating">${stars(item.rating)}</div>` : ""}
      ${item.description ? `<p class="media-description">${escapeHtml(item.description)}</p>` : ""}
    `;

    card.appendChild(posterWrap);
    card.appendChild(info);
    mediaGrid.appendChild(card);
  }

  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.id));
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteMedia(btn.dataset.id));
  });

  document.querySelectorAll(".track-btn").forEach(btn => {
    btn.addEventListener("click", () => trackMediaItem(btn.dataset.id));
  });
}

function updatePagination(totalItems, totalPages) {
  if (!mediaPagination) return;

  if (totalItems <= ITEMS_PER_PAGE) {
    mediaPagination.hidden = true;
    return;
  }

  mediaPagination.hidden = false;

  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  }

  if (prevPageBtn) {
    prevPageBtn.disabled = currentPage <= 1;
  }
  if (nextPageBtn) {
    nextPageBtn.disabled = currentPage >= totalPages;
  }

  if (pageNumbers) {
    pageNumbers.innerHTML = "";
    const maxButtons = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-num" + (p === currentPage ? " active" : "");
      btn.textContent = String(p);
      btn.setAttribute("aria-label", `Go to page ${p}`);
      if (p === currentPage) btn.setAttribute("aria-current", "page");
      btn.addEventListener("click", () => {
        if (p !== currentPage) {
          currentPage = p;
          renderMedia();
          mediaGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      pageNumbers.appendChild(btn);
    }
  }
}

function goToPage(page) {
  currentPage = page;
  renderMedia();
  mediaGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openModal(id = null) {
  if (!verifyPassword()) return;

  mediaForm.reset();
  clearFetchedPoster();
  setImdbStatus("");
  document.getElementById("mediaId").value = "";
  document.getElementById("mediaType").value = currentType;
  const typeLabel = getTypeLabel(currentType);
  document.getElementById("modalTitle").textContent = `Add ${typeLabel}`;

  if (id) {
    const item = mediaItems.find(x => x.id === id);
    if (!item) return;

    const editLabel = getTypeLabel(item.type);
    document.getElementById("modalTitle").textContent = `Edit ${editLabel}`;
    document.getElementById("mediaId").value = item.id;
    document.getElementById("mediaType").value = item.type;
    document.getElementById("mediaName").value = item.name;
    document.getElementById("mediaYear").value = item.year || "";
    document.getElementById("mediaGenre").value = item.genre || "";
    document.getElementById("mediaParts").value = item.parts || "";
    document.getElementById("mediaRating").value = item.rating || "";
    document.getElementById("mediaDescription").value = item.description || "";
  }

  mediaModal.classList.add("show");
  mediaModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  mediaModal.classList.remove("show");
  mediaModal.setAttribute("aria-hidden", "true");
  clearFetchedPoster();
  setImdbStatus("");
}

async function deleteMedia(id) {
  const item = mediaItems.find(x => x.id === id);
  if (!item) return;

  if (!verifyPassword()) return;

  if (confirm(`Delete "${item.name}"?`)) {
    try {
      await dbDeleteItem(id);
      mediaItems = mediaItems.filter(x => x.id !== id);
      await renderMedia();
    } catch (error) {
      console.error("[Collection] Delete failed:", error);
      showMediaError(`Could not delete this ${getTypeLabel(item.type).toLowerCase()}.`, error);
    }
  }
}

mediaTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    mediaTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentType = tab.dataset.type;
    currentSearch = "";
    currentPage = 1;
    mediaSearch.value = "";
    mediaSearch.placeholder = `Search ${getTypeLabel(currentType).toLowerCase()}...`;
    mediaSearch.parentElement.classList.remove("has-value");
    setActiveTracker(currentType);
    renderTrackerLists();
    renderMedia();
  });
});

mediaSearch.addEventListener("input", () => {
  currentSearch = mediaSearch.value;
  currentPage = 1;
  mediaSearch.parentElement.classList.toggle("has-value", Boolean(currentSearch));
  renderMedia();
});

clearMediaSearch.addEventListener("click", () => {
  mediaSearch.value = "";
  currentSearch = "";
  currentPage = 1;
  mediaSearch.parentElement.classList.remove("has-value");
  mediaSearch.focus();
  renderMedia();
});

mediaSort.addEventListener("change", () => {
  currentSort = mediaSort.value;
  currentPage = 1;
  renderMedia();
});

mediaSearch.placeholder = `Search ${getTypeLabel(currentType).toLowerCase()}...`;

prevPageBtn?.addEventListener("click", () => {
  if (currentPage > 1) goToPage(currentPage - 1);
});

nextPageBtn?.addEventListener("click", () => {
  goToPage(currentPage + 1);
});

addMediaBtn.addEventListener("click", () => openModal());
closeMediaModal.addEventListener("click", closeModal);
cancelMedia.addEventListener("click", closeModal);

mediaModal.addEventListener("click", event => {
  if (event.target === mediaModal) closeModal();
});

// IMDb auto-fill
const imdbFetchBtn = document.getElementById("imdbFetchBtn");
const imdbLinkInput = document.getElementById("imdbLink");
const clearPosterPreviewBtn = document.getElementById("clearPosterPreview");

imdbFetchBtn?.addEventListener("click", handleImdbFetch);

imdbLinkInput?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleImdbFetch();
  }
});

imdbLinkInput?.addEventListener("paste", () => {
  window.setTimeout(() => {
    const p = parseMediaLink(imdbLinkInput.value);
    if (p.type === "imdb" || p.type === "rt" || p.type === "title") {
      handleImdbFetch();
    }
  }, 50);
});

clearPosterPreviewBtn?.addEventListener("click", () => {
  clearFetchedPoster();
  setImdbStatus("Auto poster removed. You can upload one manually.", "");
});

document.getElementById("mediaImage")?.addEventListener("change", () => {
  const fileInput = document.getElementById("mediaImage");
  if (fileInput?.files?.length) {
    clearFetchedPoster();
    setImdbStatus("Using uploaded poster instead of IMDb auto poster.", "");
  }
});

mediaForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!collectionReady) {
    showMediaError("The collection database is not ready. Please refresh the page and try again.");
    return;
  }

  try {
    const id = document.getElementById("mediaId").value.trim();
    const type = document.getElementById("mediaType").value;
    const name = document.getElementById("mediaName").value.trim();
    const year = document.getElementById("mediaYear").value;
    const genre = normalizeGenres(document.getElementById("mediaGenre").value);
    const parts = document.getElementById("mediaParts").value;
    const ratingRaw = document.getElementById("mediaRating").value;
    let rating = "";
    if (ratingRaw !== "" && ratingRaw !== null) {
      const rn = parseFloat(ratingRaw);
      if (Number.isFinite(rn)) {
        rating = String(Math.max(0, Math.min(5, Math.round(rn * 10) / 10)));
      }
    }
    const description = document.getElementById("mediaDescription").value.trim();
    const imageFile = document.getElementById("mediaImage").files[0];

    if (!name) {
      showMediaError(`${getTypeLabel(type)} name is required.`);
      document.getElementById("mediaName").focus();
      return;
    }

    if (!["movie", "anime", "webseries"].includes(type)) {
      throw new Error(`Invalid collection type: ${type || "empty"}`);
    }

    const existing = id ? mediaItems.find(x => x.id === id) : null;
    if (id && !existing) {
      throw new Error("The item you are trying to edit no longer exists.");
    }

    const itemId = id || (
      crypto.randomUUID
        ? crypto.randomUUID()
        : `media-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    let imageKey = existing?.imageKey || "";

    if (imageFile) {
      const imageBlob = await resizeImage(imageFile);
      await dbPutImage(itemId, imageBlob);
      imageKey = itemId;
    } else if (fetchedPosterBlob) {
      await dbPutImage(itemId, fetchedPosterBlob);
      imageKey = itemId;
    }

    const item = {
      id: itemId,
      type,
      name,
      year,
      genre,
      parts,
      rating,
      description,
      imageKey,
      addedAt: existing ? getMediaAddedAt(existing) : Date.now()
    };

    await dbPutItem(item);

    if (id) {
      mediaItems = mediaItems.map(x => x.id === id ? item : x);
    } else {
      mediaItems = [...mediaItems, item];
    }

    closeModal();
    await renderMedia();
  } catch (error) {
    console.error("[Collection] Save failed:", error);
    showMediaError(
      `The ${getTypeLabel(document.getElementById("mediaType").value).toLowerCase()} could not be saved.`,
      error
    );
  }
});

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("The selected poster is not an image file."));
      return;
    }

    const reader = new FileReader();

    reader.onload = event => {
      const img = new Image();

      img.onload = () => {
        try {
          // Keep posters reasonably sized while storing the actual binary
          // image in IndexedDB instead of Base64 in localStorage.
          const max = 900;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Your browser could not create an image canvas."));
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            blob => {
              if (!blob) {
                reject(new Error("The poster could not be converted to a storable image."));
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            0.78
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error("The poster image could not be decoded."));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error("The browser could not read the poster file."));
    reader.readAsDataURL(file);
  });
}

async function initCollection() {
  try {
    await loadMedia();
    await renderMedia();
  } catch (error) {
    console.error("[Collection] Initialization failed:", error);
    showMediaError("The collection could not be initialized.", error);
  }
}

initCollection();
initTracker();
/* ——— Custom Cursor + Trail (Superhero) ——— */
(function initCursor() {
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  document.body.appendChild(dot);

  const outline = document.createElement("div");
  outline.className = "cursor-outline";
  document.body.appendChild(outline);

  const trailCount = 12;
  const trails = [];
  for (let i = 0; i < trailCount; i++) {
    const t = document.createElement("div");
    t.className = "cursor-trail";
    t.style.width = `${8 - i * 0.4}px`;
    t.style.height = `${8 - i * 0.4}px`;
    t.style.opacity = String(0.55 - i * 0.035);
    t.style.background = i % 3 === 0 ? "var(--accent)" : (i % 3 === 1 ? "var(--accent2)" : "var(--accent-gold)");
    document.body.appendChild(t);
    trails.push({ el: t, x: 0, y: 0 });
  }

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let outlineX = mouseX;
  let outlineY = mouseY;

  document.addEventListener("mousemove", e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = mouseX + "px";
    dot.style.top = mouseY + "px";
  });

  const hoverTargets = "a, button, .btn, .media-tab, .menu-btn, .small-btn, input, select, textarea, .modal-close";

  document.addEventListener("mouseover", e => {
    if (e.target.closest(hoverTargets)) {
      dot.classList.add("hover");
      outline.classList.add("hover");
    }
  });

  document.addEventListener("mouseout", e => {
    if (e.target.closest(hoverTargets)) {
      dot.classList.remove("hover");
      outline.classList.remove("hover");
    }
  });

  function animate() {
    outlineX += (mouseX - outlineX) * 0.18;
    outlineY += (mouseY - outlineY) * 0.18;
    outline.style.left = outlineX + "px";
    outline.style.top = outlineY + "px";

    let prevX = mouseX;
    let prevY = mouseY;

    trails.forEach((trail, i) => {
      const lag = 0.28 - i * 0.015;
      trail.x += (prevX - trail.x) * lag;
      trail.y += (prevY - trail.y) * lag;
      trail.el.style.left = trail.x + "px";
      trail.el.style.top = trail.y + "px";
      prevX = trail.x;
      prevY = trail.y;
    });

    requestAnimationFrame(animate);
  }

  animate();
})();

/* ——— Superhero Effects: Particles + Scroll Reveal ——— */
(function initEffects() {
  // Particle field
  const canvas = document.createElement("canvas");
  canvas.id = "particle-canvas";
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let w, h, particles = [];
  const COUNT = 55;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.8 + 0.4,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        color: i % 3 === 0 ? "225, 29, 72" : (i % 3 === 1 ? "59, 130, 246" : "251, 191, 36"),
        alpha: Math.random() * 0.5 + 0.15
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
      ctx.fill();

      // soft glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color}, ${p.alpha * 0.15})`;
      ctx.fill();
    });

    // connect nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(225, 29, 72, ${0.12 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  createParticles();
  draw();
  window.addEventListener("resize", () => {
    resize();
    createParticles();
  });

  // Scroll reveal
  const revealEls = document.querySelectorAll(
    ".section-heading, .about-box, .stats, .card, .project, .contact-box, .media-toolbar, .media-grid, .empty-media"
  );
  revealEls.forEach((el, i) => {
    el.classList.add("reveal");
    if (i % 4 === 1) el.classList.add("reveal-delay-1");
    if (i % 4 === 2) el.classList.add("reveal-delay-2");
    if (i % 4 === 3) el.classList.add("reveal-delay-3");
  });

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          const h2 = entry.target.querySelector("h2");
          if (h2) h2.classList.add("underlined");
          if (entry.target.matches(".section-heading")) {
            entry.target.querySelector("h2")?.classList.add("underlined");
          }
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  revealEls.forEach(el => observer.observe(el));

  // Hero is always visible - no need to hide
  document.querySelector(".hero")?.classList.add("visible");
})();


/* ===== CINEMATIC ANIME INTRO ===== */
(function initAnimeIntro(){
  const intro = document.getElementById("anime-intro");
  const skip = document.getElementById("skip-intro");
  if (!intro) return;

  document.body.classList.add("intro-active");

  // Build speed lines dynamically so every opening feels slightly different.
  const speedlines = intro.querySelector(".intro-speedlines");
  for (let i = 0; i < 34; i++) {
    const line = document.createElement("span");
    line.style.setProperty("--r", `${Math.random() * 360}deg`);
    line.style.setProperty("--w", `${10 + Math.random() * 38}vw`);
    line.style.setProperty("--h", `${1 + Math.random() * 2.5}px`);
    line.style.setProperty("--d", `${Math.random() * 1.15}s`);
    speedlines?.appendChild(line);
  }

  // Energy particles explode from the center of the portal.
  const particles = intro.querySelector(".intro-particles");
  for (let i = 0; i < 95; i++) {
    const p = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const distance = 12 + Math.random() * 48;
    p.style.setProperty("--x", `${Math.cos(angle) * distance}vw`);
    p.style.setProperty("--y", `${Math.sin(angle) * distance}vh`);
    p.style.setProperty("--s", `${1 + Math.random() * 4}px`);
    p.style.setProperty("--dur", `${.8 + Math.random() * 1.7}s`);
    p.style.setProperty("--delay", `${.35 + Math.random() * 2.1}s`);
    particles?.appendChild(p);
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    intro.classList.add("is-done");
    document.body.classList.remove("intro-active");
    window.setTimeout(() => intro.remove(), 900);
  };

  skip?.addEventListener("click", finish);
  window.setTimeout(finish, 4700);
})();

/* ===== ANIME OPENING V2: NEON BLADE / SHATTER ===== */
(function initAnimeIntroV2(){
  const intro=document.getElementById('anime-intro');
  const skip=document.getElementById('skip-intro-v2');
  if(!intro) return;
  document.body.classList.add('v2-intro-active');

  const particles=intro.querySelector('.v2-particles');
  for(let i=0;i<110;i++){
    const p=document.createElement('span');
    const a=Math.random()*Math.PI*2, d=10+Math.random()*58;
    p.style.setProperty('--x',`${Math.cos(a)*d}vw`);
    p.style.setProperty('--y',`${Math.sin(a)*d}vh`);
    p.style.setProperty('--s',`${1+Math.random()*3.5}px`);
    p.style.setProperty('--d',`${.25+Math.random()*2.2}s`);
    particles.appendChild(p);
  }
  const sparks=intro.querySelector('.v2-sparks');
  for(let i=0;i<28;i++){
    const s=document.createElement('span');
    s.style.setProperty('--r',`${Math.random()*360}deg`);
    s.style.setProperty('--w',`${10+Math.random()*30}vw`);
    s.style.setProperty('--x',`${25+Math.random()*55}vw`);
    s.style.setProperty('--d',`${.7+Math.random()*2.2}s`);
    sparks.appendChild(s);
  }
  let done=false;
  function finish(){
    if(done) return;
    done=true;
    intro.classList.add('v2-done');
    document.body.classList.remove('v2-intro-active');
    setTimeout(()=>intro.remove(),850);
  }
  skip?.addEventListener('click',finish);
  window.addEventListener('keydown',e=>{if(e.key==='Escape') finish();},{once:false});
  setTimeout(finish,4800);
})();
