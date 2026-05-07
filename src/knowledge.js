/**
 * Base de connaissances SnowDiablo — injectée dans le system prompt.
 * Mets ici tout ce que les bots DOIVENT savoir pour donner des infos justes.
 */
module.exports = {
  // Infos publiques que les bots peuvent citer librement
  publicFacts: `INFOS UTILES À TRANSMETTRE AUX MEMBRES (utilise-les quand quelqu'un demande) :

🌐 SITE OFFICIEL : https://snowdiablo.net
🎮 SERVEUR RUST "ONEGRID" :
  - Vote quotidien : https://snowdiablo.net/vote (récompenses DAYLI CHEST)
  - Connexion : utilise le launcher Rust + recherche "Onegrid"
  - DAYLI CHEST : récompense quotidienne en jouant + en votant
🔫 SERVEUR CS2 : Counter-Strike 2 communautaire (demande à SnowDiablo pour l'IP)
💰 TOKEN CRYPTO / SNAKE-COIN : projet web crypto type Snake game
🎥 TWITCH : streams réguliers + clips dans #your-clips
🌍 COMMUNAUTÉ MULTILINGUE : fr/en/pt/uk/ru — Cortana traduit auto
📅 EVENTS : annoncés dans #alertes et #instant-gaming

COMMANDES BOT :
  /parlez sujet:X      → Aria & Nyx débattent
  /dessine prompt:X    → Génère une image (gratuit puis abo MEE6)
  /usage               → Voir ton compteur du jour
  /msg-snow texte:X    → Laisser un message à SnowDiablo

ABONNEMENT MEE6 (10€/mois) → 200 messages IA + 10 images/jour au lieu de 10/3 :
https://mee6.xyz/fr/m/349252220866527240?subscribe=889560998678364160&bundle=1
`,

  // Quand un user demande "comment voter / connexion serveur / etc.", utiliser ces réponses préformées
  quickAnswers: [
    {
      keywords: ['vote', 'voter', 'voting', 'vote rust'],
      answer: 'Pour voter Onegrid : https://snowdiablo.net/vote — tu gagnes des récompenses DAYLI CHEST en jeu 🎁',
    },
    {
      keywords: ['rejoindre rust', 'rejoindre onegrid', 'ip rust', 'how join rust', 'connect rust'],
      answer: 'Lance le launcher Rust et cherche "Onegrid" dans la liste des serveurs communautaires 🦴',
    },
    {
      keywords: ['site', 'website', 'snowdiablo.net'],
      answer: 'Le site officiel : https://snowdiablo.net 🌐',
    },
    {
      keywords: ['premium', 'abonnement', 'subscribe'],
      answer: 'L\'abo MEE6 (10€/mois) débloque 200 messages IA et 10 images par jour. Lien : https://mee6.xyz/fr/m/349252220866527240?subscribe=889560998678364160&bundle=1 💎',
    },
  ],

  /**
   * Tente de matcher le message du user à une réponse rapide.
   * Renvoie null si rien trouvé.
   */
  matchQuickAnswer(text) {
    const lower = (text || '').toLowerCase();
    for (const qa of this.quickAnswers) {
      if (qa.keywords.some((kw) => lower.includes(kw))) {
        return qa.answer;
      }
    }
    return null;
  },
};
