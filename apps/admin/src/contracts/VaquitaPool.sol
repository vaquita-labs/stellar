// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title VaquitaPool
 * @dev A protocol that allows users to deposit ETH and participate in a reward pool
 */
contract VaquitaPool {

    // Position struct to store user position information
    struct Position {
        address owner;
        uint256 amount;
        uint256 shares;
        uint256 finalizationTime;
        uint256 lockPeriod;
    }
    
    uint256 public constant BASIS_POINTS = 1e4;
    uint256 public earlyWithdrawalFee; // Fee for early withdrawals (initially 0)
    uint256 public protocolFees;  // protocol fees
    address public owner; // Contract owner

    struct Period {
        uint256 rewardPool;
        uint256 totalShares;
    }
    mapping(uint256 => Period) public periods; // lockPeriod => Period
    mapping(uint256 => bool) public isSupportedLockPeriod; // lockPeriod => isSupported
    
    // Mappings
    mapping(bytes16 => Position) public positions;

    // Events
    event FundsDeposited(bytes16 indexed depositId, address indexed owner, uint256 amount, uint256 shares);
    event FundsWithdrawn(bytes16 indexed depositId, address indexed owner, uint256 amount, uint256 reward);
    event LockPeriodAdded(uint256 newLockPeriod);
    event EarlyWithdrawalFeeUpdated(uint256 newFee);
    event RewardsAdded(uint256 rewardAmount);
    event ProtocolFeesWithdrawn(uint256 protocolFees);
    
    // Errors
    error InvalidAmount();
    error PositionNotFound();
    error PositionAlreadyWithdrawn();
    error NotPositionOwner();
    error InvalidFee();
    error InvalidDepositId();
    error DepositAlreadyExists();
    error NotOwner();

    /**
     * @notice Constructor to initialize the contract with supported lock periods.
     * @param _lockPeriods Array of supported lock periods in seconds.
     */
    constructor(uint256[] memory _lockPeriods) {
        owner = msg.sender;
        uint256 length = _lockPeriods.length;
        for (uint256 i = 0; i < length; i++) {
            isSupportedLockPeriod[_lockPeriods[i]] = true;
        }
    }

    /**
     * @notice Modifier to restrict function access to owner only
     */
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /**
     * @notice Open a new position in the pool
     * @dev Allows a user to deposit ETH. Position is tracked by a unique depositId.
     * @param depositId The unique identifier for the position
     * @param period The lock period chosen for this deposit
     */
    function deposit(bytes16 depositId, uint256 period) external payable returns (uint256 sharesToMint) {
        if (msg.value == 0) revert InvalidAmount();
        if (depositId == bytes16(0)) revert InvalidDepositId();
        if (positions[depositId].owner != address(0)) revert DepositAlreadyExists();
        if (!isSupportedLockPeriod[period]) revert InvalidFee();

        // Create position
        Position storage position = positions[depositId];
        position.owner = msg.sender;
        position.amount = msg.value;
        position.finalizationTime = block.timestamp + period;
        position.lockPeriod = period;

        // Calculate shares (1:1 ratio for simplicity)
        sharesToMint = msg.value;
        position.shares = sharesToMint;
        periods[period].totalShares += sharesToMint;

        emit FundsDeposited(depositId, msg.sender, msg.value, sharesToMint);
    }

    /**
     * @notice Withdraw from a position
     * @dev Only the position owner can withdraw. Handles early withdrawal fees and reward distribution.
     * @param depositId The ID of the position to withdraw from
     */
    function withdraw(bytes16 depositId) external returns (uint256 amountToTransfer) {
        Position storage position = positions[depositId];
        if (position.owner == address(0)) revert PositionNotFound();
        if (position.owner != msg.sender) revert NotPositionOwner();

        position.owner = address(0);

        uint256 period = position.lockPeriod;
        uint256 withdrawnAmount = position.amount; // Simple 1:1 withdrawal

        uint256 reward = 0;
        if (block.timestamp < position.finalizationTime) {
            // Early withdrawal - calculate fee and add remaining interest to reward pool
            uint256 interest = withdrawnAmount > position.amount ? withdrawnAmount - position.amount : 0;
            uint256 feeAmount = (interest * earlyWithdrawalFee) / BASIS_POINTS;
            uint256 remainingInterest = interest - feeAmount;
            protocolFees += feeAmount;        // Fees go to protocol fees
            periods[period].rewardPool += remainingInterest;  // Only remaining interest goes to reward pool
            amountToTransfer = withdrawnAmount - interest;
        } else {
            // Late withdrawal - calculate and distribute rewards
            reward = _calculateReward(position.shares, period);
            periods[period].rewardPool -= reward;
            amountToTransfer = withdrawnAmount + reward;
        }
        periods[period].totalShares -= position.shares;
        
        // Transfer ETH to user
        (bool success, ) = payable(msg.sender).call{value: amountToTransfer}("");
        require(success, "ETH transfer failed");

        emit FundsWithdrawn(depositId, msg.sender, position.amount, reward);
    }

    /**
     * @notice Calculate reward for a position
     * @dev Proportional to the user's deposit amount
     * @param shares The position shares
     * @param period The lock period for this position
     * @return The calculated reward
     */
    function _calculateReward(uint256 shares, uint256 period) internal view returns (uint256) {
        uint256 totalSharesForPeriod = periods[period].totalShares;
        if (totalSharesForPeriod == 0) return 0;
        return (periods[period].rewardPool * shares) / totalSharesForPeriod;
    }

    /**
     * @notice Withdraw protocol fees to the contract owner
     */
    function withdrawProtocolFees() external onlyOwner {
        uint256 cacheProtocolFees = protocolFees;
        protocolFees = 0;
        (bool success, ) = payable(owner).call{value: cacheProtocolFees}("");
        require(success, "ETH transfer failed");
        emit ProtocolFeesWithdrawn(cacheProtocolFees);
    }

    /**
     * @notice Add rewards to the reward pool (owner only)
     * @param period The lock period to add rewards to
     */
    function addRewards(uint256 period) external payable onlyOwner {
        if (!isSupportedLockPeriod[period]) revert InvalidFee();
        if (msg.value == 0) revert InvalidAmount();
        periods[period].rewardPool += msg.value;
        emit RewardsAdded(msg.value);
    }

    /**
     * @notice Update the early withdrawal fee (owner only)
     * @param newFee The new fee in basis points (0-10000)
     */
    function updateEarlyWithdrawalFee(uint256 newFee) external onlyOwner {
        if (newFee > BASIS_POINTS) revert InvalidFee();
        earlyWithdrawalFee = newFee;
        emit EarlyWithdrawalFeeUpdated(newFee);
    }

    /**
     * @notice Add a new lock period to the supported list.
     * @dev Only callable by the contract owner.
     * @param newLockPeriod The new lock period in seconds.
     */
    function addLockPeriod(uint256 newLockPeriod) external onlyOwner {
        require(!isSupportedLockPeriod[newLockPeriod], "Lock period already supported");
        isSupportedLockPeriod[newLockPeriod] = true;
        emit LockPeriodAdded(newLockPeriod);
    }

    /**
     * @notice Get the contract's ETH balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Allow the contract to receive ETH
    receive() external payable {}
} 