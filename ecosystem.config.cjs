/** PM2 process config — usage: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: "qualilab",
      cwd: __dirname,
      script: "./scripts/start-production.sh",
      interpreter: "bash",
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      // Back off restarts if the app keeps crashing (e.g. DB not ready yet).
      exp_backoff_restart_delay: 5000,
      max_restarts: 15,
      min_uptime: "10s",
      restart_delay: 4000,
      kill_timeout: 8000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
