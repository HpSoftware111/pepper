/**
 * PM2 Ecosystem Configuration for Pepper 2.0 Backend
 * (.cjs = CommonJS; required when package.json has "type": "module")
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Auto-start on reboot:
 *   pm2 startup systemd
 *   pm2 save
 */

module.exports = {
  apps: [{
    name: 'pepper-2.0-backend',
    script: './index.js',
    cwd: '/opt/pepper-2.0/backend',
    instances: 1,
    exec_mode: 'fork',

    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },

    // Logging
    error_file: '/home/ubuntu/.pm2/logs/pepper-2.0-error.log',
    out_file: '/home/ubuntu/.pm2/logs/pepper-2.0-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Restart policy
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '500M',

    // Watch mode (disabled for production)
    watch: false,
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      'cases',
      '*.log'
    ],

    // Advanced options
    kill_timeout: 5000,
    listen_timeout: 3000,
    shutdown_with_message: true,

    // Source map support (if needed)
    source_map_support: true,

    // Instance variables (can be overridden)
    instance_var: 'INSTANCE_ID'
  }]
};
