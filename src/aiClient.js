const OpenAI = require('openai');
const config = require('./config');
const logger = require('./logger');

const client = new OpenAI({
  apiKey: config.ai.apiKey,
  baseURL: config.ai.baseURL,
  defaultHeaders: config.ai.baseURL.includes('openrouter')
    ? {
        'HTTP-Referer': 'https://discord-ia-bots',
        'X-Title': 'Discord IA Bots',
      }
    : {},
});

/**
 * Génère une réponse IA pour un bot.
 * @param {string} botName - Nom du bot qui répond
 * @param {string} botPersonality - Personnalité du bot
 * @param {Array} conversationHistory - Historique formaté OpenAI
 * @param {string} userMessage - Le message auquel répondre
 * @param {string} contextInfo - Contexte supplémentaire (qui parle, sujet, etc.)
 * @param {string} privateNotes - Notes privées injectées dans le system prompt (perspective unique)
 */
async function generateResponse(botName, botPersonality, conversationHistory, userMessage, contextInfo = '', privateNotes = '', userContext = '') {
  const knowledge = require('./knowledge');
  const systemPrompt = `${botPersonality}

${config.snowdiabloContext}

${knowledge.publicFacts}

${config.safetyRules}

Contexte actuel : ${contextInfo || 'Conversation sur Discord'}
${userContext ? '\n' + userContext : ''}
${privateNotes}

Instructions de format CRITIQUES (RESPECTE STRICTEMENT) :
- TON RÔLE : aider/engager l'humain, PAS débattre avec l'autre bot pendant des heures
- TRÈS COURT : maximum 2 phrases, idéalement 1. Pas de blabla.
- Si tu dépasses 25 mots, coupe.
- Pas de listes à puces, pas de paragraphes.
- Glisse 1 emoji bien choisi parfois (pas systématique, naturel) : 🔥 ✨ 💀 🤔 😏 🎭 🌀 ⚡ 💭 🖤 😈 🧠 🌑 ☄️ 🩶 🎮 ⚔️ 🚀
- NE COMMENCE JAMAIS par "[${botName}]:", ton nom, ou aucun préfixe
- Écris direct, comme un message Discord normal
- Quand un humain parle, FOCUS SUR LUI — pose-lui une question, propose ton aide
- Privilégie les sujets liés à SnowDiablo (Rust Onegrid, CS2, token, site, events)
- Réponds aux questions en allant droit au but`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await client.chat.completions.create({
      model: config.ai.model,
      messages,
      max_tokens: config.ai.maxTokens,
      temperature: config.ai.temperature,
    });

    let text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error('Réponse vide de l\'API');

    // Nettoyage : si l'IA a quand même mis "[Aria]:" ou "Aria:" au début, on le retire
    text = text.replace(/^\s*\[?\*?\*?[A-Za-zÀ-ÿ]+\*?\*?\]?\s*[:：]\s*/, '').trim();
    // Cas du double préfixe résiduel
    text = text.replace(/^\s*\[?\*?\*?[A-Za-zÀ-ÿ]+\*?\*?\]?\s*[:：]\s*/, '').trim();

    return text;
  } catch (err) {
    logger.error(`Erreur API pour ${botName}: ${err.message}`);
    return '*connexion instable... je reviens dans un instant*';
  }
}

/**
 * Génère une "réflexion privée" pour le bot après un échange.
 * Cette note sera stockée dans sa mémoire personnelle pour donner
 * une perspective unique à ses futures interventions.
 */
async function generatePrivateReflection(botName, botPersonality, conversationHistory) {
  const systemPrompt = `${botPersonality}

Tu vas faire une réflexion INTÉRIEURE et PRIVÉE en 1 phrase (max 20 mots).
Cette pensée n'est PAS un message Discord — c'est ta perspective intime sur la conversation.
Sois honnête, perspicace, parfois critique. Capture ce que tu remarques mais que tu n'as pas dit.
Format : juste la phrase, sans guillemets ni préfixe.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: 'Note ta réflexion intérieure sur la conversation actuelle (1 phrase courte).' },
  ];

  try {
    const response = await client.chat.completions.create({
      model: config.ai.model,
      messages,
      max_tokens: 60,
      temperature: 0.95,
    });
    const text = response.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    logger.error(`Erreur réflexion privée ${botName}: ${err.message}`);
    return null;
  }
}

module.exports = { generateResponse, generatePrivateReflection };
