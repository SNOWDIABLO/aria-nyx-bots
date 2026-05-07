/**
 * Mémoire des conversations.
 * - Mémoire partagée des messages publics du salon (pour cohérence)
 * - Mémoire privée par bot (pour réflexions internes, perspective unique)
 */
class ConversationMemory {
  constructor(maxSize = 20) {
    this.maxSize = maxSize;
    // Map<channelId, Message[]> — messages publics du salon
    this.channels = new Map();
    // Map<"channelId:botId", Note[]> — pensées privées de chaque bot
    this.privateNotes = new Map();
    // État de la conversation autonome par salon
    this.autonomousState = new Map();
  }

  // ─── Mémoire publique (messages du salon) ───────────────────────

  addMessage(channelId, role, name, content) {
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, []);
    }
    const history = this.channels.get(channelId);
    history.push({ role, name, content, timestamp: Date.now() });
    if (history.length > this.maxSize) history.shift();
  }

  getHistory(channelId) {
    return this.channels.get(channelId) || [];
  }

  /**
   * Formate l'historique pour l'API IA.
   * IMPORTANT : pour le bot courant, on n'ajoute PAS de préfixe `[Nom]:`
   * sur ses propres messages, sinon l'IA copie ce format dans ses réponses
   * et on a `[Aria]: [Aria]: ...` dans Discord.
   */
  formatForAI(channelId, currentBotName) {
    const history = this.getHistory(channelId);
    return history.map((msg) => {
      if (msg.name === currentBotName) {
        // C'est le bot lui-même : pas de préfixe, rôle assistant
        return { role: 'assistant', content: msg.content };
      }
      // C'est quelqu'un d'autre (humain ou autre bot) : préfixe pour identifier
      return { role: 'user', content: `[${msg.name}]: ${msg.content}` };
    });
  }

  // ─── Mémoire privée par bot (perspective unique) ────────────────

  /**
   * Ajoute une note privée pour un bot dans un salon.
   * Ces notes sont injectées dans le system prompt pour donner
   * une perspective interne différente à chaque IA.
   */
  addPrivateNote(channelId, botId, note) {
    const key = `${channelId}:${botId}`;
    if (!this.privateNotes.has(key)) {
      this.privateNotes.set(key, []);
    }
    const notes = this.privateNotes.get(key);
    notes.push({ note, timestamp: Date.now() });
    if (notes.length > 10) notes.shift(); // max 10 réflexions internes
  }

  getPrivateNotes(channelId, botId) {
    const key = `${channelId}:${botId}`;
    return this.privateNotes.get(key) || [];
  }

  formatPrivateNotes(channelId, botId) {
    const notes = this.getPrivateNotes(channelId, botId);
    if (notes.length === 0) return '';
    return '\n\nTes réflexions intérieures précédentes (perspective privée) :\n' +
      notes.map((n, i) => `- ${n.note}`).join('\n');
  }

  // ─── Conversation autonome ──────────────────────────────────────

  startAutonomous(channelId, initiatorBotId, topic = null, humanInitiator = null) {
    this.autonomousState.set(channelId, {
      active: true,
      initiatorBotId,
      messageCount: 0,
      topic,
      humanInitiator, // { id, username } de la personne qui a lancé le sujet
      startedAt: Date.now(),
      lastHumanQuestionAt: 0, // numéro du dernier message où un bot a posé une question à l'humain
    });
  }

  incrementAutonomousCount(channelId) {
    const state = this.autonomousState.get(channelId);
    if (state) state.messageCount++;
  }

  getAutonomousState(channelId) {
    return this.autonomousState.get(channelId) || { active: false };
  }

  stopAutonomous(channelId) {
    const state = this.autonomousState.get(channelId);
    if (state) state.active = false;
  }

  clearChannel(channelId) {
    this.channels.delete(channelId);
    this.autonomousState.delete(channelId);
    // Nettoyer aussi les notes privées de ce salon
    for (const key of this.privateNotes.keys()) {
      if (key.startsWith(`${channelId}:`)) {
        this.privateNotes.delete(key);
      }
    }
  }
}

// Instance partagée (singleton)
const memory = new ConversationMemory();
module.exports = memory;
