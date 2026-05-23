# Database Migration

This document describes the procedure for rebuilding the Supabase database schema from scratch. The migration is split into two stages: a teardown stage that drops all existing objects, and a creation stage that recreates the schema with the proper primary keys, foreign keys, sequences, indexes, and permissions.

## Stage 1: Teardown

Drop all tables and sequences in dependency order. Run this first and confirm that the Table Editor panel is empty before proceeding.

```sql
-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS "profiles_map_objects" CASCADE;
DROP TABLE IF EXISTS "map_objects" CASCADE;
DROP TABLE IF EXISTS "profiles_rewards" CASCADE;
DROP TABLE IF EXISTS "rewards" CASCADE;
DROP TABLE IF EXISTS "profiles_deposits" CASCADE;
DROP TABLE IF EXISTS "withdrawals" CASCADE;
DROP TABLE IF EXISTS "deposits" CASCADE;
DROP TABLE IF EXISTS "profiles" CASCADE;
DROP TABLE IF EXISTS "tokens_networks" CASCADE;
DROP TABLE IF EXISTS "networks" CASCADE;
DROP TABLE IF EXISTS "tokens" CASCADE;
DROP TABLE IF EXISTS "contracts" CASCADE;

-- Drop sequences
DROP SEQUENCE IF EXISTS deposits_id_seq CASCADE;
DROP SEQUENCE IF EXISTS networks_id_seq CASCADE;
DROP SEQUENCE IF EXISTS profiles_id_seq CASCADE;
DROP SEQUENCE IF EXISTS tokens_id_seq CASCADE;
DROP SEQUENCE IF EXISTS withdrawals_id_seq CASCADE;
DROP SEQUENCE IF EXISTS contracts_id_seq CASCADE;
DROP SEQUENCE IF EXISTS map_objects_id_seq CASCADE;
DROP SEQUENCE IF EXISTS profiles_deposits_id_seq CASCADE;
DROP SEQUENCE IF EXISTS profiles_map_objects_id_seq CASCADE;
DROP SEQUENCE IF EXISTS profiles_rewards_id_seq CASCADE;
DROP SEQUENCE IF EXISTS rewards_id_seq CASCADE;
```

## Stage 2: Schema Creation

This stage recreates the schema with primary keys, foreign keys, sequences, indexes, and Supabase role permissions.

```sql
-- =========================================
-- 1. SEQUENCES (for auto-increment IDs)
-- =========================================
CREATE SEQUENCE contracts_id_seq;
CREATE SEQUENCE tokens_id_seq;
CREATE SEQUENCE networks_id_seq;
CREATE SEQUENCE profiles_id_seq;
CREATE SEQUENCE deposits_id_seq;
CREATE SEQUENCE withdrawals_id_seq;
CREATE SEQUENCE profiles_deposits_id_seq;
CREATE SEQUENCE rewards_id_seq;
CREATE SEQUENCE profiles_rewards_id_seq;
CREATE SEQUENCE map_objects_id_seq;
CREATE SEQUENCE profiles_map_objects_id_seq;


-- =========================================
-- 2. BASE TABLES (no dependencies)
-- =========================================

CREATE TABLE "contracts" (
  "id" bigint NOT NULL DEFAULT nextval('contracts_id_seq'::regclass),
  "network_id" integer,
  "created_at" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "abi" jsonb,
  "address" text,
  "description" text,
  CONSTRAINT contracts_pkey PRIMARY KEY ("id")
);

CREATE TABLE "tokens" (
  "id" integer NOT NULL DEFAULT nextval('tokens_id_seq'::regclass),
  "name" character varying(50) NOT NULL,
  "symbol" character varying(20) NOT NULL,
  "decimals" integer,
  CONSTRAINT tokens_pkey PRIMARY KEY ("id")
);

CREATE TABLE "networks" (
  "id" integer NOT NULL DEFAULT nextval('networks_id_seq'::regclass),
  "name" character varying(50) NOT NULL,
  "layer" character varying(20),
  "type" character varying(100),
  "smart_contract_env" character varying(50),
  "languages" text,
  "origins" text,
  "order" numeric,
  "chain_id" numeric,
  CONSTRAINT networks_pkey PRIMARY KEY ("id")
);

CREATE TABLE "rewards" (
  "id" bigint NOT NULL DEFAULT nextval('rewards_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "name" text DEFAULT ''::text,
  "key" text,
  CONSTRAINT rewards_pkey PRIMARY KEY ("id")
);

CREATE TABLE "map_objects" (
  "id" bigint NOT NULL DEFAULT nextval('map_objects_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "type" text DEFAULT ''::text,
  "size" text DEFAULT '0,0,0'::text,
  "variants" text DEFAULT ''::text,
  "prices" numeric DEFAULT 0,
  "free_items" text,
  CONSTRAINT map_objects_pkey PRIMARY KEY ("id")
);


-- =========================================
-- 3. TABLES WITH FOREIGN KEYS TO BASE TABLES
-- =========================================

CREATE TABLE "tokens_networks" (
  "token_id" integer NOT NULL,
  "network_id" integer NOT NULL,
  "is_native" boolean NOT NULL DEFAULT false,
  "is_gas" boolean NOT NULL DEFAULT false,
  "is_supported" boolean NOT NULL DEFAULT false,
  "contract_address" character varying(128),
  "vaquita_contract_address" character varying(128),
  "token_decimals" smallint DEFAULT 0,
  "lock_period" text,
  "aave_pool_contract_address" text,
  "aave_token_symbol" text,
  "aave_token_contract_address" text,
  CONSTRAINT tokens_networks_pkey PRIMARY KEY ("token_id", "network_id"),
  CONSTRAINT tokens_networks_token_id_fkey FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE,
  CONSTRAINT tokens_networks_network_id_fkey FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE CASCADE
);

CREATE TABLE "profiles" (
  "id" integer NOT NULL DEFAULT nextval('profiles_id_seq'::regclass),
  "wallet_address" character varying(100) NOT NULL,
  "network_id" integer NOT NULL,
  "nickname" character varying(50),
  "full_name" character varying(100),
  "email" character varying(100),
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY ("id"),
  CONSTRAINT profiles_network_id_fkey FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE RESTRICT,
  CONSTRAINT profiles_wallet_network_unique UNIQUE ("wallet_address", "network_id")
);

CREATE TABLE "deposits" (
  "id" integer NOT NULL DEFAULT nextval('deposits_id_seq'::regclass),
  "wallet_address" character varying(100) NOT NULL,
  "network_id" integer NOT NULL,
  "token_id" integer NOT NULL,
  "amount" numeric NOT NULL,
  "transaction_hash" character varying(100),
  "status" character varying(20) NOT NULL DEFAULT 'initiated'::character varying,
  "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "transaction_event_raw" text,
  "deposit_id_hex" text,
  "confirmed_at" timestamp without time zone,
  "lock_period" numeric,
  "vaquita_contract_address" text,
  CONSTRAINT deposits_pkey PRIMARY KEY ("id"),
  CONSTRAINT deposits_network_id_fkey FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE RESTRICT,
  CONSTRAINT deposits_token_id_fkey FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE RESTRICT
);


-- =========================================
-- 4. TABLES WITH FOREIGN KEYS TO LEVEL 3 TABLES
-- =========================================

CREATE TABLE "withdrawals" (
  "id" integer NOT NULL DEFAULT nextval('withdrawals_id_seq'::regclass),
  "deposit_id" integer NOT NULL,
  "transaction_hash" character varying(100),
  "status" character varying(20) NOT NULL DEFAULT 'initiated'::character varying,
  "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  "transaction_event_raw" text,
  "confirmed_at" timestamp without time zone,
  "transfer_amount" numeric,
  "interest" numeric,
  "reward" numeric,
  CONSTRAINT withdrawals_pkey PRIMARY KEY ("id"),
  CONSTRAINT withdrawals_deposit_id_fkey FOREIGN KEY ("deposit_id") REFERENCES "deposits"("id") ON DELETE CASCADE
);

CREATE TABLE "profiles_deposits" (
  "id" bigint NOT NULL DEFAULT nextval('profiles_deposits_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
  "total_active_deposits_count" numeric DEFAULT 0,
  "profile_id" integer NOT NULL,
  "total_active_deposits" numeric[],
  "timestamp" timestamp without time zone,
  CONSTRAINT profiles_deposits_pkey PRIMARY KEY ("id"),
  CONSTRAINT profiles_deposits_profile_id_fkey FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE
);

CREATE TABLE "profiles_rewards" (
  "id" bigint NOT NULL DEFAULT nextval('profiles_rewards_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "profile_id" integer NOT NULL,
  "reward_id" bigint NOT NULL,
  "type" text NOT NULL,
  "amount" numeric NOT NULL,
  CONSTRAINT profiles_rewards_pkey PRIMARY KEY ("id"),
  CONSTRAINT profiles_rewards_profile_id_fkey FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE,
  CONSTRAINT profiles_rewards_reward_id_fkey FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE CASCADE
);

CREATE TABLE "profiles_map_objects" (
  "id" bigint NOT NULL DEFAULT nextval('profiles_map_objects_id_seq'::regclass),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "profile_id" integer,
  "objects" json,
  CONSTRAINT profiles_map_objects_pkey PRIMARY KEY ("id"),
  CONSTRAINT profiles_map_objects_profile_id_fkey FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE
);


-- =========================================
-- 5. PERFORMANCE INDEXES
-- =========================================

-- Indexes on foreign keys (accelerate joins and constraint validation)
CREATE INDEX idx_contracts_network_id ON contracts(network_id);
CREATE INDEX idx_tokens_networks_token_id ON tokens_networks(token_id);
CREATE INDEX idx_tokens_networks_network_id ON tokens_networks(network_id);
CREATE INDEX idx_profiles_network_id ON profiles(network_id);
CREATE INDEX idx_profiles_wallet_address ON profiles(wallet_address);
CREATE INDEX idx_deposits_network_id ON deposits(network_id);
CREATE INDEX idx_deposits_token_id ON deposits(token_id);
CREATE INDEX idx_deposits_wallet_address ON deposits(wallet_address);
CREATE INDEX idx_deposits_status ON deposits(status);
CREATE INDEX idx_withdrawals_deposit_id ON withdrawals(deposit_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
CREATE INDEX idx_profiles_deposits_profile_id ON profiles_deposits(profile_id);
CREATE INDEX idx_profiles_rewards_profile_id ON profiles_rewards(profile_id);
CREATE INDEX idx_profiles_rewards_reward_id ON profiles_rewards(reward_id);
CREATE INDEX idx_profiles_map_objects_profile_id ON profiles_map_objects(profile_id);


-- =========================================
-- 6. SUPABASE ROLE PERMISSIONS (anon, authenticated, service_role)
-- =========================================

-- Grants schema access to Supabase roles so the REST API can operate
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
```

## Execution Procedure

1. Open the **SQL Editor**, paste **Stage 1**, and run it. Verify that all target tables have been removed.
2. Clear the editor, paste **Stage 2**, and run it. The script should execute without errors.

## Migration: Silver → Gold consolidation (2026-05-13)

The two-coin economy (silver + gold) was collapsed into gold-only. The
conversion script lives at `migrations/20260513_silver_to_gold.sql` and must
be run **after** the gold-only build has been deployed to production (any
client still reading the silver balance would see it disappear mid-session
otherwise).

The script converts each profile's lifetime silver total into gold using a
`ceil(silver / 100)` ratio (rounded up, minimum 1 if anything was earned),
inserts a single `'earned'` gold row per user for audit purposes, then
deletes every silver `profiles_rewards` row and finally the `silver-coin`
entry from the `rewards` catalogue. It is idempotent: running it twice is a
no-op once the silver reward is gone.

## Schema Improvements

The following improvements were introduced relative to the previous schema:

- **Primary keys** defined on every table.
- **Foreign keys** with appropriate `ON DELETE CASCADE` or `ON DELETE RESTRICT` semantics.
- **Sequences** for all auto-increment IDs, including tables that previously lacked them (e.g., `contracts`, `rewards`).
- **Indexes** on foreign keys and on columns commonly used as filters (`status`, `wallet_address`).
- **Unique constraint** on `profiles(wallet_address, network_id)` to prevent duplicate profiles.
- **GRANT statements** to expose the schema to Supabase REST roles.
- Cleaned-up default values (replacing previously malformed quote-escaped defaults).

## Post-Migration Steps

Import the data (one CSV per table) in the following order to satisfy foreign key constraints:

1. `contracts`, `tokens`, `networks`, `rewards`, `map_objects`
2. `tokens_networks`, `profiles`, `deposits`
3. `withdrawals`, `profiles_deposits`, `profiles_rewards`, `profiles_map_objects`

Once the data has been loaded, reset the sequences so newly generated IDs do not collide with imported records:

```sql
SELECT setval('contracts_id_seq', COALESCE((SELECT MAX(id) FROM contracts), 1));
SELECT setval('tokens_id_seq', COALESCE((SELECT MAX(id) FROM tokens), 1));
SELECT setval('networks_id_seq', COALESCE((SELECT MAX(id) FROM networks), 1));
SELECT setval('profiles_id_seq', COALESCE((SELECT MAX(id) FROM profiles), 1));
SELECT setval('deposits_id_seq', COALESCE((SELECT MAX(id) FROM deposits), 1));
SELECT setval('withdrawals_id_seq', COALESCE((SELECT MAX(id) FROM withdrawals), 1));
SELECT setval('rewards_id_seq', COALESCE((SELECT MAX(id) FROM rewards), 1));
SELECT setval('map_objects_id_seq', COALESCE((SELECT MAX(id) FROM map_objects), 1));
SELECT setval('profiles_deposits_id_seq', COALESCE((SELECT MAX(id) FROM profiles_deposits), 1));
SELECT setval('profiles_rewards_id_seq', COALESCE((SELECT MAX(id) FROM profiles_rewards), 1));
SELECT setval('profiles_map_objects_id_seq', COALESCE((SELECT MAX(id) FROM profiles_map_objects), 1));
```
