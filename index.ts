import inquirer from 'inquirer';
import { GridClient, GridEnvironment, SessionSecrets } from '@sqds/grid';
import { 
    SystemProgram, 
    PublicKey, 
    Transaction, 
    LAMPORTS_PER_SOL, 
    Connection,
    clusterApiUrl,
    Keypair
} from '@solana/web3.js';
// Removed unused bs58 import
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// --- Configuration ---
// Load configuration from environment variables
const GRID_ENVIRONMENT = (process.env.GRID_ENVIRONMENT || 'sandbox') as GridEnvironment;
const GRID_BASE_URL = process.env.GRID_BASE_URL || 'https://grid.squads.xyz';
const SANDBOX_API_KEY = process.env.GRID_SANDBOX_API_KEY;
const PRODUCTION_API_KEY = process.env.GRID_PRODUCTION_API_KEY;
const DEBUG_MODE = process.env.DEBUG === 'true' || process.argv.includes('--debug') || process.argv.includes('-d');

// Select the appropriate API key based on environment
const GRID_API_KEY = GRID_ENVIRONMENT === 'production' ? PRODUCTION_API_KEY : SANDBOX_API_KEY;

// Validate required environment variables
if (!GRID_API_KEY) {
    console.error('❌ ERROR: Missing API key for environment:', GRID_ENVIRONMENT.toUpperCase());
    console.error('📝 Please set the following environment variable:');
    console.error(`   ${GRID_ENVIRONMENT === 'production' ? 'GRID_PRODUCTION_API_KEY' : 'GRID_SANDBOX_API_KEY'}`);
    console.error('💡 Copy .env.example to .env and add your API keys');
    process.exit(1);
}

// NOTE: Grid accounts handle transaction fees internally - no external fee payer needed

let gridClient: GridClient;
let userSession: any = null; // To store user session data (the `data` property of the API response)
let sessionSecrets: SessionSecrets | null = null; // To store session secrets separately
let solanaConnection: Connection;

// --- Utility Functions ---
function debugLog(...args: any[]) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}

function simpleLog(message: string) {
    if (!DEBUG_MODE) {
        console.log(message);
    }
}

function getExplorerUrl(signature: string): string {
    const cluster = GRID_ENVIRONMENT === 'sandbox' ? 'devnet' : 'mainnet-beta';
    return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

function validateSolanaAddress(address: string): boolean {
    try {
        new PublicKey(address);
        return true;
    } catch {
        return false;
    }
}

function validateAmount(amount: string, tokenType: 'USDC' | 'SOL'): { valid: boolean; error?: string } {
    const num = parseFloat(amount);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Please enter a valid number' };
    }
    
    if (num <= 0) {
        return { valid: false, error: 'Amount must be greater than 0' };
    }
    
    if (tokenType === 'USDC' && num > 1000000) {
        return { valid: false, error: 'USDC amount too large (max: 1,000,000)' };
    }
    
    if (tokenType === 'SOL' && num > 10000) {
        return { valid: false, error: 'SOL amount too large (max: 10,000)' };
    }
    
    return { valid: true };
}

// --- SDK Initialization ---
function initializeGridClient() {
    if (DEBUG_MODE) {
        console.log('🔧 Grid SDK Configuration:');
        console.log(`  Environment: ${GRID_ENVIRONMENT}`);
        console.log(`  API Key: ${GRID_API_KEY!.substring(0, 8)}...${GRID_API_KEY!.substring(GRID_API_KEY!.length - 8)}`);
        console.log(`  Base URL: ${GRID_BASE_URL}`);
        console.log(`  Solana Network: ${GRID_ENVIRONMENT === 'sandbox' ? 'devnet' : 'mainnet-beta'}`);
        console.log(`  Full API URL: ${GRID_BASE_URL}/api/grid/v1`);
        console.log(`  Debug Mode: ${DEBUG_MODE ? 'ON' : 'OFF'}`);
    } else {
        console.log(`🚀 Grid CLI - ${GRID_ENVIRONMENT.toUpperCase()} Environment`);
    }
    
    gridClient = new GridClient({
        apiKey: GRID_API_KEY!,
        environment: GRID_ENVIRONMENT,
        baseUrl: GRID_BASE_URL,
    });
    
    // Initialize Solana connection for arbitrary transactions
    const solanaNetwork = GRID_ENVIRONMENT === 'sandbox' ? clusterApiUrl('devnet') : clusterApiUrl('mainnet-beta');
    debugLog(`  Connecting to: ${solanaNetwork}`);
    
    solanaConnection = new Connection(
        solanaNetwork,
        'confirmed'
    );
}

// NOTE: Fee payer functions removed - Grid handles transaction fees internally

// --- Main Functions ---

async function loginOrRegister() {
    const { email } = await inquirer.prompt([
        {
            type: 'input',
            name: 'email',
            message: 'Enter your email address:',
        },
    ]);

    try {
        simpleLog('📧 Checking for existing user...');
        debugLog('Checking for existing user...');
        const authResponse = await gridClient.initAuth({ email });
        
        if (authResponse && authResponse.data) {
            simpleLog('📬 OTP sent to your email. Please check your inbox.');
            debugLog('OTP sent to your email. Please check your inbox to log in.');
            await verifyOtp(email, false);
        } else {
            throw new Error('Failed to initialize authentication');
        }
    } catch (error: any) {
        if (DEBUG_MODE) {
            console.log('🔍 Authentication Error Details:');
            console.log(`  Error Message: ${error.message}`);
            console.log(`  Error Code: ${error.code || 'N/A'}`);
            console.log(`  Environment: ${GRID_ENVIRONMENT}`);
        } else {
            console.log(`❌ Authentication failed: ${error.message}`);
        }
        
        // Check if it's specifically a "user not found" error vs account already exists
        if (error.message && (error.message.includes('User not found') || error.message.includes('not found'))) {
            simpleLog('👤 User not found. Attempting to register...');
            debugLog('User not found. Attempting to register...');
            try {
                const accountResponse = await gridClient.createAccount({ type: 'email', email });
                simpleLog('📬 Account creation initiated. OTP sent to your email.');
                debugLog('Account creation initiated. OTP sent to your email. Please check your inbox to complete registration.');
                await verifyOtp(email, true);
            } catch (registrationError: any) {
                if (DEBUG_MODE) {
                    console.log('🔍 Registration Error Details:');
                    console.log(`  Error Message: ${registrationError.message}`);
                    console.log(`  Error Code: ${registrationError.code || 'N/A'}`);
                } else {
                    console.log(`❌ Registration failed: ${registrationError.message}`);
                }
                
                if (registrationError.message && registrationError.message.includes('already exists')) {
                    simpleLog('👤 Account already exists. Retrying login...');
                    debugLog('Account already exists. Retrying login...');
                    // Account exists, try login again
                    try {
                        const retryAuthResponse = await gridClient.initAuth({ email });
                        if (retryAuthResponse && retryAuthResponse.data) {
                            simpleLog('📬 OTP sent to your email. Please check your inbox.');
                            debugLog('OTP sent to your email. Please check your inbox to log in.');
                            await verifyOtp(email, false);
                        }
                    } catch (retryError: any) {
                        console.error('❌ Login retry failed:', retryError.message);
                    }
                } else {
                    console.error('❌ Registration failed:', registrationError.message);
                }
            }
        } else {
            // For other errors, might still be an existing user, try login flow
            simpleLog('🔄 This might be an existing account. Try entering OTP if you received one.');
            debugLog('Authentication issue detected. This might be an existing account. Try entering OTP if you received one.');
            if (DEBUG_MODE) {
                console.log('If you did not receive an OTP, the error above shows what went wrong.');
            }
            await verifyOtp(email, false);
        }
    }
}

async function verifyOtp(email: string, isNewUser: boolean) {
    const { otp } = await inquirer.prompt([
        {
            type: 'input',
            name: 'otp',
            message: 'Enter the OTP from your email:',
        },
    ]);

    try {
        // Generate session secrets AFTER getting OTP
        sessionSecrets = await gridClient.generateSessionSecrets();
        
        let authResponse;
        if (isNewUser) {
            // For new users, we need to build a minimal user object
            const userContext = {
                email,
                signers: []  // Empty signers array for new user creation
            };

            authResponse = await gridClient.completeAuthAndCreateAccount({
                otpCode: otp,
                sessionSecrets,
                user: userContext,
            });
            console.log('Registration successful!');
        } else {
            // For existing users, we need to pass the stored user data or a minimal structure
            const userContext = userSession || {
                email,
                signers: []  // Will be populated by the SDK
            };

            authResponse = await gridClient.completeAuth({
                otpCode: otp,
                sessionSecrets,
                user: userContext,
            });
            console.log('Login successful!');
        }
        
        if (authResponse) {
            userSession = authResponse;  // Store the entire response, not just data
            simpleLog('✅ Login successful!');
            debugLog('User session created.');
            const accountAddress = userSession.smart_account_address || userSession.address;
            if (accountAddress) {
                simpleLog(`🏦 Account: ${accountAddress}`);
                debugLog('Account address:', accountAddress);
            }
            
            // Log the structure to understand what we're getting
            debugLog('Session structure:', Object.keys(userSession));
        } else {
            throw new Error("Authentication completed, but no session data was returned.");
        }

    } catch (error) {
        console.error('OTP verification failed:', error);
        console.error('Error details:', error);
    }
}

async function checkBalance() {
    if (!userSession) {
        console.log('Please log in first.');
        return;
    }

    try {
        const accountAddress = userSession.smart_account_address || userSession.address;
        if (!accountAddress) {
            console.error('No account address found in session');
            return;
        }

        console.log(`Fetching balance for account: ${accountAddress}`);
        const balancesResponse = await gridClient.getAccountBalances(accountAddress);
        
        if (!balancesResponse.success) {
            console.error('Failed to fetch balance:', balancesResponse.error);
            return;
        }

        if (balancesResponse.data?.tokens) {
            const tokens = balancesResponse.data.tokens;
            console.log(`Found ${tokens.length} token(s):`);
            
            tokens.forEach((token: any) => {
                const balance = token.amount_decimal || (Number(token.amount) / Math.pow(10, token.decimals || 6));
                console.log(`  ${token.symbol || 'Unknown'}: ${balance} (${token.name || 'Unknown token'})`);
            });

            const usdcBalance = tokens.find((b: any) => b.symbol === 'USDC');
            if (usdcBalance) {
                const balance = usdcBalance.amount_decimal || (Number(usdcBalance.amount) / Math.pow(10, usdcBalance.decimals || 6));
                console.log(`\n💰 Your USDC balance is: ${balance} USDC`);
            } else {
                console.log('\n⚠️ No USDC balance found for this account.');
            }
        } else {
            console.log('No token balances found for this account.');
        }

        // Also show SOL balance if available
        if (balancesResponse.data?.sol) {
            console.log(`SOL balance: ${balancesResponse.data.sol} SOL`);
        }

    } catch (error) {
        console.error('Failed to fetch balance:', error);
    }
}

async function transferTokens() {
    if (!userSession || !sessionSecrets) {
        console.log('Please log in first.');
        return;
    }

    // Only support USDC transfers in this menu (SOL has its own arbitrary transaction menu)
    const tokenType = 'usdc';

    // Get the recipient and amount for USDC transfer
    const { recipientAddress, amount } = await inquirer.prompt([
        {
            type: 'input',
            name: 'recipientAddress',
            message: 'Enter the recipient\'s Solana address:',
            validate: (input: string) => {
                if (!input.trim()) return 'Please enter a recipient address';
                if (!validateSolanaAddress(input.trim())) return 'Please enter a valid Solana address';
                return true;
            }
        },
        {
            type: 'input',
            name: 'amount',
            message: 'Enter the amount of USDC to send:',
            validate: (input: string) => {
                if (!input.trim()) return 'Please enter an amount';
                const validation = validateAmount(input.trim(), 'USDC');
                return validation.valid ? true : validation.error!;
            }
        },
    ]);

    // Convert USDC amount to base units (6 decimals)
    const amountInBaseUnits = Math.floor(parseFloat(amount) * 1_000_000);

    const accountAddress = userSession.smart_account_address || userSession.address;

    if (!accountAddress) {
        console.error('No account address found in session');
        return;
    }

    try {
        simpleLog('💸 Creating USDC payment intent...');
        debugLog('Creating USDC payment intent...');
        
        // USDC transfers use 'smart_account' payment rail
        const paymentIntentRequest = {
            amount: amountInBaseUnits.toString(),
            grid_user_id: userSession.grid_user_id,
            source: {
                account: accountAddress,
                currency: 'usdc',
                payment_rail: 'smart_account',
            },
            destination: {
                address: recipientAddress,
                currency: 'usdc',
                payment_rail: 'smart_account',
            },
        };
        
        const paymentIntentResponse = await gridClient.createPaymentIntent(
            accountAddress,
            paymentIntentRequest
        );

        if (!paymentIntentResponse.data?.transactionPayload) {
             throw new Error(`Failed to create payment intent: ${paymentIntentResponse.error || 'Response did not contain transaction payload'}`);
        }
        
        const transactionPayload = paymentIntentResponse.data.transactionPayload;

        simpleLog('✍️ Signing USDC transaction...');
        debugLog('Payment intent created. Signing transaction...');
        const signedPayload = await gridClient.sign({
            sessionSecrets,
            session: userSession.session || userSession.authentication,
            transactionPayload: transactionPayload,
        });

        simpleLog('📤 Sending USDC transaction...');
        debugLog('Transaction signed. Sending...');
        const signatureResponse = await gridClient.send({
            signedTransactionPayload: signedPayload,
            address: accountAddress,
        });

        // Handle different response formats
        let txSignature: string | null = null;
        
        if (signatureResponse && signatureResponse.transaction_signature) {
            txSignature = signatureResponse.transaction_signature;
        } else if (signatureResponse && (signatureResponse.signature || signatureResponse.data?.signature)) {
            txSignature = signatureResponse.signature || signatureResponse.data?.signature;
        }

        if (txSignature) {
            simpleLog(`✅ USDC transfer successful!`);
            simpleLog(`💰 Sent ${amount} USDC to ${recipientAddress}`);
            simpleLog(`🔗 View transaction: ${getExplorerUrl(txSignature)}`);
            
            debugLog('✅ Transaction successful! Signature:', txSignature);
            debugLog(`📊 Sent ${amount} USDC to ${recipientAddress}`);
            if (signatureResponse.confirmed_at) {
                debugLog(`⏰ Confirmed at: ${signatureResponse.confirmed_at}`);
            }
        } else {
            console.log('✅ Transaction submitted successfully, but signature format is unexpected.');
            if (DEBUG_MODE) {
                console.log('Received response:', signatureResponse);
            }
        }

    } catch (error) {
        console.error('❌ USDC transfer failed:', error);
        if (DEBUG_MODE) {
            console.error('Error details:', error);
        }
    }
}

async function transferSOLArbitrary() {
    if (!userSession || !sessionSecrets) {
        console.log('Please log in first.');
        return;
    }

    if (DEBUG_MODE) {
        console.log('🔐 Session Info:');
        console.log(`  User Session Keys: ${Object.keys(userSession)}`);
        console.log(`  Session Secrets Present: ${!!sessionSecrets}`);
        if (userSession.grid_user_id) console.log(`  Grid User ID: ${userSession.grid_user_id}`);
        if (userSession.smart_account_address) console.log(`  Smart Account: ${userSession.smart_account_address}`);
        if (userSession.address) console.log(`  Address: ${userSession.address}`);
    }

    const { recipientAddress, amount } = await inquirer.prompt([
        {
            type: 'input',
            name: 'recipientAddress',
            message: 'Enter the recipient\'s Solana address:',
            validate: (input: string) => {
                if (!input.trim()) return 'Please enter a recipient address';
                if (!validateSolanaAddress(input.trim())) return 'Please enter a valid Solana address';
                return true;
            }
        },
        {
            type: 'input',
            name: 'amount',
            message: 'Enter the amount of SOL to send:',
            validate: (input: string) => {
                if (!input.trim()) return 'Please enter an amount';
                const validation = validateAmount(input.trim(), 'SOL');
                return validation.valid ? true : validation.error!;
            }
        },
    ]);

    const accountAddress = userSession.smart_account_address || userSession.address;
    
    if (!accountAddress) {
        console.error('No account address found in session');
        return;
    }
    
    // Check if we have different address types
    if (DEBUG_MODE) {
        console.log('🏦 Address Analysis:');
        if (userSession.smart_account_address) console.log(`  Smart Account: ${userSession.smart_account_address}`);
        if (userSession.address) console.log(`  Regular Address: ${userSession.address}`);
        console.log(`  Using Address: ${accountAddress}`);
    }

    try {
        simpleLog('🔧 Creating SOL transfer transaction...');
        debugLog('Creating arbitrary SOL transfer transaction...');
        if (DEBUG_MODE) {
            console.log('📊 Transaction Details:');
            console.log(`  From: ${accountAddress}`);
            console.log(`  To: ${recipientAddress}`);
            console.log(`  Amount: ${amount} SOL`);
        }
        
        // Step 1: Create raw Solana transaction (Grid account will handle fees internally)
        const fromPubkey = new PublicKey(accountAddress); // Grid smart account (source of funds)
        const toPubkey = new PublicKey(recipientAddress); // Destination
        const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
        
        debugLog('📊 Transaction Details:');
        debugLog(`  From (Grid Account): ${fromPubkey.toBase58()}`);
        debugLog(`  To: ${toPubkey.toBase58()}`);
        debugLog(`  Amount: ${lamports} lamports (${amount} SOL)`);
        debugLog(`  Fee Payer: Grid will handle internally`);

        // Create the transfer instruction (Grid account sends to recipient)
        const transferInstruction = SystemProgram.transfer({
            fromPubkey, // Grid account
            toPubkey,   // Recipient
            lamports,
        });
        debugLog('✅ Transfer instruction created');

        // Get recent blockhash from Solana network
        simpleLog('🔗 Preparing transaction...');
        debugLog(`🔗 Fetching recent blockhash from ${GRID_ENVIRONMENT === 'sandbox' ? 'devnet' : 'mainnet-beta'}...`);
        const { blockhash } = await solanaConnection.getLatestBlockhash('finalized');
        debugLog(`  Blockhash: ${blockhash}`);
        
        // CRITICAL: Grid account acts as both sender AND fee payer
        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: fromPubkey, // Grid account pays its own transaction fees
        });
        
        transaction.add(transferInstruction);
        debugLog('✅ Transaction created with Grid account as fee payer');

        // Serialize transaction to base64
        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });
        const base64Transaction = serializedTransaction.toString('base64');
        
        debugLog('✅ Transaction serialized');
        debugLog(`📄 Base64 Transaction Length: ${base64Transaction.length}`);

        debugLog('Raw transaction created, preparing with Grid SDK...');

        // Step 2: Prepare arbitrary transaction payload (simplified format)
        const rawTransactionPayload = {
            transaction: base64Transaction, // Just the base64 transaction, Grid handles the rest
        };
        
        if (DEBUG_MODE) {
            console.log('📦 Raw Transaction Payload:');
            console.log(`  transaction length: ${rawTransactionPayload.transaction.length}`);
            console.log(`  transaction (first 100 chars): ${rawTransactionPayload.transaction.substring(0, 100)}...`);
            
            // Log the actual transaction structure for debugging
            console.log('🔍 Transaction Structure Analysis:');
            console.log(`  Transaction Instructions: ${transaction.instructions.length}`);
            console.log(`  Fee Payer: ${transaction.feePayer?.toBase58()}`);
            console.log(`  Recent Blockhash: ${transaction.recentBlockhash}`);
            transaction.instructions.forEach((instruction, index) => {
                console.log(`  Instruction ${index}:`);
                console.log(`    Program ID: ${instruction.programId.toBase58()}`);
                console.log(`    Keys: ${instruction.keys.length} accounts`);
                instruction.keys.forEach((key, keyIndex) => {
                    console.log(`      ${keyIndex}: ${key.pubkey.toBase58()} (${key.isSigner ? 'signer' : 'non-signer'}, ${key.isWritable ? 'writable' : 'readonly'})`);
                });
            });
        }

        // Step 3: Use Grid SDK's prepareArbitraryTransaction method
        simpleLog('🔄 Preparing transaction with Grid...');
        debugLog('🔄 Calling prepareArbitraryTransaction...');
        debugLog(`  Account: ${accountAddress}`);
        debugLog(`  Payload: ${JSON.stringify(rawTransactionPayload, null, 2)}`);
        
        let prepareResponse;
        try {
            prepareResponse = await gridClient.prepareArbitraryTransaction(
                accountAddress,
                rawTransactionPayload
            );
        } catch (error: any) {
            if (DEBUG_MODE) {
                console.error('❌ prepareArbitraryTransaction failed:');
                console.error(`  Error message: ${error.message}`);
                console.error(`  Error code: ${error.code}`);
                console.error(`  Error cause: ${error.cause}`);
                console.error(`  Full error:`, error);
            }
            throw error;
        }

        if (DEBUG_MODE) {
            console.log('📋 Prepare Response Details:');
            console.log(`  Data exists: ${!!prepareResponse.data}`);
            if (prepareResponse.error) {
                console.log(`  Error: ${prepareResponse.error}`);
            }
            if (prepareResponse.data) {
                console.log(`  Prepared payload keys: ${Object.keys(prepareResponse.data)}`);
                if (prepareResponse.data.transaction) {
                    console.log(`  Prepared transaction length: ${prepareResponse.data.transaction.length}`);
                }
            }
        }

        if (!prepareResponse.data) {
            throw new Error(`Failed to prepare transaction: ${prepareResponse.error || 'No data in response'}`);
        }

        const transactionPayload = prepareResponse.data;
        debugLog('✅ Transaction prepared successfully');
        
        // Step 4: Execute transaction using signAndSend method with Grid's prepared payload
        simpleLog('📤 Executing SOL transaction...');
        debugLog('📤 Executing transaction with Grid SDK...');
        if (DEBUG_MODE) {
            console.log('🔧 Session details:');
            console.log(`  sessionSecrets present: ${!!sessionSecrets}`);
            console.log(`  userSession keys: ${Object.keys(userSession)}`);
            console.log(`  authentication present: ${!!userSession.authentication}`);
        }
        
        let executedTx;
        try {
            executedTx = await gridClient.signAndSend({
                sessionSecrets: sessionSecrets!, // Private keys for cryptographic signing
                session: userSession.authentication, // Use authentication field as per docs
                transactionPayload: transactionPayload, // Use Grid's prepared transaction AS-IS
                address: accountAddress
            });
        } catch (error: any) {
            if (DEBUG_MODE) {
                console.error('❌ signAndSend failed:');
                console.error(`  Error message: ${error.message}`);
                console.error(`  Error code: ${error.code}`);
                console.error(`  Error cause: ${error.cause}`);
                console.error(`  Full error:`, error);
            }
            throw error;
        }

        // Handle different response formats
        let txSignature: string | null = null;
        
        if (executedTx && executedTx.signature) {
            txSignature = executedTx.signature;
        } else if (executedTx && (executedTx.transaction_signature || executedTx.data?.signature)) {
            txSignature = executedTx.transaction_signature || executedTx.data?.signature;
        }

        if (txSignature) {
            simpleLog(`✅ SOL transfer successful!`);
            simpleLog(`💰 Sent ${amount} SOL to ${recipientAddress}`);
            simpleLog(`🔗 View transaction: ${getExplorerUrl(txSignature)}`);
            
            debugLog('✅ Arbitrary transaction successful! Signature:', txSignature);
            debugLog(`📊 Sent ${amount} SOL to ${recipientAddress}`);
        } else {
            console.log('✅ Transaction submitted successfully, but signature format is unexpected.');
            if (DEBUG_MODE) {
                console.log('Received response:', executedTx);
            }
        }

    } catch (error) {
        console.error('❌ SOL transfer failed:', error);
        if (DEBUG_MODE) {
            console.error('Error details:', error);
        }
    }
}

// --- Main Menu ---

async function mainMenu() {
    console.log('\n------------------');
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: 'Login or Register', value: 'login' },
                { name: 'Check Balance', value: 'balance' },
                { name: 'Transfer USDC', value: 'transfer' },
                { name: 'Transfer SOL (Arbitrary Transaction)', value: 'arbitrarySOL' },
                { name: 'Exit', value: 'exit' },
            ],
        },
    ]);

    switch (action) {
        case 'login':
            await loginOrRegister();
            break;
        case 'balance':
            await checkBalance();
            break;
        case 'transfer':
            await transferTokens();
            break;
        case 'arbitrarySOL':
            await transferSOLArbitrary();
            break;
        case 'exit':
            console.log('Goodbye!');
            return;
    }

    await mainMenu(); // Show the menu again
}

// --- Script Entry Point ---

async function main() {
    initializeGridClient();
    console.log('Welcome to the Grid SDK CLI Tool!');
    await mainMenu();
}

main();
