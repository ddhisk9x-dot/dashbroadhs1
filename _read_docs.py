import sys
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document

doc = Document(r"C:\Users\Duong Hieu\Desktop\deep dashbroad\bao cao\BCTV_Phạm Thanh Tùng_Nguyễn Thị Lan Anh_THCS.docx")
for i, p in enumerate(doc.paragraphs):
    if p.text.strip():
        print(f"[{i}] {p.text.strip()}")
    if i > 300:
        break
