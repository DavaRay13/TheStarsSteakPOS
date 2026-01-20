document.addEventListener('DOMContentLoaded', () => {

    // --- 1. KEAMANAN ---
    const token = localStorage.getItem('authToken');
    const role = localStorage.getItem('userRole');

    if (!token || role !== 'owner') {
        localStorage.clear();
        alert('Anda harus login sebagai Owner untuk mengakses halaman ini.');
        window.location.href = 'index.html';
        return; 
    }
    
    // Variabel global untuk cache
    let allMaterials = [];
    let allMenus = [];
    let allModifierGroups = []; 

    // --- 2. FUNGSI LOGOUT ---
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.clear(); 
            alert('Anda berhasil logout.');
            window.location.href = 'index.html';
        });
    }

    // --- 3. FUNGSI NAVIGASI TAB (Sidebar) ---
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            const targetId = link.getAttribute('data-target');
            
            navLinks.forEach(nav => nav.classList.remove('active'));
            contentSections.forEach(sec => sec.classList.remove('active'));
            
            link.classList.add('active');
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'content-laporan') {
                loadAllReports();
            }
            if (targetId === 'content-dashboard') {
                loadDashboardSummary();
            }
            if (targetId === 'content-users') {
                loadUsers();
            }
            if (targetId === 'content-menu') {
                loadCategories(); 
                loadMenu(); // (BARU) Muat ulang menu juga
            }
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
                const text = await response.text();
                return text ? JSON.parse(text) : { success: true };
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

    // ==========================================================
    // --- 4. LOGIKA MANAJEMEN KATEGORI & MENU ---
    // ==========================================================
    
    const categoryTableBody = document.getElementById('category-table-body');
    const addCategoryForm = document.getElementById('add-category-form');
    
    const menuTableBody = document.getElementById('menu-table-body');
    const addMenuForm = document.getElementById('add-menu-form');
    const addCategorySelect = document.getElementById('menu-category');
    
    const editMenuModal = document.getElementById('edit-menu-modal');
    const editMenuForm = document.getElementById('edit-menu-form');
    const editMenuId = document.getElementById('edit-menu-id');
    const editMenuName = document.getElementById('edit-menu-name');
    const editMenuPrice = document.getElementById('edit-menu-price');
    const editCategorySelect = document.getElementById('edit-menu-category');
    
    const editStockModal = document.getElementById('edit-stock-modal');
    const editStockForm = document.getElementById('edit-stock-form');
    const editStockId = document.getElementById('edit-stock-id');
    const editMaterialName = document.getElementById('edit-material-name');
    const editMaterialUnit = document.getElementById('edit-material-unit');
    const editMaterialAlert = document.getElementById('edit-material-alert');

    const addStockModal = document.getElementById('add-stock-modal');
    const addStockQuantityForm = document.getElementById('add-stock-quantity-form');
    const addStockId = document.getElementById('add-stock-id');
    const addStockItemName = document.getElementById('add-stock-item-name');

    const menuSelectForLinking = document.getElementById('menu-select-linking');

    // Tutup Modal (Global)
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal-overlay').style.display = 'none';
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    async function loadCategories() {
        try {
            const categories = await fetchData('/api/categories');
            
            addCategorySelect.innerHTML = '<option value="">Pilih Kategori</option>'; 
            editCategorySelect.innerHTML = '<option value="">Pilih Kategori</option>';
            categoryTableBody.innerHTML = '';
            
            if (categories.length === 0) {
                 categoryTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Belum ada kategori.</td></tr>';
            }

            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                addCategorySelect.appendChild(option.cloneNode(true));
                editCategorySelect.appendChild(option);
                
                const row = `
                    <tr>
                        <td>${cat.id}</td>
                        <td>${cat.name}</td>
                        <td>
                            <button class="btn-delete" data-id="${cat.id}" data-type="category">Hapus</button>
                        </td>
                    </tr>
                `;
                categoryTableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch (error) { 
            console.error('Error loadCategories:', error); 
            categoryTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Gagal memuat kategori.</td></tr>';
        }
    }

    if (addCategoryForm) {
        addCategoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('category-name').value;
            try {
                await fetchData('/api/categories', {
                    method: 'POST',
                    body: JSON.stringify({ name })
                });
                alert('Kategori baru berhasil ditambahkan!');
                addCategoryForm.reset();
                await loadCategories(); 
            } catch(e) {
                alert(`Gagal menambah kategori: ${e.message}`);
            }
        });
    }

    async function loadMenu() {
        try {
            allMenus = await fetchData('/api/menu'); 
            menuTableBody.innerHTML = ''; 
            menuSelectForLinking.innerHTML = '<option value="">Pilih Menu...</option>';
            
            if (allMenus.length === 0) {
                menuTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Belum ada menu.</td></tr>';
                return;
            }

            allMenus.forEach(item => {
                const rowClass = item.is_available ? '' : 'archived';
                const row = `
                    <tr class="${rowClass}">
                        <td>${item.id}</td>
                        <td>${item.name} ${item.is_available ? '' : '(Diarsipkan)'}</td>
                        <td>Rp ${Number(item.base_price).toLocaleString('id-ID')}</td>
                        <td>${item.category_name || 'N/A'}</td>
                        <td>
                            <button class="btn-edit" data-id="${item.id}" data-type="menu">Edit & Resep</button>
                            ${item.is_available ? `<button class="btn-delete" data-id="${item.id}" data-type="menu">Arsipkan</button>` : 'Diarsipkan'}
                        </td>
                    </tr>
                `;
                menuTableBody.insertAdjacentHTML('beforeend', row);
                
                if (item.is_available) {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.name;
                    menuSelectForLinking.appendChild(option);
                }
            });
        } catch (error) {
            console.error('Error loadMenu:', error);
            menuTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Gagal memuat menu.</td></tr>';
        }
    }

    if (addMenuForm) {
        addMenuForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const name = document.getElementById('menu-name').value;
            const price = document.getElementById('menu-price').value;
            const category_id = addCategorySelect.value;
            try {
                await fetchData('/api/menu', {
                    method: 'POST',
                    body: JSON.stringify({ name, price, category_id })
                });
                alert('Menu baru berhasil ditambahkan!');
                addMenuForm.reset(); 
                await loadMenu(); 
            } catch (error) { alert(`Gagal menambah menu: ${error.message}`); }
        });
    }

    if (editMenuForm) {
        editMenuForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = editMenuId.value;
            const updatedData = { name: editMenuName.value, price: editMenuPrice.value, category_id: editCategorySelect.value };
            try {
                await fetchData(`/api/menu/${id}`, { method: 'PUT', body: JSON.stringify(updatedData) });
                alert('Menu berhasil diperbarui!');
                await loadMenu(); 
            } catch (error) { alert(`Gagal memperbarui menu: ${error.message}`); }
        });
    }

    // ==========================================================
    // --- 5. LOGIKA MANAJEMEN STOK ---
    // ==========================================================
    
    const stockTableBody = document.getElementById('stock-table-body');
    const addStockForm = document.getElementById('add-stock-form');
    const recipeMaterialSelect = document.getElementById('recipe-material-select'); 

    async function loadMaterials() {
        try {
            allMaterials = await fetchData('/api/materials'); 
            stockTableBody.innerHTML = ''; 
            recipeMaterialSelect.innerHTML = '<option value="">Pilih bahan...</option>';
            
            if (allMaterials.length === 0) {
                stockTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Belum ada bahan baku.</td></tr>';
                return;
            }

            allMaterials.forEach(mat => {
                const stockClass = mat.current_stock <= mat.alert_threshold ? 'text-danger' : '';
                const row = `
                    <tr>
                        <td>${mat.id}</td>
                        <td>${mat.name}</td>
                        <td class="${stockClass}">${mat.current_stock}</td>
                        <td>${mat.unit}</td>
                        <td>${mat.alert_threshold}</td>
                        <td>
                            <button class="btn-add-stock" data-id="${mat.id}" data-name="${mat.name}">+ Stok</button>
                            <button class="btn-edit" data-id="${mat.id}" data-type="material">Edit</button>
                            <button class="btn-delete" data-id="${mat.id}" data-type="material">Hapus</button>
                        </td>
                    </tr>
                `;
                stockTableBody.insertAdjacentHTML('beforeend', row);
                
                const option = document.createElement('option');
                option.value = mat.id;
                option.textContent = `${mat.name} (${mat.unit})`;
                recipeMaterialSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loadMaterials:', error);
            stockTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Gagal memuat bahan baku.</td></tr>';
        }
    }

    if (addStockForm) {
        addStockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('material-name').value;
            const unit = document.getElementById('material-unit').value;
            const current_stock = document.getElementById('material-stock').value;
            const alert_threshold = document.getElementById('material-alert').value;
            try {
                await fetchData('/api/materials', {
                    method: 'POST',
                    body: JSON.stringify({ name, unit, current_stock, alert_threshold })
                });
                alert('Bahan baku baru berhasil ditambahkan!');
                addStockForm.reset();
                await loadMaterials(); 
            } catch (error) { alert(`Gagal menambah bahan baku: ${error.message}`); }
        });
    }
    
    if (editStockForm) {
        editStockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = editStockId.value;
            const data = {
                name: editMaterialName.value,
                unit: editMaterialUnit.value,
                alert_threshold: editMaterialAlert.value
            };
            try {
                await fetchData(`/api/materials/${id}`, { method: 'PUT', body: JSON.stringify(data) });
                alert('Bahan baku berhasil diupdate!');
                editStockModal.style.display = 'none';
                await loadMaterials();
            } catch(e) {
                alert(`Gagal update: ${e.message}`);
            }
        });
    }

    if (addStockQuantityForm) {
        addStockQuantityForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = addStockId.value;
            const quantity = document.getElementById('add-stock-quantity').value;
            try {
                await fetchData('/api/materials/stock', {
                    method: 'POST',
                    body: JSON.stringify({ material_id: id, quantity: quantity })
                });
                alert('Stok berhasil diupdate!');
                addStockModal.style.display = 'none';
                addStockQuantityForm.reset();
                await loadMaterials();
            } catch(e) {
                alert(`Gagal update stok: ${e.message}`);
            }
        });
    }


    // ==========================================================
    // --- 6. LOGIKA MANAJEMEN RESEP (di Modal) ---
    // ==========================================================
    
    const addRecipeForm = document.getElementById('add-recipe-form');
    const recipeTableBody = document.getElementById('recipe-table-body');
    const recipeMenuName = document.getElementById('recipe-menu-name');

    async function loadRecipeForMenu(menuId) {
        try {
            const recipeItems = await fetchData(`/api/menu/${menuId}/recipe`);
            recipeTableBody.innerHTML = ''; 
            if (recipeItems.length === 0) {
                recipeTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Resep masih kosong.</td></tr>';
                return;
            }
            recipeItems.forEach(item => {
                const row = `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.quantity_used}</td>
                        <td>${item.unit}</td>
                        <td>
                            <button class="btn-delete" data-id="${item.id}" data-type="recipe">Hapus</button>
                        </td>
                    </tr>
                `;
                recipeTableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch (error) { recipeTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Gagal memuat resep.</td></tr>'; }
    }

    if (addRecipeForm) {
        addRecipeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const menuId = editMenuId.value; 
            const material_id = document.getElementById('recipe-material-select').value;
            const quantity = document.getElementById('recipe-quantity').value;
            if (!menuId || !material_id || !quantity) {
                alert('Pilih bahan baku dan isi jumlahnya.');
                return;
            }
            try {
                await fetchData(`/api/menu/${menuId}/recipe`, {
                    method: 'POST',
                    body: JSON.stringify({ material_id, quantity })
                });
                document.getElementById('recipe-material-select').value = '';
                document.getElementById('recipe-quantity').value = '';
                await loadRecipeForMenu(menuId); 
            } catch (error) { alert(`Gagal menambah resep: ${error.message}`); }
        });
    }

    // ==========================================================
    // --- 7. LOGIKA MANAJEMEN MODIFIER ---
    // ==========================================================

    const addGroupForm = document.getElementById('add-group-form');
    const addModifierForm = document.getElementById('add-modifier-form');
    const modifierGroupSelect = document.getElementById('modifier-group-select'); 
    const modifierLinkingArea = document.getElementById('modifier-linking-area');
    const modifierGroupCheckboxes = document.getElementById('modifier-group-checkboxes'); 
    const selectedMenuName = document.getElementById('selected-menu-name');
    const saveMenuModifiersBtn = document.getElementById('save-menu-modifiers');
    const existingModifiersList = document.getElementById('existing-modifiers-list');
    
    function renderModifierList(groups) {
        if (!existingModifiersList) return;
        
        existingModifiersList.innerHTML = ''; 
        if (groups.length === 0) {
            existingModifiersList.innerHTML = '<p>Belum ada grup modifier.</p>';
            return;
        }

        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'modifier-group-item';
            
            let headerHtml = `
                <div class.="modifier-group-header">
                    <span>${group.name} ${group.is_required ? '(Wajib)' : ''}</span>
                    <button class="btn-delete" data-id="${group.id}" data-type="modifier-group">Hapus Grup</button>
                </div>
            `;
            
            let modifiersHtml = '<ul>';
            if (group.modifiers.length > 0) {
                group.modifiers.forEach(mod => {
                    modifiersHtml += `
                        <li class="modifier-item">
                            <span>${mod.name} (+Rp ${Number(mod.additional_price).toLocaleString('id-ID')})</span>
                            <button class="btn-delete" data-id="${mod.id}" data-type="modifier">Hapus</button>
                        </li>
                    `;
                });
            } else {
                modifiersHtml += '<li style="font-size: 0.9rem; color: #777; list-style: none; padding-left: 15px;">Belum ada pilihan.</li>';
            }
            modifiersHtml += '</ul>';
            
            groupEl.innerHTML = headerHtml + modifiersHtml;
            existingModifiersList.appendChild(groupEl);
        });
    }

    async function loadModifierGroups() {
        try {
            allModifierGroups = await fetchData('/api/modifiers/groups/full'); 
            modifierGroupSelect.innerHTML = '<option value="">Pilih Grup</option>';
            modifierGroupCheckboxes.innerHTML = ''; 
            
            allModifierGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                modifierGroupSelect.appendChild(option);
                
                const div = document.createElement('div');
                div.className = 'checkbox-group';
                div.innerHTML = `
                    <input type="checkbox" id="group-${group.id}" value="${group.id}">
                    <label for="group-${group.id}">${group.name}</label>
                `;
                modifierGroupCheckboxes.appendChild(div);
            });
            
            renderModifierList(allModifierGroups);

        } catch(e) {
            console.error("Gagal load modifier groups", e);
            if (existingModifiersList) existingModifiersList.innerHTML = '<p>Gagal memuat daftar.</p>';
        }
    }
    
    if (addGroupForm) {
        addGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('group-name').value;
            const is_required = document.getElementById('group-is-required').checked;
            try {
                await fetchData('/api/modifiers/groups', {
                    method: 'POST',
                    body: JSON.stringify({ name, is_required })
                });
                alert('Grup baru berhasil dibuat!');
                addGroupForm.reset();
                document.getElementById('group-is-required').checked = true;
                await loadModifierGroups(); 
            } catch(e) { alert(`Gagal membuat grup: ${e.message}`); }
        });
    }
    
    if (addModifierForm) {
        addModifierForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const group_id = modifierGroupSelect.value;
            const name = document.getElementById('modifier-name').value;
            const additional_price = document.getElementById('modifier-price').value;
            try {
                await fetchData('/api/modifiers', {
                    method: 'POST',
                    body: JSON.stringify({ group_id, name, additional_price })
                });
                alert('Pilihan baru berhasil dibuat!');
                addModifierForm.reset();
                await loadModifierGroups(); 
            } catch(e) { alert(`Gagal membuat pilihan: ${e.message}`); }
        });
    }

    if (menuSelectForLinking) {
        menuSelectForLinking.addEventListener('change', async (e) => {
            const menuId = e.target.value;
            if (!menuId) {
                modifierLinkingArea.style.display = 'none';
                return;
            }
            const menu = allMenus.find(m => m.id == menuId);
            selectedMenuName.textContent = `"${menu.name}"`;
            const linkedGroupIds = await fetchData(`/api/menu/${menuId}/modifiers`);
            modifierGroupCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = linkedGroupIds.includes(parseInt(checkbox.value));
            });
            modifierLinkingArea.style.display = 'block';
        });
    }
    
    if (saveMenuModifiersBtn) {
        saveMenuModifiersBtn.addEventListener('click', async () => {
            const menuId = menuSelectForLinking.value;
            if (!menuId) return;
            const group_ids = Array.from(modifierGroupCheckboxes.querySelectorAll('input[type="checkbox"]:checked'))
                                 .map(cb => parseInt(cb.value));
            try {
                await fetchData(`/api/menu/${menuId}/modifiers`, {
                    method: 'POST',
                    body: JSON.stringify({ group_ids })
                });
                alert('Link modifier untuk menu berhasil disimpan!');
                menuSelectForLinking.value = '';
                modifierLinkingArea.style.display = 'none';
            } catch (e) { alert(`Gagal menyimpan link: ${e.message}`); }
        });
    }

    // ==========================================================
    // --- 8. LOGIKA LAPORAN ---
    // ==========================================================
    const summaryOmzet = document.getElementById('summary-omzet');
    const summaryTransaksi = document.getElementById('summary-transaksi');
    const reportBestSellingTable = document.getElementById('report-best-selling-table');
    const reportStockAlertTable = document.getElementById('report-stock-alert-table');
    const reportCashierTable = document.getElementById('report-cashier-table');
    
    async function loadDashboardSummary() {
        try {
            const data = await fetchData('/api/reports/daily_summary');
            summaryOmzet.textContent = `Rp ${Number(data.total_omzet || 0).toLocaleString('id-ID')}`;
            summaryTransaksi.textContent = `${data.total_transaksi || 0} Transaksi`;
        } catch(e) {
            console.error('Error load summary:', e);
            summaryOmzet.textContent = 'Gagal';
            summaryTransaksi.textContent = 'Gagal';
        }
    }

    async function loadAllReports() {
        await loadBestSelling();
        await loadStockAlert();
        await loadSalesByCashier(); 
    }

    async function loadBestSelling() {
        try {
            const data = await fetchData('/api/reports/best_selling');
            reportBestSellingTable.innerHTML = '';
            if (data.length === 0) {
                reportBestSellingTable.innerHTML = '<tr><td colspan="2" style="text-align: center;">Belum ada data penjualan.</td></tr>';
                return;
            }
            data.forEach(item => {
                const row = `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.total_terjual}</td>
                    </tr>
                `;
                reportBestSellingTable.insertAdjacentHTML('beforeend', row);
            });
        } catch (e) {
            console.error('Error load best selling:', e);
            reportBestSellingTable.innerHTML = '<tr><td colspan="2" style="text-align: center;">Gagal memuat laporan.</td></tr>';
        }
    }

    async function loadStockAlert() {
        try {
            const data = await fetchData('/api/reports/stock_alert');
            reportStockAlertTable.innerHTML = '';
            if (data.length === 0) {
                reportStockAlertTable.innerHTML = '<tr><td colspan="3" style="text-align: center;">Semua stok aman.</td></tr>';
                return;
            }
            data.forEach(item => {
                const row = `
                    <tr>
                        <td class="text-danger">${item.name}</td>
                        <td class="text-danger">${item.current_stock} ${item.unit}</td>
                        <td>${item.alert_threshold} ${item.unit}</td>
                    </tr>
                `;
                reportStockAlertTable.insertAdjacentHTML('beforeend', row);
            });
        } catch (e) {
            console.error('Error load stock alert:', e);
            reportStockAlertTable.innerHTML = '<tr><td colspan="3" style="text-align: center;">Gagal memuat laporan.</td></tr>';
        }
    }
    
    async function loadSalesByCashier() {
        try {
            const data = await fetchData('/api/reports/sales_by_cashier');
            reportCashierTable.innerHTML = '';
            if (data.length === 0) {
                reportCashierTable.innerHTML = '<tr><td colspan="3" style="text-align: center;">Belum ada penjualan hari ini.</td></tr>';
                return;
            }
            data.forEach(item => {
                const row = `
                    <tr>
                        <td>${item.username}</td>
                        <td>${item.total_transaksi}</td>
                        <td>Rp ${Number(item.total_omzet || 0).toLocaleString('id-ID')}</td>
                    </tr>
                `;
                reportCashierTable.insertAdjacentHTML('beforeend', row);
            });
        } catch (e) {
            console.error('Error load sales by cashier:', e);
            reportCashierTable.innerHTML = '<tr><td colspan="3" style="text-align: center;">Gagal memuat laporan.</td></tr>';
        }
    }
    
    
    // ==========================================================
    // --- 9. LOGIKA MANAJEMEN USER ---
    // ==========================================================
    
    const addUserForm = document.getElementById('add-user-form');
    const usersTableBody = document.getElementById('users-table-body');
    
    async function loadUsers() {
        try {
            // (PERBAIKAN) API akan HANYA mengirim user yang aktif
            const users = await fetchData('/api/users');
            usersTableBody.innerHTML = '';
            if (users.length === 0) {
                usersTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Belum ada user kasir aktif.</td></tr>';
                return;
            }
            users.forEach(user => {
                const row = `
                    <tr>
                        <td>${user.id}</td>
                        <td>${user.username}</td>
                        <td>${user.role}</td>
                        <td>
                            <button class="btn-delete" data-id="${user.id}" data-type="user">Nonaktifkan</button>
                        </td>
                    </tr>
                `;
                usersTableBody.insertAdjacentHTML('beforeend', row);
            });
        } catch(e) {
            console.error('Error load users:', e);
            usersTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Gagal memuat user.</td></tr>';
        }
    }
    
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('user-username').value;
            const password = document.getElementById('user-password').value;
            const role = document.getElementById('user-role').value;
            
            try {
                await fetchData('/api/users', {
                    method: 'POST',
                    body: JSON.stringify({ username, password, role })
                });
                alert('User baru berhasil ditambahkan!');
                addUserForm.reset();
                await loadUsers(); 
            } catch(e) {
                alert(`Gagal menambah user: ${e.message}`);
            }
        });
    }


    // ==========================================================
    // --- 10. EVENT LISTENER GLOBAL (FINAL) ---
    // ==========================================================
    
    document.querySelector('body').addEventListener('click', async (e) => {
        const target = e.target;
        
        // --- 1. Logika Tutup Modal ---
        const modal = target.closest('.modal-overlay');
        if(target.classList.contains('modal-close')) {
             target.closest('.modal-overlay').style.display = 'none';
             return;
        }
        if(target.classList.contains('modal-overlay')) {
            target.style.display = 'none';
            return;
        }
        
        // --- 2. Logika Tombol + Stok ---
        if (target.classList.contains('btn-add-stock')) {
            if (!target.closest('#add-recipe-form')) {
                const id = target.getAttribute('data-id');
                const name = target.getAttribute('data-name');
                
                addStockId.value = id;
                addStockItemName.textContent = name;
                addStockModal.style.display = 'flex';
                return;
            }
        }

        // --- 3. Logika Tombol Edit & Hapus (Butuh data-id & data-type) ---
        const id = target.getAttribute('data-id');
        const type = target.getAttribute('data-type');
        if (!id || !type) return; 

        // --- Logika HAPUS / NONAKTIFKAN ---
        if (target.classList.contains('btn-delete')) {
            let confirmMessage = `Anda yakin ingin menghapus ${type} ID ${id}?`;
            let url = '';

            if (type === 'recipe') {
                confirmMessage = 'Anda yakin ingin menghapus bahan ini dari resep?';
                url = `/api/recipe/${id}`;
            } else if (type === 'modifier-group') {
                confirmMessage = 'YAKIN HAPUS GRUP INI? Semua pilihan di dalamnya & link ke menu akan ikut terhapus.';
                url = `/api/modifiers/groups/${id}`;
            } else if (type === 'modifier') {
                confirmMessage = 'Anda yakin ingin menghapus pilihan modifier ini?';
                url = `/api/modifiers/${id}`;
            } else if (type === 'material') {
                url = `/api/materials/${id}`;
            } else if (type === 'user') {
                // (PERBAIKAN) Pesan konfirmasi diubah
                confirmMessage = 'Anda yakin ingin MENONAKTIFKAN user ini? Mereka tidak akan bisa login lagi.';
                url = `/api/users/${id}`;
            } else if (type === 'category') { 
                confirmMessage = 'YAKIN HAPUS KATEGORI INI? Menu yang memakai kategori ini akan menjadi "N/A".';
                url = `/api/categories/${id}`;
            } else { // 'menu'
                confirmMessage = 'Anda yakin ingin MENGARSIPKAN menu ini? (Akan hilang dari kasir)';
                url = `/api/menu/${id}`;
            }

            if (confirm(confirmMessage)) {
                try {
                    // API 'DELETE' akan dipanggil, tapi di backend dia 'UPDATE' (Soft Delete)
                    const result = await fetchData(url, { method: 'DELETE' });
                    alert(result.message || `${type} berhasil dihapus/diarsipkan.`);
                    
                    if (type === 'recipe') {
                        await loadRecipeForMenu(editMenuId.value);
                    } else if (type === 'modifier-group' || type === 'modifier') {
                        await loadModifierGroups(); 
                    } else if (type === 'menu') {
                        await loadMenu();
                    } else if (type === 'material') {
                        await loadMaterials();
                    } else if (type === 'user') {
                        await loadUsers(); // (PERBAIKAN) User akan hilang dari daftar
                    } else if (type === 'category') {
                        await loadCategories(); 
                        await loadMenu(); 
                    }
                } catch (e) {
                    alert(`Gagal: ${e.message}`);
                }
            }
        }

        // --- Logika EDIT ---
        if (target.classList.contains('btn-edit')) {
            if (type === 'menu') {
                try {
                    const item = await fetchData(`/api/menu/${id}`);
                    editMenuId.value = item.id;
                    editMenuName.value = item.name;
                    editMenuPrice.value = item.base_price;
                    editCategorySelect.value = item.category_id;
                    recipeMenuName.textContent = `"${item.name}"`;
                    await loadRecipeForMenu(item.id);
                    editMenuModal.style.display = 'flex';
                } catch (error) {
                    alert(`Gagal mengambil data menu: ${error.message}`);
                }
            } else if (type === 'material') {
                 try {
                    const item = await fetchData(`/api/materials/${id}`);
                    editStockId.value = item.id;
                    editMaterialName.value = item.name;
                    editMaterialUnit.value = item.unit;
                    editMaterialAlert.value = item.alert_threshold;
                    editStockModal.style.display = 'flex';
                } catch (error) {
                    alert(`Gagal mengambil data bahan: ${error.message}`);
                }
            }
        }
    });

    // ==========================================================
    // --- 11. Inisialisasi Halaman ---
    // ==========================================================
    loadCategories();
    loadMenu();
    loadMaterials();
    loadModifierGroups();
    loadDashboardSummary(); 
    loadUsers(); // (BARU) Muat user saat halaman admin dibuka

}); // Akhir dari DOMContentLoaded