/* ================================================================
   VELNORA — Comportements JS partagés, produit voyageur
   Deux fonctions communes à plusieurs écrans, isolées ici pour
   éviter la duplication (identique auparavant sur 5 écrans).
   ================================================================ */

/**
 * Préchargement des écrans de destination — remplace <link rel="prefetch">,
 * qui n'est supporté par AUCUNE version de Safari (bureau ou iOS, vérifié :
 * caniuse.com/link-rel-prefetch, statut WebKit inchangé). Un fetch() classique
 * déclenche en revanche une requête réseau normale, mise en cache HTTP comme
 * n'importe quelle navigation — fonctionne dans tous les navigateurs, Safari
 * inclus, sans dépendre d'une fonctionnalité expérimentale.
 *
 * Deux déclencheurs, complémentaires :
 * 1. velnoraPrefetch(url) — appel explicite (écran d'intro → écran d'accueil,
 *    hub d'accueil → tous ses écrans de destination, dès que le navigateur
 *    est inactif). Couvre les trajets prévisibles.
 * 2. Écouteur global sur touchstart/mousedown — dès que le doigt touche un
 *    élément de nav (onclick="location.href=...'"), on lance le fetch AVANT
 *    même la navigation (le tap complet prend 100-300ms, largement de quoi
 *    récupérer un document de quelques Ko). Couvre tout le reste sans avoir
 *    à lister chaque lien manuellement sur chaque écran.
 */
const velnoraPrefetched = new Set();
function velnoraPrefetch(url){
  if (!url || velnoraPrefetched.has(url)) return;
  velnoraPrefetched.add(url);
  fetch(url, { credentials: 'same-origin' }).catch(() => {});
}

document.addEventListener('touchstart', function(e){
  const el = e.target.closest('[onclick*="location.href"]');
  if (!el) return;
  const match = el.getAttribute('onclick').match(/location\.href\s*=\s*'([^']+)'/);
  if (match) velnoraPrefetch(match[1]);
}, { passive: true });

document.addEventListener('mousedown', function(e){
  const el = e.target.closest('[onclick*="location.href"]');
  if (!el) return;
  const match = el.getAttribute('onclick').match(/location\.href\s*=\s*'([^']+)'/);
  if (match) velnoraPrefetch(match[1]);
});

/**
 * Active la pseudo-classe :active au tap sur iOS Safari (qui l'ignore sans
 * écouteur tactile enregistré) — condition nécessaire au retour tactile
 * (compression douce) défini dans velnora-shared.css sur tous les écrans.
 */
document.addEventListener('touchstart', function(){}, {passive:true});

/**
 * Révélation au scroll des blocs marqués .enter (fondu + léger déplacement),
 * plutôt qu'une apparition figée au chargement de la page. Auto-actif sur
 * tous les écrans qui chargent ce fichier, sans appel explicite requis.
 * Repli silencieux : si IntersectionObserver est indisponible, le contenu
 * reste visible immédiatement (voir .no-js dans velnora-shared.css).
 */
(function velnoraReveal(){
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.add('no-js');
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });

  function observeAll(){
    document.querySelectorAll('.enter').forEach(el => io.observe(el));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeAll);
  } else {
    observeAll();
  }
})();

/**
 * Recul discret de la back-affordance au défilement vers le bas,
 * réapparition immédiate au moindre geste vers le haut.
 * Réservé aux écrans à défilement long (Guide pratique, La propriété,
 * Recommandations, Contacts utiles, Check-in/Check-out).
 * Les écrans courts (Wi-Fi & Accès, Départ) gardent la back-affordance
 * fixe en permanence et n'appellent pas cette fonction.
 */
function initBackAffordance(){
  const scroller = document.getElementById('scroll');
  const back = document.getElementById('back');
  if (!scroller || !back) return;
  const isNormalPageMode = () => window.matchMedia('(max-width:600px)').matches;
  let lastY = 0, accum = 0, ticking = false;
  function handleScroll(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      let y = isNormalPageMode() ? (window.scrollY || document.documentElement.scrollTop) : scroller.scrollTop;
      y = Math.max(0, y);
      const delta = y - lastY;
      accum += delta;
      if (y <= 40){ back.classList.remove('receded'); accum = 0; }
      else if (accum > 24){ back.classList.add('receded'); accum = 0; }
      else if (accum < -24){ back.classList.remove('receded'); accum = 0; }
      lastY = y;
      ticking = false;
    });
  }
  scroller.addEventListener('scroll', handleScroll, {passive:true});
  window.addEventListener('scroll', handleScroll, {passive:true});
}

/**
 * Copie la valeur affichée dans une .copy-row (Wi-Fi, mot de passe, code
 * du portail…) dans le presse-papier, avec retour visuel (pastille
 * "Copier" → coche, ~1.4s) et vibration légère si l'appareil l'expose.
 * Usage : onclick="copyValue(this)" sur le conteneur .copy-row.
 */
function copyValue(row){
  const valueEl = row.querySelector('.val');
  const pillEl = row.querySelector('.copy-pill');
  if (!valueEl) return;
  const text = valueEl.textContent.trim();
  const originalLabel = pillEl ? pillEl.textContent : '';

  const showCopied = () => {
    row.classList.add('copied');
    if (pillEl) pillEl.textContent = 'Copié';
    if (navigator.vibrate) navigator.vibrate(8);
    clearTimeout(row._copyTimeout);
    row._copyTimeout = setTimeout(() => {
      row.classList.remove('copied');
      if (pillEl) pillEl.textContent = originalLabel || 'Copier';
    }, 1400);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showCopied).catch(() => {
      // Repli silencieux si l'API Clipboard est indisponible (contexte non sécurisé, permission refusée…)
      showCopied();
    });
  } else {
    showCopied();
  }
}

/**
 * Accordéon : un seul acc-item ouvert à la fois, l'ouverture d'un
 * nouveau sujet referme automatiquement le précédent.
 * Usage : onclick="toggleAccordion(this)" sur le conteneur .acc-item
 * (Check-in/Check-out) ou son en-tête .acc-head (Guide pratique).
 */
function toggleAccordion(trigger){
  const item = trigger.classList.contains('acc-item') ? trigger : trigger.closest('.acc-item');
  if (!item) return;
  const already = item.classList.contains('open');
  item.parentElement.querySelectorAll('.acc-item').forEach(i => i.classList.remove('open'));
  if (!already) item.classList.add('open');
  if (navigator.vibrate) navigator.vibrate(5);
}

/**
 * Partage natif des identifiants Wi-Fi via la feuille de partage du
 * système (Web Share API — Safari iOS, Chrome Android). Repli : copie
 * combinée réseau + mot de passe dans le presse-papier, même retour
 * visuel que copyValue(), si l'appareil n'expose pas navigator.share.
 * Usage : onclick="shareWifi(this, 'Villa-Aurea', 'Aurea2026')".
 */
function shareWifi(btn, ssid, password){
  const text = `Wi-Fi Villa Aurea\nRéseau : ${ssid}\nMot de passe : ${password}`;

  if (navigator.share) {
    navigator.share({ title: 'Wi-Fi Villa Aurea', text }).catch(() => {
      // Annulation par l'utilisateur (bouton natif "Annuler") — pas une erreur, aucun repli nécessaire.
    });
    return;
  }

  const original = btn ? btn.textContent : '';
  navigator.clipboard && navigator.clipboard.writeText(text).then(() => {
    if (navigator.vibrate) navigator.vibrate(8);
    if (btn){
      btn.textContent = 'Copié';
      setTimeout(() => { btn.textContent = original; }, 1400);
    }
  });
}

/**
 * Formate une plage de séjour (arrivée → départ) dans un style éditorial
 * discret : "12 → 18 août" si même mois, "28 août → 3 septembre" sinon.
 * Retourne null si les dates sont absentes ou invalides — l'appelant
 * décide alors de ne rien afficher plutôt que d'afficher un espace vide.
 * Usage : formatStayRange('2026-08-12', '2026-08-18').
 */
function formatStayRange(arrivalISO, departureISO){
  try{
    const a = new Date(arrivalISO + 'T00:00:00');
    const d = new Date(departureISO + 'T00:00:00');
    if (isNaN(a) || isNaN(d)) return null;
    const sameMonth = a.getMonth() === d.getMonth() && a.getFullYear() === d.getFullYear();
    const start = new Intl.DateTimeFormat('fr-FR', sameMonth ? { day:'numeric' } : { day:'numeric', month:'long' }).format(a);
    const end = new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long' }).format(d);
    return `${start} → ${end}`;
  }catch(e){ return null; }
}

/**
 * Avant-séjour — l'accès à l'expérience s'ouvre à 8h00 la veille du
 * jour de l'arrivée (pour couvrir le cas d'un voyageur en avance).
 * Avant ce cap, l'accès est bloqué par un écran plein écran
 * non-interactif (voir enforceStayGate ci-dessous).
 * Retourne false si la date est absente ou invalide (repli silencieux).
 * Usage : isStayNotStarted(guest.arrival).
 */
function isStayNotStarted(arrivalISO){
  try{
    if (!arrivalISO) return false;
    const gate = new Date(arrivalISO + 'T08:00:00');
    if (isNaN(gate)) return false;
    gate.setDate(gate.getDate() - 1);
    return new Date() < gate;
  }catch(e){ return false; }
}

/**
 * Fin de séjour — le séjour est considéré terminé à 12h00 (heure de
 * départ) le jour du check-out. Passé ce cap, l'accès est bloqué par un
 * écran plein écran non-interactif (voir enforceStayGate ci-dessous).
 * Retourne false si la date est absente ou invalide (repli silencieux).
 * Usage : isStayEnded(guest.departure).
 */
function isStayEnded(departureISO){
  try{
    if (!departureISO) return false;
    const gate = new Date(departureISO + 'T12:00:00');
    if (isNaN(gate)) return false;
    return new Date() > gate;
  }catch(e){ return false; }
}

/**
 * Applique le blocage d'accès si le séjour est terminé : superpose un
 * écran plein écran non-interactif sur tout le contenu de la page,
 * quelle que soit la page ouverte (script partagé, chargé partout).
 */
(function enforceStayGate(){
  let guest = null;
  try{ guest = JSON.parse(localStorage.getItem('velnoraGuest') || 'null'); }catch(e){}
  if (!guest) return;

  const ended = guest.departure && isStayEnded(guest.departure);
  const notStarted = !ended && guest.arrival && isStayNotStarted(guest.arrival);
  if (!ended && !notStarted) return;

  let title, sub;
  if (ended){
    const d = new Date(guest.departure + 'T00:00:00');
    const formatted = !isNaN(d) ? new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long' }).format(d) : null;
    title = 'Votre séjour à la Villa Aurea s’est achevé.';
    sub = formatted ? ('Cette expérience vous était réservée jusqu\'au ' + formatted + ' à 12h00.') : '';
  } else {
    const a = new Date(guest.arrival + 'T00:00:00');
    let formatted = null;
    if (!isNaN(a)){
      const veille = new Date(a);
      veille.setDate(veille.getDate() - 1);
      formatted = new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long' }).format(veille);
    }
    title = 'Votre séjour à la Villa Aurea n’a pas encore commencé.';
    sub = formatted ? ('Cette expérience s\'ouvre le ' + formatted + ' à partir de 8h00.') : '';
  }

  const overlay = document.createElement('div');
  overlay.setAttribute('style', 'position:fixed;inset:0;z-index:9999;background:#0d0c0b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:24px;text-align:center;');
  overlay.innerHTML =
    '<svg viewBox="0 0 100 100" width="40" height="40" fill="none" stroke="#efece5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="5" y="3" width="90" height="94" rx="16" ry="16"/><path d="M27,15 L50,82 L73,15"/></svg>'
    + '<div style="font-family:-apple-system,\'Helvetica Neue\',Arial,sans-serif;color:#efece5;font-size:17px;font-weight:500;max-width:320px;">' + title + '</div>'
    + (sub ? '<div style="font-family:-apple-system,\'Helvetica Neue\',Arial,sans-serif;color:#8f887a;font-size:13px;max-width:300px;">' + sub + '</div>' : '')
    + (ended ? '<a href="#" id="velnoraResetStay" style="font-family:-apple-system,\'Helvetica Neue\',Arial,sans-serif;color:#c7ad82;font-size:12.5px;letter-spacing:.02em;text-decoration:underline;text-underline-offset:3px;margin-top:6px;">Vous revenez à la Villa Aurea ?</a>' : '');

  document.documentElement.style.overflow = 'hidden';
  if (document.body) document.body.appendChild(overlay);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));

  if (ended){
    const resetLink = overlay.querySelector('#velnoraResetStay');
    if (resetLink) resetLink.addEventListener('click', function(e){
      e.preventDefault();
      try{ localStorage.removeItem('velnoraGuest'); }catch(err){}
      window.location.href = '00-intro.html';
    });
  }
})();

/**
 * Météo réelle — remplace la puce statique de l'Accueil par la
 * température et la condition réelles de la propriété (Open-Meteo,
 * aucune clé requise). Icônes construites sur la même grammaire que le
 * reste du système (trait 2px, contour seul) — six conditions couvertes :
 * soleil, nuageux, couvert, pluie, orage, brouillard.
 * Usage : initWeather(latitude, longitude) sur l'écran Accueil uniquement.
 */
function initWeather(lat, lon){
  const chip = document.getElementById('weatherChip');
  if (!chip) return;

  const ICONS = {
    sun:   '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 12.06 4 4 0 0 0 7 18z"/>',
    rain:  '<path d="M7 15h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.4.9A4 4 0 0 0 7 15z"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>',
    storm: '<path d="M7 13h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.4.9A4 4 0 0 0 7 13z"/><path d="M13 13l-3 5h3l-2 4"/>',
    fog:   '<path d="M4 10h13M6 14h14M4 18h13" />'
  };

  // Codes météo (norme WMO, utilisée par Open-Meteo) regroupés en six conditions.
  function condFromCode(code){
    if ([0].includes(code)) return 'sun';
    if ([1,2].includes(code)) return 'sun';
    if ([3].includes(code)) return 'cloud';
    if ([45,48].includes(code)) return 'fog';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
    if ([71,73,75,77,85,86].includes(code)) return 'rain';
    if ([95,96,99].includes(code)) return 'storm';
    return 'sun';
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;

  fetch(url).then(r => r.ok ? r.json() : Promise.reject()).then(data => {
    const cur = data && data.current;
    if (!cur) return;
    const temp = Math.round(cur.temperature_2m);
    const cond = condFromCode(cur.weather_code);
    const svg = chip.querySelector('svg');
    const label = chip.querySelector('.wc-temp');
    if (svg) svg.innerHTML = ICONS[cond] || ICONS.sun;
    if (label) label.textContent = temp + '°';
    chip.classList.add('live');
  }).catch(() => {
    // Repli silencieux : la puce garde sa valeur de secours déjà présente dans le HTML.
  });
}

/**
 * Ouverture native de l'application de cartes du système (Apple Plans
 * sur iOS/macOS Safari, Google Maps ailleurs) plutôt qu'un lien web
 * générique — comportement déjà validé dans les écrans de référence.
 * Usage : onclick="openInMaps(lat, lon, 'Nom du lieu')" (event bloqué,
 * lat/lon en dur pour la propriété pilote).
 */
function openInMaps(lat, lon, label){
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document || /iPad|iPhone|iPod/.test(navigator.userAgent);
  const query = encodeURIComponent(label || '');
  const url = isApple
    ? `https://maps.apple.com/?ll=${lat},${lon}&q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
  window.open(url, '_blank', 'noopener');
}

/**
 * Remplit chaque barre d'étoiles proportionnellement à sa note réelle
 * (ex. 4.6/5 = 92% d'or). Usage : initStarRatings() une fois au chargement.
 */
function initStarRatings(){
  document.querySelectorAll('.stars[data-rating]').forEach(el => {
    const rating = parseFloat(el.getAttribute('data-rating')) || 0;
    const pct = Math.max(0, Math.min(100, (rating/5)*100));
    const fg = el.querySelector('.stars-fg');
    if (fg) fg.style.width = pct + '%';
  });
}

/**
 * Recommandations locales — onglets de catégorie (filtre les cartes) +
 * carte interactive (Leaflet, fond de carte sombre) dont les repères
 * suivent le filtre actif. Un tap sur un repère ouvre l'itinéraire natif.
 * Les entrées sans coordonnées (ex. service sur demande) n'ont simplement
 * pas de repère sur la carte.
 * Usage : initRecommandations() une fois, après le chargement du DOM.
 */
function initRecommandations(){
  const tabs = document.querySelectorAll('.rec-tab');
  const cards = document.querySelectorAll('.p-card');
  const empty = document.getElementById('recEmpty');
  const mapEl = document.getElementById('recMap');
  if (!tabs.length || !mapEl || typeof L === 'undefined') return;

  const map = L.map('recMap', { zoomControl:false, attributionControl:true, scrollWheelZoom:false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  const markers = [];
  cards.forEach(card => {
    const lat = parseFloat(card.dataset.lat), lon = parseFloat(card.dataset.lon);
    if (isNaN(lat) || isNaN(lon)) return;
    const icon = L.divIcon({ className: 'vln-pin-wrap', html: '<div class="vln-pin"></div>', iconSize:[10,10] });
    const marker = L.marker([lat, lon], { icon }).addTo(map);
    marker.on('click', () => openInMaps(lat, lon, card.dataset.name || ''));
    marker._cat = card.dataset.cat;
    markers.push(marker);
  });

  function fitToVisible(){
    const visible = markers.filter(m => map.hasLayer(m));
    if (!visible.length) return;
    const group = L.featureGroup(visible);
    map.fitBounds(group.getBounds().pad(0.35), { maxZoom: 13 });
  }

  function applyFilter(cat){
    let anyVisible = false;
    cards.forEach(card => {
      const match = cat === 'all' || card.dataset.cat === cat;
      card.style.display = match ? '' : 'none';
      if (match) { anyVisible = true; card.classList.add('in-view'); }
    });
    markers.forEach(m => {
      const match = cat === 'all' || m._cat === cat;
      if (match) { if (!map.hasLayer(m)) m.addTo(map); }
      else { if (map.hasLayer(m)) map.removeLayer(m); }
    });
    if (empty) empty.style.display = anyVisible ? 'none' : 'block';
    fitToVisible();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      applyFilter(tab.dataset.cat);
    });
  });

  setTimeout(() => { map.invalidateSize(); fitToVisible(); }, 60);
}





/**
 * Ouvre WhatsApp vers Stéphane avec un message pré-rempli mentionnant la
 * prestation identifiée (escalade décidée côté serveur, voir /api/chat)
 * et, si disponible, la question d'origine posée par le voyageur dans le chat.
 * Usage : openConciergeWA('Chef à domicile pour un dîner', 'Je veux réserver un chef privé').
 */
function openConciergeWA(service, question){
  let guest = null;
  try{ guest = JSON.parse(localStorage.getItem('velnoraGuest') || 'null'); }catch(e){}
  const firstName = (guest && guest.firstName) ? guest.firstName.trim() : '';
  const text = 'Bonjour Stéphane,' + (firstName ? ' ici ' + firstName + ',' : '') +
    '\nJe souhaiterais organiser : ' + service + '.' +
    (question ? ('\n\nMa question dans l\'assistant : "' + question + '"') : '') +
    '\n\nPouvez-vous me confirmer le tarif et la disponibilité ?';
  window.open('https://wa.me/' + VLN_CONCIERGE_WA + '?text=' + encodeURIComponent(text), '_blank');
}

function initAssistant(){
  if (document.getElementById('vlnFab')) return; // déjà injecté

  const fab = document.createElement('button');
  fab.id = 'vlnFab'; fab.className = 'vln-fab'; fab.setAttribute('aria-label','Assistant de la villa');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  document.body.appendChild(fab);

  const veil = document.createElement('div'); veil.className = 'vln-chat-veil'; document.body.appendChild(veil);

  const chat = document.createElement('div'); chat.className = 'vln-chat';
  chat.innerHTML = `
    <div class="vln-chat-handle" id="vlnChatHandle"></div>
    <div class="vln-chat-head">
      <div class="av"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="90" height="94" rx="16" ry="16"/><path d="M27,15 L50,82 L73,15"/></svg></div>
      <div class="id"><div class="nm">Assistant Villa Aurea</div><div class="st">Répond à partir de votre guide</div></div>
      <div class="vln-chat-close" id="vlnChatClose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
    </div>
    <div class="vln-chat-body" id="vlnChatBody"></div>
    <div class="vln-chips" id="vlnChips">
      <div class="vln-chip" data-q="Quel est le code wifi ?">Wifi</div>
      <div class="vln-chip" data-q="À quelle heure est le check-in ?">Horaires</div>
      <div class="vln-chip" data-q="Où régler la température de la piscine ?">Piscine</div>
      <div class="vln-chip" data-q="Quels extras sont disponibles ?">Extras</div>
    </div>
    <div class="vln-human-row" id="vlnHumanRow">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
      <span>Parler directement à Stéphane, votre conciergerie</span>
    </div>
    <div class="vln-chat-input">
      <input type="text" id="vlnInput" placeholder="Écrivez votre question…" autocomplete="off">
      <button id="vlnSend" aria-label="Envoyer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </div>`;
  document.body.appendChild(chat);

  const body = chat.querySelector('#vlnChatBody');
  const input = chat.querySelector('#vlnInput');
  const handle = chat.querySelector('#vlnChatHandle');
  const history = vlnLoadHistory(); // [{who,text}, ...] restauré depuis les échanges précédents

  function renderMsg(text, who, wa){
    const el = document.createElement('div');
    el.className = 'vln-msg ' + (who === 'user' ? 'vln-msg-user' : 'vln-msg-bot');
    const textEl = document.createElement('div');
    textEl.textContent = text;
    el.appendChild(textEl);
    if (wa && wa.service){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vln-msg-wa-btn';
      btn.textContent = 'Écrire à Stéphane sur WhatsApp';
      btn.addEventListener('click', () => openConciergeWA(wa.service, wa.question));
      el.appendChild(btn);
    }
    body.appendChild(el);
  }

  // Rejoue la conversation précédente au chargement de la page (chat
  // fermé mais prêt) : elle reste disponible à la réouverture, et même
  // si l'on change d'écran, puisqu'elle est stockée sur l'appareil.
  // Le bouton WhatsApp éventuel (prestations sur devis) est lui aussi
  // restauré, pour rester cliquable même après une navigation.
  history.forEach(m => renderMsg(m.text, m.who, m.wa));
  if (history.length) body.scrollTop = body.scrollHeight;

  function addMsg(text, who, wa){
    renderMsg(text, who, wa);
    body.scrollTop = body.scrollHeight;
    history.push({ who, text, wa: wa || null });
    vlnSaveHistory(history);
  }

  function openChat(){
    vlnLockPageScroll();
    veil.classList.add('show'); chat.classList.add('show'); fab.classList.add('hide');
    if (!body.children.length){
      addMsg("Bonjour ! Je suis l'assistant de la Villa Aurea — posez-moi une question sur le wifi, les horaires, la piscine ou les extras.", 'bot');
    }
    setTimeout(() => input.focus(), 300);
  }
  function closeChat(){
    input.blur();
    veil.classList.remove('show'); chat.classList.remove('show'); fab.classList.remove('hide');
    vlnUnlockPageScroll();
  }

  fab.addEventListener('click', openChat);
  veil.addEventListener('click', closeChat);
  chat.querySelector('#vlnChatClose').addEventListener('click', closeChat);

  // Fermeture par glissement vers le bas depuis la poignée ou l'en-tête —
  // comme un panneau de commentaires Instagram / TikTok. Le reste du
  // panneau (liste de messages) garde son propre scroll, non affecté.
  (function initDragToClose(){
    const dragZone = chat.querySelector('.vln-chat-head');
    let startY = null, deltaY = 0, dragging = false;

    function start(y){ dragging = true; startY = y; chat.classList.add('vln-chat-dragging'); }
    function move(y){
      if (!dragging) return;
      deltaY = Math.max(0, y - startY);
      chat.style.transform = `translateY(${deltaY}px)`;
    }
    function end(){
      if (!dragging) return;
      dragging = false;
      chat.classList.remove('vln-chat-dragging');
      chat.style.transform = '';
      if (deltaY > 80) closeChat();
      deltaY = 0;
    }

    [handle, dragZone].forEach(zone => {
      if (!zone) return;
      zone.addEventListener('touchstart', e => start(e.touches[0].clientY), {passive:true});
      zone.addEventListener('touchmove', e => move(e.touches[0].clientY), {passive:true});
      zone.addEventListener('touchend', end);
      zone.addEventListener('mousedown', e => start(e.clientY));
    });
    window.addEventListener('mousemove', e => { if (dragging) move(e.clientY); });
    window.addEventListener('mouseup', end);
  })();

  let vlnPending = false;
  const sendBtn = chat.querySelector('#vlnSend');

  function setPending(state){
    vlnPending = state;
    input.disabled = state;
    sendBtn.disabled = state;
  }

  function showTyping(){
    const el = document.createElement('div');
    el.className = 'vln-msg vln-msg-bot vln-msg-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }
  function hideTyping(el){
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  async function handleAsk(rawText){
    const text = (rawText || '').trim();
    if (!text || vlnPending) return;

    // Snapshot AVANT d'ajouter le message courant : c'est l'historique
    // "précédent" que l'API doit recevoir, le message courant est envoyé
    // séparément dans le champ `message`.
    const priorHistory = history.slice(-10).map(m => ({ who: m.who, text: m.text }));

    addMsg(text, 'user');
    input.value = '';
    setPending(true);
    const typingEl = showTyping();

    try{
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: priorHistory })
      });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      hideTyping(typingEl);
      if (data.escalate){
        addMsg(data.reply, 'bot', { service: data.escalate.service, question: text });
      } else {
        addMsg(data.reply, 'bot');
      }
    }catch(err){
      // Panne réseau ou backend indisponible : jamais d'impasse silencieuse,
      // on redirige explicitement vers la conciergerie humaine.
      hideTyping(typingEl);
      addMsg(
        "Je n'arrive pas à joindre le guide pour le moment. Le mieux est de demander directement à Stéphane, juste en dessous.",
        'bot',
        { service: "Question via l'assistant (indisponible)", question: text }
      );
    }finally{
      setPending(false);
      input.focus();
    }
  }

  sendBtn.addEventListener('click', () => handleAsk(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAsk(input.value); });

  chat.querySelectorAll('.vln-chip').forEach(chip => {
    chip.addEventListener('click', () => handleAsk(chip.dataset.q));
  });

  chat.querySelector('#vlnHumanRow').addEventListener('click', () => {
    let guest = null;
    try{ guest = JSON.parse(localStorage.getItem('velnoraGuest') || 'null'); }catch(e){}
    const firstName = (guest && guest.firstName) ? guest.firstName.trim() : '';
    const recap = history.slice(-6).map(m => (m.who === 'user' ? 'Vous : ' : 'Assistant : ') + m.text).join('\n');
    const text = 'Bonjour Stéphane,' + (firstName ? ' ici ' + firstName + ',' : '') +
      "\nJ'ai échangé avec l'assistant de la villa et j'aimerais vous parler directement." +
      (recap ? '\n\nRécapitulatif de notre échange :\n' + recap : '') +
      '\n\nMerci de votre retour.';
    window.open('https://wa.me/' + VLN_CONCIERGE_WA + '?text=' + encodeURIComponent(text), '_blank');
  });
}
