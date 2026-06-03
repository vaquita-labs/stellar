# VaquitaPool Position API

This API endpoint allows you to retrieve position data for a given deposit ID from the VaquitaPool Soroban smart
contract.

## Endpoint

```
GET /api/interest?depositId={depositId}
```

## Parameters

- `depositId` (required): The deposit ID to query position data for

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "position": {
    "owner": "G...",
    "amount": "1000000000",
    "shares": "1000000000",
    "finalization_time": "1234567890",
    "lock_period": "86400",
    "b_rate": "10000"
  }
}
```

### Error Responses

#### Missing depositId (400)

```json
{
  "error": "depositId parameter is required"
}
```

#### Position Not Found (404)

```json
{
  "error": "Position not found"
}
```

#### Server Error (500)

```json
{
  "error": "Failed to retrieve position data",
  "details": "Error details..."
}
```

## Position Data Fields

- `owner`: The Stellar address of the position owner
- `amount`: The deposited amount (in smallest units)
- `shares`: The number of shares allocated to this position
- `finalization_time`: Unix timestamp when the position can be finalized
- `lock_period`: The lock period in seconds
- `b_rate`: The basis rate for this position

## Environment Variables Required

Make sure these environment variables are set:

```bash
NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_VAQUITA_POOL_CONTRACT_ID=your_contract_id_here
```

## Usage Examples

### JavaScript/TypeScript

```javascript
const response = await fetch('/api/interest?depositId=my-deposit-123');
const data = await response.json();

if (data.success) {
  console.info('Position owner:', data.position.owner);
  console.info('Amount:', data.position.amount);
} else {
  console.error('Error:', data.error);
}
```

### cURL

```bash
curl "http://localhost:3000/api/interest?depositId=my-deposit-123"
```

## Testing

Use the provided test script:

```bash
node test-position-api.js
```

Make sure to:

1. Start your Next.js development server (`npm run dev`)
2. Set the required environment variables
3. Replace the test deposit ID with a real one from your contract

## Implementation Details

This API endpoint:

1. Uses the Stellar JavaScript SDK v13.3.0
2. Connects to the Soroban RPC endpoint
3. Simulates a read-only transaction to call the `get_position` function
4. Converts Soroban ScVal responses to native JavaScript values
5. Returns the position data in a structured format

The endpoint follows the same patterns used in the existing codebase for Soroban contract interactions.
