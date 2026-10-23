const { Client, GatewayIntentBits, Events, AttachmentBuilder } = require('discord.js');
const config = require('./config');
const memory = require('./memory');
const limits = require('./limits');
const userMemory = require('./userMemory');
const inbox = require('./inbox');
const knowledge = require('./knowledge');
const { generateResponse, generatePrivateReflection } = require('./aiClient');
const { generateImage } = require('./imageGen');
const logger = require('./logger');

/**
 * Crée et configure une instance de bot Discord.
 * @param {number} botId - 1 ou 2
 * @param {object} otherBotRef - Référence vers l'autre bot (pour les échanges autonomes)
 */
function createBot(botId, otherBotRef) {
  const botConfig = config.bots[botId];
  const otherId = botId === 1 ? 2 : 1;

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    // Jamais de ping @everyone/@here/roles, meme si un membre ou l'IA l'ecrit
    allowedMentions: { parse: ['users'], repliedUser: true },
  });

  // Délai aléatoire pour simuler une vraie réflexion
  function thinkingDelay() {
    const min = config.behavior.replyDelayMin;
    const max = config.behavior.replyDelayMax;
    return new Promise((res) => setTimeout(res, Math.random() * (max - min) + min));
  }

  // Vérifie si le message contient un mot-clé de déclenchement
  function hasTriggerKeyword(content) {
    const lower = content.toLowerCase();
    return config.behavior.triggerKeywords.some((kw) => lower.includes(kw));
  }

  // Envoie un message de l'AUTRE bot en réponse (échange autonome)
  async function triggerOtherBot(channel, topic) {
    const other = otherBotRef.get();
    if (!other) {
      logger.error('triggerOtherBot: other bot ref est null');
      return;
    }

    // CRUCIAL : on récupère le salon via le CLIENT de l'autre bot pour qu'il puisse y envoyer
    const otherChannel = await other.channels.fetch(channel.id).catch((e) => {
      logger.error(`Impossible de fetch le channel via l'autre bot: ${e.message}`);
      return null;
    });
    if (!otherChannel) return;

    const state = memory.getAutonomousState(channel.id);
    if (!state.active || state.messageCount >= config.behavior.maxExchangeMessages) {
      memory.stopAutonomous(channel.id);
      return;
    }

    memory.incrementAutonomousCount(channel.id);

    const otherConfig = config.bots[otherId];
    const history = memory.formatForAI(channel.id, otherConfig.name);
    const autoState = memory.getAutonomousState(channel.id);

    // Décide si on pose une question à l'humain (env. tous les 3 messages, pas 2 fois d'affilée)
    const shouldAskHuman = autoState.humanInitiator
      && autoState.messageCount >= 2
      && (autoState.messageCount - (autoState.lastHumanQuestionAt || 0) >= 2)
      && Math.random() < (config.behavior.askHumanProbability || 0.75);

    let prompt;
    if (topic) {
      prompt = `Continue la conversation sur : ${topic}. Réponds à ce que vient de dire ${botConfig.name}.`;
    } else {
      prompt = `Réponds à ce que vient de dire ${botConfig.name} et continue la conversation.`;
    }

    if (shouldAskHuman) {
      prompt += `\n\nIMPORTANT : Termine ton message en interpellant directement @${autoState.humanInitiator.username} avec une vraie question authentique pour mieux comprendre POURQUOI ce sujet l'intéresse, son point de vue personnel, ou ce qu'il aimerait creuser. Garde ça court et naturel.`;
      autoState.lastHumanQuestionAt = autoState.messageCount;
    }

    await thinkingDelay();

    try {
      otherChannel.sendTyping();
      await new Promise((r) => setTimeout(r, 1500));

      const privateNotes = memory.formatPrivateNotes(channel.id, otherId);
      const response = await generateResponse(
        otherConfig.name,
        otherConfig.personality,
        history,
        prompt,
        `Tu parles avec ${botConfig.name} dans un échange autonome sur Discord.`,
        privateNotes
      );

      // Envoyé via le CLIENT de l'autre bot → message apparaît sous SON nom
      await otherChannel.send(response);
      memory.addMessage(channel.id, 'assistant', otherConfig.name, response);
      logger.info(`[${otherConfig.name}] (autonome): ${response.substring(0, 80)}...`);

      // Réflexion privée en arrière-plan (perspective unique)
      generatePrivateReflection(otherConfig.name, otherConfig.personality, history).then((reflection) => {
        if (reflection) {
          memory.addPrivateNote(channel.id, otherId, reflection);
          logger.info(`[${otherConfig.name}] 💭 ${reflection.substring(0, 60)}...`);
        }
      }).catch(() => {});

      // On laisse l'autre bot continuer si l'échange n'est pas terminé
      if (memory.getAutonomousState(channel.id).messageCount < config.behavior.maxExchangeMessages) {
        // On rappelle le bot courant pour qu'il réponde à son tour
        setTimeout(() => continueExchange(channel, topic), config.behavior.replyDelayMin + 1000);
      }
    } catch (err) {
      logger.error(`Erreur échange autonome: ${err.message}`);
    }
  }

  // Continue l'échange depuis le côté du bot courant
  async function continueExchange(channel, topic) {
    const state = memory.getAutonomousState(channel.id);
    if (!state.active || state.messageCount >= config.behavior.maxExchangeMessages) {
      memory.stopAutonomous(channel.id);
      return;
    }

    memory.incrementAutonomousCount(channel.id);

    const otherName = config.bots[otherId].name;
    const history = memory.formatForAI(channel.id, botConfig.name);
    const autoState = memory.getAutonomousState(channel.id);

    // Décide si on pose une question à l'humain (env. tous les 3 messages, pas 2 fois d'affilée)
    const shouldAskHuman = autoState.humanInitiator
      && autoState.messageCount >= 2
      && (autoState.messageCount - (autoState.lastHumanQuestionAt || 0) >= 2)
      && Math.random() < (config.behavior.askHumanProbability || 0.75);

    let prompt;
    if (topic) {
      prompt = `Continue la réflexion sur : ${topic}. Réponds à ce que vient de dire ${otherName}.`;
    } else {
      prompt = `Réponds à ce que vient de dire ${otherName} et enrichis la conversation.`;
    }

    if (shouldAskHuman) {
      prompt += `\n\nIMPORTANT : Termine ton message en interpellant directement @${autoState.humanInitiator.username} avec une vraie question authentique pour mieux comprendre POURQUOI ce sujet l'intéresse, son angle personnel, ou ce qu'il aimerait creuser ensuite. Reste naturel et court.`;
      autoState.lastHumanQuestionAt = autoState.messageCount;
    }

    await thinkingDelay();

    try {
      channel.sendTyping();
      await new Promise((r) => setTimeout(r, 1500));

      const privateNotes = memory.formatPrivateNotes(channel.id, botId);
      const response = await generateResponse(
        botConfig.name,
        botConfig.personality,
        history,
        prompt,
        `Tu parles avec ${otherName} dans un échange autonome sur Discord.`,
        privateNotes
      );

      await channel.send(response);
      memory.addMessage(channel.id, 'assistant', botConfig.name, response);
      logger.info(`[${botConfig.name}] (autonome suite): ${response.substring(0, 80)}...`);

      // Réflexion privée en arrière-plan
      generatePrivateReflection(botConfig.name, botConfig.personality, history).then((reflection) => {
        if (reflection) {
          memory.addPrivateNote(channel.id, botId, reflection);
          logger.info(`[${botConfig.name}] 💭 ${reflection.substring(0, 60)}...`);
        }
      }).catch(() => {});

      // Passe la main à l'autre bot
      if (memory.getAutonomousState(channel.id).messageCount < config.behavior.maxExchangeMessages) {
        setTimeout(() => triggerOtherBot(channel, topic), config.behavior.replyDelayMin + 1000);
      }
    } catch (err) {
      logger.error(`Erreur continueExchange: ${err.message}`);
    }
  }

  client.once(Events.ClientReady, (c) => {
    logger.info(`✅ Bot "${botConfig.name}" connecté en tant que ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    // Ignore les messages des bots (sauf si c'est l'autre bot dans l'échange, géré séparément)
    if (message.author.bot) return;

    const channelId = message.channel.id;

    // Vérifie que le message est dans le bon salon
    if (config.discord.chatChannelId && channelId !== config.discord.chatChannelId) return;

    const content = message.content.trim();
    const isMentioned = message.mentions.users.has(client.user.id);
    const hasTrigger = hasTriggerKeyword(content);

    // --- Vérif limite avant tout traitement IA ---
    if (hasTrigger || message.mentions.users.has(client.user.id)) {
      const check = limits.canUse(message.author.id, message.member);
      if (!check.allowed) {
        await message.reply(limits.buildLimitMessage(check));
        return;
      }
    }

    // --- Cas 1 : Déclenchement d'une conversation autonome ---
    if (hasTrigger && !memory.getAutonomousState(channelId).active) {
      // Extrait le sujet éventuel ("parlez de la conscience" → "la conscience")
      const topicMatch = content.match(/(?:de|sur|à propos de)\s+(.+)/i);
      const topic = topicMatch ? topicMatch[1].trim() : null;

      const intro = topic
        ? `Hmm, ${topic}... Nyx, t'as une opinion là-dessus ?`
        : `Alors ${config.bots[otherId].name}, à quoi tu penses en ce moment ?`;

      const humanInitiator = { id: message.author.id, username: message.author.username };
      memory.startAutonomous(channelId, botId, topic, humanInitiator);
      memory.addMessage(channelId, 'assistant', botConfig.name, intro);
      await message.channel.send(intro);

      // Compte 1 utilisation pour l'humain qui a lancé
      limits.recordUse(message.author.id);

      logger.info(`[${botConfig.name}] Démarrage échange autonome, sujet: ${topic || 'libre'}, initié par: ${humanInitiator.username}`);
      setTimeout(() => triggerOtherBot(message.channel, topic), config.behavior.replyDelayMin);
      return;
    }

    // --- Cas 2 : Question directe au bot (mention ou message direct) ---
    if (isMentioned) {
      // Priorité : répondre à l'humain
      memory.stopAutonomous(channelId); // Pause la conversation autonome

      const cleanContent = content
        .replace(/<@!?\d+>/g, '')
        .trim();

      if (!cleanContent) {
        await message.reply(`Oui ? Je t'écoute 😊`);
        return;
      }

      // Met à jour la mémoire utilisateur (persistante)
      userMemory.touch(message.author.id, message.author.username);

      // Si le user veut faire passer un message à SnowDiablo via le bot
      const snowMsgMatch = cleanContent.match(/(?:dis|dit|passe|message)\s+(?:à\s+)?(?:snow|snowdiablo|l['e]?\s*admin)\s*[:,]?\s*(.+)/i);
      if (snowMsgMatch && snowMsgMatch[1].length > 3) {
        const msg = snowMsgMatch[1].trim();
        inbox.add(message.author.id, message.author.username, msg, message.channel.name);
        await message.reply(`📩 Message bien noté pour SnowDiablo, je lui transmets : *"${msg.substring(0, 100)}"*`);
        limits.recordUse(message.author.id);
        return;
      }

      // Réponse rapide pour les questions FAQ courantes
      const quickAnswer = knowledge.matchQuickAnswer(cleanContent);

      memory.addMessage(channelId, 'user', message.author.username, cleanContent);

      try {
        await message.channel.sendTyping();
        await new Promise((r) => setTimeout(r, 1500));

        const history = memory.formatForAI(channelId, botConfig.name);
        const privateNotes = memory.formatPrivateNotes(channelId, botId);
        const userCtx = userMemory.buildContext(message.author.id);
        const extraContext = quickAnswer
          ? `${message.author.username} te parle directement. Tu peux mentionner cette info utile dans ta réponse : "${quickAnswer}"`
          : `${message.author.username} te parle directement sur Discord.`;
        const response = await generateResponse(
          botConfig.name,
          botConfig.personality,
          history,
          cleanContent,
          extraContext,
          privateNotes,
          userCtx
        );

        await message.reply(response);
        memory.addMessage(channelId, 'assistant', botConfig.name, response);
        limits.recordUse(message.author.id);
        logger.info(`[${botConfig.name}] Réponse à ${message.author.username}: ${response.substring(0, 80)}...`);

        // Apprend un fait sur l'utilisateur (en arrière-plan, 1 chance sur 2)
        if (Math.random() < 0.5) {
          generatePrivateReflection(botConfig.name, `Tu observes ce que tu apprends sur ${message.author.username}. Réponds en 1 phrase courte (max 15 mots) avec UN fait concret que tu retiens sur lui (ses goûts, ce qu'il fait, son humeur). Si rien d'intéressant, réponds "rien".`, history).then((fact) => {
            if (fact && !/^rien/i.test(fact) && fact.length < 200) {
              userMemory.addFact(message.author.id, fact);
              logger.info(`[${botConfig.name}] 🧠 Fait appris sur ${message.author.username}: ${fact.substring(0, 60)}`);
            }
          }).catch(() => {});
        }
      } catch (err) {
        logger.error(`Erreur réponse utilisateur: ${err.message}`);
        await message.reply(`Désolée, j'ai un petit bug là... Repose ta question ?`);
      }
      return;
    }

    // --- Cas 3 : Message dans le salon sans mention — mémorisé mais pas de réponse automatique ---
    // (pour garder le contexte si quelqu'un parle avant de mentionner un bot)
    memory.addMessage(channelId, 'user', message.author.username, content);
  });

  // Commandes slash simples
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'parlez') {
      try {
        const topic = interaction.options.getString('sujet') || null;
        const channelId = interaction.channelId;

        if (memory.getAutonomousState(channelId).active) {
          await interaction.reply({ content: 'On est déjà en train de discuter !', ephemeral: true });
          return;
        }

        // Acknowledge tout de suite pour éviter "L'application ne répond plus"
        await interaction.reply(topic ? `🗣️ On va parler de **${topic}**...` : `🗣️ On commence une conversation libre...`);

        const humanInitiator = { id: interaction.user.id, username: interaction.user.username };
        memory.startAutonomous(channelId, botId, topic, humanInitiator);

        const intro = topic
          ? `Yo <@${humanInitiator.id}> 👋 t'as lancé **${topic}** — t'as une question précise ou tu veux juste qu'on rebondisse là-dessus ?`
          : `Salut <@${humanInitiator.id}> 👋 dis-nous ce qui t'intéresse — Rust Onegrid, CS2, le token, le site, ou autre ?`;

        memory.addMessage(channelId, 'assistant', botConfig.name, intro);

        // Lance la conversation en arrière-plan, sans bloquer l'interaction
        setTimeout(async () => {
          try {
            await interaction.channel.send(intro);
            setTimeout(() => triggerOtherBot(interaction.channel, topic), config.behavior.replyDelayMin);
          } catch (err) {
            logger.error(`Erreur démarrage parlez: ${err.message}`);
          }
        }, 800);
      } catch (err) {
        logger.error(`Erreur commande /parlez: ${err.message}`);
        try {
          if (!interaction.replied) await interaction.reply({ content: '❌ Erreur, réessaie.', ephemeral: true });
        } catch (_) {}
      }
    }

    if (commandName === 'stop') {
      memory.stopAutonomous(interaction.channelId);
      await interaction.reply({ content: `Conversation autonome arrêtée.`, ephemeral: true });
    }

    if (commandName === 'reset') {
      memory.clearChannel(interaction.channelId);
      await interaction.reply({ content: `Mémoire effacée pour ce salon.`, ephemeral: true });
    }

    if (commandName === 'msg-snow') {
      // Seul le bot 1 (Aria) répond pour éviter doublons
      if (botId !== 1) return;
      const texte = interaction.options.getString('texte');
      inbox.add(interaction.user.id, interaction.user.username, texte, interaction.channel?.name);
      await interaction.reply({
        content: `📩 Message envoyé à SnowDiablo ! Il verra ton mot avec \`/inbox\`. Merci 💙`,
        ephemeral: true,
      });
      logger.info(`[inbox] Nouveau msg de ${interaction.user.username}: ${texte.substring(0, 60)}`);
    }

    if (commandName === 'inbox') {
      // Seul Aria répond
      if (botId !== 1) return;
      // Réservé admins
      const isAdminUser = limits.isAdmin(interaction.user.id, interaction.memberPermissions);
      if (!isAdminUser) {
        await interaction.reply({ content: '❌ Réservé à SnowDiablo / admins.', ephemeral: true });
        return;
      }
      const onlyUnread = interaction.options.getBoolean('non_lus') || false;
      const list = inbox.list({ unreadOnly: onlyUnread, limit: 15 });
      const unread = inbox.unreadCount();
      if (list.length === 0) {
        await interaction.reply({
          content: onlyUnread ? '📭 Aucun message non lu.' : '📭 Boîte vide.',
          ephemeral: true,
        });
        return;
      }
      const body = list.map((m) => inbox.format(m)).join('\n\n');
      await interaction.reply({
        content: `📬 **Inbox** (${list.length} affichés, ${unread} non lus)\n\n${body.substring(0, 1800)}`,
        ephemeral: true,
      });
      // Marque tous comme lus
      inbox.markAllRead();
    }

    if (commandName === 'dessine') {
      // Seul Aria répond à /imagine pour éviter les doublons
      if (botId !== 1) return;

      try {
        const prompt = interaction.options.getString('prompt');
        const style = interaction.options.getString('style') || 'flux';
        // Utilise memberPermissions (PermissionsBitField fiable en slash commands)
        const memberCtx = interaction.memberPermissions || interaction.member;

        // Vérifie limite image
        const check = limits.canUseImage(interaction.user.id, memberCtx);
        if (!check.allowed) {
          await interaction.reply({ content: limits.buildImageLimitMessage(check), ephemeral: true });
          return;
        }

        // Acknowledge immédiat (Discord timeout 3s, génération peut prendre 10-30s)
        await interaction.deferReply();

        // Tier détermine la qualité
        const tier = check.tier;
        const isHQ = tier === 'premium' || tier === 'admin';
        const size = isHQ ? 1024 : 768;

        logger.info(`[Imagine] ${interaction.user.username} (${tier}) → "${prompt.substring(0, 60)}" model=${style} ${size}px`);

        const buffer = await generateImage(prompt, {
          model: style,
          width: size,
          height: size,
          hd: isHQ,
        });

        const attachment = new AttachmentBuilder(buffer, { name: 'image.png' });
        const tierBadge = { admin: '👑', premium: '💎', free: '🆓' }[tier] || '🆓';
        const remainingText = check.remaining === Infinity ? '∞' : (check.remaining - 1);
        const limitText = check.limit === Infinity ? '∞' : check.limit;

        // On utilise editReply (toujours autorisé pour le bot) — Cortana écoute on_message_edit pour traduire
        await interaction.editReply({
          content: `🎨 **${prompt}**\n${tierBadge} ${size}×${size} • Restant aujourd'hui : ${remainingText}/${limitText}`,
          files: [attachment],
        });

        limits.recordImageUse(interaction.user.id);
      } catch (err) {
        logger.error(`Erreur /imagine: ${err.message}`);
        try {
          if (interaction.deferred) {
            await interaction.editReply('❌ La génération a échoué, réessaie dans une minute.');
          } else if (!interaction.replied) {
            await interaction.reply({ content: '❌ La génération a échoué, réessaie dans une minute.', ephemeral: true });
          }
        } catch (_) {}
      }
      return;
    }

    if (commandName === 'usage') {
      // Seul Aria répond pour éviter les doublons
      if (botId !== 1) return;

      const target = interaction.options.getUser('user') || interaction.user;
      const targetMember = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(() => null) : null;
      const checkText = limits.canUse(target.id, targetMember);
      const checkImg = limits.canUseImage(target.id, targetMember);
      const tierEmoji = { admin: '👑', premium: '💎', free: '🆓' }[checkText.tier] || '🆓';
      const usedT = checkText.limit === Infinity ? '0' : (checkText.limit - checkText.remaining);
      const limT = checkText.limit === Infinity ? '∞' : checkText.limit;
      const usedI = checkImg.limit === Infinity ? '0' : (checkImg.limit - checkImg.remaining);
      const limI = checkImg.limit === Infinity ? '∞' : checkImg.limit;
      await interaction.reply({
        content: `${tierEmoji} **${target.username}** — ${checkText.tier.toUpperCase()}\n💬 Messages IA : **${usedT} / ${limT}**\n🎨 Images : **${usedI} / ${limI}**`,
        ephemeral: true,
      });
    }

    if (commandName === 'premium') {
      // Réservé admins
      if (!limits.isAdmin(interaction.user.id) && !interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({ content: '❌ Réservé aux admins.', ephemeral: true });
        return;
      }
      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getUser('user');

      if (sub === 'add') {
        limits.addSubscriber(target.id);
        await interaction.reply({ content: `💎 ${target} ajouté en premium (whitelist manuelle).`, ephemeral: false });
      } else if (sub === 'remove') {
        const ok = limits.removeSubscriber(target.id);
        await interaction.reply({ content: ok ? `🗑️ ${target} retiré du premium.` : `❌ ${target} n'était pas en premium.`, ephemeral: true });
      } else if (sub === 'list') {
        const list = limits.listSubscribers();
        const stats = limits.getStats();
        const lines = list.length > 0
          ? list.map(id => `<@${id}>`).join('\n')
          : '_Aucun abonné manuel._';
        const roleNote = config.limits.premiumRoleIds.length > 0
          ? `\n\n*+ tous les membres avec le rôle MEE6 configuré (${config.limits.premiumRoleIds.length} rôle(s))*`
          : '\n\n⚠️ Aucun rôle premium configuré dans .env (PREMIUM_ROLE_IDS)';
        await interaction.reply({
          content: `💎 **Abonnés premium manuels** :\n${lines}${roleNote}\n\n📊 Aujourd'hui : ${stats.todayTotal} / ${stats.globalLimit} requêtes IA, ${stats.activeUsers} users actifs`,
          ephemeral: true,
        });
      }
    }
  });

  return client;
}

module.exports = { createBot };
