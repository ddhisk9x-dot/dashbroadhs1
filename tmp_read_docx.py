import zipfile
import tempfile
import os
import xml.etree.ElementTree as ET

docx_path = r"C:\Users\Duong Hieu\Downloads\Bao_cao_bai_giang_dong_tich_hop_Canvas_KHTN_THCS_v2.docx"

try:
    with zipfile.ZipFile(docx_path) as docx:
        xml_content = docx.read('word/document.xml')
        tree = ET.XML(xml_content)
        
        # Word XML namespace is Usually http://schemas.openxmlformats.org/wordprocessingml/2006/main
        WORD_NAMESPACE = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        PARA = WORD_NAMESPACE + 'p'
        TEXT = WORD_NAMESPACE + 't'
        PPR = WORD_NAMESPACE + 'pPr'
        PSTYLE = WORD_NAMESPACE + 'pStyle'
        
        texts = []
        for paragraph in tree.iter(PARA):
            paratext = "".join([node.text for node in paragraph.iter(TEXT) if node.text])
            if paratext.strip():
                # rough heuristic to find headings: check style or just length/capitalization
                # We'll just extract all text and see the first 50 lines or so.
                texts.append(paratext)
                
        print("\n".join(texts[:100])) # Print first 100 non-empty paragraphs
except Exception as e:
    print("Error:", e)
