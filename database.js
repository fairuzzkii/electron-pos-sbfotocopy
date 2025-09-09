const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        const dbPath = path.join(__dirname, 'sb_fotocopy.db');
        this.db = new sqlite3.Database(dbPath);
        this.init();
    }

    init() {
        // Create tables
        this.db.serialize(() => {
            // Products table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code TEXT UNIQUE,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL, -- 'atk' or 'makmin'
                    purchase_price REAL NOT NULL,
                    selling_price REAL NOT NULL,
                    stock INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Sales table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL, -- 'atk', 'makmin', 'fotocopy'
                    payment_method TEXT NOT NULL, -- 'cash' or 'qris'
                    total_amount REAL NOT NULL,
                    items TEXT NOT NULL, -- JSON string
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Insert sample data if empty
            this.db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
                if (!err && row.count === 0) {
                    this.insertSampleData();
                }
            });
        });
    }

    insertSampleData() {
        const sampleProducts = [
            // ATK
            ['P001', 'Pulpen Biru Standard', 'atk', 2000, 3000, 50],
            ['P002', 'Pensil 2B Faber Castell', 'atk', 3000, 4500, 30],
            ['P003', 'Penggaris 30cm', 'atk', 5000, 7000, 25],
            ['P004', 'Kertas A4 70gsm', 'atk', 45000, 55000, 10],
            ['P005', 'Spidol Hitam', 'atk', 8000, 12000, 20],
            
            // Makanan & Minuman
            ['M001', 'Air Mineral 600ml', 'makmin', 2000, 3000, 100],
            ['M002', 'Teh Botol Sosro', 'makmin', 4000, 6000, 50],
            ['M003', 'Biskuit Marie', 'makmin', 8000, 12000, 30],
            ['M004', 'Kopi Sachet', 'makmin', 1500, 2500, 80],
            ['M005', 'Mie Instan', 'makmin', 3000, 4500, 40]
        ];

        const stmt = this.db.prepare(`
            INSERT INTO products (code, name, type, purchase_price, selling_price, stock)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        sampleProducts.forEach(product => {
            stmt.run(product);
        });

        stmt.finalize();
    }

    getProducts(type = null) {
        return new Promise((resolve, reject) => {
            let query = "SELECT * FROM products";
            let params = [];
            
            if (type) {
                query += " WHERE type = ?";
                params.push(type);
            }
            
            query += " ORDER BY name";

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    addProduct(product) {
        return new Promise((resolve, reject) => {
            const { code, name, type, purchase_price, selling_price, stock } = product;
            
            this.db.run(`
                INSERT INTO products (code, name, type, purchase_price, selling_price, stock)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [code, name, type, purchase_price, selling_price, stock || 0], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID });
                }
            });
        });
    }

    updateProduct(id, product) {
        return new Promise((resolve, reject) => {
            const { code, name, purchase_price, selling_price, stock } = product;
            
            this.db.run(`
                UPDATE products 
                SET code = ?, name = ?, purchase_price = ?, selling_price = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [code, name, purchase_price, selling_price, stock, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    deleteProduct(id) {
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM products WHERE id = ?", [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    updateStock(productId, delta) {  // Modifikasi: delta bisa + atau - (misal +10 untuk tambah stok)
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE products 
                SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [delta, productId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    addSale(sale) {
        return new Promise((resolve, reject) => {
            const { type, payment_method, total_amount, items } = sale;
            
            this.db.run(`
                INSERT INTO sales (type, payment_method, total_amount, items)
                VALUES (?, ?, ?, ?)
            `, [type, payment_method, total_amount, JSON.stringify(items)], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID });
                }
            });
        });
    }

    getSales(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = "SELECT * FROM sales";
            let params = [];
            let conditions = [];

            if (filters.type) {
                conditions.push("type = ?");
                params.push(filters.type);
            }

            if (filters.payment_method) {  // Tambah filter payment_method
                conditions.push("payment_method = ?");
                params.push(filters.payment_method);
            }

            if (filters.date_from) {
                conditions.push("date(created_at) >= ?");
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push("date(created_at) <= ?");
                params.push(filters.date_to);
            }

            if (conditions.length > 0) {
                query += " WHERE " + conditions.join(" AND ");
            }

            query += " ORDER BY created_at DESC";

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({
                        ...row,
                        items: JSON.parse(row.items)
                    })));
                }
            });
        });
    }

    getSalesSummary(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    type,
                    payment_method,
                    COUNT(*) as total_transactions,
                    SUM(total_amount) as total_revenue,
                    AVG(total_amount) as avg_transaction
                FROM sales
            `;
            let params = [];
            let conditions = [];

            if (filters.type) {
                conditions.push("type = ?");
                params.push(filters.type);
            }

            if (filters.payment_method) {
                conditions.push("payment_method = ?");
                params.push(filters.payment_method);
            }

            if (filters.date_from) {
                conditions.push("date(created_at) >= ?");
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push("date(created_at) <= ?");
                params.push(filters.date_to);
            }

            if (conditions.length > 0) {
                query += " WHERE " + conditions.join(" AND ");
            }

            query += " GROUP BY type, payment_method";

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = Database;