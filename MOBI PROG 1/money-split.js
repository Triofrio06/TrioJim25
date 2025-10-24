const sqlite3 = require('sqlite3').verbose();

/**
 * MOBIPAY Money Split Logic
 * Handles the distribution of transaction fees between matatu owner and developer
 */

class MoneySplitter {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get system settings for split calculations
     */
    async getSystemSettings() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT setting_key, setting_value 
                FROM system_settings 
                WHERE setting_key IN ('developer_percentage', 'min_amount')
            `;
            
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const settings = {};
                rows.forEach(row => {
                    settings[row.setting_key] = row.setting_value;
                });
                
                resolve({
                    developerPercentage: parseFloat(settings.developer_percentage) || 10,
                    minAmount: parseInt(settings.min_amount) || 50
                });
            });
        });
    }

    /**
     * Get matatu owner account details
     */
    async getMatatuOwnerAccount(matatuCode) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT m.owner_account, a.account_name 
                FROM matatus m
                JOIN accounts a ON m.owner_account = a.account_number
                WHERE m.matatu_code = ? AND m.is_active = 1 AND a.is_active = 1
            `;
            
            this.db.get(query, [matatuCode], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    reject(new Error('Matatu owner account not found or inactive'));
                    return;
                }
                
                resolve({
                    accountNumber: row.owner_account,
                    accountName: row.account_name
                });
            });
        });
    }

    /**
     * Get developer account details
     */
    async getDeveloperAccount() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT account_number, account_name 
                FROM accounts 
                WHERE account_type = 'DEVELOPER' AND is_active = 1
                LIMIT 1
            `;
            
            this.db.get(query, [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    reject(new Error('Developer account not found or inactive'));
                    return;
                }
                
                resolve({
                    accountNumber: row.account_number,
                    accountName: row.account_name
                });
            });
        });
    }

    /**
     * Calculate split amounts from transaction charge
     * @param {number} transactionCharge - The transaction charge amount
     * @param {number} developerPercentage - Percentage that goes to developer (default: 10%)
     * @returns {object} - Split calculation results
     */
    calculateSplit(transactionCharge, developerPercentage = 10) {
        // Ensure minimum values
        if (transactionCharge < 1) {
            throw new Error('Transaction charge must be at least KSh 1');
        }

        if (developerPercentage < 0 || developerPercentage > 100) {
            throw new Error('Developer percentage must be between 0 and 100');
        }

        // Calculate developer share (rounded to nearest shilling)
        const developerShare = Math.round(transactionCharge * (developerPercentage / 100));
        
        // Owner gets the remainder
        const ownerShare = transactionCharge - developerShare;

        // Ensure minimum share for owner (at least 1 shilling if transaction charge > 1)
        const finalDeveloperShare = ownerShare < 1 && transactionCharge > 1 ? developerShare - 1 : developerShare;
        const finalOwnerShare = transactionCharge - finalDeveloperShare;

        return {
            transactionCharge: transactionCharge,
            developerShare: finalDeveloperShare,
            ownerShare: finalOwnerShare,
            developerPercentage: (finalDeveloperShare / transactionCharge * 100).toFixed(2),
            ownerPercentage: (finalOwnerShare / transactionCharge * 100).toFixed(2),
            splitRatio: `${finalOwnerShare}:${finalDeveloperShare}`,
            isValid: finalDeveloperShare >= 0 && finalOwnerShare >= 0
        };
    }

    /**
     * Execute money split for a transaction
     * @param {string} matatuCode - Matatu code
     * @param {number} fareAmount - Original fare amount
     * @param {number} transactionCharge - Transaction charge amount
     * @returns {object} - Complete split execution results
     */
    async executeSplit(matatuCode, fareAmount, transactionCharge) {
        try {
            // Get system settings
            const settings = await this.getSystemSettings();
            
            // Get account details
            const [ownerAccount, developerAccount] = await Promise.all([
                this.getMatatuOwnerAccount(matatuCode),
                this.getDeveloperAccount()
            ]);

            // Calculate split
            const splitCalculation = this.calculateSplit(transactionCharge, settings.developerPercentage);

            // Prepare split execution data
            const splitExecution = {
                transactionDetails: {
                    matatuCode: matatuCode,
                    fareAmount: fareAmount,
                    transactionCharge: transactionCharge,
                    totalAmount: fareAmount + transactionCharge
                },
                splitCalculation: splitCalculation,
                accounts: {
                    owner: {
                        accountNumber: ownerAccount.accountNumber,
                        accountName: ownerAccount.accountName,
                        shareAmount: splitCalculation.ownerShare,
                        percentage: splitCalculation.ownerPercentage
                    },
                    developer: {
                        accountNumber: developerAccount.accountNumber,
                        accountName: developerAccount.accountName,
                        shareAmount: splitCalculation.developerShare,
                        percentage: splitCalculation.developerPercentage
                    }
                },
                splitSummary: {
                    totalSplit: splitCalculation.transactionCharge,
                    ownerReceives: splitCalculation.ownerShare,
                    developerReceives: splitCalculation.developerShare,
                    splitRatio: splitCalculation.splitRatio
                },
                executedAt: new Date().toISOString()
            };

            return {
                success: true,
                data: splitExecution
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }

    /**
     * Log split execution to database
     * @param {string} transactionId - Transaction ID
     * @param {object} splitData - Split execution data
     */
    async logSplitExecution(transactionId, splitData) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE transactions 
                SET owner_share = ?, developer_share = ?, updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = ?
            `;
            
            const params = [
                splitData.accounts.owner.shareAmount,
                splitData.accounts.developer.shareAmount,
                transactionId
            ];
            
            this.db.run(query, params, function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                resolve({
                    success: true,
                    rowsAffected: this.changes
                });
            });
        });
    }

    /**
     * Get split history for a matatu
     * @param {string} matatuCode - Matatu code
     * @param {number} limit - Number of records to return
     */
    async getSplitHistory(matatuCode, limit = 50) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    transaction_id,
                    amount as fare_amount,
                    transaction_charge,
                    total_amount,
                    owner_share,
                    developer_share,
                    status,
                    created_at
                FROM transactions 
                WHERE matatu_code = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `;
            
            this.db.all(query, [matatuCode, limit], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const history = rows.map(row => ({
                    transactionId: row.transaction_id,
                    fareAmount: row.fare_amount,
                    transactionCharge: row.transaction_charge,
                    totalAmount: row.total_amount,
                    ownerShare: row.owner_share,
                    developerShare: row.developer_share,
                    status: row.status,
                    createdAt: row.created_at,
                    splitRatio: `${row.owner_share}:${row.developer_share}`
                }));
                
                resolve(history);
            });
        });
    }
}

module.exports = MoneySplitter;
