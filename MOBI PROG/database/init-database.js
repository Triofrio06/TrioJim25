const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const dbPath = path.join(__dirname, '..', 'database', 'mobipay.db');
const db = new sqlite3.Database(dbPath);

// Create tables
const createTables = () => {
    // Create database directory if it doesn't exist
    const fs = require('fs');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db.serialize(() => {
        // Matatus table
        db.run(`
            CREATE TABLE IF NOT EXISTS matatus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                matatu_code VARCHAR(4) NOT NULL UNIQUE,
                route_name VARCHAR(100) NOT NULL,
                owner_account VARCHAR(20) NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Transactions table
        db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id VARCHAR(50) UNIQUE NOT NULL,
                matatu_code VARCHAR(4) NOT NULL,
                phone_number VARCHAR(15) NOT NULL,
                amount INTEGER NOT NULL,
                transaction_charge INTEGER NOT NULL,
                total_amount INTEGER NOT NULL,
                mpesa_receipt_number VARCHAR(50),
                status VARCHAR(20) DEFAULT 'PENDING',
                mpesa_request_id VARCHAR(50),
                checkout_request_id VARCHAR(50),
                owner_share INTEGER NOT NULL,
                developer_share INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (matatu_code) REFERENCES matatus(matatu_code)
            )
        `);

        // Accounts table
        db.run(`
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_number VARCHAR(20) NOT NULL UNIQUE,
                account_type VARCHAR(20) NOT NULL,
                account_name VARCHAR(100) NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // System settings table
        db.run(`
            CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key VARCHAR(50) UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                description TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default data
        db.run(`
            INSERT OR IGNORE INTO matatus (matatu_code, route_name, owner_account) 
            VALUES ('3025', 'Default Route', '254717564238')
        `);

        db.run(`
            INSERT OR IGNORE INTO accounts (account_number, account_type, account_name) 
            VALUES 
                ('254717564238', 'OWNER', 'Matatu Owner Account'),
                ('254112331196', 'DEVELOPER', 'Developer Account')
        `);

        db.run(`
            INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description) 
            VALUES 
                ('developer_percentage', '10', 'Percentage of transaction fee that goes to developer'),
                ('min_amount', '50', 'Minimum transaction amount allowed'),
                ('mpesa_consumer_key', '', 'M-Pesa Consumer Key'),
                ('mpesa_consumer_secret', '', 'M-Pesa Consumer Secret'),
                ('mpesa_shortcode', '', 'M-Pesa Shortcode'),
                ('mpesa_passkey', '', 'M-Pesa Passkey'),
                ('callback_url', '', 'M-Pesa Callback URL')
        `);

        // Create indexes for better performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_matatu_code ON transactions(matatu_code)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_phone ON transactions(phone_number)`);

        console.log('MOBIPAY Database initialized successfully!');
        console.log('Tables created: matatus, transactions, accounts, system_settings');
    });
};

// Initialize database
createTables();

// Close connection
db.close((err) => {
    if (err) {
        console.error('Error closing database:', err.message);
    } else {
        console.log('Database connection closed.');
    }
});
