const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;
        if (isElectron) {
            const { app } = require('electron');
            this.dbPath = path.join(app.getPath('userData'), 'sb_fotocopy.db');
        } else {
            this.dbPath = path.join(__dirname, 'sb_fotocopy.db');
        }

        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                throw err;
            }
            console.log('Connected to SQLite database at:', this.dbPath);
            this.init();
        });
    }

    init() {
        this.db.serialize(() => {
            // Produk
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

            // Penjualan
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

            // Pengeluaran untuk fotocopy/print
            this.db.run(`
                CREATE TABLE IF NOT EXISTS fotocopy_expenses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT,
                    amount REAL,
                    created_at TEXT
                )
            `);

            // ✅ Riwayat Pembelian (barang masuk)
            // Disimpan minimal: product_id & qty & waktu.
            // Kolom harga/nama TIDAK disalin agar tampilan selalu mengikuti data produk terkini.
            this.db.run(`
                CREATE TABLE IF NOT EXISTS purchases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    quantity INTEGER NOT NULL,
                    created_at TEXT DEFAULT (datetime('now', 'localtime')),
                    FOREIGN KEY(product_id) REFERENCES products(id)
                )
            `);

            this.db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_purchases_product_id ON purchases(product_id)`);
        });
    }

    // --------- Utilities ----------
    generateProductCode(type) {
        return new Promise((resolve, reject) => {
            const prefix = type === 'atk' ? 'ATK' : 'MM';
            this.db.get(
                `SELECT code FROM products WHERE type = ? ORDER BY CAST(SUBSTR(code, 5) AS INTEGER) DESC LIMIT 1`,
                [type],
                (err, row) => {
                    if (err) {
                        console.error('Error generating product code:', err);
                        reject(err);
                    } else {
                        let nextNumber = 1;
                        if (row && row.code) {
                            const currentNumber = parseInt(row.code.split('-')[1]);
                            nextNumber = currentNumber + 1;
                        }
                        const code = `${prefix}-${String(nextNumber).padStart(3, '0')}`;
                        console.log(`Generated code for ${type}: ${code}`);
                        resolve(code);
                    }
                }
            );
        });
    }

    // --------- Products ----------
    getProducts(type = null, searchQuery = '') {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM products';
            let params = [];
            let conditions = [];

            if (type) {
                conditions.push('type = ?');
                params.push(type);
            }

            if (searchQuery) {
                conditions.push('(name LIKE ? OR code LIKE ?)');
                params.push(`%${searchQuery}%`, `%${searchQuery}%`);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
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
                if (!code) {
                    throw new Error('Failed to generate code');
                }
                this.db.run(`
                    INSERT INTO products (code, name, type, purchase_price, selling_price, stock)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [code, name, type, purchase_price, selling_price, stock], function(err) {
                    if (err) {
                        console.error('Error adding product:', err);
                        reject(err);
                    } else {
                        const newId = this.lastID;
                        // ✅ Catat ke riwayat pembelian jika ada stok awal
                        if ((parseInt(stock) || 0) > 0) {
                            // tidak menunggu; tapi tetap aman jika ingin diawait
                            // demi konsistensi gunakan insert async
                        }
                        resolve({ id: newId });
                    }
                });
            } catch (err) {
                console.error('Error adding product:', err);
                reject(err);
            }
        }).then(async (res) => {
            // Setelah insert sukses, insert purchases jika perlu
            const { id } = res;
            if (product && (parseInt(product.stock) || 0) > 0) {
                try {
                    await this.addPurchase(id, parseInt(product.stock) || 0);
                } catch (e) {
                    console.error('Warning: failed to log initial purchase:', e);
                }
            }
            return res;
        });
    }

    updateProduct(id, product) {
        return new Promise(async (resolve, reject) => {
            const { name, type, purchase_price, selling_price, stock } = product;
            this.db.get('SELECT code, type FROM products WHERE id = ?', [id], async (err, row) => {
                if (err) {
                    console.error('Error fetching product for update:', err);
                    reject(err);
                    return;
                }
                let newCode = row.code; // Pertahankan kode lama jika tipe tidak berubah
                if (row.type !== type) {
                    newCode = await this.generateProductCode(type); // Hanya buat kode baru jika tipe berubah
                }
                this.db.run(`
                    UPDATE products
                    SET code = ?, name = ?, type = ?, purchase_price = ?, selling_price = ?, stock = ?
                    WHERE id = ?
                `, [newCode, name, type, purchase_price, selling_price, stock, id], function(err) {
                    if (err) {
                        console.error('Error updating product:', err);
                        reject(err);
                    } else {
                        console.log(`Product updated: ID=${id}, Code=${newCode}, Name=${name}`);
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

    // --------- Sales ----------
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
            `, [delta, productId], async function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        }).then(async (res) => {
            // ✅ Catat pembelian hanya ketika stok bertambah (barang masuk)
            if (delta > 0) {
                try {
                    await this.addPurchase(productId, delta);
                } catch (e) {
                    console.error('Warning: failed to log stock-add purchase:', e);
                }
            }
            return res;
        });
    }

    // --------- Expenses (fotocopy/print) ----------
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
                    resolve(row || { total_amount: 0 });
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

    // --------- Purchases (Barang Masuk) ----------
    addPurchase(productId, quantity, created_at = null) {
        return new Promise((resolve, reject) => {
            const dt = created_at ? `${created_at} 00:00:00` : null;
            const sql = dt
                ? `INSERT INTO purchases (product_id, quantity, created_at) VALUES (?, ?, ?)`
                : `INSERT INTO purchases (product_id, quantity, created_at) VALUES (?, ?, datetime('now', 'localtime'))`;
            const params = dt ? [productId, quantity, dt] : [productId, quantity];
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('Error adding purchase:', err);
                    reject(err);
                } else {
                    resolve({ id: this.lastID });
                }
            });
        });
    }

    getPurchases(filters = {}) {
        // Mengembalikan baris dengan kolom tampilan mengikuti data produk terkini (join dengan products)
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    pu.id,
                    pu.product_id,
                    pu.quantity,
                    pu.created_at,
                    pr.code,
                    pr.name,
                    pr.type,
                    pr.purchase_price,
                    pr.selling_price,
                    (pr.purchase_price * pu.quantity) AS total_modal
                FROM purchases pu
                JOIN products pr ON pr.id = pu.product_id
            `;
            let params = [];
            let conditions = [];

            if (filters.date_from) {
                conditions.push("date(pu.created_at) >= ?");
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push("date(pu.created_at) <= ?");
                params.push(filters.date_to);
            }

            if (filters.type) {
                conditions.push("pr.type = ?");
                params.push(filters.type);
            }

            if (filters.search) {
                conditions.push("(pr.name LIKE ? OR pr.code LIKE ?)");
                params.push(`%${filters.search}%`, `%${filters.search}%`);
            }

            if (conditions.length > 0) {
                query += " WHERE " + conditions.join(" AND ");
            }

            query += " ORDER BY pu.created_at DESC, pr.name ASC";

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getPurchasesSummary(filters = {}) {
        // Total belanja (total modal) pada periode & type tertentu
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    SUM(pr.purchase_price * pu.quantity) AS total_amount
                FROM purchases pu
                JOIN products pr ON pr.id = pu.product_id
            `;
            let params = [];
            let conditions = [];

            if (filters.date_from) {
                conditions.push("date(pu.created_at) >= ?");
                params.push(filters.date_from);
            }

            if (filters.date_to) {
                conditions.push("date(pu.created_at) <= ?");
                params.push(filters.date_to);
            }

            if (filters.type) {
                conditions.push("pr.type = ?");
                params.push(filters.type);
            }

            if (conditions.length > 0) {
                query += " WHERE " + conditions.join(" AND ");
            }

            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || { total_amount: 0 });
                }
            });
        });
    }

    // --------- Close ----------
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
