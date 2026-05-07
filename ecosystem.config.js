// Configuration PM2 pour le VPS
// Démarre avec : pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'bot-ia-aria-nyx',
      script: 'index.js',
      watch: false,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      log_file: './logs/pm2-combined.log',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      time: true,
    },
  ],
};
