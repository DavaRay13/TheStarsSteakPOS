# 🥩 SizzleTrack POS – Smart Inventory & Restaurant Management
SizzleTrack POS bukan sekadar aplikasi kasir biasa. Ini adalah sistem manajemen restoran steak yang mengintegrasikan logika inventaris bahan baku secara real-time. Setiap gram daging yang terjual langsung memotong stok di gudang secara otomatis melalui sistem resep yang cerdas.
## 🚀 Mengapa SizzleTrack?
Kebanyakan aplikasi POS pemula hanya mencatat transaksi. SizzleTrack melangkah lebih jauh dengan menyelesaikan masalah nyata di bisnis kuliner: Kebocoran Stok.
•	🔥 Auto-Deduct Inventory: Menggunakan logika recipes mapping. Jual 1 porsi Sirloin = Stok daging berkurang 200g, saus berkurang 50ml secara otomatis.
•	🔐 Role-Based Access Control (RBAC): Pemisahan akses ketat antara Owner (Analisis & Dashboard) dan Kasir (Transaksi POS).
•	🎨 Modifier Management: Mendukung pilihan tingkat kematangan (Rare, Medium, Well Done) yang terintegrasi langsung dengan perhitungan harga dan stok.
•	⚠️ Stock Alert System: Memberikan peringatan visual di dashboard saat bahan baku berada di bawah ambang batas (threshold).
## 🛠️ Tech Stack
•	Backend: Python & Flask (Restful API)
•	Database: PostgreSQL (Relational Data Management)
•	Security: JWT (JSON Web Tokens) & Bcrypt Password Hashing
•	Frontend: Vanilla JavaScript (ES6+), HTML5, Modern CSS (Responsive Design)
## 📸 Tampilan Aplikasi
Halaman Kasir (POS)	Dashboard Admin (Laporan)
	
Catatan: Pastikan gambar tersedia di folder docs/ atau ganti URL di atas dengan link gambar asli.
## ⚙️ Instalasi & Setup
Pastiin lu udah punya Python 3.10+ dan PostgreSQL di laptop lu.
### 1. Clone Repository
```
git clone [https://github.com/DavaRay13/TheStarsSteakPOS.git](https://github.com/DavaRay13/TheStarsSteakPOS.git)
cd SizzleTrack-POS
```
### 2. Setup Virtual Environment
```
python -m venv .venv
source .venv/Scripts/activate  # Untuk Windows (Git Bash)
```
### 3. Install Dependencies
```
pip install -r requirements.txt
```
### 4. Konfigurasi Database
1.	Buat database di PostgreSQL bernama db_the_stars_steak.
2.	Eksekusi file database_schema.sql (tersedia di root folder) untuk membuat struktur tabel.
3.	Sesuaikan konfigurasi DB di pos_backend/app.py pada bagian DB_CONFIG.
### 5. Jalankan Aplikasi
```
python pos_backend/app.py
```
Akses aplikasi di: http://127.0.0.1:5000
## 🧠 Logika Bisnis (Showcase)
Gue pake logika looping buat ngecek resep setiap kali transaksi diselesaikan, jadi nggak ada stok yang terlewat:
```
# Cuplikan logika pengurangan stok otomatis di backend
for item in cart:
    cur.execute("SELECT raw_material_id, quantity_used FROM recipes WHERE menu_item_id = %s", (item['itemId'],))
    recipe_items = cur.fetchall()
    
    for recipe_item in recipe_items:
        cur.execute(
            "UPDATE raw_materials SET current_stock = current_stock - %s WHERE id = %s",
            (recipe_item['quantity_used'], recipe_item['raw_material_id'])
        )
```
📄 Lisensi
Didistribusikan di bawah Lisensi MIT. Lihat file LICENSE untuk detailnya.
Dibuat dengan ❤️ oleh Dava

