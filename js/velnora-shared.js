/* ================================================================
   VELNORA — Comportements JS partagés, produit voyageur
   Deux fonctions communes à plusieurs écrans, isolées ici pour
   éviter la duplication (identique auparavant sur 5 écrans).
   ================================================================ */

/**
 * Active la pseudo-classe :active au tap sur iOS Safari (qui l'ignore sans
 * écouteur tactile enregistré) — condition nécessaire au retour tactile
 * (compression douce) défini dans velnora-shared.css sur tous les écrans.
 */
document.addEventListener('touchstart', function(){}, {passive:true});

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
      if (match) anyVisible = true;
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




/* ================= Assistant Velnora (FAQ locale + relais conciergerie) =================
   Fonctionne 100% côté client, sans dépendance ni coût : réponses par correspondance de
   mots-clés sur une base de connaissances propre à la Villa Aurea. Bascule vers un humain
   (Stéphane) en un clic via WhatsApp, avec le contexte de la conversation pré-rempli.
   -> Le jour où l'hôte veut une vraie IA conversationnelle (LLM), il suffira de remplacer
   vlnMatchKB() par un appel à un backend sécurisé : toute la coquille (UI, historique,
   relais humain) reste inchangée. */

const VLN_CONCIERGE_WA = '33647821590';

const VLN_KB = [
  { kw:['wifi','wi-fi','internet','mot de passe','password','code wifi','reseau'],
    a:"Le réseau est « Villa-Aurea », mot de passe « Aurea2026 ». La connexion couvre toute la villa, terrasse et piscine comprises." },
  { kw:['arrivee','arrivée','checkin','check-in','heure arrivee','quand arriver'],
    a:"L'arrivée standard est à partir de 16h. Une arrivée anticipée dès 11h est possible en extra, sous réserve de disponibilité." },
  { kw:['depart','départ','checkout','check-out','heure depart','quand partir'],
    a:"Le départ est fixé à 10h. Un départ tardif jusqu'à 16h est proposé en extra. Vous trouverez toutes les consignes de départ dans l'écran « Départ »." },
  { kw:['caution','depot','dépôt','garantie'],
    a:"Une empreinte bancaire est demandée à l'arrivée et libérée sans frais après l'état des lieux. L'option « Zéro caution » (25 €) permet de s'en dispenser, dans Extras & Services." },
  { kw:['piscine','baignade'],
    a:"La piscine (10 × 4 m) est chauffée à 28°C de mai à septembre, parfois dès fin avril si la météo le permet. Plus de détails dans l'écran « Guide de la Villa »." },
  { kw:['boitier piscine','regler la piscine','regler piscine','temperature piscine','thermostat piscine','chauffage piscine','regulation piscine'],
    a:"Le boîtier de régulation de la piscine se trouve dans le salon, juste à côté de la télévision. Il permet d'ajuster la température (28°C par défaut) et de couper le chauffage si besoin." },
  { kw:['jacuzzi','spa','sauna','bien etre','bien-être','massage'],
    a:"La villa dispose d'un sauna privé au niveau -1, avec minuterie murale (30 min par défaut). Plusieurs options bien-être existent aussi en extra : massage à domicile, séance de yoga privée — voir Extras & Services." },
  { kw:['petit dejeuner','petit-déjeuner','breakfast','pain','viennoiserie'],
    a:"Le petit-déjeuner livré en chambre (28 €/pers.) se commande dans Extras & Services, comme le panier de bienvenue gourmand." },
  { kw:['extra','extras','service','services','commander','commande'],
    a:"Toutes les prestations additionnelles — table, confort, mer, bien-être, célébrations, transport — sont regroupées dans l'écran « Extras & Services », avec commande en un clic." },
  { kw:['bateau','paddle','kayak','plage','plages','mer','voile','snorkeling','plongee','plongée'],
    a:"Location de paddle et kayaks livrée à la villa, sortie en bateau privé avec skipper, excursion snorkeling et navette vers la plage : tout est dans Extras & Services, catégorie « Mer & Plage »." },
  { kw:['animal','chien','chat','animaux'],
    a:"Un forfait animal de compagnie (30 €/séjour, panier et gamelles fournis) est disponible dans Extras & Services, catégorie « Famille & Animaux »." },
  { kw:['bebe','bébé','enfant','enfants','garde','baby'],
    a:"Kit bébé complet, garde d'enfants ponctuelle et lit d'appoint sont proposés dans Extras & Services, catégorie « Famille & Animaux »." },
  { kw:['transfert','aeroport','aéroport','gare','navette','taxi','voiture particuliere'],
    a:"Transfert privé gare ou aéroport dès 90 €, location de voiture livrée à la villa, voiturier sur demande : voir Extras & Services, catégorie « Transport »." },
  { kw:['adresse','localisation','plan','venir','giens','hyeres','hyères','ou est la villa','ou se trouve la villa','ou se situe la villa'],
    a:"La Villa Aurea se trouve à Hyères, sur la Presqu'île de Giens, face à la mer. L'itinéraire précis est disponible depuis l'écran « La Villa »." },
  { kw:['contact','urgence','probleme','problème','panne','joindre'],
    a:"Stéphane, votre conciergerie, est joignable au +33 6 47 82 15 90. Les numéros d'urgence figurent dans l'écran « Votre Conciergerie »." },
  { kw:['restaurant','manger','diner','dîner','table gastronomique'],
    a:"La sélection de Stéphane recense les meilleures tables et plages de la presqu'île (La Table du Lodge, La Colombe, L'Envie...) dans l'écran « Sélection de Stéphane »." },
  { kw:['eclairage','éclairage','lumiere','lumière','tydom','domotique'],
    a:"La tablette murale de l'entrée pilote une partie des éclairages — jardin, piscine, porche, garage. Le reste s'allume à l'interrupteur, pièce par pièce." },
  { kw:['menage','ménage','nettoyage'],
    a:"Un ménage supplémentaire en cours de séjour (60 €) peut être ajouté à la date de votre choix, dans Extras & Services." },
  { kw:['parking','stationnement','garage','se garer'],
    a:"Deux places sont réservées dans le garage attenant, accessible par la télécommande accrochée près de la porte d'entrée. Une troisième place, en extérieur, est disponible le long de l'allée." },
  { kw:['cle','clef','cles','boite a cles','lockbox','digicode entree'],
    a:"Les clés vous sont remises en main propre à l'arrivée par Stéphane. En cas d'arrivée décalée, elles sont laissées dans un boîtier sécurisé près du portail, dont le code vous est communiqué par SMS le jour même." },
  { kw:['alarme','code alarme','securite maison','systeme de securite'],
    a:"L'alarme est désactivée à votre arrivée et n'a pas besoin d'être réactivée pendant le séjour, sauf absence prolongée : le boîtier se trouve dans le placard de l'entrée, code communiqué sur demande à la conciergerie." },
  { kw:['four','cuisiniere','plaques de cuisson','plaque induction','cuisine equipee'],
    a:"La cuisine est équipée d'un four et de plaques à induction professionnels. Un mode d'emploi rapide est glissé dans le tiroir juste en dessous." },
  { kw:['lave vaisselle','lave-vaisselle'],
    a:"Le lave-vaisselle se trouve sous le plan de travail central, à gauche de l'évier. Pastilles fournies dans le meuble juste au-dessus." },
  { kw:['machine a laver','lave linge','lessive','seche linge','laverie'],
    a:"Le lave-linge et le sèche-linge sont dans la buanderie, au bout du couloir près du garage. Lessive et adoucissant sont fournis pour la durée du séjour." },
  { kw:['climatisation','clim','chauffage maison','chauffage villa','thermostat maison'],
    a:"Chaque chambre dispose de sa propre climatisation réversible, réglable via la télécommande posée sur la table de chevet. Le thermostat général du salon régule les pièces communes." },
  { kw:['tele','télé','television','netflix','chaines','decodeur'],
    a:"La télévision du salon est connectée (Netflix, Canal+) sous le compte de la villa — identifiants affichés à l'écran d'accueil. La télécommande universelle pilote aussi la barre de son." },
  { kw:['enceinte','enceintes','musique','sonos','bluetooth','son'],
    a:"Un système de son Sonos couvre le salon, la terrasse et le pourtour de la piscine. Appairage Bluetooth possible via l'appli Sonos ou directement au clavier prévu sur le meuble bas du salon." },
  { kw:['barbecue','plancha','bbq'],
    a:"Le barbecue Bastard, au charbon, est installé sur la terrasse. Un sac de charbon plein et des brochettes vous attendent à côté — comptez une bonne vingtaine de minutes pour que la braise monte en température." },
  { kw:['poubelle','poubelles','tri','recyclage','dechets'],
    a:"Les poubelles (ordures ménagères et tri sélectif) sont dans l'abri prévu à cet effet près du portail. La collecte passe le mardi et le vendredi matin." },
  { kw:['eau chaude','ballon eau chaude','pas eau chaude'],
    a:"Le ballon d'eau chaude est situé dans le local technique du sous-sol ; il alimente toute la villa en continu, sans coupure attendue en cours de séjour." },
  { kw:['gaz','bouteille de gaz','coupure gaz'],
    a:"L'arrivée de gaz principale se coupe via la vanne murale du local technique, à côté du ballon d'eau chaude — utile uniquement en cas d'urgence." },
  { kw:['disjoncteur','coupure de courant','electricite','panne electrique','plus de courant'],
    a:"Le tableau électrique et le disjoncteur général sont dans le placard technique du garage. En cas de coupure, vérifiez-le en premier avant d'appeler la conciergerie." },
  { kw:['vin','cave a vin','cave à vin'],
    a:"Une cave à vin climatisée se trouve dans le cellier, à côté de la cuisine — quelques bouteilles de bienvenue vous y attendent. Un service de réassort est possible via Extras & Services." },
  { kw:['coffre','coffre-fort','objets de valeur'],
    a:"Un coffre-fort est encastré dans la penderie de la chambre principale, à l'étage. Le code par défaut est communiqué à votre arrivée par Stéphane." },
  { kw:['fumer','fumeur','cigarette'],
    a:"La villa est non-fumeur à l'intérieur ; il est possible de fumer sur la terrasse ou au jardin, cendriers à disposition près du salon extérieur." },
  { kw:['invites','invités','visiteurs','personnes supplementaires','capacite'],
    a:"La villa accueille jusqu'à 10 personnes en configuration standard. Toute visite ou invité supplémentaire, même pour la journée, doit être signalé à la conciergerie au préalable." },
  { kw:['bruit','voisins','heures calmes','tapage','musique forte'],
    a:"Par respect du voisinage, un principe de calme s'applique après 23h, notamment autour de la piscine et de la terrasse extérieure." },
  { kw:['cheminee','cheminée','feu de bois'],
    a:"Le salon dispose d'une cheminée à foyer fermé, prête à l'usage dès la mi-automne. Bois et allume-feu sont stockés dans le coffre extérieur attenant." },
  { kw:['moustique','moustiques','insectes'],
    a:"Diffuseurs anti-moustiques électriques dans chaque chambre (recharges dans le tiroir de la table de chevet), et prestation de démoustication du jardin disponible en extra." },
  { kw:['serviette','serviettes','draps','linge de maison','linge de toilette'],
    a:"Draps et serviettes de toilette sont fournis et changés en milieu de séjour pour les locations de plus de 7 nuits. Des serviettes de piscine supplémentaires sont dans le placard du pool house." },
  { kw:['pressing','repassage'],
    a:"Un service de pressing avec collecte à la villa est disponible sur demande, dans Extras & Services, catégorie « Confort »." },
  { kw:['pharmacie','medecin','docteur','urgence medicale'],
    a:"La pharmacie la plus proche se trouve dans le village de Giens, à environ 5 minutes en voiture. Pour toute urgence médicale, composez le 15 (SAMU) ; la conciergerie peut aussi orienter vers un médecin de garde." },
  { kw:['supermarche','courses','epicerie','superette'],
    a:"Une supérette de dépannage se trouve dans le village de Giens ; le supermarché le plus complet est à Hyères, à une quinzaine de minutes. Un service de courses livrées est proposé dans Extras & Services." },
  { kw:['essence','station essence','carburant'],
    a:"La station-service la plus proche est sur la route reliant Giens à Hyères, à environ 10 minutes de la villa." },
  { kw:['distributeur','banque','retrait argent','especes'],
    a:"Le distributeur automatique le plus proche se trouve au village de Giens ; les banques principales sont à Hyères centre." },
  { kw:['velo','vélo','location velo','vtt'],
    a:"Location de vélos, dont VTT électriques, livrée directement à la villa : voir Extras & Services, catégorie « Mer & Plage »." },
  { kw:['tennis','padel','golf'],
    a:"Un court de tennis municipal et un practice de golf existent à Hyères ; réservation possible via la conciergerie sur simple demande." },
  { kw:['etage','chambres','lits','nombre de chambres'],
    a:"La villa compte 5 chambres réparties sur deux niveaux, toutes avec salle de bain privative. Le détail figure dans l'écran « Guide de la Villa »." },
  { kw:['accessibilite','pmr','fauteuil roulant','ascenseur'],
    a:"Le rez-de-chaussée (salon, une chambre, terrasse et piscine) est accessible de plain-pied. Il n'y a pas d'ascenseur vers l'étage — merci de signaler tout besoin particulier à la conciergerie en amont." },
  { kw:['annulation','assurance annulation','remboursement'],
    a:"Les conditions d'annulation dépendent de votre réservation initiale ; pour toute question, la conciergerie ou votre plateforme de réservation reste l'interlocuteur de référence." },
  { kw:['bonjour','salut','hello','bonsoir'],
    a:"Bonjour ! Je suis l'assistant de la Villa Aurea. Posez-moi une question sur le wifi, les horaires, la piscine ou les extras — ou parlez directement à Stéphane ci-dessous." },

  /* ---- Équipements complémentaires (réponses formulées à partir du Guide de la Villa) ---- */
  { kw:['cafetiere','machine a cafe','expresso','cafe'],
    a:"La cuisine est équipée d'une cafetière expresso, prête à l'emploi dès votre arrivée — capsules fournies en quantité de départ, réassort possible via Extras & Services." },
  { kw:['grille pain','bouilloire','micro ondes','micro-ondes'],
    a:"La cuisine est intégralement équipée : grille-pain, bouilloire et micro-ondes sont à disposition, rangés sous le plan de travail central." },
  { kw:['frigo','refrigerateur','congelateur','glacons'],
    a:"Le réfrigérateur et le congélateur (avec bac à glaçons) se trouvent dans la cuisine, à droite de la cuisinière à induction." },
  { kw:['fer a repasser','planche a repasser','repasser'],
    a:"Fer et planche à repasser sont rangés dans la buanderie, juste à côté du lave-linge." },
  { kw:['seche cheveux','secheur cheveux'],
    a:"Un sèche-cheveux est disponible dans chaque salle de bain, dans le tiroir sous le miroir." },
  { kw:['extincteur','extincteurs'],
    a:"Un extincteur est installé dans la cuisine et un second dans le local technique, à côté du tableau électrique." },
  { kw:['detecteur fumee','detecteur de fumee','detecteurs fumee','detecteur co','alarme incendie'],
    a:"Des détecteurs de fumée équipent chaque chambre et les couloirs, testés systématiquement avant chaque séjour." },
  { kw:['trousse de secours','premiers secours','pansement','pharmacie villa'],
    a:"Une trousse de premiers secours se trouve dans le meuble de la cuisine, juste à côté du réfrigérateur." },
  { kw:['prise usb','adaptateur','adaptateurs','chargeur telephone','prise electrique'],
    a:"Des prises USB sont intégrées aux tables de chevet de chaque chambre. Des adaptateurs universels sont disponibles sur simple demande à la conciergerie." },
  { kw:['borne recharge','recharge voiture','voiture electrique','recharge electrique'],
    a:"Une borne de recharge (prise Type 2) est installée près du garage, libre d'utilisation pendant tout votre séjour." },
  { kw:['digicode portail','code portail','ouvrir le portail','portail pieton'],
    a:"Le portail piéton s'ouvre avec le digicode 2609 pendant toute la durée du séjour — pensez à bien le refermer derrière vous, il se verrouille automatiquement." },
  { kw:['urgence numero','numeros urgence','samu','pompiers','police secours','numero urgence'],
    a:"En cas d'urgence : 112 (urgence européenne), 15 (SAMU), 17 (Police), 18 (Pompiers). Pour tout le reste, Stéphane reste votre premier contact." },
  { kw:['avis','laisser un avis','commentaire sejour','review'],
    a:"Un mot sur votre séjour ferait très plaisir à Stéphane et à son équipe — l'écran « Départ » propose un lien direct pour laisser votre avis sur Airbnb." },
  { kw:['jardin','pergola','espace exterieur'],
    a:"La villa dispose d'un beau jardin avec pergola, entre la terrasse et la piscine — idéal pour les repas en soirée ou une sieste à l'ombre." },
  { kw:['volets','store','stores','occultation chambre'],
    a:"Chaque chambre est équipée de volets ou stores occultants, à commande manuelle près de la fenêtre." },
  { kw:['interphone','visiophone','sonnette portail'],
    a:"Un interphone au portail permet d'identifier vos visiteurs depuis l'intérieur de la villa avant de leur ouvrir." },
  { kw:['camera','cameras','videosurveillance','surveillance exterieure'],
    a:"Par respect de votre vie privée, la villa n'est équipée d'aucune caméra à l'intérieur ; seules les abords extérieurs (portail, accès) peuvent être surveillés pour la sécurité du bien." },
  { kw:['groupe electrogene','coupure prolongee','panne generale'],
    a:"En cas de coupure prolongée, vérifiez d'abord le disjoncteur général dans le placard technique du garage, puis contactez Stéphane — la conciergerie peut faire intervenir un technicien rapidement." },
  { kw:['jardinier','entretien jardin','arrosage automatique'],
    a:"Le jardin est entretenu par notre équipe pendant votre séjour, avec arrosage automatique programmé tôt le matin pour ne pas déranger vos journées." },
  { kw:['robot piscine','nettoyage piscine','entretien piscine'],
    a:"La piscine est entretenue par notre équipe technique pendant votre séjour (filtration et nettoyage), sans intervention nécessaire de votre part." },
  { kw:['douche exterieure','pool house'],
    a:"Une douche extérieure est à votre disposition près de la piscine, à côté du pool house où sont rangées les serviettes supplémentaires." },
  { kw:['salle de sport','fitness','espace sport','salle de musculation'],
    a:"Un espace sport se trouve au niveau -1, juste à côté du sauna." },
  { kw:['jeux de societe','livres','bibliotheque','ping pong','billard'],
    a:"Quelques jeux de société et une petite sélection de livres sont à disposition dans le salon. Pour plus d'animations, la console de jeux et le cinéma extérieur sont proposés dans Extras & Services." },
  { kw:['parapluie','parapluies','kit pluie'],
    a:"Des parapluies sont rangés dans le placard de l'entrée, à côté de la tablette de commande des éclairages." },

  /* ---- Prestations sur devis : redirection directe vers Stéphane (WhatsApp), avec le
     libellé exact de la prestation pré-rempli pour aller droit à l'essentiel ---- */
  { kw:['chef domicile','chef prive','chef cuisinier','diner avec chef','chef a domicile'],
    service:"Chef à domicile pour un dîner", wa:true,
    a:"Excellent choix — le chef à domicile fonctionne sur devis personnalisé, selon le nombre de convives et le menu souhaité. Je vous mets directement en relation avec Stéphane pour l'organiser." },
  { kw:['sommelier','selection vin sommelier','conseil sommelier','cave sommelier'],
    service:"Cave à vin, sélection sommelier", wa:true,
    a:"La sélection sommelier se construit sur mesure selon vos préférences. Stéphane peut vous proposer une sélection et un tarif — je vous mets en relation." },
  { kw:['nuit supplementaire','prolonger sejour','rester une nuit','ajouter une nuit'],
    service:"Nuit supplémentaire", wa:true,
    a:"Une nuit supplémentaire dépend de la disponibilité de la villa juste après votre séjour — c'est Stéphane qui peut vous confirmer cela et le tarif associé." },
  { kw:['modifier reservation','changer mes dates','modification reservation','changer de dates'],
    service:"Modification de réservation", wa:true,
    a:"Toute modification de réservation se traite au cas par cas avec la conciergerie. Je vous mets en relation directe avec Stéphane pour étudier votre demande." },
  { kw:['bateau prive','sortie en bateau','location bateau','skipper'],
    service:"Sortie en bateau privé, skipper inclus", wa:true,
    a:"La sortie en bateau privé avec skipper se prépare sur devis, selon la durée et le nombre de passagers. Je vous mets en relation avec Stéphane pour l'organiser." },
  { kw:['excursion plongee','plongee privee','snorkeling prive','sortie plongee privee'],
    service:"Excursion plongée & snorkeling privée", wa:true,
    a:"L'excursion plongée et snorkeling privée se construit sur devis selon votre niveau et vos envies. Stéphane peut vous proposer une offre adaptée." },
  { kw:['yacht','location yacht','yacht equipage'],
    service:"Location de yacht avec équipage", wa:true,
    a:"La location de yacht avec équipage se traite entièrement sur devis. Je vous mets en relation directe avec Stéphane pour préparer cela." },
  { kw:['sauna mobile','sauna terrasse','sauna supplementaire exterieur'],
    service:"Sauna privé mobile installé sur la terrasse", wa:true,
    a:"Ce sauna mobile installé sur la terrasse (en plus du sauna intérieur) fonctionne sur devis, selon la durée souhaitée. Je vous mets en relation avec Stéphane." },
  { kw:['helicoptere','transfert helicoptere','helico'],
    service:"Transfert privé en hélicoptère", wa:true,
    a:"Le transfert privé en hélicoptère s'organise sur devis, selon votre point de départ et la disponibilité. Je vous mets directement en relation avec Stéphane." },
  { kw:['location voiture','louer une voiture','voiture livree villa'],
    service:"Location de voiture, livrée à la villa", wa:true,
    a:"La location de voiture livrée à la villa se prépare sur devis, selon le modèle et la durée souhaités. Stéphane peut vous faire une proposition." },
  { kw:['voiturier'],
    service:"Voiturier pour la durée du séjour", wa:true,
    a:"Le service de voiturier pour toute la durée du séjour se traite sur devis. Je vous mets en relation avec Stéphane pour l'organiser." }
];

function vlnStripAccents(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

/* ---- persistance de la conversation (survit à la fermeture du chat et
   à la navigation entre écrans, comme un fil de discussion normal) ---- */
const VLN_CHAT_KEY = 'velnoraChatHistory';
function vlnLoadHistory(){
  try{ const h = JSON.parse(localStorage.getItem(VLN_CHAT_KEY) || '[]'); return Array.isArray(h) ? h : []; }
  catch(e){ return []; }
}
function vlnSaveHistory(list){
  try{ localStorage.setItem(VLN_CHAT_KEY, JSON.stringify(list.slice(-40))); }catch(e){}
}

/* ---- verrouillage du scroll de la page pendant que le chat est ouvert :
   empêche la page du dessous de bouger, comme un panneau de commentaires
   Instagram / TikTok ---- */
let _vlnScrollY = 0;
function vlnLockPageScroll(){
  _vlnScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = (-_vlnScrollY) + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}
function vlnUnlockPageScroll(){
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, _vlnScrollY);
}

function vlnMatchKB(input){
  const norm = vlnStripAccents(input);
  const inputWords = norm.split(/[^a-z0-9]+/).filter(Boolean);
  let best = null, bestScore = 0;
  VLN_KB.forEach(entry => {
    let score = 0;
    entry.kw.forEach(k => {
      const kWords = vlnStripAccents(k).split(/[^a-z0-9]+/).filter(Boolean);
      const significant = kWords.filter(w => w.length >= 3);
      const required = significant.length ? significant : kWords;
      const allPresent = required.every(w => inputWords.includes(w));
      if (allPresent) score += required.length;
    });
    if (score > bestScore){ bestScore = score; best = entry; }
  });
  return best;
}

/**
 * Ouvre WhatsApp vers Stéphane avec un message pré-rempli mentionnant la
 * prestation identifiée (cas des entrées "sur devis" de VLN_KB) et, si
 * disponible, la question d'origine posée par le voyageur dans le chat.
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

  function handleAsk(text){
    if (!text.trim()) return;
    addMsg(text, 'user');
    input.value = '';
    setTimeout(() => {
      const entry = vlnMatchKB(text);
      if (entry && entry.wa){
        addMsg(entry.a, 'bot', { service: entry.service, question: text });
      } else if (entry){
        addMsg(entry.a, 'bot');
      } else {
        addMsg("Je n'ai pas la réponse exacte dans le guide de la villa. Le mieux est de demander directement à Stéphane, juste en dessous — je transmets votre question.", 'bot');
      }
    }, 260);
  }

  chat.querySelector('#vlnSend').addEventListener('click', () => handleAsk(input.value));
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
