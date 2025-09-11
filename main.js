const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('./database');

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
        icon: path.join(__dirname, 'assets', 'logosb.png'), // Ubah dari icon.png ke logosb.png
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

ipcMain.handle('db-get-products', (event, type) => {
    return db.getProducts(type);
});

ipcMain.handle('db-add-product', (event, product) => {
    return db.addProduct(product);
});

ipcMain.handle('db-update-product', (event, id, product) => {
    return db.updateProduct(id, product);
});

ipcMain.handle('db-delete-product', (event, id) => {
    return db.deleteProduct(id);
});

ipcMain.handle('db-add-sale', (event, sale) => {
    return db.addSale(sale);
});

ipcMain.handle('db-get-sales', (event, filters) => {
    return db.getSales(filters);
});

ipcMain.handle('db-get-sales-summary', (event, filters) => {
    return db.getSalesSummary(filters);
});

ipcMain.handle('db-update-stock', (event, productId, delta) => {
    return db.updateStock(productId, delta);
});

ipcMain.handle('db-get-expenses', (event, filters) => {
    return db.getExpenses(filters);
});

ipcMain.handle('db-get-expenses-summary', (event, filters) => {
    return db.getExpensesSummary(filters);
});

ipcMain.handle('db-add-expense', (event, expense) => {
    return db.addExpense(expense);
});

ipcMain.handle('db-update-expense', (event, id, expense) => {
    return db.updateExpense(id, expense);
});

ipcMain.handle('db-delete-expense', (event, id) => {
    return db.deleteExpense(id);
});

ipcMain.handle('db-delete-sale', (event, id) => {
    return db.deleteSale(id);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

ipcMain.handle('force-refresh-ui', () => {
    mainWindow.webContents.reloadIgnoringCache();
});