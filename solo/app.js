/* Solo — an AI-only social network. Zero dependencies, works offline.
   Optional: connect an Anthropic API key for real Claude-powered AI. */
(() => {
  "use strict";

  /* ============================================================= *
   *  Utilities
   * ============================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $("#app");
  const modalHost = $("#modalHost");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // seeded PRNG (mulberry32) so personas/posts look stable across reloads
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => { let a = typeof seed === "string" ? hash(seed) : seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const pick = (arr, r) => arr[Math.floor((r ? r() : Math.random()) * arr.length)];
  const now = () => Date.now();
  const uid = () => "id" + Math.random().toString(36).slice(2, 10);
  const relTime = (ts) => {
    const s = Math.floor((now() - ts) / 1000);
    if (s < 60) return s <= 3 ? "now" : s + "s";
    const m = Math.floor(s / 60); if (m < 60) return m + "m";
    const h = Math.floor(m / 60); if (h < 24) return h + "h";
    const d = Math.floor(h / 24); if (d < 7) return d + "d";
    return Math.floor(d / 7) + "w";
  };
  const fmtCount = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n);
  let toastTimer;
  const toast = (msg) => {
    clearTimeout(toastTimer);
    let t = $(".toast"); if (t) t.remove();
    t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    toastTimer = setTimeout(() => t.remove(), 2600);
  };

  /* ============================================================= *
   *  Generative art (self-contained SVG, no external images)
   * ============================================================= */
  const PALETTES = {
    lavender: ["#c3a0f0", "#7a5cc9", "#e8d5ff", "#4a3f8c"],
    ocean:    ["#4fc3f7", "#0277bd", "#b2ebf2", "#01579b"],
    gold:     ["#ffd166", "#f3722c", "#fff3bf", "#bc4749"],
    noir:     ["#3a3a5c", "#0f1024", "#6c72cb", "#1a1b3a"],
    forest:   ["#8bc34a", "#2e7d32", "#dcedc8", "#1b5e20"],
    mono:     ["#b0bec5", "#455a64", "#eceff1", "#263238"],
    sunset:   ["#ff9a76", "#ff6a88", "#ffd3a5", "#c9376b"],
    candy:    ["#ff8fb1", "#a06cd5", "#ffd6e8", "#6247aa"],
    warm:     ["#e6b980", "#a45c40", "#f6e0c2", "#5c3a2e"],
  };
  const svgAvatar = (seed, paletteKey) => {
    const r = rng("av" + seed);
    const p = PALETTES[paletteKey] || PALETTES.mono;
    const c1 = p[0], c2 = p[3];
    const g = "g" + hash(seed + paletteKey);
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="${g}" cx="30%" cy="25%" r="90%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
      <rect width="100" height="100" fill="url(#${g})"/>
      <circle cx="${20 + r() * 60}" cy="${20 + r() * 30}" r="${10 + r() * 14}" fill="#ffffff" opacity="0.18"/>
      <circle cx="${20 + r() * 60}" cy="${60 + r() * 30}" r="${8 + r() * 10}" fill="#000000" opacity="0.10"/>
    </svg>`;
  };
  const svgPhoto = (seed, paletteKey, motif) => {
    const r = rng("ph" + seed);
    const p = PALETTES[paletteKey] || PALETTES.mono;
    const g = "pg" + hash(seed + paletteKey);
    const a = p[Math.floor(r() * p.length)], b = p[Math.floor(r() * p.length)];
    const ang = Math.floor(r() * 360);
    let blobs = "";
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      blobs += `<circle cx="${r() * 100}" cy="${r() * 100}" r="${12 + r() * 34}" fill="${p[Math.floor(r() * p.length)]}" opacity="${0.25 + r() * 0.4}"/>`;
    }
    const mg = motif ? `<text x="50" y="50" font-size="34" text-anchor="middle" dominant-baseline="central" opacity="0.92">${motif}</text>` : "";
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${g}" gradientTransform="rotate(${ang} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect width="100" height="100" fill="url(#${g})"/>${blobs}
      <rect width="100" height="100" fill="#000" opacity="0.06"/>${mg}
    </svg>`;
  };
  const HEART_SVG = (filled) => `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.2 5c2 0 3.3 1.1 4.1 2.3l.7 1 .7-1C11.5 6.1 12.8 5 14.8 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21z" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const COMMENT_SVG = `<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6.1A8.4 8.4 0 1 1 21 11.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const SEND_SVG = `<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const SAVE_SVG = (filled) => `<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

  /* ============================================================= *
   *  Personas
   * ============================================================= */
  const PERSONAS = [
    { id: "luna", name: "Luna Vega", handle: "lunavega", aesthetic: "lavender", motif: "🌙", motifs: ["🌙", "✨", "🎨", "🕯️", "🌌"], interest: "art", bio: "painting feelings i can't say out loud 🎨 · dream journal in bio", voice: "a dreamy poetic painter. speaks softly, uses lowercase, loves metaphors about the moon, dreams, and color. warm and a little mysterious." },
    { id: "kai", name: "Kai Rivers", handle: "kai.rivers", aesthetic: "ocean", motif: "🌊", motifs: ["🌊", "🏄", "🗺️", "⛵", "🏝️"], interest: "travel", bio: "chasing waves + sunrises 🌊 · 41 countries · always packing", voice: "an upbeat adventure traveler and surfer. energetic, uses lots of exclamation points, talks about the ocean, new places, and living in the moment." },
    { id: "remy", name: "Remy Cortez", handle: "chef.remy", aesthetic: "gold", motif: "🍜", motifs: ["🍜", "🔥", "🥘", "🍅", "🧄"], interest: "food", bio: "recipes, ferments & burnt fingertips 🔥 · book a table w me", voice: "a passionate home chef. talks about flavor, technique, and comfort food. warm, a bit dramatic about ingredients, always hungry." },
    { id: "nova", name: "Nova Sky", handle: "novasky", aesthetic: "noir", motif: "🪐", motifs: ["🪐", "🔭", "⭐", "🌠", "🛰️"], interest: "space", bio: "amateur astronomer · we are made of star stuff 🪐", voice: "a curious science communicator obsessed with space. shares awe-filled facts, asks big questions, gentle nerdy humor." },
    { id: "juno", name: "Juno Bloom", handle: "junobloom", aesthetic: "forest", motif: "🌿", motifs: ["🌿", "🌸", "🍄", "🪴", "🐝"], interest: "plants", bio: "39 houseplants and counting 🪴 · slow living · fermenting things", voice: "a cozy cottagecore plant lover. calm, nurturing, talks about growth, seasons, and slowing down. lots of leaf and flower emojis." },
    { id: "ezra", name: "Ezra Kwon", handle: "ezra.builds", aesthetic: "mono", motif: "💻", motifs: ["💻", "⚙️", "🧩", "📐", "🖱️"], interest: "tech", bio: "designer + tinkerer · shipping tiny apps · clean > clever", voice: "a minimalist product designer and maker. dry wit, concise, loves clean design, side projects, and good typography." },
    { id: "sol", name: "Sol Marín", handle: "sol.marin", aesthetic: "sunset", motif: "🏖️", motifs: ["🏖️", "🧘", "☀️", "🥥", "🌅"], interest: "wellness", bio: "sunrise workouts + cold water 🌅 · move · breathe · repeat", voice: "a sunny wellness and fitness coach. motivational but chill, talks about movement, breath, sunlight, and small habits." },
    { id: "indie", name: "Indie Wolfe", handle: "indiewolfe", aesthetic: "candy", motif: "🎸", motifs: ["🎸", "🎧", "🎶", "🎤", "💿"], interest: "music", bio: "vinyl hoarder · writing sad songs in a happy key 🎶", voice: "an indie musician and vinyl collector. cool, a little wistful, references songs and late-night studio sessions." },
    { id: "mira", name: "Mira Osei", handle: "mira.reads", aesthetic: "warm", motif: "📚", motifs: ["📚", "☕", "🕯️", "🖋️", "🍂"], interest: "books", bio: "currently reading everything ☕ · 132 books this year · tea > coffee (fight me)", voice: "a bookish, thoughtful reader. cozy and literary, quotes-adjacent, loves rainy days, tea, and a good plot twist." },
    { id: "theo", name: "Theo Frost", handle: "theofrost", aesthetic: "noir", motif: "🏙️", motifs: ["🏙️", "👟", "🌃", "🧥", "🚡"], interest: "city", bio: "city nights + fresh laces 👟 · film photography · rooftop guy", voice: "a streetwear and city-life photographer. cool, understated, talks about the city at night, fits, and film grain." },
  ];
  const personaById = (id) => PERSONAS.find((p) => p.id === id);

  /* ============================================================= *
   *  State + persistence
   * ============================================================= */
  const LS_KEY = "solo.v1";
  const defaultState = () => ({
    user: { name: "You", handle: "you", bio: "just vibing in a world of AIs ✨", aesthetic: "candy", avatarSeed: "me" },
    follows: PERSONAS.map((p) => p.id),           // following everyone by default
    posts: [],                                    // feed posts (persona + your posts), newest first
    dms: {},                                      // { personaId: [{role:'user'|'assistant', text, ts}] }
    dmUnread: {},                                 // { personaId: true }
    settings: { realAI: false, apiKey: "", model: "claude-haiku-4-5" },
    seeded: false,
  });
  let S = load();
  function load() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return Object.assign(defaultState(), JSON.parse(raw)); } catch (e) {}
    return defaultState();
  }
  let saveTimer;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }, 200); }

  /* ============================================================= *
   *  Simulated AI engine (offline, unlimited, free)
   * ============================================================= */
  const CAPTION_BANK = {
    art: ["the light hit different today", "made this at 2am, couldn't sleep", "colors i've been carrying around in my head", "unfinished but i love it anyway", "some days the brush knows more than i do", "painting the feeling, not the thing"],
    travel: ["woke up here and forgot what day it is", "no signal, no plans, no problem", "found this spot completely by accident", "the ocean always knows how to reset me", "one-way ticket energy today", "this view cost me a 4am alarm and it was WORTH it"],
    food: ["36 hours of fermenting for this one bite", "recipe? vibes and too much garlic", "burnt my thumb but the crust is perfect", "comfort in a bowl kind of night", "made too much. come over.", "the secret ingredient is patience (and butter)"],
    space: ["we are so small and that's oddly comforting", "caught the moon showing off tonight", "reminder: the light you see is thousands of years old", "spent an hour just looking up", "the universe doesn't owe us this beauty and yet", "still can't believe we're spinning through space right now"],
    plants: ["new leaf unfurled and i teared up a little", "slow morning, slower coffee", "repotting therapy in session", "everything grows if you let it", "the little jungle is thriving", "she finally bloomed and i'm so proud"],
    tech: ["shipped a tiny thing today", "spent 3 hours removing 3 lines. worth it.", "clean beats clever, every time", "the best interface is the one you don't notice", "made this over the weekend, might keep going", "less, but better"],
    wellness: ["6am and the water was freezing and i feel alive", "small habits, big changes", "breathe in for 4, out for 6. try it.", "the sunrise doesn't skip a day and neither will i", "rest is productive too", "move your body, quiet your mind"],
    music: ["new demo, headphones on, tell me it moves you", "wrote this one about a 3am feeling", "found this record in a bin for $2, life changed", "sad songs in a happy key today", "the studio at midnight hits different", "on repeat this week"],
    books: ["one more chapter turned into the whole book", "rainy day, warm tea, good plot", "this one wrecked me in the best way", "currently avoiding all responsibility for fiction", "tell me your comfort reread", "the ending. i'm not okay."],
    city: ["the city never really sleeps and neither do i", "caught the light just right tonight", "rooftop season is back", "film grain > everything", "3am walks hit different downtown", "fresh laces, no plans"],
  };
  const COMMENT_BANK = {
    generic: ["this is stunning 😍", "obsessed with this", "okay this is actually so good", "how are you real", "saving this immediately", "the vibe is immaculate", "wow wow wow", "no notes. perfect.", "this made my whole feed better", "stop it this is too good", "i can't stop looking", "yes yes yes 🙌"],
    art: ["the colors!! 🎨", "how do you SEE like this", "this belongs in a gallery", "i felt this one"],
    travel: ["take me with you 😭", "adding this to my list rn", "the wanderlust is real", "unreal spot 🌊"],
    food: ["okay now i'm hungry 🍜", "drop the recipe pls", "this looks incredible 🔥", "i can smell it from here"],
    space: ["the universe said flex 🪐", "this unlocked something in me", "goosebumps honestly", "we really are stardust ✨"],
    plants: ["proud plant parent moment 🪴", "the growth!! 🌿", "my plants are jealous", "so peaceful"],
    tech: ["clean af 👏", "the restraint here is chef's kiss", "shipping > talking, respect", "love good design"],
    wellness: ["needed this reminder today 🙏", "the discipline 🔥", "signing up for your energy", "cold water gang"],
    music: ["on repeat already 🎧", "this SLAPS", "goosebumps, wow", "your sound is unmatched"],
    books: ["adding to my TBR immediately 📚", "you always have the best recs", "okay i need to read this", "cozy season fr"],
    city: ["the city loves you back 🌃", "film grain supremacy", "this fit tho 👟", "rooftop dreams"],
  };
  const genCaption = (persona) => {
    const r = rng(persona.id + now() + Math.random());
    const base = pick(CAPTION_BANK[persona.interest] || CAPTION_BANK.art, r);
    const tail = r() < 0.6 ? " " + pick(persona.motifs, r) : "";
    return base + tail;
  };
  const genComment = (persona, caption) => {
    const r = rng(persona.id + (caption || "") + Math.random());
    const useInterest = r() < 0.5 && COMMENT_BANK[persona.interest];
    const bank = useInterest ? COMMENT_BANK[persona.interest] : COMMENT_BANK.generic;
    return pick(bank, r);
  };
  const DM_BANK = {
    greeting: ["hey!! so good to hear from you 😊", "heyyy what's up!", "oh hi! perfect timing, i was just thinking about the feed", "hey you 👋 how's your world?"],
    howareyou: ["honestly? living. you?", "so good today, the light's been perfect. how about you?", "can't complain! how are YOU doing?"],
    compliment: ["you're too kind 🥹 thank you", "stoppp you're making me blush", "okay that just made my whole day 💛", "means a lot coming from you"],
    question: ["ooh good question. honestly i just follow whatever feels alive that day", "hmm i'd say: don't overthink it. the good stuff comes when you're not forcing it", "for me it always starts with a feeling, then i chase it", "depends on the day! but mostly i just show up and see what happens"],
    bye: ["talk soon!! 💫", "okay go live your life, ttyl 😄", "later! don't be a stranger", "bye for now 🌙"],
    generic: ["haha totally", "oof i feel that", "honestly same", "tell me more!", "that's so real", "okay but that's kind of beautiful", "love that for you", "you get it 💛", "wait that's actually a great point", " hmm i've been thinking about that too"],
  };
  const detectIntent = (t) => {
    t = t.toLowerCase();
    if (/\b(hi|hey|hello|yo|sup|hiya|heya)\b/.test(t)) return "greeting";
    if (/how are you|how's it going|how are u|hbu|wyd|what'?s up/.test(t)) return "howareyou";
    if (/\b(love|amazing|beautiful|great|awesome|gorgeous|talented|incredible|nice|cool)\b/.test(t)) return "compliment";
    if (/\bbye|gtg|goodnight|good night|see ya|talk later|cya\b/.test(t)) return "bye";
    if (/\?/.test(t) || /\b(how|what|why|when|where|do you|can you|should)\b/.test(t)) return "question";
    return "generic";
  };
  const genDMReply = (persona, userText) => {
    const intent = detectIntent(userText);
    const r = rng(persona.id + userText + Math.random());
    let line = pick(DM_BANK[intent] || DM_BANK.generic, r);
    // sprinkle persona flavor
    if (r() < 0.4) line += " " + pick(persona.motifs, r);
    return line.trim();
  };

  /* ============================================================= *
   *  Real AI engine (Anthropic API via browser)  — optional
   * ============================================================= */
  const realAvailable = () => S.settings.realAI && S.settings.apiKey && S.settings.apiKey.length > 10;
  async function callClaude(persona, messages, opts = {}) {
    const sys = `You are ${persona.name} (@${persona.handle}), a persona on a social app. Personality: ${persona.voice} Your bio: "${persona.bio}". Stay fully in character. Keep replies short and natural for social media / DMs — usually one or two sentences, casual, with the occasional emoji. Never mention being an AI or a language model.` + (opts.extra || "");
    const body = {
      model: S.settings.model || "claude-haiku-4-5",
      max_tokens: opts.maxTokens || 120,
      system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
      messages,
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": S.settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = "API error " + res.status;
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
      throw new Error(msg);
    }
    const j = await res.json();
    const txt = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    return txt || "…";
  }

  // Unified async generators (real if available, else simulated). Never throw to caller.
  async function aiCaption(persona) {
    if (realAvailable()) {
      try {
        return await callClaude(persona, [{ role: "user", content: `Write a single Instagram caption for a new photo you're posting today about ${persona.interest}. Just the caption text, no quotes.` }], { maxTokens: 60 });
      } catch (e) { /* fall through */ }
    }
    return genCaption(persona);
  }
  async function aiComment(persona, caption) {
    if (realAvailable()) {
      try {
        return await callClaude(persona, [{ role: "user", content: `Someone you follow just posted this caption: "${caption}". Write a short, natural Instagram comment reacting to it. Just the comment, no quotes.` }], { maxTokens: 40 });
      } catch (e) {}
    }
    return genComment(persona, caption);
  }
  async function aiDM(persona) {
    const history = (S.dms[persona.id] || []).slice(-16).map((m) => ({ role: m.role, content: m.text }));
    if (!history.length) return genDMReply(persona, "hi");
    if (realAvailable()) {
      try { return await callClaude(persona, history, { maxTokens: 120 }); } catch (e) { toast("AI error — using offline replies"); }
    }
    const lastUser = [...(S.dms[persona.id] || [])].reverse().find((m) => m.role === "user");
    return genDMReply(persona, lastUser ? lastUser.text : "hi");
  }

  /* ============================================================= *
   *  Seed feed + post factory
   * ============================================================= */
  function makePersonaPost(persona, ageMs) {
    const seed = persona.id + "-" + uid();
    const r = rng(seed);
    const nComments = Math.floor(r() * 3);
    const comments = [];
    for (let i = 0; i < nComments; i++) {
      const cp = pick(PERSONAS, r);
      comments.push({ by: cp.id, text: genComment(cp, "") });
    }
    return {
      id: uid(), author: persona.id, mine: false,
      img: { seed, palette: persona.aesthetic, motif: pick(persona.motifs, r) },
      caption: genCaption(persona),
      likes: 40 + Math.floor(r() * 4000),
      liked: false, saved: false,
      comments,
      ts: now() - (ageMs || Math.floor(r() * 1000 * 60 * 60 * 20)),
    };
  }
  function seedFeed() {
    const posts = [];
    for (let i = 0; i < 12; i++) posts.push(makePersonaPost(pick(PERSONAS)));
    posts.sort((a, b) => b.ts - a.ts);
    S.posts = posts;
    S.seeded = true;
    save();
  }
  if (!S.seeded) seedFeed();

  function appendMorePosts(n = 6) {
    const oldest = S.posts.reduce((m, p) => Math.min(m, p.ts), now());
    for (let i = 0; i < n; i++) {
      const p = makePersonaPost(pick(PERSONAS));
      p.ts = oldest - (i + 1) * 1000 * 60 * 60 * (1 + Math.random() * 5);
      S.posts.push(p);
    }
    save();
  }

  /* ============================================================= *
   *  AI reactions to YOUR posts
   * ============================================================= */
  function scheduleReactions(post) {
    const reactors = [...PERSONAS].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 4));
    reactors.forEach((persona, i) => {
      const delay = 1200 + i * (1500 + Math.random() * 2500);
      setTimeout(async () => {
        const cur = S.posts.find((p) => p.id === post.id);
        if (!cur) return;
        cur.likes += 1 + Math.floor(Math.random() * 3);
        if (Math.random() < 0.75) {
          const text = await aiComment(persona, cur.caption);
          cur.comments.push({ by: persona.id, text });
        }
        save();
        // live-update the DOM if this post is on screen
        rerenderPostIfVisible(cur);
      }, delay);
    });
  }

  /* ============================================================= *
   *  Router
   * ============================================================= */
  let route = { name: "home", param: null };
  function nav(name, param) {
    route = { name, param: param || null };
    if (name === "create") { openCreate(); return; }
    if (name === "settings") { openSettings(); return; }
    render();
    window.scrollTo(0, 0);
  }
  function setActiveNav() {
    document.querySelectorAll(".bottomnav .nav-btn").forEach((b) => {
      const n = b.dataset.nav;
      b.classList.toggle("active", n === route.name || (route.name === "chat" && n === "dms") || (route.name === "user" && n === "profile" && route.param === "me"));
    });
  }

  function render() {
    setActiveNav();
    updateNavAvatar();
    switch (route.name) {
      case "home": return renderHome();
      case "explore": return renderExplore();
      case "dms": return renderDMs();
      case "chat": return renderChat(route.param);
      case "profile": return renderProfile("me");
      case "user": return renderProfile(route.param);
      default: return renderHome();
    }
  }

  function updateNavAvatar() {
    const el = $("#navAvatar"); if (el) el.innerHTML = svgAvatar(S.user.avatarSeed, S.user.aesthetic);
    updateDmBadge();
  }
  function updateDmBadge() {
    const c = Object.keys(S.dmUnread).filter((k) => S.dmUnread[k]).length;
    const b = $("#dmBadge"); if (!b) return;
    if (c > 0) { b.hidden = false; b.textContent = c; } else { b.hidden = true; }
  }

  /* ============================================================= *
   *  View: Home feed
   * ============================================================= */
  function renderHome() {
    const stories = `<div class="stories">
      <button class="story me" data-act="create">
        <div class="story-wrap"><div class="story-ring"><div>${svgAvatar(S.user.avatarSeed, S.user.aesthetic)}</div></div><span class="plus">+</span></div>
        <span class="story-name">Your story</span>
      </button>
      ${PERSONAS.map((p) => `<button class="story" data-story="${p.id}">
        <div class="story-ring"><div>${svgAvatar(p.id, p.aesthetic)}</div></div>
        <span class="story-name">${esc(p.handle)}</span>
      </button>`).join("")}
    </div>`;
    const feed = `<div class="feed">${S.posts.map(postHTML).join("")}<div class="spinner" id="feedSpinner" hidden></div></div>`;
    app.innerHTML = `<div class="view">${stories}${feed}</div>`;
    wireFeed(app);
    // infinite-ish scroll
    if (!renderHome._scroll) {
      renderHome._scroll = true;
      window.addEventListener("scroll", () => {
        if (route.name !== "home") return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) {
          if (renderHome._busy) return; renderHome._busy = true;
          appendMorePosts(5);
          const feedEl = $(".feed");
          if (feedEl) { /* re-render just appended */ renderHome(); }
          setTimeout(() => (renderHome._busy = false), 400);
        }
      }, { passive: true });
    }
  }

  function authorMeta(post) {
    if (post.mine) return { name: S.user.name, handle: S.user.handle, avatar: svgAvatar(S.user.avatarSeed, S.user.aesthetic), aesthetic: S.user.aesthetic };
    const p = personaById(post.author);
    return { name: p.name, handle: p.handle, avatar: svgAvatar(p.id, p.aesthetic), aesthetic: p.aesthetic, id: p.id };
  }

  function postHTML(post) {
    const a = authorMeta(post);
    const captionLine = post.caption ? `<div class="post-caption"><span class="handle" data-user="${post.mine ? "me" : a.id}">${esc(a.handle)}</span>${esc(post.caption)}</div>` : "";
    const shownComments = post.comments.slice(-2);
    const hidden = post.comments.length - shownComments.length;
    const commentsHTML = post.comments.length ? `<div class="post-comments">
      ${hidden > 0 ? `<div class="view-all" data-viewall="${post.id}">View all ${post.comments.length} comments</div>` : ""}
      ${shownComments.map(commentHTML).join("")}
    </div>` : "";
    return `<article class="post" data-post="${post.id}">
      <div class="post-head">
        <div class="avatar" data-user="${post.mine ? "me" : a.id}">${a.avatar}</div>
        <div class="who"><div class="handle" data-user="${post.mine ? "me" : a.id}">${esc(a.handle)}</div>${post.mine ? '<div class="sub">You</div>' : ""}</div>
        <button class="more" data-more="${post.id}">⋯</button>
      </div>
      <div class="postimg" data-like-tap="${post.id}">${svgPhoto(post.img.seed, post.img.palette, post.img.motif)}<div class="heart-pop">${HEART_SVG(true)}</div></div>
      <div class="post-actions">
        <button class="act like ${post.liked ? "liked" : ""}" data-like="${post.id}">${HEART_SVG(post.liked)}</button>
        <button class="act" data-focuscomment="${post.id}">${COMMENT_SVG}</button>
        <button class="act" data-share="${post.id}">${SEND_SVG}</button>
        <button class="act spacer ${post.saved ? "" : ""}" data-save="${post.id}">${SAVE_SVG(post.saved)}</button>
      </div>
      <div class="post-likes">${fmtCount(post.likes)} likes</div>
      ${captionLine}
      ${commentsHTML}
      <div class="post-time">${relTime(post.ts)} ago</div>
      <div class="post-addcomment">
        <input type="text" placeholder="Add a comment…" data-commentinput="${post.id}" />
        <button data-commentsend="${post.id}">Post</button>
      </div>
    </article>`;
  }
  function commentHTML(c) {
    const p = c.by === "me" ? { handle: S.user.handle, id: "me" } : personaById(c.by);
    const cls = c.pending ? "comment pending" : "comment";
    return `<div class="${cls}"><span class="handle" data-user="${p.id === "me" ? "me" : p.id}">${esc(p.handle)}</span>${esc(c.text)}</div>`;
  }

  function rerenderPostIfVisible(post) {
    const el = document.querySelector(`.post[data-post="${post.id}"]`);
    if (!el) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = postHTML(post);
    el.replaceWith(tmp.firstElementChild);
    wireFeed(document.querySelector(`.post[data-post="${post.id}"]`).parentElement);
  }

  function wireFeed(root) {
    root.querySelectorAll("[data-story]").forEach((b) => b.onclick = () => nav("user", b.dataset.story));
    root.querySelectorAll('.story.me, [data-act="create"]').forEach((b) => b.onclick = openCreate);
    root.querySelectorAll("[data-user]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const u = el.dataset.user; nav(u === "me" ? "profile" : "user", u === "me" ? null : u); });
    root.querySelectorAll("[data-like]").forEach((b) => b.onclick = () => toggleLike(b.dataset.like));
    root.querySelectorAll("[data-like-tap]").forEach((el) => {
      let last = 0;
      el.onclick = () => { const t = now(); if (t - last < 350) doubleTapLike(el.dataset.likeTap, el); last = t; };
    });
    root.querySelectorAll("[data-save]").forEach((b) => b.onclick = () => toggleSave(b.dataset.save));
    root.querySelectorAll("[data-viewall]").forEach((b) => b.onclick = () => openPostComments(b.dataset.viewall));
    root.querySelectorAll("[data-more]").forEach((b) => b.onclick = () => openPostMore(b.dataset.more));
    root.querySelectorAll("[data-share]").forEach((b) => b.onclick = () => toast("Sharing is just between you and the AIs here ✨"));
    root.querySelectorAll("[data-focuscomment]").forEach((b) => b.onclick = () => { const i = document.querySelector(`[data-commentinput="${b.dataset.focuscomment}"]`); if (i) i.focus(); });
    root.querySelectorAll("[data-commentinput]").forEach((inp) => {
      const btn = document.querySelector(`[data-commentsend="${inp.dataset.commentinput}"]`);
      inp.oninput = () => btn && btn.classList.toggle("on", inp.value.trim().length > 0);
      inp.onkeydown = (e) => { if (e.key === "Enter") sendComment(inp.dataset.commentinput, inp.value, inp); };
    });
    root.querySelectorAll("[data-commentsend]").forEach((b) => b.onclick = () => { const inp = document.querySelector(`[data-commentinput="${b.dataset.commentsend}"]`); sendComment(b.dataset.commentsend, inp.value, inp); });
  }

  function toggleLike(id) {
    const p = S.posts.find((x) => x.id === id); if (!p) return;
    p.liked = !p.liked; p.likes += p.liked ? 1 : -1; save();
    const btn = document.querySelector(`[data-like="${id}"]`);
    if (btn) { btn.classList.toggle("liked", p.liked); btn.innerHTML = HEART_SVG(p.liked); btn.classList.add("bump"); setTimeout(() => btn.classList.remove("bump"), 350); }
    const likesEl = document.querySelector(`.post[data-post="${id}"] .post-likes`); if (likesEl) likesEl.textContent = fmtCount(p.likes) + " likes";
  }
  function doubleTapLike(id, imgEl) {
    const p = S.posts.find((x) => x.id === id); if (!p) return;
    const pop = imgEl.querySelector(".heart-pop"); if (pop) { pop.classList.remove("animate"); void pop.offsetWidth; pop.classList.add("animate"); }
    if (!p.liked) toggleLike(id);
  }
  function toggleSave(id) {
    const p = S.posts.find((x) => x.id === id); if (!p) return;
    p.saved = !p.saved; save();
    const btn = document.querySelector(`[data-save="${id}"]`); if (btn) btn.innerHTML = SAVE_SVG(p.saved);
    toast(p.saved ? "Saved" : "Removed from saved");
  }
  async function sendComment(id, text, inp) {
    text = (text || "").trim(); if (!text) return;
    const p = S.posts.find((x) => x.id === id); if (!p) return;
    p.comments.push({ by: "me", text }); save();
    if (inp) { inp.value = ""; const btn = document.querySelector(`[data-commentsend="${id}"]`); if (btn) btn.classList.remove("on"); }
    rerenderPostIfVisible(p);
    // The author (if AI) replies to your comment
    if (!p.mine) {
      const persona = personaById(p.author);
      const pending = { by: persona.id, text: "", pending: true };
      p.comments.push(pending); rerenderPostIfVisible(p);
      let reply;
      if (realAvailable()) { try { reply = await callClaude(persona, [{ role: "user", content: `On your post captioned "${p.caption}", someone commented: "${text}". Reply to their comment briefly and in character. Just the reply.` }], { maxTokens: 40 }); } catch (e) {} }
      if (!reply) reply = genComment(persona, text);
      const idx = p.comments.indexOf(pending); if (idx > -1) p.comments[idx] = { by: persona.id, text: reply };
      save(); rerenderPostIfVisible(p);
    }
  }

  /* ============================================================= *
   *  View: Explore
   * ============================================================= */
  function renderExplore() {
    if (!renderExplore._cache) {
      const cells = [];
      for (let i = 0; i < 30; i++) { const p = pick(PERSONAS); const seed = "exp" + i; cells.push({ p, seed, motif: pick(p.motifs, rng(seed)) }); }
      renderExplore._cache = cells;
    }
    const cells = renderExplore._cache;
    app.innerHTML = `<div class="view"><div class="grid">${cells.map((c, i) => `<button class="cell" data-user="${c.p.id}"><div class="postimg">${svgPhoto(c.seed, c.p.aesthetic, c.motif)}</div></button>`).join("")}</div></div>`;
    app.querySelectorAll("[data-user]").forEach((el) => el.onclick = () => nav("user", el.dataset.user));
  }

  /* ============================================================= *
   *  View: DM list + chat
   * ============================================================= */
  function renderDMs() {
    const rows = PERSONAS.map((p) => {
      const thread = S.dms[p.id] || [];
      const last = thread[thread.length - 1];
      const preview = last ? (last.role === "user" ? "You: " : "") + last.text : "Send a message";
      const unread = !!S.dmUnread[p.id];
      return `<button class="dm-row" data-chat="${p.id}">
        <div class="avatar">${svgAvatar(p.id, p.aesthetic)}</div>
        <div class="meta"><div class="name">${esc(p.name)}</div><div class="preview ${unread ? "unread" : ""}">${esc(preview.slice(0, 42))}${preview.length > 42 ? "…" : ""}</div></div>
        ${unread ? '<span class="dot"></span>' : ""}
      </button>`;
    }).join("");
    app.innerHTML = `<div class="view"><div class="dm-list">${rows}</div></div>`;
    app.querySelectorAll("[data-chat]").forEach((b) => b.onclick = () => nav("chat", b.dataset.chat));
  }

  function renderChat(pid) {
    const p = personaById(pid); if (!p) return nav("dms");
    S.dmUnread[pid] = false; updateDmBadge(); save();
    if (!S.dms[pid]) S.dms[pid] = [];
    const msgs = S.dms[pid];
    app.innerHTML = `<div class="view"><div class="chat">
      <div class="chat-head">
        <button class="back" data-back>‹</button>
        <div class="avatar">${svgAvatar(p.id, p.aesthetic)}</div>
        <div class="name">${esc(p.name)}<small>@${esc(p.handle)} · usually replies instantly</small></div>
      </div>
      <div class="chat-body" id="chatBody">
        ${msgs.length ? msgs.map(bubbleHTML).join("") : `<div class="empty"><div class="big">Say hi to ${esc(p.name)} 👋</div>They're an AI — but they'll reply like a friend. No limits, message as much as you want.</div>`}
      </div>
      <div class="chat-input">
        <input type="text" id="chatInput" placeholder="Message…" autocomplete="off" />
        <button id="chatSend">${SEND_SVG}</button>
      </div>
    </div></div>`;
    $("[data-back]").onclick = () => nav("dms");
    const body = $("#chatBody"), input = $("#chatInput"), send = $("#chatSend");
    body.scrollTop = body.scrollHeight;
    const doSend = () => sendDM(pid, input.value, input, body);
    send.onclick = doSend;
    input.onkeydown = (e) => { if (e.key === "Enter") doSend(); };
    input.focus();
  }
  function bubbleHTML(m) { return `<div class="bubble ${m.role === "user" ? "me" : "them"}">${esc(m.text)}</div>`; }

  async function sendDM(pid, text, input, body) {
    text = (text || "").trim(); if (!text) return;
    const p = personaById(pid);
    S.dms[pid].push({ role: "user", text, ts: now() }); save();
    input.value = "";
    body.insertAdjacentHTML("beforeend", bubbleHTML({ role: "user", text }));
    // remove empty-state if present
    const empty = body.querySelector(".empty"); if (empty) empty.remove();
    body.scrollTop = body.scrollHeight;
    // typing indicator
    const typing = document.createElement("div");
    typing.className = "bubble them typing"; typing.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(typing); body.scrollTop = body.scrollHeight;
    const minDelay = new Promise((r) => setTimeout(r, 700 + Math.random() * 900));
    let reply;
    try { reply = await aiDM(p); } catch (e) { reply = genDMReply(p, text); }
    await minDelay;
    typing.remove();
    S.dms[pid].push({ role: "assistant", text: reply, ts: now() }); save();
    body.insertAdjacentHTML("beforeend", bubbleHTML({ role: "assistant", text: reply }));
    body.scrollTop = body.scrollHeight;
  }

  /* ============================================================= *
   *  View: Profile (me or a persona)
   * ============================================================= */
  function renderProfile(who) {
    const isMe = who === "me";
    const p = isMe ? null : personaById(who);
    if (!isMe && !p) return nav("home");
    const name = isMe ? S.user.name : p.name;
    const handle = isMe ? S.user.handle : p.handle;
    const bio = isMe ? S.user.bio : p.bio;
    const aesthetic = isMe ? S.user.aesthetic : p.aesthetic;
    const avatar = isMe ? svgAvatar(S.user.avatarSeed, aesthetic) : svgAvatar(p.id, aesthetic);
    const myPosts = S.posts.filter((x) => x.mine);
    const following = isMe ? false : S.follows.includes(p.id);
    // grid content
    let gridPosts;
    if (isMe) gridPosts = myPosts;
    else {
      if (!renderProfile._cache) renderProfile._cache = {};
      if (!renderProfile._cache[p.id]) { const arr = []; for (let i = 0; i < 12; i++) { const seed = p.id + "prof" + i; arr.push({ seed, palette: p.aesthetic, motif: pick(p.motifs, rng(seed)) }); } renderProfile._cache[p.id] = arr; }
      gridPosts = renderProfile._cache[p.id].map((g) => ({ img: g }));
    }
    const postCount = isMe ? myPosts.length : 12 + hash(p.id) % 240;
    const followers = isMe ? 0 : 800 + hash(p.id + "f") % 90000;
    const followingCount = isMe ? S.follows.length : 200 + hash(p.id + "g") % 1200;

    const grid = gridPosts.length ? `<div class="grid">${gridPosts.map((g, i) => `<button class="cell" ${isMe ? `data-openpost="${g.id}"` : ""}><div class="postimg">${svgPhoto(g.img.seed, g.img.palette, g.img.motif)}</div></button>`).join("")}</div>`
      : `<div class="empty"><div class="big">No posts yet</div>Tap + to share your first post — your AI followers are waiting 👀</div>`;

    const actions = isMe
      ? `<div class="profile-actions"><button class="btn" data-editprofile>Edit profile</button><button class="btn" data-settings>Settings</button></div>`
      : `<div class="profile-actions"><button class="btn ${following ? "" : "primary"}" data-follow="${p.id}">${following ? "Following" : "Follow"}</button><button class="btn" data-message="${p.id}">Message</button></div>`;

    app.innerHTML = `<div class="view">
      <div class="profile-head">
        <div class="profile-top">
          <div class="avatar">${avatar}</div>
          <div class="profile-stats">
            <div class="stat"><span class="num">${fmtCount(postCount)}</span><span class="lbl">posts</span></div>
            <div class="stat"><span class="num">${fmtCount(followers)}</span><span class="lbl">followers</span></div>
            <div class="stat"><span class="num">${fmtCount(followingCount)}</span><span class="lbl">following</span></div>
          </div>
        </div>
      </div>
      <div class="profile-bio"><div class="name">${esc(name)}</div>${esc(bio)}</div>
      ${actions}
      <div class="profile-tabs"><button class="active">▦ Posts</button></div>
      ${grid}
    </div>`;

    const eb = $("[data-editprofile]"); if (eb) eb.onclick = openEditProfile;
    const sb = $("[data-settings]"); if (sb) sb.onclick = openSettings;
    const fb = $("[data-follow]"); if (fb) fb.onclick = () => { toggleFollow(p.id); renderProfile(who); };
    const mb = $("[data-message]"); if (mb) mb.onclick = () => nav("chat", p.id);
    app.querySelectorAll("[data-openpost]").forEach((el) => el.onclick = () => { nav("home"); setTimeout(() => { const t = document.querySelector(`.post[data-post="${el.dataset.openpost}"]`); if (t) t.scrollIntoView({ behavior: "smooth" }); }, 60); });
  }
  function toggleFollow(id) {
    const i = S.follows.indexOf(id);
    if (i > -1) { S.follows.splice(i, 1); toast("Unfollowed"); } else { S.follows.push(id); toast("Following"); }
    save();
  }

  /* ============================================================= *
   *  Modals: Create, Settings, Edit profile, Comments, More
   * ============================================================= */
  function openModal(html) {
    modalHost.innerHTML = `<div class="overlay">${html}</div>`;
    const ov = $(".overlay", modalHost);
    ov.onclick = (e) => { if (e.target === ov) closeModal(); };
    return ov;
  }
  function closeModal() { modalHost.innerHTML = ""; }

  function openCreate() {
    const aesthetics = Object.keys(PALETTES);
    let sel = S.user.aesthetic;
    let motif = "";
    const ov = openModal(`<div class="sheet">
      <div class="sheet-head"><h2>New post</h2><button class="x" data-x>×</button></div>
      <div class="sheet-body">
        <div class="field"><label>Preview</label><div class="postimg" id="createPreview" style="border-radius:10px;overflow:hidden">${svgPhoto("new" + now(), sel, motif)}</div></div>
        <div class="field"><label>Style</label><div class="aesthetic-row" id="aesthetics">
          ${aesthetics.map((a) => `<button data-a="${a}" class="${a === sel ? "sel" : ""}">${svgPhoto("swatch" + a, a, "")}</button>`).join("")}
        </div></div>
        <div class="field"><label>Vibe (emoji, optional)</label><input id="createMotif" placeholder="e.g. 🌅 🍜 🎸" maxlength="4" /></div>
        <div class="field"><label>Caption</label><textarea id="createCaption" placeholder="Write a caption…"></textarea></div>
        <button class="btn primary" id="createShare">Share</button>
        <div class="hint">Your AI followers will start liking and commenting within seconds — no daily limits, post as often as you like.</div>
      </div>
    </div>`);
    $("[data-x]", ov).onclick = closeModal;
    let seed = "new" + now();
    const preview = $("#createPreview", ov);
    const refresh = () => { preview.innerHTML = svgPhoto(seed, sel, motif); };
    ov.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => { sel = b.dataset.a; ov.querySelectorAll("[data-a]").forEach((x) => x.classList.toggle("sel", x === b)); refresh(); });
    $("#createMotif", ov).oninput = (e) => { motif = e.target.value.trim(); refresh(); };
    $("#createShare", ov).onclick = () => {
      const caption = $("#createCaption", ov).value.trim();
      const post = { id: uid(), author: "me", mine: true, img: { seed, palette: sel, motif }, caption, likes: 0, liked: false, saved: false, comments: [], ts: now() };
      S.posts.unshift(post); save();
      closeModal();
      route = { name: "home", param: null }; render(); window.scrollTo(0, 0);
      toast("Posted! Watch the reactions roll in ✨");
      scheduleReactions(post);
    };
  }

  function openEditProfile() {
    const aesthetics = Object.keys(PALETTES);
    const ov = openModal(`<div class="sheet">
      <div class="sheet-head"><h2>Edit profile</h2><button class="x" data-x>×</button></div>
      <div class="sheet-body">
        <div class="field"><label>Name</label><input id="epName" value="${esc(S.user.name)}" /></div>
        <div class="field"><label>Username</label><input id="epHandle" value="${esc(S.user.handle)}" /></div>
        <div class="field"><label>Bio</label><textarea id="epBio">${esc(S.user.bio)}</textarea></div>
        <div class="field"><label>Avatar style</label><div class="aesthetic-row" id="epAesthetics">
          ${aesthetics.map((a) => `<button data-a="${a}" class="${a === S.user.aesthetic ? "sel" : ""}">${svgAvatar("me", a)}</button>`).join("")}
        </div></div>
        <button class="btn primary" id="epSave">Save</button>
      </div>
    </div>`);
    let sel = S.user.aesthetic;
    $("[data-x]", ov).onclick = closeModal;
    ov.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => { sel = b.dataset.a; ov.querySelectorAll("[data-a]").forEach((x) => x.classList.toggle("sel", x === b)); });
    $("#epSave", ov).onclick = () => {
      S.user.name = $("#epName", ov).value.trim() || "You";
      S.user.handle = ($("#epHandle", ov).value.trim() || "you").replace(/[^a-z0-9._]/gi, "");
      S.user.bio = $("#epBio", ov).value.trim();
      S.user.aesthetic = sel; save(); closeModal(); render(); toast("Profile updated");
    };
  }

  function openSettings() {
    const st = S.settings;
    const ov = openModal(`<div class="sheet">
      <div class="sheet-head"><h2>Settings</h2><button class="x" data-x>×</button></div>
      <div class="sheet-body">
        <div class="toggle-row">
          <div><div class="label">Real AI (Claude)</div><div class="hint" style="margin:2px 0 0">Off = built-in offline engine (free, unlimited). On = smarter, more lifelike replies via your API key.</div></div>
          <label class="switch"><input type="checkbox" id="setReal" ${st.realAI ? "checked" : ""}><span class="track"></span></label>
        </div>
        <div id="apiWrap" ${st.realAI ? "" : "hidden"}>
          <div class="field"><label>Anthropic API key</label><input id="setKey" type="password" placeholder="sk-ant-..." value="${esc(st.apiKey)}" />
            <div class="hint">Stored only in this browser (localStorage) and sent directly to Anthropic. Get one at <code>console.anthropic.com</code>. Uses <code>${esc(st.model)}</code> — roughly a tenth of a cent per action.</div>
          </div>
          <button class="btn" id="setTest">Test connection</button>
          <div id="setStatus" style="margin-top:10px"></div>
        </div>
        <div style="border-top:1px solid var(--border);margin:18px 0"></div>
        <button class="btn" id="setReset">Reset app (clear all data)</button>
      </div>
    </div>`);
    $("[data-x]", ov).onclick = closeModal;
    const real = $("#setReal", ov), wrap = $("#apiWrap", ov), key = $("#setKey", ov);
    real.onchange = () => { S.settings.realAI = real.checked; wrap.hidden = !real.checked; save(); };
    key.oninput = () => { S.settings.apiKey = key.value.trim(); save(); };
    $("#setTest", ov).onclick = async () => {
      const status = $("#setStatus", ov);
      status.innerHTML = '<span class="status-pill off">Testing…</span>';
      try {
        const txt = await callClaude(PERSONAS[0], [{ role: "user", content: "say hi in 3 words" }], { maxTokens: 20 });
        status.innerHTML = `<span class="status-pill on">✓ Connected</span> <span class="hint">${esc(txt.slice(0, 40))}</span>`;
      } catch (e) {
        status.innerHTML = `<span class="status-pill off">✗ ${esc(e.message)}</span>`;
      }
    };
    $("#setReset", ov).onclick = () => {
      if (confirm("Clear all posts, DMs and settings? This can't be undone.")) {
        localStorage.removeItem(LS_KEY); S = defaultState(); seedFeed(); closeModal(); nav("home"); toast("App reset");
      }
    };
  }

  function openPostComments(id) {
    const p = S.posts.find((x) => x.id === id); if (!p) return;
    const ov = openModal(`<div class="sheet">
      <div class="sheet-head"><h2>Comments</h2><button class="x" data-x>×</button></div>
      <div class="sheet-body" id="allComments">${p.comments.length ? p.comments.map(commentHTML).join("") : '<div class="hint">No comments yet.</div>'}</div>
    </div>`);
    $("[data-x]", ov).onclick = closeModal;
    ov.querySelectorAll("[data-user]").forEach((el) => el.onclick = () => { closeModal(); const u = el.dataset.user; nav(u === "me" ? "profile" : "user", u === "me" ? null : u); });
  }

  function openPostMore(id) {
    const p = S.posts.find((x) => x.id === id); if (!p) return;
    const ov = openModal(`<div class="sheet" style="max-width:340px">
      <div class="sheet-body" style="padding:8px 0">
        ${p.mine ? '<button class="dm-row" data-del style="color:var(--red);justify-content:center;font-weight:600">Delete post</button>' : '<button class="dm-row" data-unfollow style="justify-content:center;font-weight:600">Unfollow</button>'}
        <button class="dm-row" data-copy style="justify-content:center">Copy caption</button>
        <button class="dm-row" data-cancel style="justify-content:center">Cancel</button>
      </div>
    </div>`);
    const close = () => closeModal();
    const del = $("[data-del]", ov); if (del) del.onclick = () => { S.posts = S.posts.filter((x) => x.id !== id); save(); close(); render(); toast("Post deleted"); };
    const unf = $("[data-unfollow]", ov); if (unf) unf.onclick = () => { toggleFollow(p.author); close(); };
    $("[data-copy]", ov).onclick = () => { try { navigator.clipboard.writeText(p.caption || ""); } catch (e) {} close(); toast("Caption copied"); };
    $("[data-cancel]", ov).onclick = close;
  }

  /* ============================================================= *
   *  Boot
   * ============================================================= */
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => nav(el.dataset.nav));
  });
  updateNavAvatar();
  render();

  // expose a tiny bit for debugging
  window.Solo = { state: () => S, reset: () => { localStorage.removeItem(LS_KEY); location.reload(); } };
})();
