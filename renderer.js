const { ipcRenderer } = require('electron');

// Global variables
let currentPage = 'dashboard';
let currentProductTab = 'atk';
let currentHistoryTab = 'summary';
let currentPaymentMethod = 'cash';  // Default
let products = { atk: [], makmin: [] };
let allProducts = [];  // Untuk dropdown add stock
let cart = { makmin: [], atk: [], fotocopy: [] };
let isEditMode = false;
let editingProductId = null;
let filteredSales = [];  // Untuk search history

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadProducts();
    updateCartDisplays();
    updateGrandTotal();
    loadHistoryData();
    
    // Set initial theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.className = savedTheme + '-theme';
    updateThemeIcon();
    
    // Set initial dates
    document.getElementById('date-from').valueAsDate = new Date();
    document.getElementById('date-to').valueAsDate = new Date();

    // Load all products for add stock dropdown
    allProducts = [...products.atk, ...products.makmin];
    populateStockSelect();
});

// Theme management
function toggleTheme() {
    const currentTheme = document.body.className.includes('dark') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.body.className = newTheme + '-theme';
    localStorage.setItem('theme', newTheme);
    updateThemeIcon();
}

function updateThemeIcon() {
    const themeToggle = document.querySelector('.theme-toggle i');
    const isDark = document.body.className.includes('dark');
    themeToggle.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

// Page navigation
function showPage(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // Show selected page
    document.getElementById(page + '-page').classList.add('active');
    document.querySelector(`[onclick="showPage('${page}')"]`).classList.add('active');
    
    currentPage = page;
    
    // Load page-specific data
    if (page === 'products') {
        loadProductsTable();
    } else if (page === 'history') {
        loadHistoryData();
    }
}

// Tab management
function showProductTab(tab) {
    document.querySelectorAll('.product-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[onclick="showProductTab('${tab}')"]`).classList.add('active');
    
    currentProductTab = tab;
    loadProductsTable();
}

function showHistoryTab(tab) {
    document.querySelectorAll('.history-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[onclick="showHistoryTab('${tab}')"]`).classList.add('active');
    
    currentHistoryTab = tab;
    loadHistoryData();
}

// Product management
async function loadProducts() {
    try {
        products.atk = await ipcRenderer.invoke('db-get-products', 'atk');
        products.makmin = await ipcRenderer.invoke('db-get-products', 'makmin');
        allProducts = [...products.atk, ...products.makmin];
        
        updateProductLists();
        populateStockSelect();  // Update dropdown
    } catch (error) {
        console.error('Error loading products:', error);
        showNotification('Error loading products', 'error');
    }
}

function populateStockSelect(searchTerm = '') {
    const select = document.getElementById('stock-product-select');
    select.innerHTML = '<option value="">-- Pilih Produk --</option>';
    
    const filteredProducts = allProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    filteredProducts.forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.code} - ${product.name} (Stok Saat Ini: ${product.stock})`;
        select.appendChild(option);
    });
}

function filterStockSelect() {
    const searchTerm = document.getElementById('stock-search').value;
    populateStockSelect(searchTerm);
}

function updateProductLists() {
    updateProductList('atk');
    updateProductList('makmin');
}

function updateProductList(type) {
    const container = document.getElementById(`${type}-products`);
    if (!container) return;
    
    container.innerHTML = '';
    
    products[type].forEach(product => {
        const productElement = document.createElement('div');
        productElement.className = 'product-item';
        productElement.onclick = () => addToCart(type, product);
        
        productElement.innerHTML = `
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-price">Rp ${formatNumber(product.selling_price)}</div>
            </div>
            <div class="product-stock">${product.stock}</div>
        `;
        
        container.appendChild(productElement);
    });
}

function searchProducts(type) {
    const searchTerm = document.getElementById(`${type}-search`).value.toLowerCase();
    const container = document.getElementById(`${type}-products`);
    
    container.innerHTML = '';
    
    const filteredProducts = products[type].filter(product =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.code.toLowerCase().includes(searchTerm)
    );
    
    filteredProducts.forEach(product => {
        const productElement = document.createElement('div');
        productElement.className = 'product-item';
        productElement.onclick = () => addToCart(type, product);
        
        productElement.innerHTML = `
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-price">Rp ${formatNumber(product.selling_price)}</div>
            </div>
            <div class="product-stock">${product.stock}</div>
        `;
        
        container.appendChild(productElement);
    });
}

// Search for products table
function searchProductsTable() {
    const searchTerm = document.getElementById('product-search').value.toLowerCase();
    const currentProducts = products[currentProductTab] || [];
    const filtered = currentProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.code.toLowerCase().includes(searchTerm)
    );
    renderProductsTable(filtered);
}

// Render products table helper
function renderProductsTable(productsToRender) {
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = '';
    
    productsToRender.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.code}</td>
            <td>${product.name}</td>
            <td>Rp ${formatNumber(product.purchase_price)}</td>
            <td>Rp ${formatNumber(product.selling_price)}</td>
            <td>${product.stock}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-primary btn-sm" onclick="showEditProductModal(${JSON.stringify(product).replace(/"/g, '&quot;')})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger btn-sm" onclick="deleteProduct(${product.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function loadProductsTable() {
    const currentProducts = products[currentProductTab] || [];
    const searchTerm = document.getElementById('product-search').value.toLowerCase();
    const filtered = currentProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.code.toLowerCase().includes(searchTerm)
    );
    renderProductsTable(filtered);
}

// Cart management
function addToCart(type, product) {
    if (product.stock <= 0) {
        showNotification('Stok tidak tersedia', 'warning');
        return;
    }
    
    const existingItem = cart[type].find(item => item.id === product.id);
    
    if (existingItem) {
        if (existingItem.quantity < product.stock) {
            existingItem.quantity++;
        } else {
            showNotification('Stok tidak mencukupi', 'warning');
            return;
        }
    } else {
        cart[type].push({
            id: product.id,
            name: product.name,
            price: product.selling_price,
            purchase_price: product.purchase_price,
            quantity: 1,
            stock: product.stock
        });
    }
    
    updateCartDisplay(type);
    updateGrandTotal();
}

function removeFromCart(type, productId) {
    cart[type] = cart[type].filter(item => item.id !== productId);
    updateCartDisplay(type);
    updateGrandTotal();
}

function updateCartQuantity(type, productId, quantity) {
    const item = cart[type].find(item => item.id === productId);
    if (item) {
        if (quantity > 0 && quantity <= item.stock) {
            item.quantity = quantity;
        } else if (quantity <= 0) {
            removeFromCart(type, productId);
            return;
        } else {
            showNotification('Jumlah melebihi stok', 'warning');
            return;
        }
    }
    updateCartDisplay(type);
    updateGrandTotal();
}

function updateCartDisplay(type) {
    if (type === 'fotocopy') {
        const container = document.querySelector(`#fotocopy-cart .cart-items`);
        const totalElement = document.querySelector(`#fotocopy-cart .cart-total span`);
        
        container.innerHTML = '';
        let total = 0;
        
        cart.fotocopy.forEach((item, index) => {
            const itemTotal = item.price * item.quantity;
            total += itemTotal;
            
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            
            cartItem.innerHTML = `
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-details">
                        ${item.quantity} x Rp ${formatNumber(item.price)} = Rp ${formatNumber(itemTotal)}
                        ${item.note ? `<br><small>${item.note}</small>` : ''}
                    </div>
                </div>
                <div class="cart-item-actions">
                    <button class="remove-btn" onclick="removeFotocopyItem(${index})">×</button>
                </div>
            `;
            
            container.appendChild(cartItem);
        });
        
        totalElement.textContent = formatNumber(total);
        return;
    }
    
    const container = document.querySelector(`#${type}-cart .cart-items`);
    const totalElement = document.querySelector(`#${type}-cart .cart-total span`);
    
    container.innerHTML = '';
    let total = 0;
    
    cart[type].forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        
        cartItem.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-details">
                    ${item.quantity} x Rp ${formatNumber(item.price)} = Rp ${formatNumber(itemTotal)}
                </div>
            </div>
            <div class="cart-item-actions">
                <button class="qty-btn" onclick="updateCartQuantity('${type}', ${item.id}, ${item.quantity - 1})">-</button>
                <input type="number" class="qty-input" value="${item.quantity}" 
                       onchange="updateCartQuantity('${type}', ${item.id}, parseInt(this.value))">
                <button class="qty-btn" onclick="updateCartQuantity('${type}', ${item.id}, ${item.quantity + 1})">+</button>
                <button class="remove-btn" onclick="removeFromCart('${type}', ${item.id})">×</button>
            </div>
        `;
        
        container.appendChild(cartItem);
    });
    
    totalElement.textContent = formatNumber(total);
}

function updateCartDisplays() {
    updateCartDisplay('atk');
    updateCartDisplay('makmin');
    updateCartDisplay('fotocopy');
}

function addFotocopyItem() {
    const type = document.getElementById('fotocopy-type').value;
    const price = parseFloat(document.getElementById('fotocopy-price').value) || 0;
    const qty = parseInt(document.getElementById('fotocopy-qty').value) || 0;
    const note = document.getElementById('fotocopy-note').value.trim();
    
    if (!type || price <= 0 || qty <= 0) {
        showNotification('Mohon lengkapi semua field yang wajib', 'warning');
        return;
    }
    
    const item = {
        id: Date.now(),
        name: getServiceName(type),
        type: type,
        price: price,
        quantity: qty,
        note: note
    };
    
    cart.fotocopy.push(item);
    updateCartDisplay('fotocopy');
    updateGrandTotal();
    
    // Clear form
    document.getElementById('fotocopy-type').value = '';
    document.getElementById('fotocopy-price').value = '';
    document.getElementById('fotocopy-qty').value = '';
    document.getElementById('fotocopy-note').value = '';
}

function getServiceName(type) {
    const names = {
        'fotocopy': 'Fotocopy',
        'print-color': 'Print Warna'
    };
    return names[type] || type;
}

function removeFotocopyItem(index) {
    cart.fotocopy.splice(index, 1);
    updateCartDisplay('fotocopy');
    updateGrandTotal();
}

function updateGrandTotal() {
    let grandTotal = 0;
    
    cart.atk.forEach(item => grandTotal += item.price * item.quantity);
    cart.makmin.forEach(item => grandTotal += item.price * item.quantity);
    cart.fotocopy.forEach(item => grandTotal += item.price * item.quantity);
    
    document.getElementById('grand-total').textContent = formatNumber(grandTotal);
}

// Payment processing
function processPayment() {
    const grandTotal = calculateGrandTotal();
    
    if (grandTotal <= 0) {
        showNotification('Keranjang kosong', 'warning');
        return;
    }
    
    document.getElementById('payment-total').textContent = formatNumber(grandTotal);
    document.getElementById('payment-method').value = 'cash';
    document.getElementById('payment-received').value = '';
    document.getElementById('payment-change').textContent = '0';
    toggleCashInput();  // Show/hide cash input based on method
    
    showModal('payment-modal');
}

function toggleCashInput() {
    const method = document.getElementById('payment-method').value;
    const cashGroup = document.getElementById('cash-input-group');
    const total = calculateGrandTotal();
    if (method === 'cash') {
        cashGroup.style.display = 'block';
    } else {
        cashGroup.style.display = 'none';
        document.getElementById('payment-received').value = total;  // For QRIS, assume paid full
        document.getElementById('payment-change').textContent = '0';
    }
}

function calculateGrandTotal() {
    let total = 0;
    cart.atk.forEach(item => total += item.price * item.quantity);
    cart.makmin.forEach(item => total += item.price * item.quantity);
    cart.fotocopy.forEach(item => total += item.price * item.quantity);
    return total;
}

function calculateChange() {
    const total = calculateGrandTotal();
    const received = parseFloat(document.getElementById('payment-received').value) || 0;
    const change = received - total;
    
    document.getElementById('payment-change').textContent = formatNumber(Math.max(0, change));
}

async function completeSale() {
    const total = calculateGrandTotal();
    const paymentMethod = document.getElementById('payment-method').value;
    const received = parseFloat(document.getElementById('payment-received').value) || 0;
    
    if (paymentMethod === 'cash' && received < total) {
        showNotification('Uang yang diterima kurang', 'error');
        return;
    }
    
    if (!paymentMethod) {
        showNotification('Pilih metode pembayaran', 'error');
        return;
    }
    
    try {
        // Process each cart type with payment_method
        const salePromises = [];
        
        if (cart.atk.length > 0) {
            salePromises.push(processSaleByType('atk', paymentMethod));
        }
        
        if (cart.makmin.length > 0) {
            salePromises.push(processSaleByType('makmin', paymentMethod));
        }
        
        if (cart.fotocopy.length > 0) {
            salePromises.push(processSaleByType('fotocopy', paymentMethod));
        }
        
        await Promise.all(salePromises);
        
        // Update stock for ATK and Makmin (kurangi)
        for (const item of cart.atk) {
            await ipcRenderer.invoke('db-update-stock', item.id, -item.quantity);  // Negative untuk kurangi
        }
        
        for (const item of cart.makmin) {
            await ipcRenderer.invoke('db-update-stock', item.id, -item.quantity);
        }
        
        // Clear carts
        cart.atk = [];
        cart.makmin = [];
        cart.fotocopy = [];
        
        // Update displays
        updateCartDisplays();
        updateGrandTotal();
        await loadProducts();
        
        showNotification(`Transaksi berhasil dengan ${paymentMethod.toUpperCase()}`, 'success');
        closeModal('payment-modal');
        
    } catch (error) {
        console.error('Error completing sale:', error);
        showNotification('Error processing sale', 'error');
    }
}

async function processSaleByType(type, paymentMethod) {
    const cartItems = cart[type];
    if (cartItems.length === 0) return;
    
    let total = 0;
    const items = cartItems.map(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        
        if (type === 'fotocopy') {
            return {
                name: item.name,
                type: item.type,
                price: item.price,
                quantity: item.quantity,
                total: itemTotal,
                note: item.note || ''
            };
        } else {
            return {
                id: item.id,
                name: item.name,
                price: item.price,
                purchase_price: item.purchase_price,
                quantity: item.quantity,
                total: itemTotal
            };
        }
    });
    
    const sale = {
        type: type,
        payment_method: paymentMethod,
        total_amount: total,
        items: items
    };
    
    return await ipcRenderer.invoke('db-add-sale', sale);
}

// Add Stock Modal
function showAddStockModal() {
    document.getElementById('stock-search').value = '';
    document.getElementById('stock-product-select').value = '';
    document.getElementById('stock-add-amount').value = '';
    populateStockSelect();
    showModal('add-stock-modal');
}

async function addStock() {
    const productId = parseInt(document.getElementById('stock-product-select').value);
    const amount = parseInt(document.getElementById('stock-add-amount').value) || 0;
    
    if (!productId || amount <= 0) {
        showNotification('Pilih produk dan masukkan jumlah yang valid', 'warning');
        return;
    }
    
    try {
        await ipcRenderer.invoke('db-update-stock', productId, amount);  // + amount
        showNotification('Stok berhasil ditambahkan', 'success');
        closeModal('add-stock-modal');
        await loadProducts();  // Reload untuk update dropdown dan list
        if (currentPage === 'products') {
            loadProductsTable();
        }
    } catch (error) {
        console.error('Error adding stock:', error);
        showNotification('Error menambah stok', 'error');
    }
}

// Product management modal
function showAddProductModal() {
    isEditMode = false;
    editingProductId = null;
    document.getElementById('product-modal-title').textContent = 'Tambah Barang';
    document.getElementById('product-form').reset();
    document.getElementById('product-type').value = currentProductTab;
    showModal('product-modal');
}

function showEditProductModal(product) {
    isEditMode = true;
    editingProductId = product.id;
    document.getElementById('product-modal-title').textContent = 'Edit Barang';
    
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-type').value = product.type;
    document.getElementById('product-code').value = product.code;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-purchase-price').value = product.purchase_price;
    document.getElementById('product-selling-price').value = product.selling_price;
    document.getElementById('product-stock').value = product.stock;
    
    showModal('product-modal');
}

async function saveProduct() {
    const productData = {
        code: document.getElementById('product-code').value.trim(),
        name: document.getElementById('product-name').value.trim(),
        type: document.getElementById('product-type').value,
        purchase_price: parseFloat(document.getElementById('product-purchase-price').value) || 0,
        selling_price: parseFloat(document.getElementById('product-selling-price').value) || 0,
        stock: parseInt(document.getElementById('product-stock').value) || 0
    };
    
    if (!productData.code || !productData.name || productData.selling_price <= 0) {
        showNotification('Mohon lengkapi semua field', 'warning');
        return;
    }
    
    try {
        if (isEditMode) {
            await ipcRenderer.invoke('db-update-product', editingProductId, productData);
            showNotification('Produk berhasil diupdate', 'success');
        } else {
            await ipcRenderer.invoke('db-add-product', productData);
            showNotification('Produk berhasil ditambahkan', 'success');
        }
        
        await loadProducts();
        loadProductsTable();
        closeModal('product-modal');
        
    } catch (error) {
        console.error('Error saving product:', error);
        showNotification('Error menyimpan produk', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('Yakin ingin menghapus produk ini?')) return;
    
    try {
        await ipcRenderer.invoke('db-delete-product', id);
        await loadProducts();
        loadProductsTable();
        showNotification('Produk berhasil dihapus', 'success');
    } catch (error) {
        console.error('Error deleting product:', error);
        showNotification('Error menghapus produk', 'error');
    }
}

// History and reporting
async function loadHistoryData() {
    const baseFilters = getHistoryFilters();
    let sales = [];
    let summaryFilters = { ...baseFilters };  // Untuk summary, tanpa filter type/payment spesifik
    
    try {
        if (currentHistoryTab === 'summary') {
            // Tampilkan SEMUA sales untuk tabel dan summary
            sales = await ipcRenderer.invoke('db-get-sales', summaryFilters);
            await loadSummaryData(summaryFilters, sales);  // Pass sales untuk menghindari query ganda
        } else if (currentHistoryTab === 'qris' || currentHistoryTab === 'cash') {
            // Filter by payment_method, tampilkan semua type yang match payment
            const pmFilters = { ...baseFilters, payment_method: currentHistoryTab };
            sales = await ipcRenderer.invoke('db-get-sales', pmFilters);
            await loadSalesData(null, pmFilters, sales);  // null type, pass sales
        } else {
            // Filter by type (atk, makmin, fotocopy)
            const typeFilters = { ...baseFilters, type: currentHistoryTab };
            sales = await ipcRenderer.invoke('db-get-sales', typeFilters);
            await loadSalesData(currentHistoryTab, typeFilters, sales);
        }
        
        filteredSales = sales;  // Store filtered results for search
        searchHistory();  // Apply search on the filtered sales
        
    } catch (error) {
        console.error('Error loading history:', error);
        showNotification('Error loading history data', 'error');
    }
}

function searchHistory() {
    const searchTerm = document.getElementById('history-search').value.toLowerCase();
    let salesToShow = filteredSales;

    if (searchTerm) {
        salesToShow = filteredSales.filter(sale => {
            const itemsText = sale.items.map(item => item.name).join(' ').toLowerCase();
            const totalText = sale.total_amount.toString().toLowerCase();
            const dateText = new Date(sale.created_at).toLocaleDateString('id-ID').toLowerCase();
            return itemsText.includes(searchTerm) || totalText.includes(searchTerm) || dateText.includes(searchTerm);
        });
    }

    loadSalesTable(salesToShow);
}

function getHistoryFilters() {
    const period = document.getElementById('period-filter').value;
    const today = new Date();
    let dateFrom, dateTo;
    
    switch (period) {
        case 'today':
            dateFrom = dateTo = today.toISOString().split('T')[0];
            break;
        case 'week':
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            dateFrom = weekStart.toISOString().split('T')[0];
            dateTo = today.toISOString().split('T')[0];
            break;
        case 'month':
            dateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
            dateTo = today.toISOString().split('T')[0];
            break;
        case 'custom':
            dateFrom = document.getElementById('date-from').value;
            dateTo = document.getElementById('date-to').value;
            break;
        default:
            dateFrom = dateTo = today.toISOString().split('T')[0];
    }
    
    return { date_from: dateFrom, date_to: dateTo };
}

async function loadSummaryData(filters, allSales) {
    try {
        const summary = await ipcRenderer.invoke('db-get-sales-summary', filters);
        
        let totalRevenue = 0;
        let totalTransactions = 0;
        let totalCost = 0;
        let totalProfit = 0;
        
        summary.forEach(s => {
            totalRevenue += s.total_revenue || 0;
            totalTransactions += s.total_transactions || 0;
        });
        
        // Calculate cost and profit for product-based sales (semua sales)
        allSales.forEach(sale => {
            if (sale.type !== 'fotocopy') {
                sale.items.forEach(item => {
                    if (item.purchase_price) {
                        const itemCost = item.purchase_price * item.quantity;
                        totalCost += itemCost;
                    }
                });
            }
        });
        
        totalProfit = totalRevenue - totalCost;
        
        // Update summary cards
        const cards = document.querySelectorAll('.summary-card .amount');
        cards[0].textContent = `Rp ${formatNumber(totalRevenue)}`;
        cards[1].textContent = `Rp ${formatNumber(totalCost)}`;
        cards[2].textContent = `Rp ${formatNumber(totalProfit)}`;
        cards[3].textContent = totalTransactions.toString();
        
        // Tabel: gunakan allSales (semua)
        loadSalesTable(allSales);
        
    } catch (error) {
        console.error('Error loading summary:', error);
    }
}

async function loadSalesData(type, filters, sales) {
    loadSalesTable(sales);
    
    // Calculate summary berdasarkan sales yang difilter
    let totalRevenue = 0;
    let totalCost = 0;
    let totalTransactions = sales.length;
    
    sales.forEach(sale => {
        totalRevenue += sale.total_amount;
        
        if (sale.type !== 'fotocopy') {
            sale.items.forEach(item => {
                if (item.purchase_price) {
                    totalCost += item.purchase_price * item.quantity;
                }
            });
        }
    });
    
    const totalProfit = totalRevenue - totalCost;
    
    // Update summary cards
    const cards = document.querySelectorAll('.summary-card .amount');
    cards[0].textContent = `Rp ${formatNumber(totalRevenue)}`;
    cards[1].textContent = `Rp ${formatNumber(totalCost)}`;
    cards[2].textContent = `Rp ${formatNumber(totalProfit)}`;
    cards[3].textContent = totalTransactions.toString();
}

function loadSalesTable(sales) {
    const tbody = document.querySelector('#history-table tbody');
    tbody.innerHTML = '';
    
    sales.forEach(sale => {
        const row = document.createElement('tr');
        const date = new Date(sale.created_at).toLocaleDateString('id-ID');
        const itemsText = sale.items.map(item => 
            `${item.name} (${item.quantity}x)`
        ).join(', ');
        const methodLabel = sale.payment_method === 'cash' ? 'Cash' : 'QRIS';
        
        row.innerHTML = `
            <td>${date}</td>
            <td>${getTypeLabel(sale.type)}</td>
            <td>${methodLabel}</td>
            <td>Rp ${formatNumber(sale.total_amount)}</td>
            <td>${itemsText}</td>
        `;
        tbody.appendChild(row);
    });
}

function getTypeLabel(type) {
    const labels = {
        'atk': 'ATK',
        'makmin': 'Makanan & Minuman',
        'fotocopy': 'Fotocopy & Print'
    };
    return labels[type] || type;
}

function updateHistoryData() {
    const period = document.getElementById('period-filter').value;
    const customRange = document.getElementById('custom-date-range');
    
    if (period === 'custom') {
        customRange.style.display = 'flex';
    } else {
        customRange.style.display = 'none';
    }
    
    loadHistoryData();
}

// Modal management
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

// Utility functions
function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: var(--shadow);
        z-index: 1001;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        min-width: 300px;
        color: white;
        font-weight: 500;
    `;
    
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#007bff'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Event listeners
document.getElementById('period-filter').addEventListener('change', updateHistoryData);

// Tambah event listener untuk payment-method change
if (document.getElementById('payment-method')) {
    document.getElementById('payment-method').addEventListener('change', toggleCashInput);
}

// Close modals when clicking outside
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey) {
        switch (event.key) {
            case '1':
                event.preventDefault();
                showPage('dashboard');
                break;
            case '2':
                event.preventDefault();
                showPage('products');
                break;
            case '3':
                event.preventDefault();
                showPage('history');
                break;
            case 'n':
                if (currentPage === 'products') {
                    event.preventDefault();
                    showAddProductModal();
                }
                break;
        }
    }
    
    if (event.key === 'Escape') {
        document.querySelectorAll('.modal.show').forEach(modal => {
            modal.classList.remove('show');
        });
    }
});