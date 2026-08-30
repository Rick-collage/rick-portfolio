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

const DB_NAME = "rickPortfolioDB";
const DB_VERSION = 1;
const ITEMS_STORE = "mediaItems";
const IMAGES_STORE = "mediaImages";

function getTypeLabel(type) {
  return type === "movie" ? "Movie" : type === "anime" ? "Anime" : "Web Series";
}

function showMediaError(message, error = null) {
  const detail = error?.message ? `\n\nTechnical detail: ${error.message}` : "";
  alert(`SAVE ERROR\n\n${message}${detail}`);
}

function stars(rating) {
  if (!rating) return "";
  return "★".repeat(Number(rating)) + "☆".repeat(5 - Number(rating));
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

async function loadMedia() {
  try {
    await migrateLegacyCollection();
    mediaItems = await dbGetAllItems();
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

  emptyMedia.style.display = filtered.length ? "none" : "block";

  if (!filtered.length && query) {
    emptyMedia.querySelector("h3").textContent = "No results found";
    emptyMedia.querySelector("p").textContent = `Nothing matches “${currentSearch.trim()}”. Try another search.`;
  } else {
    emptyMedia.querySelector("h3").textContent = "No favorites yet";
    emptyMedia.querySelector("p").innerHTML =
      'Click <strong>Add New</strong> to add your first movie, anime, or series.';
  }

  for (const item of filtered) {
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
      <button class="small-btn edit-btn" data-id="${escapeHtml(item.id)}" title="Edit">✎</button>
      <button class="small-btn delete-btn" data-id="${escapeHtml(item.id)}" title="Delete">🗑</button>
    `;
    posterWrap.appendChild(actions);

    const info = document.createElement("div");
    info.className = "media-info";

    const meta = `${item.year || ""}${
      item.year && item.genre ? " • " : ""
    }${escapeHtml(item.genre || "")}${
      item.parts
        ? (item.year || item.genre ? " • " : "") +
          escapeHtml(item.parts) +
          " " +
          (item.type === "movie"
            ? (Number(item.parts) === 1 ? "Part" : "Parts")
            : (Number(item.parts) === 1 ? "Season" : "Seasons"))
        : ""
    }`;

    info.innerHTML = `
      <h3>${escapeHtml(item.name)}</h3>
      <p class="media-meta">${meta}</p>
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
}

function openModal(id = null) {
  if (!verifyPassword()) return;

  mediaForm.reset();
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
    mediaSearch.value = "";
    mediaSearch.placeholder = `Search ${getTypeLabel(currentType).toLowerCase()}...`;
    mediaSearch.parentElement.classList.remove("has-value");
    renderMedia();
  });
});

mediaSearch.addEventListener("input", () => {
  currentSearch = mediaSearch.value;
  mediaSearch.parentElement.classList.toggle("has-value", Boolean(currentSearch));
  renderMedia();
});

clearMediaSearch.addEventListener("click", () => {
  mediaSearch.value = "";
  currentSearch = "";
  mediaSearch.parentElement.classList.remove("has-value");
  mediaSearch.focus();
  renderMedia();
});

mediaSort.addEventListener("change", () => {
  currentSort = mediaSort.value;
  renderMedia();
});

mediaSearch.placeholder = `Search ${getTypeLabel(currentType).toLowerCase()}...`;

addMediaBtn.addEventListener("click", () => openModal());
closeMediaModal.addEventListener("click", closeModal);
cancelMedia.addEventListener("click", closeModal);

mediaModal.addEventListener("click", event => {
  if (event.target === mediaModal) closeModal();
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
    const genre = document.getElementById("mediaGenre").value.trim();
    const parts = document.getElementById("mediaParts").value;
    const rating = document.getElementById("mediaRating").value;
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
