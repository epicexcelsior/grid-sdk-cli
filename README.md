# Grid SDK CLI Tool

A command-line interface for interacting with the [Grid SDK from Squads](https://grid.squads.xyz). It lets you manage non-custodial stablecoin accounts on Solana, token transfers (USDC & SOL), and transactions in a simple environment so you can replicate it in your own projects.

## Features

- 🔐 **Authentication**: Login/register with email and OTP
- 💰 **Balance Checking**: View account balances for multiple tokens (USDC, SOL, etc.)
- 🔄 **USDC Transfers**: Send USDC using Grid's smart accounts
- ⚡ **Arbitrary Transactions**: Execute custom Solana transactions
- 🌍 **Multi-Environment**: Support for both sandbox and production environments
- 🐛 **Debug Mode**: Detailed logging for troubleshooting

## Quick Start

### Prerequisites

- Node.js 16 or higher
- npm or yarn
- Grid API keys (get them from [Grid Dashboard](https://grid.squads.xyz/dashboard))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/epicexcelsior/grid-sdk-cli
   cd grid-sdk-cli
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```env
   GRID_ENVIRONMENT=sandbox
   GRID_SANDBOX_API_KEY=your_sandbox_api_key_here
   GRID_PRODUCTION_API_KEY=your_production_api_key_here
   ```

4. **Run the CLI**
   ```bash
   npm start
   ```

## ⚠️ Important Safety Notice

**Production Environment Warning**: When using `GRID_ENVIRONMENT=production`, you are working with **REAL FUNDS** on the Solana mainnet! All transactions are irreversible. Always:

- Start with sandbox environment for testing
- Double-check recipient addresses before sending
- Verify amounts carefully before confirming transactions
- Test your workflows in sandbox before using production

**Recommended Development Flow**:
1. Use `GRID_ENVIRONMENT=sandbox` for development and testing
2. Get test funds from faucets (see below)
3. Only switch to production when ready for real transactions

Contributors to this open-source CLI are not responsible for lost funds. Use at your own risk.

### Test Token Faucets

For testing in sandbox environment:

- **Testnet USDC**: Get free testnet USDC from [Circle Faucet](https://faucet.circle.com/)
- **Devnet SOL**: Get free devnet SOL from [Solana Faucet](https://faucet.solana.com/)

These test tokens have no real value and are perfect for development.

## Configuration

### Environment Variables

Simply add keys for one or both environments, then set the environment accordingly.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GRID_ENVIRONMENT` | Environment to use (`sandbox` or `production`) | `sandbox` | Yes |
| `GRID_SANDBOX_API_KEY` | Sandbox API key from Grid Dashboard | - | Yes (for sandbox) |
| `GRID_PRODUCTION_API_KEY` | Production API key from Grid Dashboard | - | Yes (for production) |
| `GRID_BASE_URL` | Grid API base URL | `https://grid.squads.xyz` | No |
| `DEBUG` | Enable debug mode (`true` or `false`) | `false` | No |

⚠️ **Important**: Keep your API keys secure and never commit them to version control.

## Usage

### Basic Commands

```bash
# Start the CLI (normal mode)
npm start

# Start with debug logging
npm run dev
# or
npm start -- --debug
```

### CLI Features

#### 1. Login or Register
- Enter your email address
- Receive OTP via email
- Complete authentication

#### 2. Check Balance
- View account balances for all tokens
- See USDC and SOL balances
- Account summary information

#### 3. Transfer USDC
- Send USDC using Grid's smart accounts
- Automatic fee handling by Grid
- Simple and reliable transfers

#### 4. Arbitrary Transactions
- Execute custom Solana transactions
- Full control over transaction structure
- Grid handles signing and execution

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Method 1: Environment variable
DEBUG=true npm start

# Method 2: Command line flag
npm start -- --debug

# Method 3: Use dev script
npm run dev
```

Debug mode shows:
- Detailed API responses
- Transaction structures
- Network information
- Error stack traces

## Examples

### Environment Switching

**Sandbox (Development)**
```env
GRID_ENVIRONMENT=sandbox
GRID_SANDBOX_API_KEY=your_sandbox_key
```

**Production (Live)**
```env
GRID_ENVIRONMENT=production
GRID_PRODUCTION_API_KEY=your_production_key
```

### Sample Workflow

1. **Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   npm install
   ```

2. **First Run**
   ```bash
   npm start
   ```

3. **Login/Register**
   - Select "Login or Register"
   - Enter your email
   - Check email for OTP
   - Enter OTP to complete authentication

4. **Check Balance**
   - Select "Check Balance"
   - View your account balances

5. **Transfer USDC**
   - Select "Transfer USDC"
   - Enter recipient address and amount
   - Confirm transaction

## Troubleshooting

### Common Issues

#### API Key Disabled
```
❌ Authentication failed: API key is disabled
```
**Solution**: Check your Grid Dashboard and ensure your API key is active.

#### Missing Environment Variables
```
❌ ERROR: Missing API key for environment: PRODUCTION
```
**Solution**: Add the required API key to your `.env` file.

#### Network Errors
```
❌ Network error: Unable to connect
```
**Solution**: Check your internet connection and Grid service status.

### Debug Information

Run with debug mode to get detailed information:
```bash
npm run dev
```

This will show:
- API configuration
- Request/response details
- Transaction information
- Error stack traces

### Environment Issues

1. **Sandbox works, Production fails**
   - Verify production API key is active
   - Check if production account exists
   - Ensure sufficient permissions

2. **Authentication loops**
   - Clear any cached session data
   - Try with a fresh email address
   - Enable debug mode to see detailed errors

## Security

- Never commit API keys to version control
- Use `.env` files for sensitive configuration
- Keep your Grid API keys secure

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- [Grid Documentation](https://grid.squads.xyz/)
- [Grid Dashboard](https://grid.squads.xyz/dashboard)