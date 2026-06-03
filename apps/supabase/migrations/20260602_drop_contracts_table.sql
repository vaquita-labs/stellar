-- Drop the unused `contracts` table.
--
-- The table backed an ABI registry (Contract.address -> Contract.abi) consumed
-- only by getABIByAddress, which fed the now-removed contractAbi/vaquitaContractAbi
-- fields on the /config (project config) and legacy network DTOs. Stellar/Soroban
-- never consumed those ABIs, and the single remaining caller (toNetwork) was dead
-- code. With the model and service removed, the table has no readers.

DROP TABLE IF EXISTS contracts;
