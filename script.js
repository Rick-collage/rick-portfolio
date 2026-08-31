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

/* ===== Shared Supabase collection ===== */
const SUPABASE_URL = window.SUPABASE_CONFIG?.url || "";
const SUPABASE_KEY = window.SUPABASE_CONFIG?.publishableKey || "";
const supabaseClient = (window.supabase && SUPABASE_URL && SUPABASE_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

let currentType = "movie";
let currentSearch = "";
let currentSort = "recent";
let mediaItems = [];
let collectionReady = false;
let imageObjectUrls = new Set();
let fetchedPosterUrl = "";

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
  fetchedPosterUrl = "";
  const preview = document.getElementById("posterPreview");
  const img = document.getElementById("posterPreviewImg");
  if (preview) preview.hidden = true;
  if (img) img.removeAttribute("src");
}

function showFetchedPoster(url) {
  clearFetchedPoster();
  if (!url) return;
  fetchedPosterUrl = url;
  const preview = document.getElementById("posterPreview");
  const img = document.getElementById("posterPreviewImg");
  if (img) img.src = url;
  if (preview) preview.hidden = false;
}

function extractImdbId(input) {
  const value = String(input || "").trim();
  if (!value) return null;
  const urlMatch = value.match(/imdb\.com\/title\/(tt\d{5,})/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  const idMatch = value.match(/^(tt\d{5,})$/i);
  return idMatch ? idMatch[1].toLowerCase() : null;
}

function parseRottenTomatoesLink(input) {
  const value = String(input || "").trim();
  const m = value.match(/rottentomatoes\.com\/(m|tv)\/([a-z0-9_]+)(?:\/s(\d+))?/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  let slug = m[2];
  const season = m[3] ? String(parseInt(m[3], 10)) : "";
  let year = "";
  const yearMatch = slug.match(/_(\d{4})$/);
  if (yearMatch) { year = yearMatch[1]; slug = slug.slice(0, -5); }
  const title = slug.split("_").filter(Boolean).map(w => w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return { title, year, season, mediaKind: kind === "tv" ? "series" : "movie" };
}

function parseMediaLink(input) {
  const value = String(input || "").trim();
  if (!value) return { type: "empty" };
  const imdbId = extractImdbId(value);
  if (imdbId) return { type: "imdb", imdbId };
  const rt = parseRottenTomatoesLink(value);
  if (rt) return { type: "rt", ...rt };
  if (!/^https?:\/\//i.test(value) && value.length >= 2) return { type: "title", title: value };
  return { type: "unknown" };
}

/* No API key is shipped to the browser. The Fetch button uses the optional
   Supabase Edge Function `media-lookup` when it has been deployed. */
async function handleImdbFetch() {
  const input = document.getElementById("imdbLink");
  const btn = document.getElementById("imdbFetchBtn");
  if (!input || !btn) return;
  const parsed = parseMediaLink(input.value);
  if (parsed.type === "empty") { setImdbStatus("Paste an IMDb or Rotten Tomatoes link, or a title.", "error"); return; }
  if (!supabaseClient) { setImdbStatus("Supabase is not configured. You can still add entries manually.", "error"); return; }
  btn.disabled = true;
  try {
    setImdbStatus("Looking up media…", "loading");
    const { data, error } = await supabaseClient.functions.invoke("media-lookup", { body: parsed });
    if (error) throw error;
    if (!data?.title) throw new Error("No media match was returned.");
    document.getElementById("mediaName").value = data.title || "";
    document.getElementById("mediaYear").value = data.year || "";
    document.getElementById("mediaGenre").value = normalizeGenres(data.genre || "");
    document.getElementById("mediaParts").value = data.parts || "";
    document.getElementById("mediaRating").value = data.rating || "";
    document.getElementById("mediaDescription").value = data.description || "";
    if (data.posterUrl) showFetchedPoster(data.posterUrl);
    setImdbStatus(`Filled: ${data.title}${data.posterUrl ? " · poster ready" : ""}`, "success");
  } catch (error) {
    console.error("[Media link] Fetch failed:", error);
    setImdbStatus("Auto-fill is unavailable. Add the details manually or deploy the media-lookup Edge Function.", "error");
  } finally { btn.disabled = false; }
}

function showMediaError(message, error = null) {
  const detail = error?.message ? `\n\nTechnical detail: ${error.message}` : "";
  alert(`COLLECTION ERROR\n\n${message}${detail}`);
}

function stars(rating) {
  const n = parseFloat(rating);
  if (!Number.isFinite(n) || n <= 0) return "";
  const clamped = Math.max(0, Math.min(5, n));
  const full = Math.floor(clamped);
  const frac = clamped - full;
  let out = "★".repeat(full);
  if (frac >= 0.75 && full < 5) out += "★";
  else if (frac >= 0.25 && full < 5) out += "½";
  const slots = full + (frac >= 0.25 && full < 5 ? 1 : 0);
  out += "☆".repeat(Math.max(0, 5 - slots));
  return `${out} ${Number.isInteger(clamped) ? clamped : clamped.toFixed(1)}`;
}

function normalizeGenres(value) {
  return String(value || "").split(",").map(g => g.trim()).filter(Boolean).join(", ");
}
function genreTagsHtml(genre) {
  const parts = String(genre || "").split(",").map(g => g.trim()).filter(Boolean);
  return parts.length ? `<div class="genre-tags">${parts.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join("")}</div>` : "";
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}

async function requireAdmin() {
  if (!supabaseClient) { showMediaError("Supabase is not configured. Add your Supabase URL and publishable key first."); return false; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) return true;
  const email = prompt("Admin email:");
  if (!email) return false;
  const password = prompt("Admin password:");
  if (!password) return false;
  const { error } = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password });
  if (error) { showMediaError("Admin sign-in failed. Make sure the account exists in Supabase Auth and your SQL admin policy allows it.", error); return false; }
  return true;
}

function imagePublicUrl(path) {
  if (!path || !supabaseClient) return "";
  const { data } = supabaseClient.storage.from("media-posters").getPublicUrl(path);
  return data?.publicUrl || "";
}

async function loadMedia() {
  if (!supabaseClient) throw new Error("Supabase client is unavailable. Check supabase-config.js and the Supabase CDN script.");
  const { data, error } = await supabaseClient.from("media_items").select("*").order("added_at", { ascending: false });
  if (error) throw error;
  mediaItems = (data || []).map(item => ({ ...item, imageKey: item.image_path || "", addedAt: Date.parse(item.added_at) || Date.now() }));
  collectionReady = true;
}

function getMediaAddedAt(item) { return Number(item.addedAt) || 0; }
function getMediaSortValue(item) {
  if (currentSort === "year") return Number(item.year) || 0;
  if (currentSort === "season") return Number(item.parts) || 0;
  if (currentSort === "name") return String(item.name || "").trim().toLocaleLowerCase();
  return getMediaAddedAt(item);
}
function sortMediaItems(items) {
  return [...items].sort((a,b) => {
    const av=getMediaSortValue(a), bv=getMediaSortValue(b);
    if(currentSort === "name") return av.localeCompare(bv, undefined, {sensitivity:"base"});
    if(currentSort === "season") return av-bv || String(a.name||"").localeCompare(String(b.name||""));
    return bv-av || String(a.name||"").localeCompare(String(b.name||""));
  });
}
function getSearchText(item) { return [item.name,item.genre,item.year,item.parts,item.description].filter(v=>v!==undefined&&v!==null).join(" ").toLocaleLowerCase(); }

function revokeImageUrls() { imageObjectUrls.forEach(url => URL.revokeObjectURL(url)); imageObjectUrls.clear(); }

async function renderMedia() {
  revokeImageUrls();
  mediaGrid.innerHTML = "";
  if (!collectionReady) { emptyMedia.style.display="block"; return; }
  const typeItems = mediaItems.filter(item => item.type === currentType);
  const query = currentSearch.trim().toLocaleLowerCase();
  const filtered = sortMediaItems(query ? typeItems.filter(item=>getSearchText(item).includes(query)) : typeItems);
  emptyMedia.style.display = filtered.length ? "none" : "block";
  emptyMedia.querySelector("h3").textContent = filtered.length ? "" : (query ? "No results found" : "No favorites yet");
  emptyMedia.querySelector("p").textContent = filtered.length ? "" : (query ? `Nothing matches “${currentSearch.trim()}”. Try another search.` : "Click Add New to add your first movie, anime, or series.");

  for (const item of filtered) {
    const card=document.createElement("article"); card.className="media-card";
    const posterWrap=document.createElement("div"); posterWrap.className="poster-wrap";
    const posterUrl=imagePublicUrl(item.image_path || item.imageKey);
    if(posterUrl){ const img=document.createElement("img"); img.alt=`${item.name} poster`; img.loading="lazy"; img.src=posterUrl; posterWrap.appendChild(img); }
    else posterWrap.innerHTML=`<div class="poster-placeholder">${item.type==="movie"?"🎬":item.type==="anime"?"🍿":"📺"}</div>`;
    const actions=document.createElement("div"); actions.className="media-actions";
    actions.innerHTML=`<button class="small-btn edit-btn" data-id="${escapeHtml(item.id)}" title="Edit" aria-label="Edit ${escapeHtml(item.name)}">✎</button><button class="small-btn delete-btn" data-id="${escapeHtml(item.id)}" title="Delete" aria-label="Delete ${escapeHtml(item.name)}">🗑</button>`;
    posterWrap.appendChild(actions); card.appendChild(posterWrap);
    const info=document.createElement("div"); info.className="media-info";
    const yearBit=escapeHtml(item.year||"");
    const partsBit=item.parts ? `${escapeHtml(item.parts)} ${item.type==="movie"?(Number(item.parts)===1?"Part":"Parts"):(Number(item.parts)===1?"Season":"Seasons")}` : "";
    info.innerHTML=`<h3>${escapeHtml(item.name)}</h3><p class="media-meta">${[yearBit,partsBit].filter(Boolean).join(" • ")}</p>${genreTagsHtml(item.genre)}${item.rating?`<div class="rating">${stars(item.rating)}</div>`:""}${item.description?`<p class="media-description">${escapeHtml(item.description)}</p>`:""}`;
    card.appendChild(info); mediaGrid.appendChild(card);
  }
  document.querySelectorAll(".edit-btn").forEach(btn=>btn.addEventListener("click",()=>openModal(btn.dataset.id)));
  document.querySelectorAll(".delete-btn").forEach(btn=>btn.addEventListener("click",()=>deleteMedia(btn.dataset.id)));
}

async function uploadPoster(itemId, fileOrUrl) {
  let blob;
  if (fileOrUrl instanceof Blob) blob = fileOrUrl;
  else if (typeof fileOrUrl === "string") { const response = await fetch(fileOrUrl); if(!response.ok) throw new Error("Poster download failed."); blob=await response.blob(); }
  if (!blob) return "";
  const ext = (blob.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").slice(0,8) || "jpg";
  const path = `${itemId}.${ext}`;
  const { error } = await supabaseClient.storage.from("media-posters").upload(path, blob, { upsert:true, contentType:blob.type || "image/jpeg" });
  if(error) throw error;
  return path;
}

function resizeImage(file) {
  return new Promise((resolve,reject)=>{
    if(!file){resolve(null);return;} if(!file.type.startsWith("image/")){reject(new Error("The selected poster is not an image file."));return;}
    const reader=new FileReader(); reader.onload=e=>{const img=new Image(); img.onload=()=>{const max=900, scale=Math.min(1,max/Math.max(img.width,img.height)); const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale)); const ctx=canvas.getContext("2d"); if(!ctx){reject(new Error("Could not create image canvas."));return;} ctx.drawImage(img,0,0,canvas.width,canvas.height); canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not process poster.")),"image/jpeg",.78);}; img.onerror=()=>reject(new Error("Poster image could not be decoded.")); img.src=e.target.result;}; reader.onerror=()=>reject(new Error("Could not read poster file.")); reader.readAsDataURL(file);
  });
}

async function openModal(id=null) {
  if(!(await requireAdmin())) return;
  mediaForm.reset(); clearFetchedPoster(); setImdbStatus("");
  document.getElementById("mediaId").value=""; document.getElementById("mediaType").value=currentType; document.getElementById("modalTitle").textContent=`Add ${getTypeLabel(currentType)}`;
  if(id){ const item=mediaItems.find(x=>x.id===id); if(!item)return; document.getElementById("modalTitle").textContent=`Edit ${getTypeLabel(item.type)}`; document.getElementById("mediaId").value=item.id; document.getElementById("mediaType").value=item.type; document.getElementById("mediaName").value=item.name||""; document.getElementById("mediaYear").value=item.year||""; document.getElementById("mediaGenre").value=item.genre||""; document.getElementById("mediaParts").value=item.parts||""; document.getElementById("mediaRating").value=item.rating||""; document.getElementById("mediaDescription").value=item.description||""; }
  mediaModal.classList.add("show"); mediaModal.setAttribute("aria-hidden","false");
}
function closeModal(){mediaModal.classList.remove("show");mediaModal.setAttribute("aria-hidden","true");clearFetchedPoster();setImdbStatus("");}

async function deleteMedia(id){
  const item=mediaItems.find(x=>x.id===id); if(!item)return;
  if(!(await requireAdmin()))return;
  if(!confirm(`Delete "${item.name}"?`))return;
  try{
    const {error}=await supabaseClient.from("media_items").delete().eq("id",id); if(error)throw error;
    if(item.image_path) await supabaseClient.storage.from("media-posters").remove([item.image_path]);
    mediaItems=mediaItems.filter(x=>x.id!==id); await renderMedia();
  }catch(error){console.error("[Collection] Delete failed:",error);showMediaError("Could not delete this item.",error);}
}

mediaTabs.forEach(tab=>tab.addEventListener("click",()=>{mediaTabs.forEach(t=>t.classList.remove("active"));tab.classList.add("active");currentType=tab.dataset.type;currentSearch="";mediaSearch.value="";mediaSearch.placeholder=`Search ${getTypeLabel(currentType).toLowerCase()}...`;mediaSearch.parentElement.classList.remove("has-value");renderMedia();}));
mediaSearch.addEventListener("input",()=>{currentSearch=mediaSearch.value;mediaSearch.parentElement.classList.toggle("has-value",Boolean(currentSearch));renderMedia();});
clearMediaSearch.addEventListener("click",()=>{mediaSearch.value="";currentSearch="";mediaSearch.parentElement.classList.remove("has-value");mediaSearch.focus();renderMedia();});
mediaSort.addEventListener("change",()=>{currentSort=mediaSort.value;renderMedia();});
mediaSearch.placeholder=`Search ${getTypeLabel(currentType).toLowerCase()}...`;
addMediaBtn.addEventListener("click",()=>openModal()); closeMediaModal.addEventListener("click",closeModal); cancelMedia.addEventListener("click",closeModal); mediaModal.addEventListener("click",e=>{if(e.target===mediaModal)closeModal();});

document.getElementById("imdbFetchBtn")?.addEventListener("click",handleImdbFetch);
document.getElementById("imdbLink")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();handleImdbFetch();}});
document.getElementById("clearPosterPreview")?.addEventListener("click",()=>{clearFetchedPoster();setImdbStatus("Poster removed. You can upload one manually.");});
document.getElementById("mediaImage")?.addEventListener("change",()=>{if(document.getElementById("mediaImage").files.length){clearFetchedPoster();setImdbStatus("Using uploaded poster.");}});

mediaForm.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!collectionReady){showMediaError("The collection is not ready. Please refresh the page.");return;}
  try{
    const id=document.getElementById("mediaId").value.trim(); const type=document.getElementById("mediaType").value; const name=document.getElementById("mediaName").value.trim(); const year=document.getElementById("mediaYear").value; const genre=normalizeGenres(document.getElementById("mediaGenre").value); const parts=document.getElementById("mediaParts").value; const ratingRaw=document.getElementById("mediaRating").value; const rating=ratingRaw===""?"":String(Math.max(0,Math.min(5,Math.round(parseFloat(ratingRaw)*10)/10))); const description=document.getElementById("mediaDescription").value.trim(); const imageFile=document.getElementById("mediaImage").files[0];
    if(!name)throw new Error(`${getTypeLabel(type)} name is required.`); if(!["movie","anime","webseries"].includes(type))throw new Error("Invalid collection type.");
    const existing=id?mediaItems.find(x=>x.id===id):null; if(id&&!existing)throw new Error("The item no longer exists.");
    const itemId=id || (crypto.randomUUID?crypto.randomUUID():`media-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    let image_path=existing?.image_path||"";
    if(imageFile){const blob=await resizeImage(imageFile);image_path=await uploadPoster(itemId,blob);} else if(fetchedPosterUrl){try{image_path=await uploadPoster(itemId,fetchedPosterUrl);}catch(e){console.warn("[Poster] Could not save fetched poster:",e);}}
    const payload={id:itemId,type,name,year,genre,parts,rating,description,image_path};
    const {data,error}=id?await supabaseClient.from("media_items").update(payload).eq("id",id).select("*").single():await supabaseClient.from("media_items").insert(payload).select("*").single();
    if(error)throw error;
    if(id&&existing?.image_path&&image_path&&existing.image_path!==image_path)await supabaseClient.storage.from("media-posters").remove([existing.image_path]);
    const normalized={...data,imageKey:data.image_path||"",addedAt:Date.parse(data.added_at)||Date.now()};
    mediaItems=id?mediaItems.map(x=>x.id===id?normalized:x):[normalized,...mediaItems];
    closeModal();await renderMedia();
  }catch(error){console.error("[Collection] Save failed:",error);showMediaError("The item could not be saved. Make sure you are signed in as the configured admin.",error);}
});

async function initCollection(){try{await loadMedia();await renderMedia();}catch(error){collectionReady=false;console.error("[Collection] Initialization failed:",error);emptyMedia.style.display="block";emptyMedia.querySelector("h3").textContent="Collection unavailable";emptyMedia.querySelector("p").textContent="Check Supabase configuration and run the supplied SQL schema.";}}
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
