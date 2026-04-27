module.exports = {
  apps: [
    {
      name: 'api',
      script: 'src/app-api.ts',
      interpreter: 'node',
      node_args: '--experimental-specifier-resolution=node --loader ts-node/esm',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        TZ: 'UTC',
        NODE_ENV: 'production',
      },
    },
  ],
};
