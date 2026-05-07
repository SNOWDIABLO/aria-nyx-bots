const logger = require('./logger');

/**
 * Petit délai (sleep)
 */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Queue globale pour limiter à 1 requête à la fois sur Pollinations
let queue = Promise.resolve();
function enqueue(taskFn) {
  const next = queue.then(() => taskFn());
  // On évite que la queue garde l'erreur (pour ne pas bloquer les suivantes)
  queue = next.catch(() => {});
  return next;
}

/**
 * Génère une image via Pollinations.ai (gratuit, rate-limited).
 * - Sérialise les requêtes (1 à la fois) pour éviter les 429
 * - Retry automatique avec backoff sur 429 / 502 / 503 / 504
 * @param {string} prompt - Description de l'image
 * @param {object} opts - { model, width, height, hd }
 * @returns {Promise<Buffer>} - Le buffer PNG de l'image
 */
async function generateImage(prompt, opts = {}) {
  return enqueue(() => generateImageInternal(prompt, opts));
}

async function generateImageInternal(prompt, opts = {}) {
  const model = opts.model || 'flux';
  const width = opts.width || 1024;
  const height = opts.height || 1024;
  const seed = Math.floor(Math.random() * 1000000);

  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model,
    nologo: 'true',
    private: 'true',
    enhance: opts.hd ? 'true' : 'false',
  });

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;

  // Retry avec backoff exponentiel sur 429/5xx
  const maxAttempts = 4;
  const backoffsMs = [3000, 8000, 15000, 30000]; // 3s, 8s, 15s, 30s
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      // Retry sur 429 (rate limit) ou 5xx (serveur down)
      if (response.status === 429 || response.status >= 500) {
        const wait = backoffsMs[attempt];
        logger.warn(`Pollinations ${response.status}, attente ${wait/1000}s avant retry (essai ${attempt + 1}/${maxAttempts})`);
        if (attempt < maxAttempts - 1) {
          await sleep(wait);
          continue;
        }
        throw new Error(`Pollinations API surchargé (${response.status}). Réessaie dans 1 min.`);
      }

      if (!response.ok) {
        throw new Error(`Pollinations API error: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 1000) {
        throw new Error('Image trop petite, probablement invalide');
      }

      return buffer;
    } catch (err) {
      lastErr = err;
      // Pour les erreurs réseau (timeout, ECONNRESET), on retry aussi
      if (err.name === 'AbortError' || /ECONNRESET|ETIMEDOUT|ENOTFOUND/.test(err.message)) {
        const wait = backoffsMs[attempt];
        logger.warn(`Erreur réseau (${err.message}), retry dans ${wait/1000}s`);
        if (attempt < maxAttempts - 1) {
          await sleep(wait);
          continue;
        }
      }
      // Sinon on remonte l'erreur
      throw err;
    }
  }

  throw lastErr || new Error('Échec génération image');
}

module.exports = { generateImage };
