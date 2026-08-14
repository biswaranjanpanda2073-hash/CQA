import sys

def replace_lines(filepath, start_line, end_line, replacement_file):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    with open(replacement_file, 'r', encoding='utf-8') as f:
        replacement = f.read()

    new_lines = lines[:start_line-1] + [replacement + '\n'] + lines[end_line:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
if __name__ == "__main__":
    replace_lines("src/components/BaanModule.jsx", 418, 896, "new_baan.txt")
