const { ipcRenderer } = require('electron');

let currentPage = 'dashboard';
let currentProductTab = 'atk';
let currentHistoryTab = 'summary';
let currentPaymentMethod = 'cash';
let products = { atk: [], makmin: [] };
let allProducts = [];
let cart = { makmin: [], atk: [], fotocopy: [] };
let isEditMode = false;
let editingProductId = null;
let editingExpenseId = null;
let filteredSales = [];
let filteredExpenses = [];
let confirmResolve = null; // Untuk menangani Promise di confirm modal

document.addEventListener('DOMContentLoaded', async () => {
    await loadProducts();
    updateCartDisplays();
    updateGrandTotal();
    loadHistoryData();
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.className = savedTheme + '-theme';
    updateThemeIcon();
    
    document.getElementById('date-from').valueAsDate = new Date();
    document.getElementById('date-to').valueAsDate = new Date();
    document.getElementById('expenses-date-from').valueAsDate = new Date();
    document.getElementById('expenses-date-to').valueAsDate = new Date();

    allProducts = [...products.atk, ...products.makmin];
    populateStockSelect();
});

// Fungsi untuk menangani confirm modal
function showConfirmModal(message, onConfirm) {
    return new Promise((resolve) => {
        confirmResolve = resolve;
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-yes-btn').onclick = () => {
            onConfirm();
            closeConfirmModal();
        };
        showModal('confirm-modal');
    });
}

function closeConfirmModal() {
    closeModal('confirm-modal');
    document.getElementById('confirm-yes-btn').onclick = null; // Reset listener
    if (confirmResolve) {
        confirmResolve();
        confirmResolve = null;
    }
}

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

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(page + '-page').classList.add('active');
    document.querySelector(`[onclick="showPage('${page}')"]`).classList.add('active');
    
    currentPage = page;
    
    if (page === 'products') {
        loadProductsTable();
    } else if (page === 'history') {
        loadHistoryData();
    } else if (page === 'fotocopy-expenses') {
        loadExpensesData();
    }
}

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

async function loadProducts() {
    try {
        products.atk = await ipcRenderer.invoke('db-get-products', 'atk');
        products.makmin = await ipcRenderer.invoke('db-get-products', 'makmin');
        allProducts = [...products.atk, ...products.makmin];
        
        updateProductLists();
        populateStockSelect();
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

function searchProductsTable() {
    console.log('Mencari di tabel produk');
    const searchTerm = document.getElementById('product-search').value.toLowerCase();
    const currentProducts = products[currentProductTab] || [];
    const filtered = currentProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.code.toLowerCase().includes(searchTerm)
    );
    console.log(`Produk ditemukan di tabel: ${filtered.length}`);
    renderProductsTable(filtered);
}

function renderProductsTable(productsToRender) {
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = '';
    
    productsToRender.forEach(product => {
        const totalModal = product.purchase_price * product.stock;
        const profitPerItem = product.selling_price - product.purchase_price;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.code}</td>
            <td>${product.name}</td>
            <td>Rp ${formatNumber(product.purchase_price)}</td>
            <td>Rp ${formatNumber(totalModal)}</td>
            <td>Rp ${formatNumber(product.selling_price)}</td>
            <td>Rp ${formatNumber(profitPerItem)}</td>
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
    toggleCashInput();
    
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
        document.getElementById('payment-received').value = total;
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
        
        for (const item of cart.atk) {
            await ipcRenderer.invoke('db-update-stock', item.id, -item.quantity);
        }
        
        for (const item of cart.makmin) {
            await ipcRenderer.invoke('db-update-stock', item.id, -item.quantity);
        }
        
        cart.atk = [];
        cart.makmin = [];
        cart.fotocopy = [];
        
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

function showAddStockModal() {
    document.getElementById('stock-search').value = '';
    document.getElementById('stock-product-select').value = '';
    document.getElementById('stock-add-amount').value = '';
    populateStockSelect();
    showModal('add-stock-modal');
    setTimeout(() => {
        document.getElementById('stock-search').focus();
    }, 100);
}

async function addStock() {
    const productId = parseInt(document.getElementById('stock-product-select').value);
    const amount = parseInt(document.getElementById('stock-add-amount').value) || 0;
    
    if (!productId || amount <= 0) {
        showNotification('Pilih produk dan masukkan jumlah yang valid', 'warning');
        return;
    }
    
    try {
        await ipcRenderer.invoke('db-update-stock', productId, amount);
        showNotification('Stok berhasil ditambahkan', 'success');
        closeModal('add-stock-modal');
        await loadProducts();
        if (currentPage === 'products') {
            loadProductsTable();
        }
    } catch (error) {
        console.error('Error adding stock:', error);
        showNotification('Error menambah stok', 'error');
    }
}

function showAddProductModal() {
    isEditMode = false;
    editingProductId = null;
    document.getElementById('product-modal-title').textContent = 'Tambah Barang';
    document.getElementById('product-form').reset();
    document.getElementById('product-type').value = currentProductTab;
    showModal('product-modal');
    setTimeout(() => {
        document.getElementById('product-name').focus();
    }, 100);
}

function showEditProductModal(product) {
    isEditMode = true;
    editingProductId = product.id;
    document.getElementById('product-modal-title').textContent = 'Edit Barang';
    
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-type').value = product.type;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-purchase-price').value = product.purchase_price;
    document.getElementById('product-selling-price').value = product.selling_price;
    document.getElementById('product-stock').value = product.stock;
    
    showModal('product-modal');
    setTimeout(() => {
        document.getElementById('product-name').focus();
    }, 100);
}

async function saveProduct() {
    const productData = {
        name: document.getElementById('product-name').value.trim(),
        type: document.getElementById('product-type').value,
        purchase_price: parseFloat(document.getElementById('product-purchase-price').value) || 0,
        selling_price: parseFloat(document.getElementById('product-selling-price').value) || 0,
        stock: parseInt(document.getElementById('product-stock').value) || 0
    };
    
    if (!productData.name || productData.selling_price <= 0) {
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
        setTimeout(() => {
            document.getElementById('product-search').focus();
        }, 100);
    } catch (error) {
        console.error('Error saving product:', error);
        showNotification('Error menyimpan produk', 'error');
    }
}

async function deleteProduct(id) {
    await showConfirmModal('Yakin ingin menghapus produk ini?', async () => {
        try {
            await ipcRenderer.invoke('db-delete-product', id);
            showNotification('Produk berhasil dihapus', 'success');
            await loadProducts();
            loadProductsTable();
            populateStockSelect();
            setTimeout(() => {
                document.getElementById('product-search').focus();
                document.body.style.display = 'none';
                document.body.offsetHeight;
                document.body.style.display = 'block';
                console.log('Fokus dikembalikan ke product-search');
            }, 100);
        } catch (error) {
            console.error('Error deleting product:', error);
            showNotification('Error menghapus produk: ' + error.message, 'error');
        }
    });
}

async function loadHistoryData() {
    const baseFilters = getHistoryFilters();
    let sales = [];
    
    try {
        if (currentHistoryTab === 'summary') {
            sales = await ipcRenderer.invoke('db-get-sales', baseFilters);
            await loadSummaryData(baseFilters, sales);
        } else if (currentHistoryTab === 'qris' || currentHistoryTab === 'cash') {
            const pmFilters = { ...baseFilters, payment_method: currentHistoryTab };
            sales = await ipcRenderer.invoke('db-get-sales', pmFilters);
            await loadSalesData(null, pmFilters, sales);
        } else if (currentHistoryTab === 'fotocopy') {
            const typeFilters = { ...baseFilters, type: 'fotocopy' };
            sales = await ipcRenderer.invoke('db-get-sales', typeFilters);
            await loadFotocopyData(typeFilters, sales);
        } else {
            const typeFilters = { ...baseFilters, type: currentHistoryTab };
            sales = await ipcRenderer.invoke('db-get-sales', typeFilters);
            await loadSalesData(currentHistoryTab, typeFilters, sales);
        }
        
        filteredSales = sales;
        searchHistory();
        
    } catch (error) {
        console.error('Error loading history:', error);
        showNotification('Error loading history data', 'error');
    }
}

function searchHistory() {
    const searchTerm = document.getElementById('history-search').value.toLowerCase();
    let salesToShow = filteredSales;

    if (searchTerm) {
        if (currentHistoryTab === 'fotocopy') {
            let filteredItems = [];
            salesToShow.forEach(sale => {
                sale.items.forEach(item => {
                    if ((item.type === 'fotocopy' || item.type === 'print-color') &&
                        (item.name.toLowerCase().includes(searchTerm) ||
                         item.total.toString().toLowerCase().includes(searchTerm) ||
                         sale.created_at.toLowerCase().includes(searchTerm))) {
                        filteredItems.push({ ...item, saleDate: sale.created_at, paymentMethod: sale.payment_method, saleType: sale.type });
                    }
                });
            });
            loadSalesTable(filteredItems);
        } else {
            salesToShow = filteredSales.filter(sale => {
                const itemsText = sale.items.map(item => item.name).join(' ').toLowerCase();
                const totalText = sale.total_amount.toString().toLowerCase();
                const dateText = sale.created_at.toLowerCase();
                return itemsText.includes(searchTerm) || totalText.includes(searchTerm) || dateText.includes(searchTerm);
            });
            loadSalesTable(salesToShow);
        }
    } else {
        loadSalesTable(currentHistoryTab === 'fotocopy' ? flattenFotocopyItems(salesToShow) : salesToShow);
    }
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
        
        document.getElementById('fotocopy-extra').style.display = 'none';
        document.getElementById('print-extra').style.display = 'none';
        document.getElementById('expenses-extra').style.display = 'none';
        
        const cards = document.querySelectorAll('#summary-cards .summary-card .amount');
        cards[0].textContent = `Rp ${formatNumber(totalRevenue)}`;
        cards[1].textContent = `Rp ${formatNumber(totalCost)}`;
        cards[2].textContent = `Rp ${formatNumber(totalProfit)}`;
        cards[3].textContent = totalTransactions.toString();
        
        loadSalesTable(allSales);
        
    } catch (error) {
        console.error('Error loading summary:', error);
        showNotification('Error loading summary data', 'error');
    }
}

async function loadSalesData(type, filters, sales) {
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
    
    document.getElementById('fotocopy-extra').style.display = 'none';
    document.getElementById('print-extra').style.display = 'none';
    document.getElementById('expenses-extra').style.display = 'none';
    
    const cards = document.querySelectorAll('#summary-cards .summary-card .amount');
    cards[0].textContent = `Rp ${formatNumber(totalRevenue)}`;
    cards[1].textContent = `Rp ${formatNumber(totalCost)}`;
    cards[2].textContent = `Rp ${formatNumber(totalProfit)}`;
    cards[3].textContent = totalTransactions.toString();
    
    loadSalesTable(sales);
}

async function loadFotocopyData(filters, sales) {
    let allItems = [];
    let totalFotocopy = 0;
    let totalPrintColor = 0;
    let totalOmset = 0;
    let totalExpenses = 0;
    let totalLaba = 0;

    const expenseSummary = await ipcRenderer.invoke('db-get-expenses-summary', filters);
    totalExpenses = expenseSummary.total_amount || 0;

    sales.forEach(sale => {
        sale.items.forEach(item => {
            if (item.type === 'fotocopy') {
                totalFotocopy += item.total;
                allItems.push({ ...item, saleDate: sale.created_at, paymentMethod: sale.payment_method, saleType: sale.type });
            } else if (item.type === 'print-color') {
                totalPrintColor += item.total;
                allItems.push({ ...item, saleDate: sale.created_at, paymentMethod: sale.payment_method, saleType: sale.type });
            }
        });
    });

    totalOmset = totalFotocopy + totalPrintColor;
    totalLaba = totalOmset - totalExpenses;

    updateSummaryCardsForFotocopy(totalOmset, totalFotocopy, totalPrintColor, totalExpenses, totalLaba);

    loadSalesTable(allItems);
}

function updateSummaryCardsForFotocopy(omset, fotocopy, print, expenses, laba) {
    const cards = document.querySelectorAll('#summary-cards .summary-card .amount');
    cards[0].textContent = `Rp ${formatNumber(omset)}`;
    cards[1].textContent = `Rp 0`;
    cards[2].textContent = `Rp ${formatNumber(laba)}`;
    cards[3].textContent = filteredSales.length.toString();
    
    document.getElementById('fotocopy-extra').style.display = 'block';
    document.getElementById('print-extra').style.display = 'block';
    document.getElementById('expenses-extra').style.display = 'block';
    
    const extraCards = document.querySelectorAll('#summary-cards .summary-card');
    extraCards[4].querySelector('.amount').textContent = `Rp ${formatNumber(fotocopy)}`;
    extraCards[5].querySelector('.amount').textContent = `Rp ${formatNumber(print)}`;
    extraCards[6].querySelector('.amount').textContent = `Rp ${formatNumber(expenses)}`;
}

function flattenFotocopyItems(sales) {
    let allItems = [];
    sales.forEach(sale => {
        sale.items.forEach(item => {
            if (item.type === 'fotocopy' || item.type === 'print-color') {
                allItems.push({ ...item, saleDate: sale.created_at, paymentMethod: sale.payment_method, saleType: sale.type });
            }
        });
    });
    return allItems;
}

function loadSalesTable(itemsOrSales) {
    const tbody = document.querySelector('#history-table tbody');
    tbody.innerHTML = '';
    
    if (currentHistoryTab === 'fotocopy') {
        itemsOrSales.forEach(item => {
            const row = document.createElement('tr');
            const typeLabel = item.type === 'fotocopy' ? 'Fotocopy' : 'Print Warna';
            row.innerHTML = `
                <td>${item.saleDate}</td>
                <td>${typeLabel}</td>
                <td>${item.name}${item.note ? `<br><small>${item.note}</small>` : ''}</td>
                <td>${item.paymentMethod.toUpperCase()}</td>
                <td>Rp ${formatNumber(item.price)}</td>
                <td>${item.quantity}</td>
                <td>Rp ${formatNumber(item.total)}</td>
                <td></td>
            `;
            tbody.appendChild(row);
        });
    } else {
        itemsOrSales.forEach(sale => {
            sale.items.forEach((item, index) => {
                const row = document.createElement('tr');
                const typeLabel = getTypeLabel(sale.type);
                row.innerHTML = `
                    <td>${sale.created_at}</td>
                    <td>${typeLabel}</td>
                    <td>${item.name}${item.note ? `<br><small>${item.note}</small>` : ''}</td>
                    <td>${sale.payment_method.toUpperCase()}</td>
                    <td>Rp ${formatNumber(item.price)}</td>
                    <td>${item.quantity}</td>
                    <td>Rp ${formatNumber(item.total)}</td>
                    <td>
                        ${index === 0 ? `
                            <button class="btn-danger btn-sm" onclick="deleteSale(${sale.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </td>
                `;
                tbody.appendChild(row);
            });
        });
    }
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

async function loadExpensesData() {
    const filters = getExpensesFilters();
    try {
        const expenses = await ipcRenderer.invoke('db-get-expenses', filters);
        const expenseSummary = await ipcRenderer.invoke('db-get-expenses-summary', filters);
        const salesSummary = await ipcRenderer.invoke('db-get-sales-summary', filters);
        
        let totalFotocopy = 0;
        let totalPrintColor = 0;
        let totalOmset = 0;
        let totalExpenses = expenseSummary.total_amount || 0;
        
        salesSummary.forEach(summary => {
            if (summary.type === 'fotocopy') {
                totalFotocopy = summary.total_revenue || 0;
            } else if (summary.type === 'print-color') {
                totalPrintColor = summary.total_revenue || 0;
            }
        });
        
        totalOmset = totalFotocopy + totalPrintColor;
        const totalLaba = totalOmset - totalExpenses;
        
        const cards = document.querySelectorAll('#expenses-summary-cards .summary-card .amount');
        cards[0].textContent = `Rp ${formatNumber(totalOmset)}`;
        cards[1].textContent = `Rp ${formatNumber(totalFotocopy)}`;
        cards[2].textContent = `Rp ${formatNumber(totalPrintColor)}`;
        cards[3].textContent = `Rp ${formatNumber(totalExpenses)}`;
        cards[4].textContent = `Rp ${formatNumber(totalLaba)}`;
        
        filteredExpenses = expenses;
        searchExpenses();
        
    } catch (error) {
        console.error('Error loading expenses:', error);
        showNotification('Error loading expenses data', 'error');
    }
}

function searchExpenses() {
    const searchTerm = document.getElementById('expenses-search').value.toLowerCase();
    const filtered = filteredExpenses.filter(expense =>
        expense.description.toLowerCase().includes(searchTerm) ||
        expense.created_at.toLowerCase().includes(searchTerm)
    );
    
    const tbody = document.querySelector('#expenses-table tbody');
    tbody.innerHTML = '';
    
    filtered.forEach(expense => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${expense.created_at.split(' ')[0]}</td>
            <td>${expense.description}</td>
            <td>Rp ${formatNumber(expense.amount)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-primary btn-sm" onclick="showEditExpenseModal(${expense.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger btn-sm" onclick="deleteExpense(${expense.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function getExpensesFilters() {
    const period = document.getElementById('expenses-period-filter').value;
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
            dateFrom = document.getElementById('expenses-date-from').value;
            dateTo = document.getElementById('expenses-date-to').value;
            break;
        default:
            dateFrom = dateTo = today.toISOString().split('T')[0];
    }
    
    return { date_from: dateFrom, date_to: dateTo };
}

function showAddExpenseModal() {
    document.getElementById('expense-date').valueAsDate = new Date();
    document.getElementById('expense-description').value = '';
    document.getElementById('expense-amount').value = '';
    showModal('add-expense-modal');
    setTimeout(() => {
        document.getElementById('expense-description').focus();
    }, 100);
}

function showEditExpenseModal(id) {
    const expense = filteredExpenses.find(exp => exp.id === id);
    if (!expense) {
        showNotification('Pengeluaran tidak ditemukan', 'error');
        return;
    }
    
    editingExpenseId = id;
    document.getElementById('edit-expense-id').value = id;
    document.getElementById('edit-expense-date').value = expense.created_at.split(' ')[0];
    document.getElementById('edit-expense-description').value = expense.description;
    document.getElementById('edit-expense-amount').value = expense.amount;
    
    showModal('edit-expense-modal');
    setTimeout(() => {
        document.getElementById('edit-expense-description').focus();
    }, 100);
}

async function saveExpense() {
    const expenseData = {
        description: document.getElementById('expense-description').value.trim(),
        amount: parseFloat(document.getElementById('expense-amount').value) || 0,
        created_at: document.getElementById('expense-date').value
    };
    
    if (!expenseData.description || expenseData.amount <= 0) {
        showNotification('Mohon lengkapi semua field', 'warning');
        return;
    }
    
    try {
        await ipcRenderer.invoke('db-add-expense', expenseData);
        showNotification('Pengeluaran berhasil ditambahkan', 'success');
        closeModal('add-expense-modal');
        await loadExpensesData();
    } catch (error) {
        console.error('Error saving expense:', error);
        showNotification('Error menambah pengeluaran', 'error');
    }
}

async function updateExpense() {
    const expenseData = {
        description: document.getElementById('edit-expense-description').value.trim(),
        amount: parseFloat(document.getElementById('edit-expense-amount').value) || 0,
        created_at: document.getElementById('edit-expense-date').value
    };
    
    if (!expenseData.description || expenseData.amount <= 0) {
        showNotification('Mohon lengkapi semua field', 'warning');
        return;
    }
    
    try {
        await ipcRenderer.invoke('db-update-expense', editingExpenseId, expenseData);
        showNotification('Pengeluaran berhasil diupdate', 'success');
        closeModal('edit-expense-modal');
        await loadExpensesData();
    } catch (error) {
        console.error('Error updating expense:', error);
        showNotification('Error mengupdate pengeluaran', 'error');
    }
}

async function deleteExpense(id) {
    await showConfirmModal('Yakin ingin menghapus pengeluaran ini?', async () => {
        try {
            await ipcRenderer.invoke('db-delete-expense', id);
            showNotification('Pengeluaran berhasil dihapus', 'success');
            await loadExpensesData();
            setTimeout(() => {
                document.getElementById('expenses-search').focus();
                document.body.style.display = 'none';
                document.body.offsetHeight;
                document.body.style.display = 'block';
                console.log('Fokus dikembalikan ke expenses-search');
            }, 100);
        } catch (error) {
            console.error('Error deleting expense:', error);
            showNotification('Error menghapus pengeluaran', 'error');
        }
    });
}

async function deleteSale(id) {
    await showConfirmModal('Yakin ingin menghapus penjualan ini?', async () => {
        try {
            await ipcRenderer.invoke('db-delete-sale', id);
            showNotification('Penjualan berhasil dihapus', 'success');
            await loadHistoryData();
            setTimeout(() => {
                document.getElementById('history-search').focus();
                document.body.style.display = 'none';
                document.body.offsetHeight;
                document.body.style.display = 'block';
                console.log('Fokus dikembalikan ke history-search');
            }, 100);
        } catch (error) {
            console.error('Error deleting sale:', error);
            showNotification('Error menghapus penjualan', 'error');
        }
    });
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
    document.getElementById(modalId).style.pointerEvents = 'auto';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    setTimeout(() => {
        const focusElement = modalId === 'product-modal' ? 'product-search' :
                            modalId === 'add-stock-modal' ? 'product-search' :
                            modalId === 'add-expense-modal' ? 'expenses-search' :
                            modalId === 'edit-expense-modal' ? 'expenses-search' :
                            modalId === 'payment-modal' ? 'atk-search' : 'product-search';
        document.getElementById(focusElement).focus();
        console.log(`Fokus dikembalikan ke ${focusElement} setelah menutup modal`);
    }, 100);
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }, 100);
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}