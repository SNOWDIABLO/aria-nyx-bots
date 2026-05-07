const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

class LimitsManager {
  constructor() {
    this.subscribers = new Set();
    this.adminIds = new Set();
    this.usage = new Map(); // userId -> { date, count }
    this.imageUsage = new Map(); // userId -> { date, count }  -- séparé du texte
    this.globalUsage = { date: '', count: 0 };
    this.globalImageUsage = { date: '', count: 0 };
    this.loadData();
  }

  // ─── Persistence ──────────────────────────────────────────

  loadData() {
    try {
      if (fs.existsSync(SUBSCRIBERS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
        this.subscribers = new Set(data.subscribers || []);
        this.adminIds = new Set(data.admins || []);
      }
      if (fs.existsSync(USAGE_FILE)) {
        const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
        for (const [k, v] of Object.entries(data.users || {})) {
          this.usage.set(k, v);
        }
        for (const [k, v] of Object.entries(data.imageUsers || {})) {
          this.imageUsage.set(k, v);
        }
        this.globalUsage = data.global || { date: '', count: 0 };
        this.globalImageUsage = data.globalImage || { date: '', count: 0 };
      }
      // Charger les admins depuis .env aussi
      const envAdmins = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
      envAdmins.forEach(id => this.adminIds.add(id));
    } catch (e) {
      logger.error(`Erreur chargement limites: ${e.message}`);
    }
  }

  saveSubscribers() {
    try {
      fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify({
        subscribers: [...this.subscribers],
        admins: [...this.adminIds],
      }, null, 2));
    } catch (e) {
      logger.error(`Erreur save subscribers: ${e.message}`);
    }
  }

  saveUsage() {
    try {
      const users = {};
      for (const [k, v] of this.usage.entries()) users[k] = v;
      const imageUsers = {};
      for (const [k, v] of this.imageUsage.entries()) imageUsers[k] = v;
      fs.writeFileSync(USAGE_FILE, JSON.stringify({
        users,
        imageUsers,
        global: this.globalUsage,
        globalImage: this.globalImageUsage,
      }, null, 2));
    } catch (e) {
      logger.error(`Erreur save usage: ${e.message}`);
    }
  }

  // ─── Roles ────────────────────────────────────────────────

  isAdmin(userId, memberOrPerms = null) {
    // Whitelist explicite via .env (ADMIN_USER_IDS)
    if (this.adminIds.has(String(userId))) return true;
    if (!memberOrPerms) return false;
    // Cas 1 : objet PermissionsBitField direct (interaction.memberPermissions)
    if (typeof memberOrPerms.has === 'function') {
      try { if (memberOrPerms.has('Administrator')) return true; } catch (_) {}
    }
    // Cas 2 : GuildMember avec .permissions
    if (memberOrPerms.permissions && typeof memberOrPerms.permissions.has === 'function') {
      try { if (memberOrPerms.permissions.has('Administrator')) return true; } catch (_) {}
    }
    // Cas 3 : APIInteractionGuildMember (string bitfield brut)
    if (memberOrPerms.permissions && typeof memberOrPerms.permissions === 'string') {
      try {
        const ADMIN_BIT = 0x8n; // 1 << 3
        if ((BigInt(memberOrPerms.permissions) & ADMIN_BIT) !== 0n) return true;
      } catch (_) {}
    }
    return false;
  }

  /**
   * Vérifie si un user est premium.
   * @param {string} userId - L'ID Discord
   * @param {GuildMember} member - L'objet member (pour vérifier les rôles MEE6 auto)
   */
  isPremium(userId, member = null) {
    // Whitelist manuelle (cadeaux, beta testeurs)
    if (this.subscribers.has(String(userId))) return true;
    // Auto via rôle Discord (abonnement MEE6)
    if (member && config.limits.premiumRoleIds.length > 0) {
      const memberRoleIds = member.roles?.cache?.map(r => r.id) || [];
      if (config.limits.premiumRoleIds.some(rid => memberRoleIds.includes(rid))) {
        return true;
      }
    }
    return false;
  }

  // ─── Check / Record ───────────────────────────────────────

  todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  canUse(userId, member = null) {
    const id = String(userId);
    const today = this.todayKey();

    // Admin = illimité (whitelist .env OU permission Administrator Discord)
    if (this.isAdmin(id, member)) {
      return { allowed: true, tier: 'admin', remaining: Infinity, limit: Infinity };
    }

    // Reset global si nouveau jour
    if (this.globalUsage.date !== today) {
      this.globalUsage = { date: today, count: 0 };
    }

    // Check global limit
    if (this.globalUsage.count >= config.limits.globalPerDay) {
      return { allowed: false, tier: 'global', remaining: 0, limit: config.limits.globalPerDay, reason: 'global' };
    }

    // Tier user (vérifie aussi le rôle Discord pour MEE6)
    const tier = this.isPremium(id, member) ? 'premium' : 'free';
    const limit = tier === 'premium' ? config.limits.premiumPerDay : config.limits.freePerDay;

    let u = this.usage.get(id);
    if (!u || u.date !== today) {
      u = { date: today, count: 0 };
      this.usage.set(id, u);
    }

    if (u.count >= limit) {
      return { allowed: false, tier, remaining: 0, limit, reason: 'user' };
    }

    return { allowed: true, tier, remaining: limit - u.count, limit };
  }

  recordUse(userId) {
    const id = String(userId);
    const today = this.todayKey();

    if (this.isAdmin(id)) {
      // On compte quand même pour le global
      if (this.globalUsage.date !== today) this.globalUsage = { date: today, count: 0 };
      this.globalUsage.count++;
      this.saveUsage();
      return;
    }

    if (this.globalUsage.date !== today) this.globalUsage = { date: today, count: 0 };
    this.globalUsage.count++;

    let u = this.usage.get(id);
    if (!u || u.date !== today) {
      u = { date: today, count: 0 };
      this.usage.set(id, u);
    }
    u.count++;
    this.saveUsage();
  }

  // ─── Limite IMAGE ─────────────────────────────────────────

  canUseImage(userId, member = null) {
    const id = String(userId);
    const today = this.todayKey();

    // Admin = illimité (whitelist .env OU permission Administrator Discord)
    if (this.isAdmin(id, member)) {
      return { allowed: true, tier: 'admin', remaining: Infinity, limit: Infinity };
    }

    if (this.globalImageUsage.date !== today) {
      this.globalImageUsage = { date: today, count: 0 };
    }

    if (this.globalImageUsage.count >= config.limits.globalImagesPerDay) {
      return { allowed: false, tier: 'global', remaining: 0, limit: config.limits.globalImagesPerDay, reason: 'global' };
    }

    const tier = this.isPremium(id, member) ? 'premium' : 'free';
    const limit = tier === 'premium' ? config.limits.premiumImagesPerDay : config.limits.freeImagesPerDay;

    let u = this.imageUsage.get(id);
    if (!u || u.date !== today) {
      u = { date: today, count: 0 };
      this.imageUsage.set(id, u);
    }

    if (u.count >= limit) {
      return { allowed: false, tier, remaining: 0, limit, reason: 'user' };
    }

    return { allowed: true, tier, remaining: limit - u.count, limit };
  }

  recordImageUse(userId) {
    const id = String(userId);
    const today = this.todayKey();

    if (this.globalImageUsage.date !== today) this.globalImageUsage = { date: today, count: 0 };
    this.globalImageUsage.count++;

    if (!this.isAdmin(id)) {
      let u = this.imageUsage.get(id);
      if (!u || u.date !== today) {
        u = { date: today, count: 0 };
        this.imageUsage.set(id, u);
      }
      u.count++;
    }
    this.saveUsage();
  }

  buildImageLimitMessage(check) {
    const url = config.limits.subscribeUrl;
    if (check.reason === 'global') {
      return `🚫 Limite globale d'images atteinte (${check.limit}/jour). Réessaie demain.`;
    }
    if (check.tier === 'free') {
      return `🎨 Tu as utilisé tes **${check.limit} images gratuites du jour**.\n\n💎 Abonne-toi à 10$/mois pour passer à **${config.limits.premiumImagesPerDay} images/jour** : ${url}`;
    }
    if (check.tier === 'premium') {
      return `🎨 Tu as utilisé tes **${check.limit} images premium du jour**. Reset à minuit. Merci pour ton soutien 💎`;
    }
    return `🎨 Limite atteinte. Réessaie plus tard.`;
  }

  // ─── Premium management ───────────────────────────────────

  addSubscriber(userId) {
    this.subscribers.add(String(userId));
    this.saveSubscribers();
  }

  removeSubscriber(userId) {
    const removed = this.subscribers.delete(String(userId));
    this.saveSubscribers();
    return removed;
  }

  listSubscribers() {
    return [...this.subscribers];
  }

  addAdmin(userId) {
    this.adminIds.add(String(userId));
    this.saveSubscribers();
  }

  // ─── Stats ────────────────────────────────────────────────

  getStats() {
    const today = this.todayKey();
    const totalToday = (this.globalUsage.date === today) ? this.globalUsage.count : 0;
    return {
      todayTotal: totalToday,
      globalLimit: config.limits.globalPerDay,
      subscribers: this.subscribers.size,
      admins: this.adminIds.size,
      activeUsers: [...this.usage.values()].filter(u => u.date === today).length,
    };
  }

  buildLimitMessage(check) {
    const url = config.limits.subscribeUrl;
    if (check.reason === 'global') {
      return `🚫 Limite quotidienne globale atteinte (${check.limit} messages/jour). Réessaie demain ou abonne-toi pour soutenir : ${url}`;
    }
    if (check.tier === 'free') {
      return `⏸️ Tu as utilisé tes **${check.limit} messages gratuits du jour**. Reset à minuit (UTC).\n\n💎 Abonne-toi pour passer à **${config.limits.premiumPerDay} messages/jour** : ${url}`;
    }
    if (check.tier === 'premium') {
      return `⏸️ Tu as utilisé tes **${check.limit} messages premium du jour**. Reset à minuit (UTC). Merci pour ton soutien ! 💎`;
    }
    return `⏸️ Limite atteinte. Réessaie plus tard.`;
  }
}

const limits = new LimitsManager();
module.exports = limits;
