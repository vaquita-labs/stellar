module.exports = {
  apps: [
    {
      name: 'job-deposits-history',
      script: 'src/app-job-deposits-history.ts',
      interpreter: 'node',
      node_args: '--experimental-specifier-resolution=node --loader ts-node/esm',
      instances: 1,
      exec_mode: 'fork',
      env: {
        TZ: 'UTC',
        NODE_ENV: 'production',
      },
    },
  ],
};
