const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('./database');
const fs = require('fs');
const ExcelJS = require('exceljs');
const os = require('os');

let mainWindow;
let db;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1000,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'assets', 'logosb.png'),
        titleBarStyle: 'default',
        show: false
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (process.argv.includes('--dev')) {
            mainWindow.webContents.openDevTools();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // Salin database ke userData jika belum ada
    const dbSource = path.join(__dirname, 'sb_fotocopy.db');
    const dbDest = path.join(app.getPath('userData'), 'sb_fotocopy.db');
    if (!fs.existsSync(dbDest) && fs.existsSync(dbSource)) {
        fs.copyFileSync(dbSource, dbDest);
        console.log('Database copied to:', dbDest);
    }

    db = new Database();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ✅ IPC Handlers Database
ipcMain.handle('db-get-products', (event, type, searchQuery = '') => db.getProducts(type, searchQuery));
ipcMain.handle('db-add-product', (event, product) => db.addProduct(product));
ipcMain.handle('db-update-product', (event, id, product) => db.updateProduct(id, product));
ipcMain.handle('db-delete-product', (event, id) => db.deleteProduct(id));
ipcMain.handle('db-add-sale', (event, sale) => db.addSale(sale));
ipcMain.handle('db-get-sales', (event, filters) => db.getSales(filters));
ipcMain.handle('db-get-sales-summary', (event, filters) => db.getSalesSummary(filters));
ipcMain.handle('db-update-stock', (event, productId, delta) => db.updateStock(productId, delta));
ipcMain.handle('db-get-expenses', (event, filters) => db.getExpenses(filters));
ipcMain.handle('db-get-expenses-summary', (event, filters) => db.getExpensesSummary(filters));
ipcMain.handle('db-add-expense', (event, expense) => db.addExpense(expense));
ipcMain.handle('db-update-expense', (event, id, expense) => db.updateExpense(id, expense));
ipcMain.handle('db-delete-expense', (event, id) => db.deleteExpense(id));
ipcMain.handle('db-delete-sale', (event, id) => db.deleteSale(id));
ipcMain.handle('force-refresh-ui', () => mainWindow.webContents.reloadIgnoringCache());

// ✅ IPC Export to Excel
ipcMain.handle('export-sales-to-excel', async (event, salesData) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan Penjualan');

        sheet.columns = [
            { header: 'Tanggal & Jam', key: 'created_at', width: 22 },
            { header: 'Jenis', key: 'type', width: 15 },
            { header: 'Nama Barang/Layanan', key: 'name', width: 30 },
            { header: 'Metode Bayar', key: 'payment_method', width: 15 },
            { header: 'Harga Satuan', key: 'price', width: 15 },
            { header: 'Qty', key: 'qty', width: 10 },
            { header: 'Total', key: 'total', width: 15 },
        ];

        salesData.forEach(sale => {
            sale.items.forEach(item => {
                sheet.addRow({
                    created_at: sale.created_at,
                    type: sale.type,
                    name: item.name,
                    payment_method: sale.payment_method,
                    price: item.price,
                    qty: item.quantity,
                    total: item.total
                });
            });
        });

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).alignment = { horizontal: 'center' };

        const downloadsPath = path.join(os.homedir(), 'Downloads');
        const filePath = path.join(downloadsPath, `Laporan_Penjualan_${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(filePath);
        console.log('✅ Laporan diekspor ke:', filePath);

        return { success: true, path: filePath };
    } catch (error) {
        console.error('❌ Gagal ekspor Excel:', error);
        return { success: false, message: error.message };
    }
});

process.on('uncaughtException', (error) => console.error('Uncaught Exception:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled Rejection:', error));
