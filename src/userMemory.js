/**
 * Mémoire persistante par utilisateur Discord.
 * Sauvegarde sur disque pour survivre aux restarts.
 *
 * Chaque user a :
 *  - facts: liste de "faits" appris sur lui (ex: "joue à Rust Onegrid", "aime le metal")
 *  - lastSeen: timestamp dernière interaction
 *  - interactions: nb total d'interactions
 *  - mood: note récente (Aria/Nyx peuvent l'écrire)
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MAX_FACTS_PER_USER = 15;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

class UserMemory {
  constructor() {
    this.users = new Map(); // userId -> { facts, lastSeen, interactions, mood, displayName }
    this.load();
    this.saveTimer = null;
  }

  load() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        for (const [k, v] of Object.entries(data)) this.users.set(k, v);
      }
    } catch (e) {
      logger.error(`Erreur load users: ${e.message}`);
    }
  }

  // Save différé (regroupe les écritures sur 5s)
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      try {
        const obj = {};
        for (const [k, v] of this.users.entries()) obj[k] = v;
        fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2));
      } catch (e) {
        logger.error(`Erreur save users: ${e.message}`);
      }
      this.saveTimer = null;
    }, 5000);
  }

  ensure(userId, displayName = null) {
    const id = String(userId);
    if (!this.users.has(id)) {
      this.users.set(id, {
        displayName: displayName || 'inconnu',
        facts: [],
        lastSeen: Date.now(),
        interactions: 0,
        mood: null,
      });
    }
    return this.users.get(id);
  }

  touch(userId, displayName = null) {
    const u = this.ensure(userId, displayName);
    if (displayName && displayName !== u.displayName) u.displayName = displayName;
    u.lastSeen = Date.now();
    u.interactions = (u.interactions || 0) + 1;
    this.save();
    return u;
  }

  addFact(userId, fact) {
    const u = this.ensure(userId);
    if (!fact || fact.length > 200) return;
    // Évite les doublons exacts
    if (u.facts.some((f) => f.text.toLowerCase() === fact.toLowerCase())) return;
    u.facts.push({ text: fact, ts: Date.now() });
    if (u.facts.length > MAX_FACTS_PER_USER) u.facts.shift();
    this.save();
  }

  setMood(userId, mood) {
    const u = this.ensure(userId);
    u.mood = mood;
    this.save();
  }

  /**
   * Construit un résumé pour injection dans le system prompt
   */
  buildContext(userId) {
    const u = this.users.get(String(userId));
    if (!u) return '';
    const lines = [];
    lines.push(`MÉMOIRE SUR ${u.displayName} :`);
    lines.push(`- Interactions totales : ${u.interactions}`);
    if (u.facts.length > 0) {
      lines.push('- Ce que tu sais sur cette personne :');
      u.facts.slice(-8).forEach((f) => lines.push(`  • ${f.text}`));
    } else {
      lines.push("- Tu ne le connais pas encore. Pose des questions pour apprendre.");
    }
    if (u.mood) lines.push(`- Dernière humeur perçue : ${u.mood}`);
    return lines.join('\n');
  }

  /**
   * Stats globales (admin)
   */
  getStats() {
    return {
      totalUsers: this.users.size,
      totalInteractions: [...this.users.values()].reduce((s, u) => s + (u.interactions || 0), 0),
    };
  }
}

const userMemory = new UserMemory();
module.exports = userMemory;
