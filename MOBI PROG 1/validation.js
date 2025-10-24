const Joi = require('joi');

// Validation schemas
const schemas = {
    // Matatu code validation - max 4 digits
    matatuCode: Joi.string()
        .pattern(/^\d{1,4}$/)
        .required()
        .messages({
            'string.pattern.base': 'Matatu code must be 1-4 digits only',
            'any.required': 'Matatu code is required'
        }),

    // Phone number validation (Kenyan format)
    phoneNumber: Joi.string()
        .pattern(/^254[17]\d{8}$/)
        .required()
        .messages({
            'string.pattern.base': 'Phone number must be in format 254XXXXXXXXX',
            'any.required': 'Phone number is required'
        }),

    // Amount validation
    amount: Joi.number()
        .integer()
        .min(50)
        .max(100000)
        .required()
        .messages({
            'number.min': 'Amount must be at least KSh 50',
            'number.max': 'Amount cannot exceed KSh 100,000',
            'any.required': 'Amount is required'
        }),

    // M-Pesa PIN validation (4 digits)
    mpesaPin: Joi.string()
        .pattern(/^\d{4}$/)
        .required()
        .messages({
            'string.pattern.base': 'M-Pesa PIN must be exactly 4 digits',
            'any.required': 'M-Pesa PIN is required'
        }),

    // Transaction ID validation
    transactionId: Joi.string()
        .alphanum()
        .min(10)
        .max(50)
        .required(),

    // USSD input validation
    ussdInput: Joi.string()
        .trim()
        .max(100)
        .required()
};

// Validation functions
const validate = {
    // Validate matatu code
    validateMatatuCode: (code) => {
        const { error, value } = schemas.matatuCode.validate(code);
        return {
            isValid: !error,
            error: error?.details[0]?.message,
            value: value
        };
    },

    // Validate phone number
    validatePhoneNumber: (phone) => {
        const { error, value } = schemas.phoneNumber.validate(phone);
        return {
            isValid: !error,
            error: error?.details[0]?.message,
            value: value
        };
    },

    // Validate amount
    validateAmount: (amount) => {
        const { error, value } = schemas.amount.validate(amount);
        return {
            isValid: !error,
            error: error?.details[0]?.message,
            value: value
        };
    },

    // Validate M-Pesa PIN
    validateMpesaPin: (pin) => {
        const { error, value } = schemas.mpesaPin.validate(pin);
        return {
            isValid: !error,
            error: error?.details[0]?.message,
            value: value
        };
    },

    // Validate complete payment request
    validatePaymentRequest: (data) => {
        const paymentSchema = Joi.object({
            matatu_code: schemas.matatuCode,
            phone_number: schemas.phoneNumber,
            amount: schemas.amount
        });

        const { error, value } = paymentSchema.validate(data);
        return {
            isValid: !error,
            errors: error?.details?.map(detail => ({
                field: detail.path[0],
                message: detail.message
            })) || [],
            value: value
        };
    },

    // Validate USSD session data
    validateUssdSession: (data) => {
        const ussdSchema = Joi.object({
            sessionId: Joi.string().required(),
            serviceCode: Joi.string().required(),
            phoneNumber: schemas.phoneNumber,
            text: schemas.ussdInput.allow('')
        });

        const { error, value } = ussdSchema.validate(data);
        return {
            isValid: !error,
            errors: error?.details?.map(detail => ({
                field: detail.path[0],
                message: detail.message
            })) || [],
            value: value
        };
    }
};

// Business logic validation
const businessRules = {
    // Calculate transaction charge based on amount
    calculateTransactionCharge: (amount) => {
        let percentage;
        if (amount <= 500) {
            percentage = 1.5;
        } else if (amount <= 1000) {
            percentage = 1.2;
        } else if (amount <= 2000) {
            percentage = 1.0;
        } else {
            percentage = 0.8;
        }
        
        return Math.round(amount * (percentage / 100));
    },

    // Validate transaction charge calculation
    validateTransactionCharge: (amount, providedCharge) => {
        const expectedCharge = businessRules.calculateTransactionCharge(amount);
        return {
            isValid: expectedCharge === providedCharge,
            expectedCharge: expectedCharge,
            providedCharge: providedCharge
        };
    },

    // Check if matatu code exists and is active
    validateMatatuCodeExists: async (db, matatuCode) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT id, matatu_code, route_name, owner_account, is_active 
                FROM matatus 
                WHERE matatu_code = ? AND is_active = 1
            `;
            
            db.get(query, [matatuCode], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                resolve({
                    isValid: !!row,
                    matatu: row,
                    error: !row ? 'Invalid matatu code or matatu is not active' : null
                });
            });
        });
    }
};

// Sanitization functions
const sanitize = {
    // Clean phone number (add 254 prefix if missing)
    cleanPhoneNumber: (phone) => {
        if (!phone) return null;
        
        // Remove any non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        
        // Handle different formats
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
        } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
            cleaned = '254' + cleaned;
        }
        
        return cleaned;
    },

    // Clean matatu code
    cleanMatatuCode: (code) => {
        if (!code) return null;
        return code.replace(/\D/g, '');
    },

    // Clean amount
    cleanAmount: (amount) => {
        if (typeof amount === 'string') {
            return parseInt(amount.replace(/\D/g, ''));
        }
        return parseInt(amount);
    }
};

module.exports = {
    validate,
    businessRules,
    sanitize,
    schemas
};
