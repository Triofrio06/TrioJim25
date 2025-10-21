const axios = require('axios');
const moment = require('moment');

/**
 * MOBIPAY M-Pesa Daraja API Integration
 * Handles STK Push requests and payment processing
 */

class MpesaService {
    constructor(config) {
        this.consumerKey = config.consumerKey;
        this.consumerSecret = config.consumerSecret;
        this.shortcode = config.shortcode;
        this.passkey = config.passkey;
        this.callbackUrl = config.callbackUrl;
        this.environment = config.environment || 'sandbox'; // 'sandbox' or 'production'
        
        // Set base URLs
        this.baseURL = this.environment === 'production' 
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';
            
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    /**
     * Generate OAuth access token
     */
    async generateAccessToken() {
        try {
            // Check if current token is still valid
            if (this.accessToken && this.tokenExpiry && moment().isBefore(this.tokenExpiry)) {
                return this.accessToken;
            }

            const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
            
            const response = await axios.get(`${this.baseURL}/oauth/v1/generate?grant_type=client_credentials`, {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json'
                }
            });

            this.accessToken = response.data.access_token;
            // Token expires in 1 hour, set expiry to 55 minutes for safety
            this.tokenExpiry = moment().add(55, 'minutes');
            
            return this.accessToken;

        } catch (error) {
            console.error('Error generating access token:', error.response?.data || error.message);
            throw new Error('Failed to generate M-Pesa access token');
        }
    }

    /**
     * Generate M-Pesa password for STK Push
     */
    generatePassword() {
        const timestamp = moment().format('YYYYMMDDHHmmss');
        const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
        
        return {
            password: password,
            timestamp: timestamp
        };
    }

    /**
     * Initiate STK Push request
     */
    async stkPush(phoneNumber, amount, accountReference, transactionDesc) {
        try {
            const accessToken = await this.generateAccessToken();
            const { password, timestamp } = this.generatePassword();

            // Clean phone number format
            const cleanPhone = phoneNumber.startsWith('254') ? phoneNumber : `254${phoneNumber.substring(1)}`;

            const requestPayload = {
                BusinessShortCode: this.shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: amount,
                PartyA: cleanPhone,
                PartyB: this.shortcode,
                PhoneNumber: cleanPhone,
                CallBackURL: this.callbackUrl,
                AccountReference: accountReference,
                TransactionDesc: transactionDesc || 'MOBIPAY Payment'
            };

            const response = await axios.post(
                `${this.baseURL}/mpesa/stkpush/v1/processrequest`,
                requestPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                data: {
                    merchantRequestId: response.data.MerchantRequestID,
                    checkoutRequestId: response.data.CheckoutRequestID,
                    responseCode: response.data.ResponseCode,
                    responseDescription: response.data.ResponseDescription,
                    customerMessage: response.data.CustomerMessage
                }
            };

        } catch (error) {
            console.error('STK Push error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.errorMessage || 'STK Push request failed',
                errorCode: error.response?.data?.errorCode || 'UNKNOWN_ERROR'
            };
        }
    }

    /**
     * Query STK Push transaction status
     */
    async stkPushQuery(checkoutRequestId) {
        try {
            const accessToken = await this.generateAccessToken();
            const { password, timestamp } = this.generatePassword();

            const requestPayload = {
                BusinessShortCode: this.shortcode,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestId
            };

            const response = await axios.post(
                `${this.baseURL}/mpesa/stkpushquery/v1/query`,
                requestPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                data: {
                    merchantRequestId: response.data.MerchantRequestID,
                    checkoutRequestId: response.data.CheckoutRequestID,
                    responseCode: response.data.ResponseCode,
                    responseDescription: response.data.ResponseDescription,
                    resultCode: response.data.ResultCode,
                    resultDesc: response.data.ResultDesc
                }
            };

        } catch (error) {
            console.error('STK Push query error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.errorMessage || 'STK Push query failed',
                errorCode: error.response?.data?.errorCode || 'UNKNOWN_ERROR'
            };
        }
    }

    /**
     * Process M-Pesa callback data
     */
    processCallback(callbackData) {
        try {
            const { Body } = callbackData;
            const { stkCallback } = Body;

            const result = {
                merchantRequestId: stkCallback.MerchantRequestID,
                checkoutRequestId: stkCallback.CheckoutRequestID,
                resultCode: stkCallback.ResultCode,
                resultDesc: stkCallback.ResultDesc,
                success: stkCallback.ResultCode === 0
            };

            // If payment was successful, extract additional details
            if (result.success && stkCallback.CallbackMetadata) {
                const metadata = stkCallback.CallbackMetadata.Item;
                
                result.amount = metadata.find(item => item.Name === 'Amount')?.Value;
                result.mpesaReceiptNumber = metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
                result.transactionDate = metadata.find(item => item.Name === 'TransactionDate')?.Value;
                result.phoneNumber = metadata.find(item => item.Name === 'PhoneNumber')?.Value;
                result.balance = metadata.find(item => item.Name === 'Balance')?.Value;
            }

            return result;

        } catch (error) {
            console.error('Error processing callback:', error);
            return {
                success: false,
                error: 'Invalid callback data format'
            };
        }
    }

    /**
     * Validate M-Pesa callback
     */
    validateCallback(callbackData) {
        try {
            // Basic structure validation
            if (!callbackData || !callbackData.Body || !callbackData.Body.stkCallback) {
                return { isValid: false, error: 'Invalid callback structure' };
            }

            const { stkCallback } = callbackData.Body;

            // Required fields validation
            const requiredFields = ['MerchantRequestID', 'CheckoutRequestID', 'ResultCode', 'ResultDesc'];
            for (const field of requiredFields) {
                if (!stkCallback[field] && stkCallback[field] !== 0) {
                    return { isValid: false, error: `Missing required field: ${field}` };
                }
            }

            return { isValid: true };

        } catch (error) {
            return { isValid: false, error: 'Callback validation failed' };
        }
    }

    /**
     * Format phone number for M-Pesa
     */
    formatPhoneNumber(phoneNumber) {
        if (!phoneNumber) return null;

        // Remove any non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');

        // Handle different formats
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
        } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
            cleaned = '254' + cleaned;
        } else if (!cleaned.startsWith('254')) {
            return null; // Invalid format
        }

        // Validate length (should be 12 digits for Kenya)
        if (cleaned.length !== 12) {
            return null;
        }

        return cleaned;
    }

    /**
     * Get transaction status message
     */
    getTransactionStatusMessage(resultCode) {
        const statusMessages = {
            0: 'Success',
            1: 'Insufficient Funds',
            17: 'User cancelled transaction',
            26: 'Invalid business number',
            2001: 'Invalid Pin Entered',
            1001: 'Unable to lock subscriber, a transaction is already in process for the current subscriber',
            1019: 'Transaction expired',
            1032: 'Request cancelled by user',
            1037: 'DS timeout user cannot be reached',
            SFC_IC0003: 'Invalid Paybill Number',
            2006: 'Transaction failed'
        };

        return statusMessages[resultCode] || `Transaction failed with code ${resultCode}`;
    }
}

module.exports = MpesaService;
