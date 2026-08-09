/* ================================================================
   VELNORA — Backend de l'assistant conversationnel (Cloudflare Pages Function)
   Route : POST /api/chat

   Rôle : seul endroit du projet qui connaît la clé API Anthropic (jamais
   exposée au navigateur). Reçoit la question du voyageur + un court
   historique, construit un prompt système à partir de villa-config.json,
   appelle Claude, et renvoie soit une réponse directe, soit un signal
   d'escalade vers la conciergerie humaine (prestations sur devis ou
   information absente du guide).

   Config requise côté Cloudflare Pages (dashboard du projet) :
   - Settings → Environment variables → ANTHROPIC_API_KEY (type "Secret")
   - Settings → Functions → KV namespace bindings → RATE_LIMIT (recommandé,
     voir checkRateLimit ci-dessous — fonctionne sans, mais sans protection
     anti-abus)
   ================================================================ */

import villaConfig from '../../villa-config.json';

const MODEL = 'claude-haiku-4-5-20251001'; // rapide et peu coûteux, largement suffisant pour du FAQ + escalade
const MAX_TOKENS = 400;
const MAX_MESSAGE_LEN = 500;   // borne la taille d'un message voyageur (coût + abus)
const MAX_HISTORY_TURNS = 10;  // borne le contexte renvoyé à l'API à chaque appel
const RATE_LIMIT_PER_HOUR = 30; // par IP — largement au-dessus d'un usage voyageur normal

const ESCALATE_TOOL = {
  name: 'escalate_to_concierge',
  description:
    "Utilise cet outil quand la demande correspond à une prestation sur devis listée dans le guide, ou quand l'information demandée n'existe pas dans le guide. Ne l'utilise jamais si le guide contient déjà la réponse.",
  input_schema: {
    type: 'object',
    properties: {
      service: {
        type: 'string',
        description:
          "Résumé court (5 à 8 mots) de la demande à transmettre à la conciergerie, ex. 'Chef à domicile pour un dîner'."
      }
    },
    required: ['service']
  }
};

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      // Erreur de configuration serveur, pas une erreur voyageur — pas de détail exposé côté client.
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const allowed = await checkRateLimit(env, ip);
    if (!allowed) {
      // 200 volontaire (pas 429) : le front-end n'a pas de cas particulier à gérer,
      // il affiche simplement ce message comme une réponse normale de l'assistant.
      return jsonResponse({
        reply: "Beaucoup de questions d'un coup ! Réessayez dans quelques minutes, ou écrivez directement à Stéphane juste en dessous.",
        escalate: null
      }, 200);
    }

    const body = await request.json().catch(() => null);
    const rawMessage = body && typeof body.message === 'string' ? body.message.trim() : '';
    if (!rawMessage) {
      return jsonResponse({ error: 'invalid_request' }, 400);
    }
    const message = rawMessage.slice(0, MAX_MESSAGE_LEN);

    const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];
    const messages = history
      .filter(turn => turn && typeof turn.text === 'string')
      .map(turn => ({
        role: turn.who === 'user' ? 'user' : 'assistant',
        content: turn.text.slice(0, 800)
      }));
    messages.push({ role: 'user', content: message });

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        messages,
        tools: [ESCALATE_TOOL]
      })
    });

    if (!apiRes.ok) {
      // Panne/latence côté Anthropic : on ne bloque jamais le voyageur, on le redirige vers l'humain.
      return jsonResponse(fallbackReply(message), 200);
    }

    const data = await apiRes.json();
    const content = Array.isArray(data.content) ? data.content : [];
    const textBlock = content.find(b => b.type === 'text');
    const toolBlock = content.find(b => b.type === 'tool_use' && b.name === 'escalate_to_concierge');

    if (toolBlock) {
      const service = (toolBlock.input && toolBlock.input.service) || message;
      const reply = (textBlock && textBlock.text) ||
        `Je transmets votre demande directement à ${villaConfig.property.conciergeName}, votre conciergerie.`;
      return jsonResponse({ reply, escalate: { service, question: message } }, 200);
    }

    const reply = (textBlock && textBlock.text) ||
      "Je n'ai pas la réponse exacte dans le guide de la villa. Le mieux est de demander directement à Stéphane, juste en dessous.";
    return jsonResponse({ reply, escalate: null }, 200);

  } catch (err) {
    return jsonResponse(fallbackReply(''), 200);
  }
}

function buildSystemPrompt() {
  const factsBlock = villaConfig.facts.map(f => `- ${f}`).join('\n');
  const quotedBlock = villaConfig.quotedServices.map(q => `- ${q.service} : ${q.note}`).join('\n');

  return `Tu es l'assistant de ${villaConfig.property.name}, une villa de location saisonnière à ${villaConfig.property.location}. Tu réponds aux voyageurs en séjour ou sur le point d'arriver.

RÈGLES STRICTES :
- Réponds uniquement à partir des informations ci-dessous. N'invente jamais un code, un tarif, un numéro ou un détail absent de ce guide.
- Ton chaleureux et direct, 1 à 3 phrases dans la grande majorité des cas.
- Si la demande correspond à une prestation "sur devis" listée ci-dessous, ou si l'information n'est pas dans ce guide, utilise l'outil escalate_to_concierge — n'improvise jamais une réponse à sa place.
- Ne donne aucun conseil médical, juridique ou de sécurité qui irait au-delà de ce qui est écrit ici.

INFORMATIONS SUR LA VILLA :
${factsBlock}

PRESTATIONS SUR DEVIS (transmets systématiquement à ${villaConfig.property.conciergeName} via l'outil) :
${quotedBlock}`;
}

function fallbackReply(message) {
  return {
    reply: "Je n'arrive pas à joindre le guide pour le moment. Le mieux est de demander directement à Stéphane, juste en dessous.",
    escalate: { service: "Question via l'assistant (indisponible)", question: message }
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Limitation de débit par IP (fenêtre glissante approximative, 1h).
 * Nécessite un namespace KV lié au binding "RATE_LIMIT" dans le dashboard
 * Cloudflare Pages (Settings → Functions → KV namespace bindings).
 * Sans ce binding, la fonction reste opérationnelle mais SANS protection
 * anti-abus — à faire avant mise en production réelle.
 */
async function checkRateLimit(env, ip) {
  if (!env.RATE_LIMIT) return true;
  const key = `rl:${ip}`;
  const current = await env.RATE_LIMIT.get(key);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= RATE_LIMIT_PER_HOUR) return false;
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 3600 });
  return true;
}
