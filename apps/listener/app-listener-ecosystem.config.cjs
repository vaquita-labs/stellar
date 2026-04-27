module.exports = {
  apps: [
    {
      name: 'listener',
      script: 'src/app-listener.ts',
      interpreter: 'node',
      node_args: '--experimental-specifier-resolution=node --loader ts-node/esm',
      instances: 1,
      exec_mode: 'fork',
      env: {
        TZ: 'UTC',
        NODE_ENV: 'production',
        // Required by src/config/env.ts validation
        PORT: process.env.PORT || '3000',
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        // Required by src/services/base/pool.ts (getDepositVaquitaPoolPositions)
        PRIVATE_KEY: process.env.PRIVATE_KEY,
        // Required by src/services/ably/index.ts (used by deposit service)
        ABLY_KEY: process.env.ABLY_KEY,
      },
    },
  ],
};
