/** PM2 process config — usage: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: "qualilab",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 0.0.0.0 --port 3000",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
