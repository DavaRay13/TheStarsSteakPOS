# nama file: buat_admin.py
import psycopg2
from flask_bcrypt import Bcrypt

# --- KONFIGURASI DATABASE ANDA ---
DB_HOST = "localhost"
DB_NAME = "db_the_stars_steak"
DB_USER = "postgres" # Ganti dengan user Anda
DB_PASS = "Katasandi130305" # Ganti dengan password Anda
# --------------------------------

# Buat koneksi
conn = psycopg2.connect(
    host=DB_HOST,
    database=DB_NAME,
    user=DB_USER,
    password=DB_PASS
)
cur = conn.cursor()
bcrypt = Bcrypt()

# Data admin baru
username = "owner"
password = "admin123" # Password sementara
role = "owner" 

# Hash passwordnya
password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

# Masukkan ke database
try:
    cur.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
        (username, password_hash, role)
    )
    conn.commit()
    print(f"User '{username}' berhasil dibuat!")
except Exception as e:
    print(f"Error: {e}")
    conn.rollback()
finally:
    cur.close()
    conn.close()