import os
import subprocess
import json

def test_php_syntax_detection():
    test_file = os.path.abspath("tests/mock_student_project/broken_app.php")
    print(f"Testing PHP lint on: {test_file}")
    
    # Run php -l
    proc = subprocess.run(["php", "-l", test_file], capture_output=True, text=True)
    combined = f"{proc.stdout}\n{proc.stderr}"
    print(f"Output: {combined.strip()}")
    
    assert "Parse error" in combined or "syntax error" in combined, "Expected syntax/parse error"
    print("✓ Successfully reproduced student syntax error in mock project")

if __name__ == "__main__":
    test_php_syntax_detection()

