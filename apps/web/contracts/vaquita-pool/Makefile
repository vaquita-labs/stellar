-include ../../.env

default: build

all: test

test: build
	cargo test

build:
	stellar contract build
	@ls -l ../../target/wasm32v1-none/release/*.wasm


deploy: build
	stellar contract deploy --source $(SOURCE_ACCOUNT) --network $(NETWORK) --wasm ../../target/wasm32v1-none/release/vaquita_pool.wasm --alias vaquita_pool
	CONTRACT_ID=$(stellar contract alias show vaquita_pool)

initialize: deploy
	stellar contract invoke --source $(SOURCE_ACCOUNT) --network $(NETWORK) --id vaquita_pool \
	-- \
	initialize \
	--admin $(USER_ADDRESS) \
	--blend_token $(BLEND_TOKEN) \
	--pool_address $(POOL_ADDRESS) \
	--defindex_vault_address $(DEFINDEX_VAULT_ADDRESS) \
	--lock_periods "[$(LOCK_PERIODS)]"

deposit:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) \
	-- \
	deposit \
	--caller $(USER_ADDRESS) \
	--deposit_id $(DEPOSIT_ID) \
	--amount $(DEPOSIT_AMOUNT) \
	--period $(LOCK_PERIOD)

withdraw:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) \
	-- \
	withdraw \
	--caller $(USER_ADDRESS) \
	--deposit_id $(DEPOSIT_ID)

add-lock-period:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) \
	-- \
	add_lock_period \
	--caller $(USER_ADDRESS) \
	--new_lock_period $(NEW_LOCK_PERIOD)


add-rewards:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) \
	-- \
	add_rewards \
	--caller $(USER_ADDRESS) \
	--period $(LOCK_PERIOD) \
	--reward_amount $(REWARD_AMOUNT)

fmt:
	cargo fmt --all

clean:
	cargo clean