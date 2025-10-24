require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import custom modules
const { validate, businessRules, sanitize } = require('./utils/validation');
const MoneySplitter = require('./utils/money-split');
const MpesaService = require('./services/mpesa-service');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files for dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'public')));
app.use('/api/dashboard', dashboardRoutes);

// Database connection
const dbPath = path.join(__dirname, 'database', 'mobipay.db');
const db = new sqlite3.Database(dbPath);

// Initialize services
const moneySplitter = new MoneySplitter(db);

// M-Pesa configuration
const mpesaConfig = {
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    shortcode: process.env.MPESA_SHORTCODE || '',
    passkey: process.env.MPESA_PASSKEY || '',
    callbackUrl: process.env.MPESA_CALLBACK_URL || `http://localhost:${PORT}/api/mpesa/callback`,
    environment: process.env.MPESA_ENVIRONMENT || 'sandbox'
};

const mpesaService = new MpesaService(mpesaConfig);

// Utility function to log transactions
const logTransaction = (transactionData) => {
    return new Promise((resolve, reject) => {
        const query = `
            INSERT INTO transactions (
                transaction_id, matatu_code, phone_number, amount, 
                transaction_charge, total_amount, owner_share, developer_share,
                status, mpesa_request_id, checkout_request_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            transactionData.transactionId,
            transactionData.matatuCode,
            transactionData.phoneNumber,
            transactionData.amount,
            transactionData.transactionCharge,
            transactionData.totalAmount,
            transactionData.ownerShare,
            transactionData.developerShare,
            transactionData.status,
            transactionData.mpesaRequestId || null,
            transactionData.checkoutRequestId || null
        ];
        
        db.run(query, params, function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ id: this.lastID, transactionId: transactionData.transactionId });
        });
    });
};

// API Routes

/**
 * Welcome endpoint
 */
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to MOBIPAY - Lipa Matatu na Code',
        version: '1.0.0',
        endpoints: {
            payment: '/api/payment/initiate',
            status: '/api/payment/status/:transactionId',
            callback: '/api/mpesa/callback',
            history: '/api/payment/history/:matatuCode',
            ussd: '/api/ussd'
        }
    });
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected'
    });
});

/**
 * Initiate payment endpoint
 */
app.post('/api/payment/initiate', async (req, res) => {
    try {
        const { matatu_code, phone_number, amount } = req.body;

        // Sanitize inputs
        const cleanMatatuCode = sanitize.cleanMatatuCode(matatu_code);
        const cleanPhoneNumber = sanitize.cleanPhoneNumber(phone_number);
        const cleanAmount = sanitize.cleanAmount(amount);

        // Validate input data
        const validation = validate.validatePaymentRequest({
            matatu_code: cleanMatatuCode,
            phone_number: cleanPhoneNumber,
            amount: cleanAmount
        });

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                errors: validation.errors
            });
        }

        // Validate matatu code exists
        const matatuValidation = await businessRules.validateMatatuCodeExists(db, cleanMatatuCode);
        if (!matatuValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: matatuValidation.error
            });
        }

        // Calculate transaction charge
        const transactionCharge = businessRules.calculateTransactionCharge(cleanAmount);
        const totalAmount = cleanAmount + transactionCharge;

        // Execute money split
        const splitResult = await moneySplitter.executeSplit(cleanMatatuCode, cleanAmount, transactionCharge);
        if (!splitResult.success) {
            return res.status(500).json({
                success: false,
                error: splitResult.error
            });
        }

        // Generate transaction ID
        const transactionId = `MOBI${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        // Initiate M-Pesa STK Push
        const stkPushResult = await mpesaService.stkPush(
            cleanPhoneNumber,
            totalAmount,
            transactionId,
            `MOBIPAY Payment - Matatu ${cleanMatatuCode}`
        );

        if (!stkPushResult.success) {
            return res.status(500).json({
                success: false,
                error: 'Failed to initiate payment',
                details: stkPushResult.error
            });
        }

        // Log transaction to database
        const transactionData = {
            transactionId: transactionId,
            matatuCode: cleanMatatuCode,
            phoneNumber: cleanPhoneNumber,
            amount: cleanAmount,
            transactionCharge: transactionCharge,
            totalAmount: totalAmount,
            ownerShare: splitResult.data.accounts.owner.shareAmount,
            developerShare: splitResult.data.accounts.developer.shareAmount,
            status: 'PENDING',
            mpesaRequestId: stkPushResult.data.merchantRequestId,
            checkoutRequestId: stkPushResult.data.checkoutRequestId
        };

        await logTransaction(transactionData);

        // Log split execution
        await moneySplitter.logSplitExecution(transactionId, splitResult.data);

        // Return success response
        res.json({
            success: true,
            message: 'Payment initiated successfully',
            data: {
                transactionId: transactionId,
                amount: cleanAmount,
                transactionCharge: transactionCharge,
                totalAmount: totalAmount,
                phoneNumber: cleanPhoneNumber,
                matatuCode: cleanMatatuCode,
                checkoutRequestId: stkPushResult.data.checkoutRequestId,
                customerMessage: stkPushResult.data.customerMessage,
                split: {
                    ownerShare: splitResult.data.accounts.owner.shareAmount,
                    developerShare: splitResult.data.accounts.developer.shareAmount
                }
            }
        });

    } catch (error) {
        console.error('Payment initiation error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * Check payment status endpoint
 */
app.get('/api/payment/status/:transactionId', async (req, res) => {
    try {
        const { transactionId } = req.params;

        // Query transaction from database
        const query = `
            SELECT t.*, m.route_name, m.owner_account 
            FROM transactions t
            LEFT JOIN matatus m ON t.matatu_code = m.matatu_code
            WHERE t.transaction_id = ?
        `;

        db.get(query, [transactionId], async (err, transaction) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Database error'
                });
            }

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }

            // If transaction is still pending and has checkout request ID, query M-Pesa
            if (transaction.status === 'PENDING' && transaction.checkout_request_id) {
                const queryResult = await mpesaService.stkPushQuery(transaction.checkout_request_id);
                
                if (queryResult.success && queryResult.data.resultCode !== undefined) {
                    const newStatus = queryResult.data.resultCode === 0 ? 'COMPLETED' : 'FAILED';
                    
                    // Update transaction status in database
                    const updateQuery = `
                        UPDATE transactions 
                        SET status = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE transaction_id = ?
                    `;
                    
                    db.run(updateQuery, [newStatus, transactionId], (updateErr) => {
                        if (updateErr) {
                            console.error('Status update error:', updateErr);
                        }
                    });
                    
                    transaction.status = newStatus;
                }
            }

            res.json({
                success: true,
                data: {
                    transactionId: transaction.transaction_id,
                    matatuCode: transaction.matatu_code,
                    route: transaction.route_name,
                    phoneNumber: transaction.phone_number,
                    amount: transaction.amount,
                    transactionCharge: transaction.transaction_charge,
                    totalAmount: transaction.total_amount,
                    status: transaction.status,
                    mpesaReceiptNumber: transaction.mpesa_receipt_number,
                    ownerShare: transaction.owner_share,
                    developerShare: transaction.developer_share,
                    createdAt: transaction.created_at,
                    updatedAt: transaction.updated_at
                }
            });
        });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * M-Pesa callback endpoint
 */
app.post('/api/mpesa/callback', async (req, res) => {
    try {
        console.log('M-Pesa Callback received:', JSON.stringify(req.body, null, 2));

        // Validate callback data
        const validation = mpesaService.validateCallback(req.body);
        if (!validation.isValid) {
            console.error('Invalid callback:', validation.error);
            return res.status(400).json({ error: validation.error });
        }

        // Process callback data
        const callbackResult = mpesaService.processCallback(req.body);
        
        // Find transaction by checkout request ID
        const query = `
            SELECT transaction_id FROM transactions 
            WHERE checkout_request_id = ?
        `;

        db.get(query, [callbackResult.checkoutRequestId], (err, row) => {
            if (err) {
                console.error('Database error in callback:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!row) {
                console.error('Transaction not found for checkout ID:', callbackResult.checkoutRequestId);
                return res.status(404).json({ error: 'Transaction not found' });
            }

            // Update transaction status
            const status = callbackResult.success ? 'COMPLETED' : 'FAILED';
            const updateQuery = `
                UPDATE transactions 
                SET status = ?, mpesa_receipt_number = ?, updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = ?
            `;

            db.run(updateQuery, [status, callbackResult.mpesaReceiptNumber, row.transaction_id], (updateErr) => {
                if (updateErr) {
                    console.error('Transaction update error:', updateErr);
                    return res.status(500).json({ error: 'Update failed' });
                }

                console.log(`Transaction ${row.transaction_id} updated to ${status}`);
                res.json({ success: true, message: 'Callback processed successfully' });
            });
        });

    } catch (error) {
        console.error('Callback processing error:', error);
        res.status(500).json({ error: 'Callback processing failed' });
    }
});

/**
 * Get transaction history for a matatu
 */
app.get('/api/payment/history/:matatuCode', async (req, res) => {
    try {
        const { matatuCode } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const history = await moneySplitter.getSplitHistory(matatuCode, limit);

        res.json({
            success: true,
            data: {
                matatuCode: matatuCode,
                transactions: history,
                totalTransactions: history.length
            }
        });

    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transaction history'
        });
    }
});

/**
 * USSD endpoint (basic structure)
 */
app.post('/api/ussd', async (req, res) => {
    try {
        const { sessionId, serviceCode, phoneNumber, text } = req.body;

        // Clean phone number
        const cleanPhone = sanitize.cleanPhoneNumber(phoneNumber);

        // Basic USSD flow
        let response = '';

        if (text === '') {
            // Main menu
            response = `CON Welcome to MOBIPAY - Lipa Matatu na Code
1. Make Payment
2. Check Transaction Status
3. Help`;
        } else if (text === '1') {
            // Payment option
            response = 'CON Enter Matatu Code (1-4 digits):';
        } else if (text.startsWith('1*')) {
            const inputs = text.split('*');
            if (inputs.length === 2) {
                // Matatu code entered, ask for amount
                const matatuCode = inputs[1];
                const validation = validate.validateMatatuCode(matatuCode);
                
                if (!validation.isValid) {
                    response = `END ${validation.error}`;
                } else {
                    response = 'CON Enter amount (Min KSh 50):';
                }
            } else if (inputs.length === 3) {
                // Amount entered, process payment
                const matatuCode = inputs[1];
                const amount = parseInt(inputs[2]);
                
                const transactionCharge = businessRules.calculateTransactionCharge(amount);
                const totalAmount = amount + transactionCharge;
                
                response = `END Payment request sent!
Fare: KSh ${amount}
Service Fee: KSh ${transactionCharge}
Total: KSh ${totalAmount}
You will receive STK push shortly.`;
                
                // Here you would trigger the actual payment process
                // Similar to the /api/payment/initiate endpoint
            }
        } else if (text === '2') {
            response = 'CON Enter Transaction ID to check status:';
        } else if (text === '3') {
            response = `END MOBIPAY Help:
- Dial this code to pay matatu fare
- Enter matatu code (4 digits max)
- Enter amount (min KSh 50)
- Complete payment via M-Pesa
For support call: 0700000000`;
        } else {
            response = 'END Invalid option. Please try again.';
        }

        res.set('Content-Type', 'text/plain');
        res.send(response);

    } catch (error) {
        console.error('USSD error:', error);
        res.set('Content-Type', 'text/plain');
        res.send('END Service temporarily unavailable. Please try again later.');
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 MOBIPAY Server running on port ${PORT}`);
    console.log(`📱 API endpoints available at http://localhost:${PORT}`);
    console.log(`🔗 M-Pesa callback URL: ${mpesaConfig.callbackUrl}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n📴 Shutting down MOBIPAY server...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});

module.exports = app;
