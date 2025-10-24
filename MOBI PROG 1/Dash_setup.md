# MOBIPAY Developer Dashboard Setup Guide

## 🎯 Quick Access

**Dashboard URL:** `http://localhost:3000/dashboard/dashboard.html`

**Default Login Credentials:**
- Username: `developer`
- Password: `mobipay123`

## 📋 Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

The dashboard requires these additional dependencies which are now included:
- `socket.io` - Real-time monitoring
- `bcryptjs` - Password hashing
- `jsonwebtoken` - Authentication tokens
- `express-session` - Session management

### 2. Environment Configuration

Copy and update your environment file:
```bash
cp .env.example .env
```

Add dashboard-specific settings to your `.env`:
```env
# Dashboard Authentication
DASHBOARD_USERNAME=developer
DASHBOARD_PASSWORD=mobipay123
JWT_SECRET=mobipay-secret-key
```

### 3. Initialize Database
```bash
npm run init-db
```

### 4. Start MOBIPAY Server
```bash
# Development
npm run dev

# Production
npm start
```

### 5. Access Dashboard

1. **Open Browser:** Navigate to `http://localhost:3000/dashboard/dashboard.html`
2. **Login:** Use the default credentials above
3. **Explore:** Navigate through all dashboard sections

## 🎛️ Dashboard Features

### 🏠 Overview Section
- **System Statistics:** Total transactions, revenue, success rates
- **Real-time Data:** Live updates every 30 seconds
- **Recent Activity:** Latest transaction summaries
- **Quick Metrics:** Developer earnings, pending payments

### 💳 Transaction Management
- **Complete Transaction History:** Search, filter, paginate
- **Status Monitoring:** Real-time transaction status updates
- **Transaction Details:** View full payment information
- **Export Capability:** Download transaction data

### 🚌 Matatu Management
- **Fleet Overview:** All registered matatus
- **Performance Metrics:** Revenue per matatu, transaction counts
- **Add New Matatus:** Register new vehicles with validation
- **Route Management:** Manage matatu routes and codes

### 📊 Analytics & Reports
- **Interactive Charts:** Transaction trends, revenue analysis
- **Time Period Filters:** 7 days, 30 days, 1 year
- **Performance Metrics:** Top performing matatus
- **Revenue Distribution:** Hourly revenue patterns

### ⚙️ System Settings
- **Configuration Management:** Update system parameters
- **Fee Structure:** Modify transaction charges and splits
- **M-Pesa Settings:** Update API credentials
- **Real-time Updates:** Changes applied immediately

### 📝 System Logs
- **Activity Monitoring:** All system activities
- **Transaction Logs:** Complete audit trail
- **Error Tracking:** System errors and issues
- **Real-time Updates:** Live log streaming

### 🗄️ Database Management
- **Direct Database Access:** View all tables
- **Data Export:** Export data in various formats
- **Table Browser:** Browse transactions, matatus, accounts
- **Query Results:** Real-time database queries

## 🔐 Security Features

### Authentication
- JWT-based authentication system
- Secure login with token expiration (24 hours)
- Session management and automatic logout

### Access Control
- Developer-only access to sensitive data
- API endpoint protection with bearer tokens
- Input validation and sanitization

### Data Protection
- Encrypted password storage
- Secure API communications
- CORS protection enabled

## 🚀 Advanced Features

### Real-time Monitoring
- **Auto-refresh:** Overview updates every 30 seconds
- **Live Status:** Real-time transaction status changes
- **System Health:** Database connection monitoring
- **Performance Metrics:** Response time tracking

### Keyboard Shortcuts
- `Ctrl/Cmd + 1`: Overview section
- `Ctrl/Cmd + 2`: Transactions section  
- `Ctrl/Cmd + 3`: Matatus section
- `Ctrl/Cmd + 4`: Analytics section

### Responsive Design
- **Mobile-friendly:** Works on tablets and phones
- **Adaptive Layout:** Adjusts to screen size
- **Touch Support:** Mobile gesture support

## 🔧 Customization

### Change Login Credentials
Update your `.env` file:
```env
DASHBOARD_USERNAME=your_username
DASHBOARD_PASSWORD=your_secure_password
JWT_SECRET=your-secret-key-here
```

### Customize Dashboard Theme
Edit `dashboard.css` to modify:
- Color scheme (CSS variables at top)
- Layout dimensions
- Component styling

### Add Custom Charts
Extend `dashboard.js` to add new Chart.js visualizations:
```javascript
// Add new chart function
function createCustomChart(data) {
    // Chart.js implementation
}
```

## 🎨 Dashboard Interface Guide

### Navigation
- **Left Sidebar:** Main navigation menu
- **Header:** User info, live status, logout
- **Main Content:** Dynamic section content
- **Modals:** Forms and detailed views

### Data Tables
- **Sorting:** Click column headers to sort
- **Pagination:** Navigate large datasets
- **Search:** Filter data in real-time
- **Actions:** View, edit, delete records

### Charts & Analytics
- **Interactive:** Hover for details
- **Responsive:** Adapts to container size
- **Real-time:** Updates with new data
- **Export:** Save charts as images

## 🐛 Troubleshooting

### Dashboard Won't Load
1. Verify server is running: `http://localhost:3000`
2. Check static files are being served
3. Ensure all dependencies installed: `npm install`

### Login Issues
1. Check credentials in `.env` file
2. Verify JWT_SECRET is set
3. Clear browser localStorage: `localStorage.clear()`

### Data Not Loading
1. Verify database is initialized: `npm run init-db`
2. Check API endpoints respond: `/api/dashboard/overview`
3. Monitor browser console for errors

### Charts Not Displaying
1. Verify Chart.js CDN is loaded
2. Check browser console for JavaScript errors
3. Ensure data format matches chart expectations

## 📊 API Endpoints

All dashboard endpoints are prefixed with `/api/dashboard`:

- `POST /auth/login` - Authenticate user
- `GET /overview` - System overview statistics
- `GET /transactions` - Transaction management
- `GET /matatus` - Matatu data
- `GET /analytics` - Analytics data
- `GET /settings` - System settings
- `GET /logs` - System logs

## 🔍 Monitoring & Maintenance

### Performance Monitoring
- Dashboard automatically monitors API response times
- Real-time database connection status
- Transaction processing metrics

### Data Backup
- Export functionality for all data
- Regular database backups recommended
- Transaction audit trail preservation

### System Health
- Live status indicator in header
- Database connectivity monitoring
- Error logging and tracking

## 🎯 Production Considerations

### Security Hardening
1. **Change Default Credentials:** Update username/password
2. **Secure JWT Secret:** Use strong, random secret
3. **HTTPS Only:** Enable SSL in production
4. **Rate Limiting:** Add API rate limits

### Performance Optimization
1. **Database Indexing:** Monitor query performance
2. **Caching:** Implement Redis for frequent queries
3. **CDN:** Use CDN for static assets
4. **Compression:** Enable gzip compression

### Monitoring & Alerts
1. **Uptime Monitoring:** Monitor dashboard availability
2. **Error Alerts:** Set up error notifications
3. **Performance Metrics:** Track response times
4. **Usage Analytics:** Monitor dashboard usage

---

**🎉 Your MOBIPAY Dashboard is Ready!**

The dashboard provides complete monitoring and management capabilities for your transport payment system. Access it at `http://localhost:3000/dashboard/dashboard.html` and explore all the powerful features available to manage your MOBIPAY system effectively.
