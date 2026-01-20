from flask import Flask, request, jsonify, send_from_directory
from flask_bcrypt import Bcrypt
from flask_cors import CORS
import psycopg2
import psycopg2.extras
import jwt 
import datetime
import os 
from functools import wraps


app = Flask(__name__)
CORS(app) 
bcrypt = Bcrypt(app)
app.config['SECRET_KEY'] = 'ini-kunci-rahasia-banget-ganti-nanti'


DB_HOST = "localhost"
DB_NAME = "db_the_stars_steak"
DB_USER = "postgres"
DB_PASS = "Katasandi130305" 

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'pos_frontend'))

def get_db_connection():
    conn = psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS)
    return conn

# --- DECORATOR KEAMANAN ---
def get_token_data():
    token = request.headers.get('Authorization')
    if not token:
        return None
    try:
        token = token.split(" ")[1]
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        return data
    except Exception as e:
        print(f"Token error: {e}")
        return None

def owner_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token_data = get_token_data()
        if not token_data or token_data.get('role') != 'owner':
            return jsonify({"error": "Akses ditolak. Hanya owner."}), 403
        return f(*args, **kwargs)
    return decorated

# --- 1. API AUTENTIKASI ---
@app.route('/api/login', methods=['POST']) 
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"error": "Username dan password dibutuhkan"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # (INI DIPERBAIKI)
        # Sekarang juga mengecek apakah user 'aktif'
        cur.execute("SELECT * FROM users WHERE username = %s AND is_active = TRUE", (username,))
        
        user = cur.fetchone()
        if not user or not bcrypt.check_password_hash(user['password_hash'], password):
            return jsonify({"error": "Username atau password salah"}), 401
            
        token_payload = {
            'user_id': user['id'], 'username': user['username'], 'role': user['role'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }
        token = jwt.encode(token_payload, app.config['SECRET_KEY'], algorithm='HS256')
        
        redirect_url = 'admin_dashboard.html' if user['role'] == 'owner' else 'pos.html'
        
        return jsonify({
            "message": "Login berhasil!", 
            "token": token, 
            "role": user['role'],
            "user_id": user['id'],
            "username": user['username'],
            "redirect_url": redirect_url
        }), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

# --- 2. API MANAJEMEN MENU (Hanya Owner) ---
@app.route('/api/categories', methods=['GET'])
@owner_required 
def get_categories():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM categories ORDER BY name ASC")
        categories = cur.fetchall()
        return jsonify(categories), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/categories', methods=['POST'])
@owner_required
def add_category():
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({"error": "Nama kategori wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("INSERT INTO categories (name) VALUES (%s) RETURNING *", (name,))
        new_category = cur.fetchone()
        conn.commit()
        return jsonify(new_category), 201
    except Exception as e:
        print(e); conn.rollback()
        if 'unique constraint' in str(e).lower():
            return jsonify({"error": "Nama kategori itu sudah ada."}), 409
        return jsonify({"error": "Gagal menambah kategori"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
@owner_required
def delete_category(category_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM categories WHERE id = %s RETURNING *", (category_id,))
        deleted_item = cur.fetchone()
        conn.commit()
        if not deleted_item:
            return jsonify({"error": "Kategori tidak ditemukan"}), 404
        return jsonify({"message": "Kategori berhasil dihapus"}), 200
    except Exception as e:
        print(e); conn.rollback()
        if 'foreign key constraint' in str(e).lower():
            return jsonify({"error": "Kategori tidak bisa dihapus karena masih dipakai oleh menu."}), 409
        return jsonify({"error": "Gagal menghapus kategori"}), 500
    finally:
        if conn: conn.close()


@app.route('/api/menu', methods=['GET'])
@owner_required
def get_menu():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        query = """
            SELECT m.*, c.name AS category_name 
            FROM menu_items m
            LEFT JOIN categories c ON m.category_id = c.id
            ORDER BY m.id DESC
        """
        cur.execute(query)
        menu_items = cur.fetchall()
        return jsonify(menu_items), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/menu', methods=['POST'])
@owner_required
def add_menu_item():
    data = request.get_json()
    name = data.get('name'); price = data.get('price'); category_id = data.get('category_id')
    if not name or not price or not category_id:
        return jsonify({"error": "Nama, harga, dan kategori wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("INSERT INTO menu_items (name, base_price, category_id) VALUES (%s, %s, %s) RETURNING *", (name, price, category_id))
        new_menu_item = cur.fetchone()
        conn.commit()
        return jsonify(new_menu_item), 201
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/menu/<int:item_id>', methods=['GET'])
@owner_required
def get_menu_item(item_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM menu_items WHERE id = %s", (item_id,))
        item = cur.fetchone()
        if not item: return jsonify({"error": "Menu tidak ditemukan"}), 404
        return jsonify(item), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/menu/<int:item_id>', methods=['PUT'])
@owner_required
def update_menu_item(item_id):
    data = request.get_json()
    name = data.get('name'); price = data.get('price'); category_id = data.get('category_id')
    if not name or not price or not category_id:
        return jsonify({"error": "Nama, harga, dan kategori wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("UPDATE menu_items SET name = %s, base_price = %s, category_id = %s WHERE id = %s RETURNING *", (name, price, category_id, item_id))
        updated_item = cur.fetchone()
        conn.commit()
        if not updated_item: return jsonify({"error": "Menu tidak ditemukan"}), 404
        return jsonify(updated_item), 200
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/menu/<int:item_id>', methods=['DELETE'])
@owner_required
def delete_menu_item(item_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("UPDATE menu_items SET is_available = false WHERE id = %s RETURNING *", (item_id,))
        deleted_item = cur.fetchone()
        conn.commit()
        if not deleted_item: return jsonify({"error": "Menu tidak ditemukan"}), 404
        return jsonify({"message": "Menu berhasil diarsipkan (disembunyikan dari POS)"}), 200
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

# --- 3. API MANAJEMEN STOK (Hanya Owner) ---
@app.route('/api/materials', methods=['GET'])
@owner_required 
def get_materials():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM raw_materials ORDER BY name ASC")
        materials = cur.fetchall()
        return jsonify(materials), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/materials', methods=['POST'])
@owner_required 
def add_material():
    data = request.get_json()
    name = data.get('name'); unit = data.get('unit'); current_stock = data.get('current_stock'); alert_threshold = data.get('alert_threshold')
    if not name or not unit or current_stock is None:
        return jsonify({"error": "Nama, unit, dan stok awal wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("INSERT INTO raw_materials (name, unit, current_stock, alert_threshold) VALUES (%s, %s, %s, %s) RETURNING *", (name, unit, current_stock, alert_threshold or 0))
        new_material = cur.fetchone()
        conn.commit()
        return jsonify(new_material), 201
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Gagal menambah bahan baku"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/materials/<int:material_id>', methods=['GET'])
@owner_required 
def get_material(material_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM raw_materials WHERE id = %s", (material_id,))
        material = cur.fetchone()
        if not material:
            return jsonify({"error": "Bahan baku tidak ditemukan"}), 404
        return jsonify(material), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/materials/<int:material_id>', methods=['PUT'])
@owner_required 
def update_material(material_id):
    data = request.get_json()
    name = data.get('name'); unit = data.get('unit'); alert_threshold = data.get('alert_threshold')
    if not name or not unit or alert_threshold is None:
        return jsonify({"error": "Nama, unit, dan batas alert wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "UPDATE raw_materials SET name = %s, unit = %s, alert_threshold = %s WHERE id = %s RETURNING *",
            (name, unit, alert_threshold, material_id)
        )
        updated_material = cur.fetchone()
        conn.commit()
        if not updated_material:
            return jsonify({"error": "Bahan baku tidak ditemukan"}), 404
        return jsonify(updated_material), 200
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Gagal update bahan baku"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/materials/<int:material_id>', methods=['DELETE'])
@owner_required 
def delete_material(material_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM raw_materials WHERE id = %s RETURNING *", (material_id,))
        deleted_item = cur.fetchone()
        conn.commit()
        if not deleted_item:
            return jsonify({"error": "Bahan baku tidak ditemukan"}), 404
        return jsonify({"message": "Bahan baku berhasil dihapus"}), 200
    except Exception as e:
        print(e); conn.rollback()
        # (BARU) Jika bahan baku dipakai di resep, cegah penghapusan
        if 'foreign key constraint' in str(e).lower():
            return jsonify({"error": "Gagal: Bahan baku ini dipakai di resep. Hapus dari resep dulu."}), 409
        return jsonify({"error": "Gagal menghapus bahan baku"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/materials/stock', methods=['POST'])
@owner_required 
def add_stock():
    data = request.get_json()
    material_id = data.get('material_id'); quantity = data.get('quantity')
    if not material_id or not quantity:
        return jsonify({"error": "ID bahan baku dan jumlah wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "UPDATE raw_materials SET current_stock = current_stock + %s WHERE id = %s RETURNING *",
            (quantity, material_id)
        )
        updated_material = cur.fetchone()
        conn.commit()
        if not updated_material:
            return jsonify({"error": "Bahan baku tidak ditemukan"}), 404
        return jsonify(updated_material), 200
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Gagal menambah stok"}), 500
    finally:
        if conn: conn.close()

# --- 4. API MANAJEMEN RESEP (Hanya Owner) ---
@app.route('/api/menu/<int:menu_id>/recipe', methods=['GET'])
@owner_required 
def get_recipe(menu_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        query = """
            SELECT r.id, r.quantity_used, rm.name, rm.unit
            FROM recipes r
            JOIN raw_materials rm ON r.raw_material_id = rm.id
            WHERE r.menu_item_id = %s ORDER BY rm.name
        """
        cur.execute(query, (menu_id,))
        recipe_items = cur.fetchall()
        return jsonify(recipe_items), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/menu/<int:menu_id>/recipe', methods=['POST'])
@owner_required 
def add_recipe_item(menu_id):
    data = request.get_json()
    material_id = data.get('material_id'); quantity = data.get('quantity')
    if not material_id or not quantity:
        return jsonify({"error": "Bahan baku dan jumlah wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("INSERT INTO recipes (menu_item_id, raw_material_id, quantity_used) VALUES (%s, %s, %s) RETURNING *", (menu_id, material_id, quantity))
        new_recipe_item = cur.fetchone()
        conn.commit()
        return jsonify(new_recipe_item), 201
    except Exception as e:
        print(e); conn.rollback()
        if 'unique constraint' in str(e).lower():
            return jsonify({"error": "Bahan baku itu sudah ada di resep."}), 409
        return jsonify({"error": "Gagal menambah resep"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/recipe/<int:recipe_id>', methods=['DELETE'])
@owner_required 
def delete_recipe_item(recipe_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("DELETE FROM recipes WHERE id = %s RETURNING *", (recipe_id,))
        deleted_item = cur.fetchone()
        conn.commit()
        if not deleted_item: return jsonify({"error": "Item resep tidak ditemukan"}), 404
        return jsonify({"message": "Item resep dihapus"}), 200
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

# --- 5. API MANAJEMEN MODIFIER (Hanya Owner) ---
@app.route('/api/modifiers/groups', methods=['GET'])
@owner_required 
def get_modifier_groups():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM modifier_groups ORDER BY name")
        groups = cur.fetchall()
        return jsonify(groups), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/modifiers/groups', methods=['POST'])
@owner_required 
def add_modifier_group():
    data = request.get_json()
    name = data.get('name'); is_required = data.get('is_required', True)
    if not name: return jsonify({"error": "Nama grup wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("INSERT INTO modifier_groups (name, is_required) VALUES (%s, %s) RETURNING *", (name, is_required))
        new_group = cur.fetchone()
        conn.commit()
        return jsonify(new_group), 201
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Gagal menambah grup"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/modifiers', methods=['POST'])
@owner_required 
def add_modifier():
    data = request.get_json()
    name = data.get('name'); additional_price = data.get('additional_price', 0); group_id = data.get('group_id')
    if not name or not group_id: return jsonify({"error": "Nama, harga, dan ID grup wajib diisi"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("INSERT INTO modifiers (name, additional_price, group_id) VALUES (%s, %s, %s) RETURNING *", (name, additional_price, group_id))
        new_modifier = cur.fetchone()
        conn.commit()
        return jsonify(new_modifier), 201
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Gagal menambah modifier"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/modifiers/groups/full', methods=['GET'])
@owner_required 
def get_full_modifier_data():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM modifier_groups ORDER BY name")
        groups = cur.fetchall()
        cur.execute("SELECT * FROM modifiers ORDER BY name")
        modifiers = cur.fetchall()
        for group in groups:
            group['modifiers'] = [m for m in modifiers if m['group_id'] == group['id']]
        return jsonify(groups), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/menu/<int:menu_id>/modifiers', methods=['GET'])
@owner_required 
def get_menu_modifiers(menu_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT modifier_group_id FROM menu_modifier_groups WHERE menu_item_id = %s", (menu_id,))
        group_ids = [row['modifier_group_id'] for row in cur.fetchall()]
        return jsonify(group_ids), 200
    except Exception as e:
        print(e); return jsonify({"error": "Terjadi kesalahan di server"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/menu/<int:menu_id>/modifiers', methods=['POST'])
@owner_required 
def set_menu_modifiers(menu_id):
    data = request.get_json()
    group_ids = data.get('group_ids') 
    if group_ids is None: return jsonify({"error": "group_ids (array) wajib ada"}), 400
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM menu_modifier_groups WHERE menu_item_id = %s", (menu_id,))
        if group_ids: 
            from psycopg2.extras import execute_values
            values_to_insert = [(menu_id, group_id) for group_id in group_ids]
            execute_values(cur, "INSERT INTO menu_modifier_groups (menu_item_id, modifier_group_id) VALUES %s", values_to_insert)
        conn.commit()
        return jsonify({"message": "Modifier menu berhasil diperbarui"}), 200
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Gagal memperbarui modifier"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/modifiers/groups/<int:group_id>', methods=['DELETE'])
@owner_required 
def delete_modifier_group(group_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM modifier_groups WHERE id = %s RETURNING *", (group_id,))
        deleted_item = cur.fetchone()
        conn.commit()
        if not deleted_item: return jsonify({"error": "Grup tidak ditemukan"}), 404
        return jsonify({"message": "Grup berhasil dihapus"}), 200
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Gagal menghapus grup"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/modifiers/<int:modifier_id>', methods=['DELETE'])
@owner_required 
def delete_modifier(modifier_id):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM modifiers WHERE id = %s RETURNING *", (modifier_id,))
        deleted_item = cur.fetchone()
        conn.commit()
        if not deleted_item: return jsonify({"error": "Pilihan tidak ditemukan"}), 404
        return jsonify({"message": "Pilihan berhasil dihapus"}), 200
    except Exception as e:
        print(e); conn.rollback(); return jsonify({"error": "Gagal menghapus pilihan"}), 500
    finally:
        if conn: conn.close()

# --- 6. API HALAMAN POS (Bisa diakses Kasir) ---
@app.route('/api/pos/data', methods=['GET'])
def get_pos_data():
    token_data = get_token_data()
    if not token_data:
        return jsonify({"error": "Akses ditolak."}), 401
        
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        output = {}
        cur.execute("SELECT * FROM categories ORDER BY name")
        output['categories'] = cur.fetchall()
        cur.execute("SELECT * FROM menu_items WHERE is_available = TRUE ORDER BY name")
        output['menu_items'] = cur.fetchall()
        cur.execute("SELECT * FROM modifier_groups")
        output['modifier_groups'] = cur.fetchall()
        cur.execute("SELECT * FROM modifiers")
        output['modifiers'] = cur.fetchall()
        cur.execute("SELECT * FROM menu_modifier_groups")
        output['menu_modifier_links'] = cur.fetchall()
        return jsonify(output), 200
    except Exception as e:
        print(e); return jsonify({"error": "Gagal mengambil data POS"}), 500
    finally:
        if conn: conn.close()

# --- 7. API CHECKOUT (Bisa diakses Kasir) ---
@app.route('/api/checkout', methods=['POST'])
def checkout():
    token_data = get_token_data()
    if not token_data:
        return jsonify({"error": "Akses ditolak."}), 401
        
    data = request.get_json()
    cart = data.get('cart')
    summary = data.get('summary')
    payments = data.get('payments')
    user_id = data.get('user_id')

    if not cart or not summary or not payments or not user_id:
        return jsonify({"error": "Data tidak lengkap"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        required_materials = {} 
        for item in cart:
            cur.execute("SELECT raw_material_id, quantity_used FROM recipes WHERE menu_item_id = %s", (item['itemId'],))
            recipe_items = cur.fetchall()
            for recipe_item in recipe_items:
                mat_id = recipe_item['raw_material_id']
                qty_needed = recipe_item['quantity_used']
                required_materials[mat_id] = required_materials.get(mat_id, 0) + qty_needed
        
        if required_materials:
            for mat_id, qty_needed in required_materials.items():
                cur.execute("SELECT name, current_stock FROM raw_materials WHERE id = %s FOR UPDATE", (mat_id,))
                stock_item = cur.fetchone()
                if not stock_item or stock_item['current_stock'] < qty_needed:
                    item_name = stock_item['name'] if stock_item else f"ID {mat_id}"
                    conn.rollback() 
                    return jsonify({"error": f"Stok tidak cukup untuk: {item_name}. Transaksi dibatalkan."}), 409
        
        cur.execute("INSERT INTO orders (user_id, sub_total, tax_amount, grand_total, status) VALUES (%s, %s, %s, %s, 'paid') RETURNING id",
            (user_id, summary['subtotal'], summary['tax'], summary['total']))
        order_id = cur.fetchone()['id']
        
        for item in cart:
            cur.execute("INSERT INTO order_items (order_id, menu_item_id, quantity, price_per_item) VALUES (%s, %s, 1, %s) RETURNING id",
                (order_id, item['itemId'], item['totalPrice']))
            order_item_id = cur.fetchone()['id']
            
            if item['modifiers']:
                modifiers_to_insert = [(order_item_id, mod['name'], mod['price']) for mod in item['modifiers']]
                from psycopg2.extras import execute_values
                execute_values(cur, "INSERT INTO order_item_modifiers (order_item_id, modifier_name, additional_price) VALUES %s", modifiers_to_insert)
        
        if required_materials:
            for mat_id, qty_needed in required_materials.items():
                cur.execute("UPDATE raw_materials SET current_stock = current_stock - %s WHERE id = %s", (qty_needed, mat_id))

        payments_to_insert = [(order_id, p['amount'], p['method']) for p in payments]
        from psycopg2.extras import execute_values
        execute_values(cur, "INSERT INTO payments (order_id, amount, method) VALUES %s", payments_to_insert)

        conn.commit()
        return jsonify({"message": "Transaksi berhasil!", "order_id": order_id}), 201
        
    except Exception as e:
        if conn: conn.rollback() 
        print(f"Checkout Error: {e}")
        return jsonify({"error": f"Terjadi kesalahan server saat checkout: {str(e)}"}), 500
    finally:
        if conn: conn.close()

# --- 8. API UNTUK LAPORAN (Hanya Owner) ---
@app.route('/api/reports/daily_summary', methods=['GET'])
@owner_required 
def get_daily_summary():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT SUM(grand_total) AS total_omzet, COUNT(id) AS total_transaksi FROM orders WHERE created_at >= CURRENT_DATE")
        summary = cur.fetchone()
        return jsonify(summary), 200
    except Exception as e:
        print(e); return jsonify({"error": "Gagal mengambil laporan"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/reports/best_selling', methods=['GET'])
@owner_required 
def get_best_selling():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT m.name, SUM(oi.quantity) AS total_terjual
            FROM order_items oi
            JOIN menu_items m ON oi.menu_item_id = m.id
            GROUP BY m.name ORDER BY total_terjual DESC LIMIT 5
            """
        )
        items = cur.fetchall()
        return jsonify(items), 200
    except Exception as e:
        print(e); return jsonify({"error": "Gagal mengambil laporan"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/reports/stock_alert', methods=['GET'])
@owner_required 
def get_stock_alert():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, name, current_stock, alert_threshold, unit FROM raw_materials WHERE current_stock <= alert_threshold ORDER BY name")
        items = cur.fetchall()
        return jsonify(items), 200
    except Exception as e:
        print(e); return jsonify({"error": "Gagal mengambil laporan"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/reports/sales_by_cashier', methods=['GET'])
@owner_required
def get_sales_by_cashier():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT u.username, COUNT(o.id) AS total_transaksi, SUM(o.grand_total) AS total_omzet
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.created_at >= CURRENT_DATE
            GROUP BY u.username ORDER BY total_omzet DESC
            """
        )
        report = cur.fetchall()
        return jsonify(report), 200
    except Exception as e:
        print(e); return jsonify({"error": "Gagal mengambil laporan"}), 500
    finally:
        if conn: conn.close()


# --- 9. API UNTUK MANAJEMEN USER (Hanya Owner) ---
@app.route('/api/users', methods=['GET'])
@owner_required
def get_users():
    token_data = get_token_data()
    owner_id = token_data['user_id']
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # (INI DIPERBAIKI) Hanya tampilkan user yang 'aktif'
        cur.execute("SELECT id, username, role FROM users WHERE id != %s AND is_active = TRUE ORDER BY username", (owner_id,))
        users = cur.fetchall()
        return jsonify(users), 200
    except Exception as e:
        print(e); return jsonify({"error": "Gagal mengambil data user"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/users', methods=['POST'])
@owner_required
def add_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'kasir') 
    
    if not username or not password:
        return jsonify({"error": "Username dan password wajib diisi"}), 400
    
    password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s) RETURNING id, username, role",
            (username, password_hash, role)
        )
        new_user = cur.fetchone()
        conn.commit()
        return jsonify(new_user), 201
    except Exception as e:
        print(e); conn.rollback()
        if 'unique constraint' in str(e).lower():
            return jsonify({"error": "Username itu sudah dipakai."}), 409
        return jsonify({"error": "Gagal menambah user"}), 500
    finally:
        if conn: conn.close()

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@owner_required
def delete_user(user_id):
    # (INI DIPERBAIKI) Logika diubah dari DELETE menjadi "Soft Delete" (UPDATE)
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Kita set 'is_active' menjadi 'false'
        cur.execute(
            "UPDATE users SET is_active = false WHERE id = %s AND role != 'owner' RETURNING *", 
            (user_id,)
        )
        deleted_item = cur.fetchone()
        conn.commit()
        
        if not deleted_item:
            return jsonify({"error": "User tidak ditemukan atau Anda mencoba menonaktifkan owner"}), 404
            
        return jsonify({"message": "User berhasil dinonaktifkan"}), 200
    except Exception as e:
        print(e); conn.rollback()
        return jsonify({"error": "Gagal menonaktifkan user"}), 500
    finally:
        if conn: conn.close()

# --- 10. Rute untuk Menyajikan Frontend ---
@app.route('/')
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static_files(path):
    file_path = os.path.join(FRONTEND_DIR, path)
    if os.path.exists(file_path):
        return send_from_directory(FRONTEND_DIR, path)
    else:
        if '.' not in path: 
             return send_from_directory(FRONTEND_DIR, 'index.html')
        return "File not found", 404

# --- Jalankan Server ---
if __name__ == '__main__':
    app.run(debug=True, port=5000)