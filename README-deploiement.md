# Déploiement — Velnora, Villa Aurea

## 1. Hébergement (Cloudflare Pages)

1. Pousse ce dossier sur un repo GitHub.
2. Sur [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**, sélectionne le repo.
3. Build settings : laisser vide (site 100 % statique, aucune commande de build, dossier racine `/`).
4. Déployer. Cloudflare redéploie automatiquement à chaque `git push`.

## 2. Activer l'assistant conversationnel

L'assistant appelle `/api/chat` (fonction dans `functions/api/chat.js`), qui a besoin de deux réglages **dans le dashboard Cloudflare**, jamais dans le code :

### a) Clé API Anthropic (obligatoire)
Projet Cloudflare Pages → **Settings** → **Environment variables** →
`ANTHROPIC_API_KEY` = ta clé, type **Secret**. Sans elle, l'assistant répond
toujours par le message de repli ("je n'arrive pas à joindre le guide").

### b) Limitation de débit (fortement recommandé avant mise en ligne réelle)
Sans ça, n'importe qui peut appeler `/api/chat` en boucle et faire grimper la facture API.

1. **Storage & Databases** → **KV** → créer un namespace (ex. `velnora-rate-limit`).
2. Projet Pages → **Settings** → **Functions** → **KV namespace bindings** → variable `RATE_LIMIT` → lier au namespace créé.

Limite par défaut : 30 messages/heure/IP (modifiable dans `RATE_LIMIT_PER_HOUR`, en haut de `functions/api/chat.js`).

## 3. Faire évoluer le contenu du guide

Le contenu que l'assistant connaît vit dans **`villa-config.json`** (racine du projet), pas dans le code :

```json
{
  "property": { "name": "...", "location": "...", "conciergeName": "...", "conciergeWhatsApp": "..." },
  "facts": [ "phrase factuelle 1", "phrase factuelle 2", ... ],
  "quotedServices": [ { "service": "Nom de la prestation", "note": "explication" }, ... ]
}
```

- `facts` : tout ce que l'assistant peut répondre directement (wifi, horaires, équipements...).
- `quotedServices` : prestations sur devis — l'assistant ne répond jamais lui-même,
  il bascule systématiquement vers Stéphane sur WhatsApp.

Éditer ce fichier et pousser sur GitHub suffit — pas de redéploiement manuel, pas de
modification du code de la fonction.

## 4. Pour une prochaine villa

`villa-config.json` étant la seule source de contenu de l'assistant, dupliquer le
projet pour une nouvelle propriété revient à changer ce fichier (+ les textes/photos
des écrans HTML, comme avant). `functions/api/chat.js` n'a besoin d'aucune modification.
