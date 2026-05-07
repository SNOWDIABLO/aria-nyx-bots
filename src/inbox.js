/**
 * Boîte de messages que les users peuvent laisser pour SnowDiablo via les bots.
 * SnowDiablo les consulte avec /inbox.
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INBOX_FILE = path.join(DATA_DIR, 'inbox.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

class Inbox {
  constructor() {
    this.messages = []; // { id, from, fromId, text, ts, channel, read }
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(INBOX_FILE)) {
        const data = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8'));
        this.messages = data.messages || [];
      }
    } catch (e) {
      logger.error(`Erreur load inbox: ${e.message}`);
    }
  }

  save() {
    try {
      fs.writeFileSync(INBOX_FILE, JSON.stringify({ messages: this.messages }, null, 2));
    } catch (e) {
      logger.error(`Erreur save inbox: ${e.message}`);
    }
  }

  add(fromId, fromName, text, channelName = null) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const msg = {
      id,
      fromId: String(fromId),
      from: fromName,
      text: (text || '').slice(0, 1000),
      ts: Date.now(),
      channel: channelName,
      read: false,
    };
    this.messages.push(msg);
    if (this.messages.length > 200) this.messages.shift();
    this.save();
    return msg;
  }

  list({ unreadOnly = false, limit = 20 } = {}) {
    let list = this.messages.slice().reverse();
    if (unreadOnly) list = list.filter((m) => !m.read);
    return list.slice(0, limit);
  }

  markAllRead() {
    this.messages.forEach((m) => (m.read = true));
    this.save();
  }

  unreadCount() {
    return this.messages.filter((m) => !m.read).length;
  }

  format(msg) {
    const date = new Date(msg.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const channel = msg.channel ? ` (#${msg.channel})` : '';
    return `📩 **${msg.from}** • ${date}${channel}\n> ${msg.text}`;
  }
}

const inbox = new Inbox();
module.exports = inbox;
