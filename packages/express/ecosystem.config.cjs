module.exports = {
  apps: [
    {
      name: 'express-api',
      script: './src/server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      instances: process.env.PM2_INSTANCES || 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 8787,
        LOAD_TEST: 'true',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8787,
      },
    },
  ],
};
