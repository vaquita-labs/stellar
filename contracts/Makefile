-include .env

POOL_DIR := vaquita-pool
WASM := $(CURDIR)/target/wasm32v1-none/release/vaquita_pool.wasm

INVOKE_FEE ?= 10000000

default: build

all: test

test: build
	cargo test --workspace

# --remap-path-prefix: avoid HTML mirroring absolute paths (coverage/Users/.../projects/...).
coverage:
	cargo llvm-cov --workspace --all-features --remap-path-prefix \
		--ignore-filename-regex '/test/|defindex_vault\.rs|vaquita-pool/src/types\.rs' \
		--lcov --output-path lcov.info
	cargo llvm-cov report --remap-path-prefix \
		--ignore-filename-regex '/test/|defindex_vault\.rs|vaquita-pool/src/types\.rs' \
		--fail-under-lines 80 \
		--html --output-dir coverage-html

build:
	cd $(POOL_DIR) && stellar contract build
	@ls -l $(CURDIR)/target/wasm32v1-none/release/*.wasm

deploy: build
	stellar contract deploy --source $(SOURCE_ACCOUNT) --network $(NETWORK) --wasm $(WASM) --alias vaquita_pool
	CONTRACT_ID=$(stellar contract alias show vaquita_pool)

initialize: deploy
	stellar contract invoke --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) --id vaquita_pool \
	-- \
	initialize \
	--admin $(USER_ADDRESS) \
	--blend_token $(BLEND_TOKEN) \
	--defindex_vault_address $(DEFINDEX_VAULT_ADDRESS) \
	--lock_periods "[$(LOCK_PERIODS)]"

deposit:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) \
	-- \
	deposit \
	--caller $(USER_ADDRESS) \
	--deposit_id $(DEPOSIT_ID) \
	--amount $(DEPOSIT_AMOUNT) \
	--period $(LOCK_PERIOD)

withdraw:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) \
	-- \
	withdraw \
	--caller $(USER_ADDRESS) \
	--deposit_id $(DEPOSIT_ID)

add-lock-period:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) \
	-- \
	add_lock_period \
	--caller $(USER_ADDRESS) \
	--new_lock_period $(NEW_LOCK_PERIOD)

add-rewards:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) \
	-- \
	add_rewards \
	--caller $(USER_ADDRESS) \
	--period $(LOCK_PERIOD) \
	--reward_amount $(REWARD_AMOUNT)

cargo-release:
	cargo build --release --target wasm32v1-none -p vaquita-pool
	@ls -l $(CURDIR)/target/wasm32v1-none/release/*.wasm

fmt:
	cargo fmt --all

clean:
	cargo clean
