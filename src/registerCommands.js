/**
 * Enregistre les commandes slash Discord.
 * Lance ce script UNE FOIS après avoir configuré .env :
 *   node src/registerCommands.js
 */
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const logger = require('./logger');

const commands = [
  new SlashCommandBuilder()
    .setName('parlez')
    .setDescription('Lance une conversation autonome entre les deux bots IA')
    .addStringOption((opt) =>
      opt.setName('sujet').setDescription('Le sujet dont vous voulez qu\'ils parlent').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Arrête la conversation autonome en cours'),

  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Efface la mémoire des bots pour ce salon'),

  new SlashCommandBuilder()
    .setName('dessine')
    .setDescription('🎨 Génère une image IA SnowDiablo (gratuit avec limite, illimité avec abo MEE6)')
    .addStringOption((opt) =>
      opt.setName('prompt').setDescription('Description de l\'image à générer').setRequired(true).setMaxLength(500)
    )
    .addStringOption((opt) =>
      opt.setName('style').setDescription('Style de l\'image').setRequired(false)
        .addChoices(
          { name: 'Auto (Flux)', value: 'flux' },
          { name: 'Rapide (Turbo)', value: 'turbo' },
          { name: 'Classique (SDXL)', value: 'sdxl' },
        )
    ),

  new SlashCommandBuilder()
    .setName('usage')
    .setDescription('Voir ton utilisation IA du jour (ou celle d\'un autre user)')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('User à inspecter (admin uniquement)').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('msg-snow')
    .setDescription('📩 Laisser un message à SnowDiablo (il le verra avec /inbox)')
    .addStringOption((opt) =>
      opt.setName('texte').setDescription('Ton message').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('inbox')
    .setDescription('📬 Voir les messages laissés par les members (admin)')
    .addBooleanOption((opt) =>
      opt.setName('non_lus').setDescription('Afficher seulement les non-lus').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Gestion des abonnés premium (admin)')
    .addSubcommand((sub) =>
      sub.setName('add')
        .setDescription('Ajouter un user en premium manuellement')
        .addUserOption((o) => o.setName('user').setDescription('User à ajouter').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('remove')
        .setDescription('Retirer un user du premium')
        .addUserOption((o) => o.setName('user').setDescription('User à retirer').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Voir la liste des abonnés et stats')
    ),
].map((cmd) => cmd.toJSON());

async function registerCommands() {
  if (!process.env.BOT1_TOKEN || !process.env.GUILD_ID) {
    logger.error('BOT1_TOKEN et GUILD_ID doivent être définis dans .env');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(process.env.BOT1_TOKEN);

  try {
    logger.info('Enregistrement des commandes slash...');
    await rest.put(Routes.applicationGuildCommands(
      // On récupère l'ID de l'application automatiquement
      (await rest.get(Routes.oauth2CurrentApplication())).id,
      process.env.GUILD_ID
    ), { body: commands });
    logger.info('✅ Commandes slash enregistrées avec succès !');
    logger.info('Commandes disponibles : /parlez, /stop, /reset');
  } catch (err) {
    logger.error(`Erreur enregistrement commandes: ${err.message}`);
    process.exit(1);
  }
}

registerCommands();
