const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Database connection
const dbPath = path.join(__dirname, '..', 'database', 'mobipay.db');
const db = new sqlite3.Database(dbPath);

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'mobipay-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Login endpoint
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Default developer credentials (change these!)
        const defaultUsername = process.env.DASHBOARD_USERNAME || 'developer';
        const defaultPassword = process.env.DASHBOARD_PASSWORD || 'mobipay123';

        if (username === defaultUsername && password === defaultPassword) {
            const token = jwt.sign(
                { username: username, role: 'developer' },
                process.env.JWT_SECRET || 'mobipay-secret-key',
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                token: token,
                user: { username: username, role: 'developer' }
            });
        } else {
            res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// Dashboard overview statistics
router.get('/overview', authenticateToken, async (req, res) => {
    try {
        const stats = await new Promise((resolve, reject) => {
            const queries = {
                totalTransactions: "SELECT COUNT(*) as count FROM transactions",
                completedTransactions: "SELECT COUNT(*) as count FROM transactions WHERE status = 'COMPLETED'",
                pendingTransactions: "SELECT COUNT(*) as count FROM transactions WHERE status = 'PENDING'",
                failedTransactions: "SELECT COUNT(*) as count FROM transactions WHERE status = 'FAILED'",
                totalRevenue: "SELECT SUM(amount) as total FROM transactions WHERE status = 'COMPLETED'",
                totalCommissions: "SELECT SUM(transaction_charge) as total FROM transactions WHERE status = 'COMPLETED'",
                developerShare: "SELECT SUM(developer_share) as total FROM transactions WHERE status = 'COMPLETED'",
                ownerShare: "SELECT SUM(owner_share) as total FROM transactions WHERE status = 'COMPLETED'",
                activeMatatusCount: "SELECT COUNT(*) as count FROM matatus WHERE is_active = 1",
                todayTransactions: `SELECT COUNT(*) as count FROM transactions 
                                   WHERE DATE(created_at) = DATE('now')`,
                recentTransactions: `SELECT t.*, m.route_name 
                                   FROM transactions t 
                                   LEFT JOIN matatus m ON t.matatu_code = m.matatu_code 
                                   ORDER BY t.created_at DESC LIMIT 10`
            };

            let completedQueries = 0;
            const results = {};

            Object.keys(queries).forEach(key => {
                db.all(queries[key], [], (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (key === 'recentTransactions') {
                        results[key] = rows;
                    } else {
                        results[key] = rows[0]?.count || rows[0]?.total || 0;
                    }

                    completedQueries++;
                    if (completedQueries === Object.keys(queries).length) {
                        resolve(results);
                    }
                });
            });
        });

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Overview stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch overview statistics'
        });
    }
});

// Transactions management
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const status = req.query.status;
        const matatuCode = req.query.matatu_code;
        const search = req.query.search;

        let whereClause = '';
        let params = [];

        if (status) {
            whereClause += ' WHERE t.status = ?';
            params.push(status);
        }

        if (matatuCode) {
            whereClause += (whereClause ? ' AND' : ' WHERE') + ' t.matatu_code = ?';
            params.push(matatuCode);
        }

        if (search) {
            whereClause += (whereClause ? ' AND' : ' WHERE') + 
                          ' (t.transaction_id LIKE ? OR t.phone_number LIKE ? OR t.mpesa_receipt_number LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const query = `
            SELECT t.*, m.route_name, m.owner_account
            FROM transactions t
            LEFT JOIN matatus m ON t.matatu_code = m.matatu_code
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `;

        params.push(limit, offset);

        const transactions = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total
            FROM transactions t
            LEFT JOIN matatus m ON t.matatu_code = m.matatu_code
            ${whereClause}
        `;

        const totalCount = await new Promise((resolve, reject) => {
            db.get(countQuery, params.slice(0, -2), (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row.total);
            });
        });

        res.json({
            success: true,
            data: {
                transactions: transactions,
                pagination: {
                    page: page,
                    limit: limit,
                    total: totalCount,
                    pages: Math.ceil(totalCount / limit)
                }
            }
        });

    } catch (error) {
        console.error('Transactions fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transactions'
        });
    }
});

// Matatus management
router.get('/matatus', authenticateToken, async (req, res) => {
    try {
        const matatus = await new Promise((resolve, reject) => {
            const query = `
                SELECT m.*, 
                       COUNT(t.id) as total_transactions,
                       SUM(CASE WHEN t.status = 'COMPLETED' THEN t.amount ELSE 0 END) as total_revenue,
                       SUM(CASE WHEN t.status = 'COMPLETED' THEN t.owner_share ELSE 0 END) as owner_earnings
                FROM matatus m
                LEFT JOIN transactions t ON m.matatu_code = t.matatu_code
                GROUP BY m.id
                ORDER BY m.created_at DESC
            `;

            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });

        res.json({
            success: true,
            data: matatus
        });

    } catch (error) {
        console.error('Matatus fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch matatus'
        });
    }
});

// Add new matatu
router.post('/matatus', authenticateToken, async (req, res) => {
    try {
        const { matatu_code, route_name, owner_account } = req.body;

        const result = await new Promise((resolve, reject) => {
            const query = `
                INSERT INTO matatus (matatu_code, route_name, owner_account)
                VALUES (?, ?, ?)
            `;

            db.run(query, [matatu_code, route_name, owner_account], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ id: this.lastID });
            });
        });

        res.json({
            success: true,
            message: 'Matatu added successfully',
            data: { id: result.id }
        });

    } catch (error) {
        console.error('Add matatu error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add matatu'
        });
    }
});

// Analytics data
router.get('/analytics', authenticateToken, async (req, res) => {
    try {
        const period = req.query.period || '7days';
        
        let dateFilter = '';
        if (period === '7days') {
            dateFilter = "DATE(created_at) >= DATE('now', '-7 days')";
        } else if (period === '30days') {
            dateFilter = "DATE(created_at) >= DATE('now', '-30 days')";
        } else if (period === '1year') {
            dateFilter = "DATE(created_at) >= DATE('now', '-1 year')";
        }

        const analytics = await new Promise((resolve, reject) => {
            const queries = {
                dailyTransactions: `
                    SELECT DATE(created_at) as date, 
                           COUNT(*) as transactions,
                           SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) as revenue
                    FROM transactions 
                    WHERE ${dateFilter}
                    GROUP BY DATE(created_at) 
                    ORDER BY date DESC
                `,
                statusDistribution: `
                    SELECT status, COUNT(*) as count
                    FROM transactions 
                    WHERE ${dateFilter}
                    GROUP BY status
                `,
                topMatatus: `
                    SELECT t.matatu_code, m.route_name,
                           COUNT(*) as transactions,
                           SUM(CASE WHEN t.status = 'COMPLETED' THEN t.amount ELSE 0 END) as revenue
                    FROM transactions t
                    LEFT JOIN matatus m ON t.matatu_code = m.matatu_code
                    WHERE ${dateFilter}
                    GROUP BY t.matatu_code
                    ORDER BY revenue DESC
                    LIMIT 10
                `,
                revenueByHour: `
                    SELECT strftime('%H', created_at) as hour,
                           COUNT(*) as transactions,
                           SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) as revenue
                    FROM transactions 
                    WHERE ${dateFilter}
                    GROUP BY strftime('%H', created_at)
                    ORDER BY hour
                `
            };

            let completedQueries = 0;
            const results = {};

            Object.keys(queries).forEach(key => {
                db.all(queries[key], [], (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    results[key] = rows;
                    completedQueries++;
                    
                    if (completedQueries === Object.keys(queries).length) {
                        resolve(results);
                    }
                });
            });
        });

        res.json({
            success: true,
            data: analytics
        });

    } catch (error) {
        console.error('Analytics fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics'
        });
    }
});

// System settings
router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const settings = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM system_settings ORDER BY setting_key', [], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });

        res.json({
            success: true,
            data: settings
        });

    } catch (error) {
        console.error('Settings fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch settings'
        });
    }
});

// Update system setting
router.put('/settings/:key', authenticateToken, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        await new Promise((resolve, reject) => {
            const query = `
                UPDATE system_settings 
                SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
                WHERE setting_key = ?
            `;

            db.run(query, [value, key], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        res.json({
            success: true,
            message: 'Setting updated successfully'
        });

    } catch (error) {
        console.error('Setting update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update setting'
        });
    }
});

// System logs (recent activity)
router.get('/logs', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        
        const logs = await new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    'transaction' as type,
                    transaction_id as reference,
                    status,
                    amount,
                    phone_number,
                    created_at,
                    updated_at
                FROM transactions 
                ORDER BY created_at DESC 
                LIMIT ?
            `;

            db.all(query, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });

        res.json({
            success: true,
            data: logs
        });

    } catch (error) {
        console.error('Logs fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch logs'
        });
    }
});

module.exports = router;
