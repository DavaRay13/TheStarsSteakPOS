document.addEventListener('DOMContentLoaded', () => {

    // --- 1. KEAMANAN & INISIALISASI ---
    const token = localStorage.getItem('authToken');
    const role = localStorage.getItem('userRole');
    const userId = localStorage.getItem('userId');
    const username = localStorage.getItem('username');
    const userDisplay = document.getElementById('user-display');

    if (!token || !userId || !username || (role !== 'owner' && role !== 'kasir')) {
        localStorage.clear(); 
        alert('Login Anda bermasalah. Silakan login kembali.');
        window.location.href = 'index.html';
        return; 
    }
    
    userDisplay.textContent = username;
    
    document.getElementById('logout-button').addEventListener('click', () => {
        localStorage.clear();
        alert('Anda berhasil logout.');
        window.location.href = 'index.html';
    });
    
    // --- 2. Variabel Global & Elemen DOM ---
    let appData = {};
    let cart = []; 
    let currentItemForModal = null; 
    let currentPayments = [];
    let currentOrderTotal = 0;
    
    const categoryTabs = document.getElementById('category-tabs');
    const menuGrid = document.getElementById('menu-grid');
    const cartItems = document.getElementById('cart-items');
    const cartSubtotalEl = document.getElementById('cart-subtotal');
    const cartTaxEl = document.getElementById('cart-tax');
    const cartTotalEl = document.getElementById('cart-total');
    const payButton = document.getElementById('pay-button');
    
    // Elemen Modal Modifier
    const modifierModal = document.getElementById('modifier-modal');
    const modalItemName = document.getElementById('modal-item-name');
    const modifierForm = document.getElementById('modifier-form');
    const addToCartButton = document.getElementById('add-to-cart-button');

    // Elemen Modal Pembayaran
    const paymentModal = document.getElementById('payment-modal');
    const paymentTotalDisplay = document.getElementById('payment-total-display');
    const paymentDueDisplay = document.getElementById('payment-due-display');
    const addPaymentForm = document.getElementById('add-payment-form');
    const paymentMethodEl = document.getElementById('payment-method');
    const paymentAmountEl = document.getElementById('payment-amount');
    const paymentList = document.getElementById('payment-list');
    const processCheckoutButton = document.getElementById('process-checkout-button');

    // Tutup Modal
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById(btn.dataset.target).style.display = 'none';
        });
    });

    /**
     * Helper untuk Fetch API
     */
    async function fetchData(url, options = {}) {
        const defaultHeaders = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        options.headers = { ...defaultHeaders, ...options.headers };
        
        const response = await fetch(url, options);
        let responseData;
        try {
            if (response.status === 204 || (options.method === 'DELETE' && response.ok)) {
                return { success: true };
            }
            responseData = await response.json();
        } catch (e) {
            if (response.ok) return { success: true };
            throw new Error(`Invalid JSON response from server: ${e.message}`);
        }
        if (!response.ok) {
            throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
        }
        return responseData;
    }

    /**
     * Inisialisasi: Ambil semua data POS
     */
    async function initializePOS() {
        try {
            appData = await fetchData('/api/pos/data');
            renderCategories();
            renderMenu(); 
        } catch (error) {
            console.error('Error inisialisasi:', error);
            menuGrid.innerHTML = '<p style="color: red;">Error: Gagal memuat data menu. Pastikan server (app.py) sudah di-restart.</p>';
        }
    }
    
    function renderCategories() {
        categoryTabs.innerHTML = ''; 
        const allTab = document.createElement('button');
        allTab.className = 'category-tab active';
        allTab.textContent = 'Semua';
        allTab.dataset.categoryId = 'all';
        categoryTabs.appendChild(allTab);
        
        appData.categories.forEach(cat => {
            const tab = document.createElement('button');
            tab.className = 'category-tab';
            tab.textContent = cat.name;
            tab.dataset.categoryId = cat.id;
            categoryTabs.appendChild(tab);
        });
        
        categoryTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-tab')) {
                categoryTabs.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                renderMenu(e.target.dataset.categoryId);
            }
        });
    }

    function renderMenu(categoryId = 'all') {
        menuGrid.innerHTML = ''; 
        
        const itemsToShow = (categoryId === 'all')
            ? appData.menu_items
            : appData.menu_items.filter(item => item.category_id == categoryId);
            
        if (itemsToShow.length === 0) {
            menuGrid.innerHTML = '<p>Tidak ada menu di kategori ini.</p>';
            return;
        }
            
        itemsToShow.forEach(item => {
            const card = document.createElement('div');
            card.className = 'menu-item-card';
            card.dataset.itemId = item.id;
            card.innerHTML = `
                <h4>${item.name}</h4>
                <span>Rp ${Number(item.base_price).toLocaleString('id-ID')}</span>
            `;
            card.addEventListener('click', () => onMenuItemClick(item.id));
            menuGrid.appendChild(card);
        });
    }
    
    function onMenuItemClick(itemId) {
        const item = appData.menu_items.find(m => m.id == itemId);
        if (!item) return;
        
        const requiredGroupIds = appData.menu_modifier_links
            .filter(link => link.menu_item_id == itemId)
            .map(link => link.modifier_group_id);
            
        if (requiredGroupIds.length > 0) {
            currentItemForModal = item;
            openModifierModal(item, requiredGroupIds);
        } else {
            const cartItem = {
                cartId: Date.now(),
                itemId: item.id,
                name: item.name,
                basePrice: parseFloat(item.base_price), 
                modifiers: [],
                totalPrice: parseFloat(item.base_price) 
            };
            addItemToCart(cartItem);
        }
    }
    
    function openModifierModal(item, groupIds) {
        modalItemName.textContent = `Pilih Opsi untuk ${item.name}`;
        modifierForm.innerHTML = ''; 
        
        const groups = appData.modifier_groups.filter(g => groupIds.includes(g.id));
        
        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'modifier-group-box';
            const isRequired = group.is_required ? 'required' : '';
            const requiredText = group.is_required ? ' (Wajib)' : '';
            groupEl.innerHTML = `<h4>${group.name}${requiredText}</h4>`;
            
            const options = appData.modifiers.filter(m => m.group_id == group.id);
            options.forEach(opt => {
                const inputType = group.is_required ? 'radio' : 'checkbox';
                const optionEl = document.createElement('div');
                optionEl.className = 'modifier-option';
                optionEl.innerHTML = `
                    <input type="${inputType}" id="mod-${opt.id}" name="group-${group.id}" value="${opt.id}" data-price="${opt.additional_price}" data-name="${opt.name}" ${isRequired}>
                    <label for="mod-${opt.id}">
                        ${opt.name}
                        ${opt.additional_price > 0 ? `<span class="modifier-price">(+Rp ${Number(opt.additional_price).toLocaleString('id-ID')})</span>` : ''}
                    </label>
                `;
                groupEl.appendChild(optionEl);
            });
            modifierForm.appendChild(groupEl);
        });
        
        modifierModal.style.display = 'flex';
    }
    
    addToCartButton.addEventListener('click', () => {
        const formData = new FormData(modifierForm);
        let selectedModifiers = [];
        let additionalPrice = 0;
        
        for (const group of appData.modifier_groups.filter(g => g.is_required)) {
            const link = appData.menu_modifier_links.find(l => l.menu_item_id == currentItemForModal.id && l.modifier_group_id == group.id);
            if(link && !formData.has(`group-${group.id}`)) {
                alert(`Pilihan "${group.name}" wajib diisi.`);
                return;
            }
        }
        
        modifierForm.querySelectorAll('input:checked').forEach(input => {
            const price = parseFloat(input.dataset.price);
            selectedModifiers.push({
                id: input.value,
                name: input.dataset.name,
                price: price
            });
            additionalPrice += price;
        });
        
        const item = currentItemForModal;
        const cartItem = {
            cartId: Date.now(),
            itemId: item.id,
            name: item.name,
            basePrice: parseFloat(item.base_price),
            modifiers: selectedModifiers,
            totalPrice: parseFloat(item.base_price) + additionalPrice
        };
        
        addItemToCart(cartItem);
        modifierModal.style.display = 'none'; 
        currentItemForModal = null; 
    });

    function addItemToCart(item) {
        cart.push(item);
        renderCart();
    }
    
    cartItems.addEventListener('click', (e) => {
        if(e.target.classList.contains('cart-item-remove')) {
            const cartId = parseInt(e.target.dataset.cartId);
            cart = cart.filter(item => item.cartId !== cartId);
            renderCart();
        }
    });

    function renderCart() {
        if (cart.length === 0) {
            cartItems.innerHTML = '<p class="cart-empty">Keranjang kosong</p>';
            payButton.disabled = true;
        } else {
            cartItems.innerHTML = ''; 
            cart.forEach(item => {
                let modifiersHtml = '';
                if (item.modifiers.length > 0) {
                    modifiersHtml = '<ul class="modifiers-list">';
                    item.modifiers.forEach(mod => {
                        modifiersHtml += `<li>- ${mod.name} ${mod.price > 0 ? `(+${mod.price.toLocaleString('id-ID')})` : ''}</li>`;
                    });
                    modifiersHtml += '</ul>';
                }
                
                const itemEl = document.createElement('div');
                itemEl.className = 'cart-item';
                itemEl.innerHTML = `
                    <div class="cart-item-details">
                        <h5>${item.name}</h5>
                        ${modifiersHtml}
                        <button class="cart-item-remove" data-cart-id="${item.cartId}">Hapus</button>
                    </div>
                    <span class="cart-item-price">Rp ${Number(item.totalPrice).toLocaleString('id-ID')}</span>
                `;
                cartItems.appendChild(itemEl);
            });
            payButton.disabled = false;
        }
        updateCartSummary();
    }
    
    function updateCartSummary() {
        const subtotal = cart.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0);
        
        const tax = subtotal * 0.11; 
        currentOrderTotal = subtotal + tax; 
        
        cartSubtotalEl.textContent = `Rp ${subtotal.toLocaleString('id-ID')}`;
        cartTaxEl.textContent = `Rp ${tax.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
        cartTotalEl.textContent = `Rp ${currentOrderTotal.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
    }
    
    // ==========================================================
    // --- LOGIKA PEMBAYARAN ---
    // ==========================================================
    
    payButton.addEventListener('click', () => {
        paymentTotalDisplay.textContent = `Rp ${currentOrderTotal.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
        currentPayments = []; 
        renderPaymentList();
        paymentModal.style.display = 'flex';
    });
    
    addPaymentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const method = paymentMethodEl.value;
        let amount = parseFloat(paymentAmountEl.value);
        
        const totalPaid = currentPayments.reduce((sum, p) => sum + p.amount, 0);
        const remainingDue = currentOrderTotal - totalPaid;
        
        if (isNaN(amount) || amount <= 0) {
            amount = remainingDue;
        }
        
        if (amount > remainingDue + 0.01) { 
            alert('Jumlah bayar melebihi sisa tagihan.');
            return;
        }
        
        currentPayments.push({ method, amount });
        renderPaymentList();
        paymentAmountEl.value = ''; 
    });
    
    function renderPaymentList() {
        paymentList.innerHTML = '';
        let totalPaid = 0;
        
        currentPayments.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${p.method}</span>
                <span>Rp ${p.amount.toLocaleString('id-ID')}</span>
            `;
            paymentList.appendChild(li);
            totalPaid += p.amount;
        });
        
        const remainingDue = currentOrderTotal - totalPaid;
        
        paymentDueDisplay.textContent = `Sisa: Rp ${remainingDue.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
        
        if (remainingDue <= 0.01) { 
            paymentDueDisplay.textContent = 'LUNAS';
            paymentDueDisplay.classList.remove('text-danger');
            processCheckoutButton.disabled = false;
        } else {
            paymentDueDisplay.classList.add('text-danger');
            processCheckoutButton.disabled = true;
        }
    }
    
    processCheckoutButton.addEventListener('click', async () => {
        const payload = {
            user_id: userId,
            cart: cart,
            payments: currentPayments,
            summary: {
                subtotal: cart.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0),
                tax: currentOrderTotal - cart.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0),
                total: currentOrderTotal
            }
        };

        try {
            processCheckoutButton.disabled = true;
            processCheckoutButton.textContent = 'Memproses...';
            
            const result = await fetchData('/api/checkout', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            alert(`Transaksi berhasil! Order ID: ${result.order_id}`);
            
            cart = [];
            currentPayments = [];
            renderCart();
            paymentModal.style.display = 'none';
            
        } catch (error) {
            console.error('Checkout Error:', error);
            alert(`Gagal checkout: ${error.message}`);
        } finally {
            processCheckoutButton.disabled = false;
            processCheckoutButton.textContent = 'Selesaikan Transaksi';
        }
    });

    
    // --- Inisialisasi ---
    initializePOS();

});