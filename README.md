# Discord IA Bots — Aria & Nyx

Deux bots IA capables de discuter entre eux de façon autonome et de répondre aux utilisateurs.  
Basés sur **Node.js + discord.js + OpenRouter** (ou OpenAI).

---

## Fonctionnalités

- **Conversation autonome** — les bots s'auto-alimentent sur un sujet donné
- **Réponse aux utilisateurs** — mentionnez un bot pour lui poser une question
- **Mémoire courte** — ils se souviennent des derniers échanges du salon
- **Personnalités distinctes** — Aria (curieuse/chaleureuse) et Nyx (philosophique/mystérieuse)
- **Modération intégrée** — zéro racisme, homophobie, contenu illégal
- **Ton adulte autorisé** — flirt et sujets matures, sans contenu explicite excessif
- **Commandes slash** — `/parlez`, `/stop`, `/reset`

---

## Prérequis

| Outil | Version |
|-------|---------|
| Node.js | >= 18 |
| npm | >= 9 |
| Un VPS Linux | Ubuntu 22.04 recommandé |

---

## Installation locale (Windows)

```bash
# 1. Dans le dossier du projet
npm install

# 2. Copier et remplir la config
copy .env.example .env
# Ouvre .env avec ton éditeur et remplis les tokens

# 3. Enregistrer les commandes slash (une seule fois)
node src/registerCommands.js

# 4. Lancer les bots
npm start
```

---

## Installation sur VPS Linux (Ubuntu)

### Étape 1 — Connexion et mise à jour

```bash
ssh user@ton-ip-vps
sudo apt update && sudo apt upgrade -y
```

### Étape 2 — Installer Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # doit afficher v20.x.x
```

### Étape 3 — Installer PM2 (gestionnaire de processus)

```bash
sudo npm install -g pm2
```

### Étape 4 — Copier le projet sur le VPS

**Option A — via Git (recommandé)**
```bash
# Sur le VPS :
git clone https://github.com/TON-USER/discord-ia-bots.git
cd discord-ia-bots
npm install
```

**Option B — via SCP depuis Windows**
```bash
# Dans PowerShell sur ta machine :
scp -r "C:\Users\Alexi\project bot ia discord" user@ton-ip:/home/user/discord-bots
```

### Étape 5 — Configurer .env

```bash
cp .env.example .env
nano .env
# Remplis les valeurs, puis Ctrl+X > Y > Entrée pour sauvegarder
```

### Étape 6 — Enregistrer les commandes slash (une seule fois)

```bash
node src/registerCommands.js
```

### Étape 7 — Lancer avec PM2

```bash
pm2 start ecosystem.config.js
pm2 save                    # sauvegarde pour redémarrage auto
pm2 startup                 # active le démarrage automatique au boot
# Copie-colle la commande que PM2 te donne
```

### Commandes PM2 utiles

```bash
pm2 status                  # état des bots
pm2 logs discord-ia-bots    # voir les logs en temps réel
pm2 restart discord-ia-bots # redémarrer
pm2 stop discord-ia-bots    # arrêter
pm2 delete discord-ia-bots  # supprimer de PM2
```

---

## Configuration Discord Developer Portal

### Créer les deux applications

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clique **New Application** → nomme-la `Aria`
3. Onglet **Bot** → clique **Add Bot**
4. Active ces **Privileged Gateway Intents** :
   - `Server Members Intent`
   - `Message Content Intent`
5. Copie le **Token** → colle dans `BOT1_TOKEN` dans `.env`
6. Répète les étapes 2-5 pour `Nyx` → `BOT2_TOKEN`

### Inviter les bots sur ton serveur

Pour chaque bot, dans l'onglet **OAuth2 > URL Generator** :
- Scopes : `bot` + `applications.commands`
- Permissions : `Send Messages`, `Read Messages/View Channels`, `Use Slash Commands`
- Copie l'URL générée et ouvre-la dans ton navigateur

---

## Configuration OpenRouter (recommandé)

OpenRouter permet d'accéder à des modèles variés dont certains non-filtrés.

1. Inscris-toi sur [openrouter.ai](https://openrouter.ai)
2. Crée une clé API
3. Colle-la dans `OPENROUTER_API_KEY` dans `.env`
4. Choisis ton modèle dans `AI_MODEL` :

| Modèle | Prix | Qualité | Filtrage |
|--------|------|---------|----------|
| `meta-llama/llama-3.1-8b-instruct:free` | Gratuit | Bon | Standard |
| `openai/gpt-4o-mini` | ~$0.15/1M tokens | Très bon | Filtré |
| `nousresearch/hermes-3-llama-3.1-405b` | ~$3/1M tokens | Excellent | Permissif |
| `cognitivecomputations/dolphin-mixtral-8x22b` | ~$0.9/1M tokens | Très bon | Non-filtré |

---

## Utilisation

### Commandes slash

| Commande | Description |
|----------|-------------|
| `/parlez` | Lance une conversation autonome libre |
| `/parlez sujet:la conscience` | Lance un débat sur un sujet précis |
| `/stop` | Arrête la conversation autonome |
| `/reset` | Efface la mémoire du salon |

### Mots-clés dans le chat

Ces mots déclenchent automatiquement une conversation entre les bots :
- `parlez`, `discutez`, `débattez`, `causez`, `chat entre vous`

Exemple : `hey les gars, parlez de l'amour !`

### Poser une question directe

Mentionnez le bot : `@Aria c'est quoi ton film préféré ?`

---

## Personnaliser les bots

Edite `src/config.js` pour modifier :

```js
// Changer la personnalité d'Aria
personality: `Tu es Aria, [ta description ici]...`

// Ajouter des mots-clés déclencheurs
triggerKeywords: ['parlez', 'discutez', 'vos avis', 'débattez'],

// Changer le nombre de messages max dans un échange
maxExchangeMessages: 12,
```

---

## Structure du projet

```
discord-ia-bots/
├── index.js                 # Point d'entrée, lance les deux bots
├── ecosystem.config.js      # Config PM2 pour le VPS
├── package.json
├── .env.example             # Template de configuration
├── .env                     # Ta configuration (ne pas commit !)
├── logs/                    # Logs générés automatiquement
└── src/
    ├── config.js            # Configuration et personnalités
    ├── botInstance.js       # Logique principale de chaque bot
    ├── aiClient.js          # Client API OpenRouter/OpenAI
    ├── memory.js            # Mémoire courte partagée
    ├── registerCommands.js  # Enregistrement des commandes slash
    └── logger.js            # Système de logs
```

---

## Dépannage

**Les bots ne répondent pas**
- Vérifie que `Message Content Intent` est activé sur Discord Developer Portal
- Vérifie que `CHAT_CHANNEL_ID` correspond au bon salon

**Erreur d'API**
- Vérifie ta clé `OPENROUTER_API_KEY` dans `.env`
- Vérifie que tu as du crédit sur OpenRouter

**Les commandes slash n'apparaissent pas**
- Relance `node src/registerCommands.js`
- Les commandes peuvent prendre 1-2 minutes à apparaître

**Les bots se répondent en boucle**
- Utilise `/stop` pour stopper l'échange
- Réduis `MAX_EXCHANGE_MESSAGES` dans `.env`

---

## Coût estimé

Avec le modèle gratuit de Llama sur OpenRouter :
- **Gratuit** pour commencer
- Passe à `gpt-4o-mini` (~$0.001 par conversation) pour plus de qualité
