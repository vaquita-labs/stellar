-include .env

POOL_DIR  := vaquita-pool
WASM      := $(CURDIR)/target/wasm32v1-none/release/vaquita_pool.wasm

BADGES_DIR  := vaquita-badges
BADGES_WASM := $(CURDIR)/target/wasm32v1-none/release/vaquita_badges.wasm
BADGES_ADMIN ?= $(USER_ADDRESS)

INVOKE_FEE ?= 10000000

default: build

all: test

test: build
	cargo test --workspace

# --remap-path-prefix: avoid HTML mirroring absolute paths (coverage/Users/.../projects/...).
coverage:
	cargo llvm-cov --workspace --all-features --remap-path-prefix \
		--ignore-filename-regex '/test/|defindex_vault\.rs|src/types\.rs|src/events\.rs' \
		--lcov --output-path lcov.info
	cargo llvm-cov report --remap-path-prefix \
		--ignore-filename-regex '/test/|defindex_vault\.rs|src/types\.rs|src/events\.rs' \
		--fail-under-lines 80 \
		--html --output-dir coverage-html
	cargo llvm-cov report --remap-path-prefix \
		--ignore-filename-regex '/test/|defindex_vault\.rs|src/types\.rs|src/events\.rs' \
		--json --summary-only 2>/dev/null \
		| python3 $(CURDIR)/scripts/print_coverage_summary.py

build:
	cd $(POOL_DIR) && stellar contract build
	@ls -l $(CURDIR)/target/wasm32v1-none/release/*.wasm

build-badges:
	cd $(BADGES_DIR) && stellar contract build
	@ls -l $(BADGES_WASM)

deploy: build
	stellar contract deploy \
		--source $(SOURCE_ACCOUNT) \
		--network $(NETWORK) \
		--wasm $(WASM) \
		--alias vaquita_pool \
		-- \
		--admin $(USER_ADDRESS) \
		--blend_token $(BLEND_TOKEN) \
		--defindex_vault_address $(DEFINDEX_VAULT_ADDRESS) \
		--lock_periods "[$(LOCK_PERIODS)]" \
		--early_withdrawal_fee_bps $(EARLY_WITHDRAWAL_FEE_BPS) \
		--upgrade_timelock_secs $(UPGRADE_TIMELOCK_SECS)

# Admin lifecycle helpers
pause:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) -- pause

unpause:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) -- unpause

propose-upgrade:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) \
	-- propose_upgrade --new_wasm_hash $(NEW_WASM_HASH)

cancel-upgrade:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) -- cancel_upgrade

execute-upgrade:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) -- execute_upgrade

deploy-badges: build-badges
	stellar contract deploy --source $(SOURCE_ACCOUNT) --network $(NETWORK) --wasm $(BADGES_WASM) --alias vaquita_badges \
	-- \
	--admin $(BADGES_ADMIN) \
	--signing_key $(BADGES_SIGNING_KEY)

pause-badges:
	stellar contract invoke --id vaquita_badges --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) -- pause

unpause-badges:
	stellar contract invoke --id vaquita_badges --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) -- unpause

propose-upgrade-badges:
	stellar contract invoke --id vaquita_badges --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) \
	-- propose_upgrade --new_wasm_hash $(NEW_WASM_HASH)

cancel-upgrade-badges:
	stellar contract invoke --id vaquita_badges --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) -- cancel_upgrade

execute-upgrade-badges:
	stellar contract invoke --id vaquita_badges --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) -- execute_upgrade

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
	--new_lock_period $(NEW_LOCK_PERIOD)

add-rewards:
	stellar contract invoke --id vaquita_pool --source $(SOURCE_ACCOUNT) --network $(NETWORK) --inclusion-fee $(INVOKE_FEE) \
	-- \
	add_rewards \
	--period $(LOCK_PERIOD) \
	--reward_amount $(REWARD_AMOUNT)

cargo-release:
	cargo build --release --target wasm32v1-none -p vaquita-pool
	@ls -l $(CURDIR)/target/wasm32v1-none/release/*.wasm

fmt:
	cargo fmt --all

clean:
	cargo clean
