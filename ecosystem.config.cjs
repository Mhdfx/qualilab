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
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
