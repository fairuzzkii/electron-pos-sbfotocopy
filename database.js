const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'sb_fotocopy.db'), (err) => {
            if (err) {
                console.error('Error connecting to database:', err);
            } else {
                console.log('Connected to SQLite database');
                this.init();
            }
        });
    }

    init() {
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code TEXT UNIQUE,
                    name TEXT,
                    type TEXT,
                    purchase_price REAL,
                    selling_price REAL,
                    stock INTEGER
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT,
                    payment_method TEXT,
                    total_amount REAL,
                    items TEXT,
                    created_at TEXT DEFAULT (datetime('now', 'localtime'))
                )
            `);

            this.db.run(`
                CREATE TABLE IF NOT EXISTS fotocopy_expenses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT,
                    amount REAL,
                    created_at TEXT
                )
            `);

            const sampleProducts = [
                ['ATK001', 'Pulpen', 'atk', 2000, 3000, 50],
                ['ATK002', 'Buku Tulis', 'atk', 3000, 5000, 30],
                ['MM001', 'Kopi Sachet', 'makmin', 1000, 2000, 100],
                ['MM002', 'Teh Botol', 'makmin', 3000, 5000, 50]
            ];

            const stmt = this.db.prepare(`
                INSERT OR IGNORE INTO products (code, name, type, purchase_price, selling_price, stock)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            sampleProducts.forEach(product => {
                stmt.run(product, (err) => {
                    if (err) {
                        console.error('Error inserting sample product:', err);
                    }
                });
            });

            stmt.finalize();
        });
    }

    generateProductCode(type) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT COUNT(*) as count FROM products WHERE type = ?`,
                [type],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        const prefix = type === 'atk' ? 'ATK' : 'MM';
                        const count = row.count + 1;
                        const code = `${prefix}-${String(count).padStart(3, '0')}`;
                        resolve(code);
                    }
                }
            );
        });
    }

    getProducts(type = null) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM products';
            let params = [];

            if (type) {
                query += ' WHERE type = ?';
                params.push(type);
            }

            query += ' ORDER BY name';

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
        return new Promise(async (resolve, reject) => {
            const { name, type, purchase_price, selling_price, stock } = product;
            try {
                const code = await this.generateProductCode(type);
                this.db.run(`
                    INSERT INTO products (code, name, type, purchase_price, selling_price, stock)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [code, name, type, purchase_price, selling_price, stock], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID });
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    updateProduct(id, product) {
        return new Promise(async (resolve, reject) => {
            const { code, name, type, purchase_price, selling_price, stock } = product;
            let newCode = code;
            this.db.get('SELECT type FROM products WHERE id = ?', [id], async (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (row.type !== type) {
                    newCode = await this.generateProductCode(type);
                }
                this.db.run(`
                    UPDATE products
                    SET code = ?, name = ?, type = ?, purchase_price = ?, selling_price = ?, stock = ?
                    WHERE id = ?
                `, [newCode, name, type, purchase_price, selling_price, stock, id], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ changes: this.changes });
                    }
                });
            });
        });
    }

    deleteProduct(id) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
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
            const itemsJson = JSON.stringify(items);
            this.db.run(`
                INSERT INTO sales (type, payment_method, total_amount, items, created_at)
                VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
            `, [type, payment_method, total_amount, itemsJson], function(err) {
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
            let query = 'SELECT * FROM sales';
            let params = [];
            let conditions = [];

            if (filters.date_from) {
                conditions.push("date(created_at) >= ?");
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push("date(created_at) <= ?");
                params.push(filters.date_to);
            }

            if (filters.type) {
                conditions.push("type = ?");
                params.push(filters.type);
            }

            if (filters.payment_method) {
                conditions.push("payment_method = ?");
                params.push(filters.payment_method);
            }

            if (conditions.length > 0) {
                query += " WHERE " + conditions.join(" AND ");
            }

            query += " ORDER BY created_at DESC";

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const sales = rows.map(row => ({
                        ...row,
                        items: JSON.parse(row.items)
                    }));
                    resolve(sales);
                }
            });
        });
    }

    getSalesSummary(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT type,
                       COUNT(*) as total_transactions,
                       SUM(total_amount) as total_revenue
                FROM sales
            `;
            let params = [];
            let conditions = [];

            if (filters.date_from) {
                conditions.push("date(created_at) >= ?");
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push("date(created_at) <= ?");
                params.push(filters.date_to);
            }

            if (filters.type) {
                conditions.push("type = ?");
                params.push(filters.type);
            }

            if (conditions.length > 0) {
                query += " WHERE " + conditions.join(" AND ");
            }

            query += " GROUP BY type";

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    updateStock(productId, delta) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE products
                SET stock = stock + ?
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

    getExpenses(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = "SELECT * FROM fotocopy_expenses";
            let params = [];
            let conditions = [];

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
                    resolve(rows);
                }
            });
        });
    }

    getExpensesSummary(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = "SELECT SUM(amount) as total_amount FROM fotocopy_expenses";
            let params = [];
            let conditions = [];

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

            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    addExpense(expense) {
        return new Promise((resolve, reject) => {
            const { description, amount, created_at } = expense;
            const formattedDate = created_at ? `${created_at} 00:00:00` : new Date().toISOString();
            
            console.log('Menyimpan ke database:', { description, amount, formattedDate });
            
            this.db.run(`
                INSERT INTO fotocopy_expenses (description, amount, created_at)
                VALUES (?, ?, ?)
            `, [description, amount, formattedDate], function(err) {
                if (err) {
                    console.error('Error saat menyimpan pengeluaran:', err);
                    reject(err);
                } else {
                    console.log('Pengeluaran tersimpan, ID:', this.lastID);
                    resolve({ id: this.lastID });
                }
            });
        });
    }

    updateExpense(id, expense) {
        return new Promise((resolve, reject) => {
            const { description, amount, created_at } = expense;
            const formattedDate = created_at ? `${created_at} 00:00:00` : new Date().toISOString();
            this.db.run(`
                UPDATE fotocopy_expenses
                SET description = ?, amount = ?, created_at = ?
                WHERE id = ?
            `, [description, amount, formattedDate, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    deleteExpense(id) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM fotocopy_expenses WHERE id = ?', [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    deleteSale(id) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM sales WHERE id = ?', [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed');
            }
        });
    }
}

module.exports = Database;