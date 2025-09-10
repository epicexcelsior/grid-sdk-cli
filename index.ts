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
import bs58 from 'bs58';

// --- Configuration ---
// IMPORTANT: Replace these with your actual credentials.
const GRID_API_KEY = "API KEY HERE";
const GRID_ENVIRONMENT = 'sandbox' as GridEnvironment;
const GRID_BASE_URL = 'https://grid.squads.xyz'; // SDK will append /api/grid/v1 automatically

// NOTE: Grid accounts handle transaction fees internally - no external fee payer needed

let gridClient: GridClient;
let userSession: any = null; // To store user session data (the `data` property of the API response)
let sessionSecrets: SessionSecrets | null = null; // To store session secrets separately
let solanaConnection: Connection;

// --- SDK Initialization ---
function initializeGridClient() {
    console.log('🔧 Grid SDK Configuration:');
    console.log(`  Environment: ${GRID_ENVIRONMENT}`);
    console.log(`  API Key: ${GRID_API_KEY.substring(0, 8)}...${GRID_API_KEY.substring(GRID_API_KEY.length - 8)}`);
    console.log(`  Base URL: ${GRID_BASE_URL}`);
    console.log(`  Solana Network: ${GRID_ENVIRONMENT === 'sandbox' ? 'devnet' : 'mainnet-beta'}`);
    
    gridClient = new GridClient({
        apiKey: GRID_API_KEY,
        environment: GRID_ENVIRONMENT,
        baseUrl: GRID_BASE_URL, // SDK appends /api/grid/v1 automatically
    });
    
    // Initialize Solana connection for arbitrary transactions
    const solanaNetwork = GRID_ENVIRONMENT === 'sandbox' ? clusterApiUrl('devnet') : clusterApiUrl('mainnet-beta');
    console.log(`  Connecting to: ${solanaNetwork}`);
    
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
        console.log('Checking for existing user...');
        const authResponse = await gridClient.initAuth({ email });
        
        if (authResponse && authResponse.data) {
            console.log('OTP sent to your email. Please check your inbox to log in.');
            await verifyOtp(email, false);
        } else {
            throw new Error('Failed to initialize authentication');
        }
    } catch (error: any) {
        // Check if it's specifically a "user not found" error vs account already exists
        if (error.message && (error.message.includes('User not found') || error.message.includes('not found'))) {
            console.log('User not found. Attempting to register...');
            try {
                const accountResponse = await gridClient.createAccount({ type: 'email', email });
                console.log('Account creation initiated. OTP sent to your email. Please check your inbox to complete registration.');
                await verifyOtp(email, true);
            } catch (registrationError: any) {
                if (registrationError.message && registrationError.message.includes('already exists')) {
                    console.log('Account already exists. Retrying login...');
                    // Account exists, try login again
                    try {
                        const retryAuthResponse = await gridClient.initAuth({ email });
                        if (retryAuthResponse && retryAuthResponse.data) {
                            console.log('OTP sent to your email. Please check your inbox to log in.');
                            await verifyOtp(email, false);
                        }
                    } catch (retryError) {
                        console.error('Login retry failed:', retryError);
                    }
                } else {
                    console.error('Registration failed:', registrationError);
                }
            }
        } else {
            // For other errors, might still be an existing user, try login flow
            console.log('Authentication issue detected. This might be an existing account. Try entering OTP if you received one.');
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
            console.log('User session created.');
            console.log('Account address:', userSession.smart_account_address || userSession.address);
            
            // Log the structure to understand what we're getting
            console.log('Session structure:', Object.keys(userSession));
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

    // First, get the token type
    const { tokenType } = await inquirer.prompt([
        {
            type: 'list',
            name: 'tokenType',
            message: 'Which token would you like to send?',
            choices: [
                { name: 'USDC', value: 'usdc' },
                { name: 'SOL', value: 'sol' },
            ],
        },
    ]);

    // Then get the recipient and amount with the correct token type in the message
    const { recipientAddress, amount } = await inquirer.prompt([
        {
            type: 'input',
            name: 'recipientAddress',
            message: 'Enter the recipient\'s Solana address:',
        },
        {
            type: 'input',
            name: 'amount',
            message: `Enter the amount of ${tokenType === 'usdc' ? 'USDC' : 'SOL'} to send:`,
        },
    ]);

    // Convert amount to base units based on token type
    let amountInBaseUnits: number;
    if (tokenType === 'usdc') {
        amountInBaseUnits = Math.floor(parseFloat(amount) * 1_000_000); // USDC has 6 decimals
    } else if (tokenType === 'sol') {
        amountInBaseUnits = Math.floor(parseFloat(amount) * 1_000_000_000); // SOL has 9 decimals
    } else {
        throw new Error('Unsupported token type');
    }

    const accountAddress = userSession.smart_account_address || userSession.address;

    if (!accountAddress) {
        console.error('No account address found in session');
        return;
    }

    try {
        console.log(`Creating ${tokenType.toUpperCase()} payment intent...`);
        
        let paymentIntentRequest;
        if (tokenType === 'sol') {
            // SOL transfers use 'solana' payment rail
            paymentIntentRequest = {
                amount: amountInBaseUnits.toString(),
                grid_user_id: userSession.grid_user_id,
                source: {
                    address: accountAddress,
                    currency: 'sol',
                    payment_rail: 'solana',
                },
                destination: {
                    address: recipientAddress,
                    currency: 'sol',
                    payment_rail: 'solana',
                },
            };
        } else {
            // USDC transfers use 'smart_account' payment rail
            paymentIntentRequest = {
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
        }
        
        const paymentIntentResponse = await gridClient.createPaymentIntent(
            accountAddress,
            paymentIntentRequest
        );

        if (!paymentIntentResponse.data?.transactionPayload) {
             throw new Error(`Failed to create payment intent: ${paymentIntentResponse.error || 'Response did not contain transaction payload'}`);
        }
        
        const transactionPayload = paymentIntentResponse.data.transactionPayload;

        console.log('Payment intent created. Signing transaction...');
        const signedPayload = await gridClient.sign({
            sessionSecrets,
            session: userSession.session || userSession.authentication,
            transactionPayload: transactionPayload,
        });

        console.log('Transaction signed. Sending...');
        const signatureResponse = await gridClient.send({
            signedTransactionPayload: signedPayload,
            address: accountAddress,
        });

        // Handle different response formats
        if (signatureResponse && signatureResponse.transaction_signature) {
            console.log('✅ Transaction successful! Signature:', signatureResponse.transaction_signature);
            console.log(`📊 Sent ${amount} ${tokenType.toUpperCase()} to ${recipientAddress}`);
            if (signatureResponse.confirmed_at) {
                console.log(`⏰ Confirmed at: ${signatureResponse.confirmed_at}`);
            }
        } else if (signatureResponse && (signatureResponse.signature || signatureResponse.data?.signature)) {
            const signature = signatureResponse.signature || signatureResponse.data?.signature;
            console.log('✅ Transaction successful! Signature:', signature);
            console.log(`📊 Sent ${amount} ${tokenType.toUpperCase()} to ${recipientAddress}`);
        } else {
            console.log('Transaction submitted successfully, but the response format is unexpected.');
            console.log('Received response:', signatureResponse);
        }

    } catch (error) {
        console.error('Transfer failed:', error);
        console.error('Error details:', error);
    }
}

async function transferSOLArbitrary() {
    if (!userSession || !sessionSecrets) {
        console.log('Please log in first.');
        return;
    }

    console.log('🔐 Session Info:');
    console.log(`  User Session Keys: ${Object.keys(userSession)}`);
    console.log(`  Session Secrets Present: ${!!sessionSecrets}`);
    if (userSession.grid_user_id) console.log(`  Grid User ID: ${userSession.grid_user_id}`);
    if (userSession.smart_account_address) console.log(`  Smart Account: ${userSession.smart_account_address}`);
    if (userSession.address) console.log(`  Address: ${userSession.address}`);

    const { recipientAddress, amount } = await inquirer.prompt([
        {
            type: 'input',
            name: 'recipientAddress',
            message: 'Enter the recipient\'s Solana address:',
        },
        {
            type: 'input',
            name: 'amount',
            message: 'Enter the amount of SOL to send:',
        },
    ]);

    const accountAddress = userSession.smart_account_address || userSession.address;
    
    if (!accountAddress) {
        console.error('No account address found in session');
        return;
    }
    
    // Check if we have different address types
    console.log('🏦 Address Analysis:');
    if (userSession.smart_account_address) console.log(`  Smart Account: ${userSession.smart_account_address}`);
    if (userSession.address) console.log(`  Regular Address: ${userSession.address}`);
    console.log(`  Using Address: ${accountAddress}`);

    try {
        console.log('Creating arbitrary SOL transfer transaction...');
        console.log('📊 Transaction Details:');
        console.log(`  From: ${accountAddress}`);
        console.log(`  To: ${recipientAddress}`);
        console.log(`  Amount: ${amount} SOL`);
        
        // Step 1: Create raw Solana transaction (Grid account will handle fees internally)
        const fromPubkey = new PublicKey(accountAddress); // Grid smart account (source of funds)
        const toPubkey = new PublicKey(recipientAddress); // Destination
        const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
        
        console.log('📊 Transaction Details:');
        console.log(`  From (Grid Account): ${fromPubkey.toBase58()}`);
        console.log(`  To: ${toPubkey.toBase58()}`);
        console.log(`  Amount: ${lamports} lamports (${amount} SOL)`);
        console.log(`  Fee Payer: Grid will handle internally`);

        // Create the transfer instruction (Grid account sends to recipient)
        const transferInstruction = SystemProgram.transfer({
            fromPubkey, // Grid account
            toPubkey,   // Recipient
            lamports,
        });
        console.log('✅ Transfer instruction created');

        // Get recent blockhash from Solana network
        console.log(`🔗 Fetching recent blockhash from ${GRID_ENVIRONMENT === 'sandbox' ? 'devnet' : 'mainnet-beta'}...`);
        const { blockhash } = await solanaConnection.getLatestBlockhash('finalized');
        console.log(`  Blockhash: ${blockhash}`);
        
        // CRITICAL: Grid account acts as both sender AND fee payer
        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: fromPubkey, // Grid account pays its own transaction fees
        });
        
        transaction.add(transferInstruction);
        console.log('✅ Transaction created with Grid account as fee payer');

        // Serialize transaction to base64
        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });
        const base64Transaction = serializedTransaction.toString('base64');
        
        console.log('✅ Transaction serialized');
        console.log(`📄 Base64 Transaction Length: ${base64Transaction.length}`);

        console.log('Raw transaction created, preparing with Grid SDK...');

        // Step 2: Prepare arbitrary transaction payload (simplified format)
        const rawTransactionPayload = {
            transaction: base64Transaction, // Just the base64 transaction, Grid handles the rest
        };
        
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

        // Step 3: Use Grid SDK's prepareArbitraryTransaction method
        console.log('🔄 Calling prepareArbitraryTransaction...');
        console.log(`  Account: ${accountAddress}`);
        console.log(`  Payload: ${JSON.stringify(rawTransactionPayload, null, 2)}`);
        
        let prepareResponse;
        try {
            prepareResponse = await gridClient.prepareArbitraryTransaction(
                accountAddress,
                rawTransactionPayload
            );
        } catch (error: any) {
            console.error('❌ prepareArbitraryTransaction failed:');
            console.error(`  Error message: ${error.message}`);
            console.error(`  Error code: ${error.code}`);
            console.error(`  Error cause: ${error.cause}`);
            console.error(`  Full error:`, error);
            throw error;
        }

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

        if (!prepareResponse.data) {
            throw new Error(`Failed to prepare transaction: ${prepareResponse.error || 'No data in response'}`);
        }

        const transactionPayload = prepareResponse.data;
        console.log('✅ Transaction prepared successfully');
        
        // Step 4: Execute transaction using signAndSend method with Grid's prepared payload
        console.log('📤 Executing transaction with Grid SDK...');
        console.log('🔧 Session details:');
        console.log(`  sessionSecrets present: ${!!sessionSecrets}`);
        console.log(`  userSession keys: ${Object.keys(userSession)}`);
        console.log(`  authentication present: ${!!userSession.authentication}`);
        
        let executedTx;
        try {
            executedTx = await gridClient.signAndSend({
                sessionSecrets: sessionSecrets!, // Private keys for cryptographic signing
                session: userSession.authentication, // Use authentication field as per docs
                transactionPayload: transactionPayload, // Use Grid's prepared transaction AS-IS
                address: accountAddress
            });
        } catch (error: any) {
            console.error('❌ signAndSend failed:');
            console.error(`  Error message: ${error.message}`);
            console.error(`  Error code: ${error.code}`);
            console.error(`  Error cause: ${error.cause}`);
            console.error(`  Full error:`, error);
            throw error;
        }

        // Handle different response formats
        if (executedTx && executedTx.signature) {
            console.log('✅ Arbitrary transaction successful! Signature:', executedTx.signature);
            console.log(`📊 Sent ${amount} SOL to ${recipientAddress}`);
            console.log('🔗 View transaction:', `https://explorer.solana.com/tx/${executedTx.signature}?cluster=${GRID_ENVIRONMENT === 'sandbox' ? 'devnet' : 'mainnet-beta'}`);
        } else if (executedTx && (executedTx.transaction_signature || executedTx.data?.signature)) {
            const signature = executedTx.transaction_signature || executedTx.data?.signature;
            console.log('✅ Arbitrary transaction successful! Signature:', signature);
            console.log(`📊 Sent ${amount} SOL to ${recipientAddress}`);
            console.log('🔗 View transaction:', `https://explorer.solana.com/tx/${signature}?cluster=${GRID_ENVIRONMENT === 'sandbox' ? 'devnet' : 'mainnet-beta'}`);
        } else {
            console.log('Transaction submitted successfully, but the response format is unexpected.');
            console.log('Received response:', executedTx);
        }

    } catch (error) {
        console.error('Arbitrary SOL transfer failed:', error);
        console.error('Error details:', error);
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
                { name: 'Transfer Tokens (USDC/SOL)', value: 'transfer' },
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
