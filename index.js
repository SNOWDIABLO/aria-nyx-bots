require('dotenv').config();
const { createBot } = require('./src/botInstance');
const config = require('./src/config');
const logger = require('./src/logger');
const fs = require('fs');
const path = require('path');

// Crée le dossier logs si inexistant
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

// Validation de la configuration
function validateConfig() {
  const required = ['BOT1_TOKEN', 'BOT2_TOKEN'];
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error(`Variables manquantes dans .env : ${missing.join(', ')}`);
    logger.error('Copie .env.example en .env et remplis les valeurs.');
    process.exit(1);
  }

  if (!hasOpenRouter && !hasOpenAI) {
    logger.error('Il faut OPENROUTER_API_KEY ou OPENAI_API_KEY dans .env');
    process.exit(1);
  }

  if (!process.env.CHAT_CHANNEL_ID) {
    logger.warn('CHAT_CHANNEL_ID non défini — les bots répondront dans tous les salons !');
  }
}

validateConfig();

logger.info('=== Démarrage des bots IA Discord ===');
logger.info(`Bot 1 : ${config.bots[1].name}`);
logger.info(`Bot 2 : ${config.bots[2].name}`);
logger.info(`Modèle IA : ${config.ai.model}`);

// Référence croisée entre les deux bots (pour les échanges autonomes)
const bot2Ref = { get: () => bot2 };
const bot1Ref = { get: () => bot1 };

const bot1 = createBot(1, bot2Ref);
const bot2 = createBot(2, bot1Ref);

// Connexion des deux bots
bot1.login(config.bots[1].token).catch((err) => {
  logger.error(`Impossible de connecter ${config.bots[1].name}: ${err.message}`);
  process.exit(1);
});

bot2.login(config.bots[2].token).catch((err) => {
  logger.error(`Impossible de connecter ${config.bots[2].name}: ${err.message}`);
  process.exit(1);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  logger.info('Arrêt des bots...');
  bot1.destroy();
  bot2.destroy();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error(`Exception non gérée: ${err.message}`);
  logger.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Promesse rejetée: ${reason}`);
});
