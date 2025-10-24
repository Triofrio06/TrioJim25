# MOBIPAY - Enhanced Transport Payment System

MOBIPAY is a modern, enhanced version of your original C transport payment program. It features M-Pesa STK Push integration, a comprehensive REST API, SQLite database for transaction logging, 2-way money splitting, USSD interface, and robust input validation.

## Features

### ✨ Core Features
- **M-Pesa STK Push Integration** - Seamless mobile money payments
- **REST API** - Complete API for payment processing
- **SQLite Database** - Comprehensive transaction logging and history
- **2-Way Money Split** - Automated distribution between owner and developer
- **Input Validation** - Robust validation including 4-digit matatu code limit
- **USSD Interface** - Basic USSD menu system for payments
- **Callback URL Handling** - Real-time payment status updates

### 🔧 Technical Features
- Node.js with Express.js framework
- SQLite database with proper indexing
- Comprehensive error handling and logging
- Transaction status tracking
- Phone number formatting and validation
- Automated transaction charge calculation
- Split ratio management

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- M-Pesa Daraja API credentials

### Setup Steps

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd mobipay-transport-system
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your M-Pesa credentials and settings
   ```

3. **Initialize Database**
   ```bash
   npm run init-db
   ```

4. **Start the Server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## Configuration

### M-Pesa Setup

1. Visit [Safaricom Developer Portal](https://developer.safaricom.co.ke)
2. Create an app and obtain:
   - Consumer Key
   - Consumer Secret
   - Shortcode
   - Passkey

3. Update your `.env` file with these credentials

### Environment Variables

```env
# Required M-Pesa Configuration
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_ENVIRONMENT=sandbox  # or 'production'
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback

# Server Configuration
PORT=3000
```

## API Documentation

### Base URL
```
http://localhost:3000
```

### Endpoints

#### 1. Initiate Payment
```http
POST /api/payment/initiate
Content-Type: application/json

{
  "matatu_code": "3025",
  "phone_number": "254712345678",
  "amount": 100
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment initiated successfully",
  "data": {
    "transactionId": "MOBI1703012345ABCD",
    "amount": 100,
    "transactionCharge": 2,
    "totalAmount": 102,
    "phoneNumber": "254712345678",
    "matatuCode": "3025",
    "checkoutRequestId": "ws_CO_123456789",
    "customerMessage": "Check your phone for payment prompt",
    "split": {
      "ownerShare": 2,
      "developerShare": 0
    }
  }
}
```

#### 2. Check Payment Status
```http
GET /api/payment/status/MOBI1703012345ABCD
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "MOBI1703012345ABCD",
    "matatuCode": "3025",
    "route": "Default Route",
    "phoneNumber": "254712345678",
    "amount": 100,
    "transactionCharge": 2,
    "totalAmount": 102,
    "status": "COMPLETED",
    "mpesaReceiptNumber": "OKL1A2B3C4",
    "ownerShare": 2,
    "developerShare": 0,
    "createdAt": "2024-01-01T10:00:00.000Z",
    "updatedAt": "2024-01-01T10:01:00.000Z"
  }
}
```

#### 3. Transaction History
```http
GET /api/payment/history/3025?limit=50
```

#### 4. M-Pesa Callback (Internal)
```http
POST /api/mpesa/callback
```

#### 5. USSD Interface
```http
POST /api/ussd
Content-Type: application/json

{
  "sessionId": "session123",
  "serviceCode": "*123#",
  "phoneNumber": "254712345678",
  "text": ""
}
```

## Database Schema

### Tables

1. **matatus** - Matatu registration and owner information
2. **transactions** - All payment transactions with complete details
3. **accounts** - Account information for owners and developers
4. **system_settings** - Configurable system parameters

### Key Fields

- **matatu_code**: 1-4 digits maximum (as requested)
- **transaction_charge**: Calculated based on amount tiers
- **owner_share/developer_share**: 2-way split amounts
- **status**: PENDING, COMPLETED, FAILED

## Business Logic

### Transaction Charge Calculation
```javascript
// Amount-based percentage tiers (from original C code)
if (amount <= 500) percentage = 1.5%;
else if (amount <= 1000) percentage = 1.2%;
else if (amount <= 2000) percentage = 1.0%;
else percentage = 0.8%;
```

### 2-Way Money Split
- Default: 10% to developer, 90% to matatu owner
- Configurable via system_settings table
- Ensures minimum 1 KSh for owner when possible

### Input Validation
- **Matatu Code**: 1-4 digits only (as requested)
- **Phone Number**: Kenyan format (254XXXXXXXXX)
- **Amount**: Minimum KSh 50, Maximum KSh 100,000
- **M-Pesa PIN**: Exactly 4 digits (validation ready)

## USSD Flow

```
*123# (Service Code)
├── 1. Make Payment
│   ├── Enter Matatu Code (1-4 digits)
│   └── Enter Amount
├── 2. Check Transaction Status
│   └── Enter Transaction ID
└── 3. Help
    └── Display help information
```

## Testing

### Local Testing
```bash
# Start server
npm run dev

# Test payment initiation
curl -X POST http://localhost:3000/api/payment/initiate \
  -H "Content-Type: application/json" \
  -d '{"matatu_code":"3025","phone_number":"254712345678","amount":100}'
```

### M-Pesa Sandbox Testing
Use Safaricom's test credentials and sandbox environment for development.

## Deployment

### Production Considerations

1. **Callback URL**: Must be HTTPS and publicly accessible
2. **Environment**: Set `MPESA_ENVIRONMENT=production`
3. **Database**: Consider migrating to PostgreSQL for production
4. **Security**: Enable HTTPS, add rate limiting, API authentication
5. **Monitoring**: Implement logging and monitoring solutions

### Deployment Options
- **VPS/Cloud Server**: Direct deployment with PM2
- **Container**: Docker deployment
- **Serverless**: AWS Lambda, Vercel, etc.

## Advanced Features & Guidelines

### Current Implementation Status ✅
- [x] REST API with all endpoints
- [x] M-Pesa STK Push integration
- [x] SQLite database with complete schema
- [x] 2-way money splitting logic
- [x] Input validation (4-digit matatu code limit)
- [x] Transaction logging and history
- [x] Callback URL handling
- [x] Basic USSD interface structure
- [x] Error handling and validation

### Potential Enhancements 🚀

1. **Security Enhancements**
   - API key authentication
   - Rate limiting
   - Request encryption
   - IP whitelisting for callbacks

2. **Advanced Features**
   - SMS notifications
   - Email receipts
   - Dashboard for matatu owners
   - Analytics and reporting
   - Multi-currency support

3. **USSD Improvements**
   - Session management
   - More complex flows
   - Transaction status checking via USSD
   - Balance inquiries

4. **Database Enhancements**
   - Data backup and recovery
   - Performance optimization
   - Reporting views
   - Data archiving

5. **Integration Options**
   - Other payment providers
   - Banking APIs
   - Accounting systems
   - Fleet management systems

## Support

### Common Issues

1. **M-Pesa Integration**
   - Ensure callback URL is HTTPS in production
   - Verify credentials are correct
   - Check network connectivity

2. **Database Issues**
   - Run `npm run init-db` to initialize
   - Check file permissions
   - Verify SQLite installation

3. **Validation Errors**
   - Matatu codes must be 1-4 digits
   - Phone numbers must be Kenyan format
   - Amount must be between 50-100,000

### Contact
For technical support and feature requests, please create an issue or contact the development team.

---

**MOBIPAY** - Making matatu payments simple, secure, and efficient! 🚌💳
