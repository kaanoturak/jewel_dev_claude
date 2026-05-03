import os
import sys
from datetime import datetime

# ==================== YAPILANDIRMA ====================

# Projenin kök klasörü (Scriptin çalıştığı dizin olarak ayarlandı)
ROOT_FOLDER = os.getcwd()

# Çıktı dosyası
OUTPUT_FILE = "merged_file.txt"

# Kendi dosyasını bulma (Çıktıya kendini eklememesi için)
try:
    SCRIPT_NAME = os.path.basename(__file__)
except NameError:
    SCRIPT_NAME = sys.argv[0] if sys.argv else "merge_script.py"

# Dahil edilecek dosya uzantıları
VALID_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".cpp", ".c", ".h", ".cs", 
    ".go", ".rs", ".php", ".rb", ".swift", ".kt", ".scala", ".sql", ".sh", 
    ".yaml", ".yml", ".json", ".xml", ".html", ".css", ".scss", ".md", ".txt"
}

# Özel isimli dosyalar
SPECIAL_FILES = {
    "Dockerfile", "docker-compose.yml", "requirements.txt", "package.json", 
    "Makefile", "README.md", ".gitignore", ".env.example"
}

# Hariç tutulacak klasörler
EXCLUDE_DIRS = {
    "venv", "env", ".venv", "__pycache__", ".git", ".github", ".vscode", 
    ".idea", "node_modules", "dist", "build", "target", ".next", "coverage"
}

# Hariç tutulacak dosya uzantıları
EXCLUDE_EXTENSIONS = {
    ".pyc", ".pyo", ".exe", ".dll", ".so", ".bin", ".db", ".sqlite", 
    ".log", ".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".rar"
}

# Maksimum dosya boyutu (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

# ==================== YARDIMCI FONKSİYONLAR ====================

def is_binary_file(file_path, chunk_size=8192):
    try:
        with open(file_path, 'rb') as f:
            chunk = f.read(chunk_size)
            if b'\0' in chunk: return True
            text_chars = bytearray({7, 8, 9, 10, 12, 13, 27} | set(range(0x20, 0x100)))
            non_text = sum(1 for b in chunk if b not in text_chars)
            if non_text / (len(chunk) + 1) > 0.3: return True
        return False
    except Exception:
        return True

def should_include_file(file_name, file_ext, file_path):
    # Kendini ve çıktı dosyasını hariç tut
    if file_name in (OUTPUT_FILE, SCRIPT_NAME): return False
    
    if file_ext in EXCLUDE_EXTENSIONS: return False
    try:
        if os.path.getsize(file_path) > MAX_FILE_SIZE: return False
    except OSError: return False
    
    if is_binary_file(file_path): return False
    if file_ext in VALID_EXTENSIONS or file_name in SPECIAL_FILES: return True
    return False

def format_file_size(size):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0: return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} TB"

def generate_project_tree(dir_path, prefix=""):
    """
    Proje şemasını ağaç (tree) formatında oluşturur.
    Sadece dahil edilen klasörleri ve dosyaları listeler.
    """
    tree_str = ""
    try:
        # Klasör içeriğini al ve alfabetik sırala
        entries = sorted(os.listdir(dir_path))
    except PermissionError:
        return ""

    valid_entries = []
    for entry in entries:
        full_path = os.path.join(dir_path, entry)
        if os.path.isdir(full_path):
            if entry not in EXCLUDE_DIRS:
                valid_entries.append((entry, True, full_path))
        else:
            file_ext = os.path.splitext(entry)[1].lower()
            if should_include_file(entry, file_ext, full_path):
                valid_entries.append((entry, False, full_path))

    for i, (entry, is_dir, full_path) in enumerate(valid_entries):
        is_last = (i == len(valid_entries) - 1)
        connector = "└── " if is_last else "├── "
        tree_str += f"{prefix}{connector}{entry}\n"
        
        if is_dir:
            extension = "    " if is_last else "│   "
            tree_str += generate_project_tree(full_path, prefix + extension)
            
    return tree_str

# ==================== ANA FONKSİYON ====================

def merge_code_files():
    if not os.path.exists(ROOT_FOLDER):
        print(f"❌ HATA: '{ROOT_FOLDER}' klasörü bulunamadı!")
        sys.exit(1)
    
    print(f"📂 Taranacak klasör: {ROOT_FOLDER}")
    print(f"📄 Çıktı dosyası: {OUTPUT_FILE}")
    print(f"⚙️  Script dosyası atlanacak: {SCRIPT_NAME}")
    print(f"{'='*60}\n")
    
    stats = {'total': 0, 'included': 0, 'skipped': 0, 'error': 0, 'size': 0}
    output_path = os.path.join(ROOT_FOLDER, OUTPUT_FILE)
    
    try:
        with open(output_path, "w", encoding="utf-8") as out_f:
            # 1. BAŞLIK BİLGİLERİ
            out_f.write(f"{'='*70}\n  BİRLEŞTİRİLMİŞ KOD DOSYASI\n")
            out_f.write(f"  Tarih: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            out_f.write(f"  Dizin: {ROOT_FOLDER}\n{'='*70}\n\n")
            
            # 2. PROJE ŞEMASI (AĞAÇ)
            project_tree = generate_project_tree(ROOT_FOLDER)
            out_f.write("<project_tree>\n")
            out_f.write(f"📂 {os.path.basename(ROOT_FOLDER) or 'Proje Kök Dizini'}\n")
            if not project_tree.strip():
                out_f.write("└── (İçerik bulunamadı veya tümü filtrelendi)\n")
            else:
                out_f.write(project_tree)
            out_f.write("</project_tree>\n\n")
            
            # 3. DOSYA İÇERİKLERİ
            for folder_path, subfolders, files in os.walk(ROOT_FOLDER):
                # Hariç tutulan klasörleri os.walk ağacından çıkart
                subfolders[:] = [d for d in subfolders if d not in EXCLUDE_DIRS]
                
                for file_name in sorted(files):
                    stats['total'] += 1
                    file_path = os.path.join(folder_path, file_name)
                    file_ext = os.path.splitext(file_name)[1].lower()
                    
                    if not should_include_file(file_name, file_ext, file_path):
                        stats['skipped'] += 1
                        continue
                    
                    relative_path = os.path.relpath(file_path, ROOT_FOLDER)
                    
                    try:
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                        
                        out_f.write(f'<file path="{relative_path.replace(os.sep, "/")}">\n')
                        out_f.write(content.strip() + "\n</file>\n")
                        
                        stats['included'] += 1
                        stats['size'] += os.path.getsize(file_path)
                        print(f"✅ {relative_path}")
                        
                    except Exception as e:
                        stats['error'] += 1
                        print(f"⚠️  HATA: {relative_path} - {e}")

    except Exception as e:
        print(f"\n❌ KRİTİK HATA: {e}")
        sys.exit(1)
    
    print(f"\n{'='*60}\n✅ TAMAMLANDI! Toplam Taranan: {stats['total']}, Dahil: {stats['included']}, Boyut: {format_file_size(stats['size'])}")

if __name__ == "__main__":
    merge_code_files()