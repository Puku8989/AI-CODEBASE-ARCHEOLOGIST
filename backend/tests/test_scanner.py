from pathlib import Path
from app.services.scanner_service import ScannerService, should_ignore, is_binary_file


def test_ignore_patterns():
    patterns = [".git", "node_modules", "venv", "*.pyc", "__pycache__"]
    
    assert should_ignore(".git/config", patterns) is True
    assert should_ignore("node_modules/package/index.js", patterns) is True
    assert should_ignore("app/__pycache__/main.cpython-312.pyc", patterns) is True
    assert should_ignore("app/core/auth.py", patterns) is False
    assert should_ignore("src/components/Button.tsx", patterns) is False


def test_scan_sample_repo(sample_repo_path):
    scanner = ScannerService()
    scanned_files, lang_percentages = scanner.scan_directory(sample_repo_path)

    paths = [f.path for f in scanned_files]
    assert any("models/user.py" in p for p in paths)
    assert any("services/auth_service.py" in p for p in paths)
    assert any("services/token_service.py" in p for p in paths)
    assert any("api/routes.py" in p for p in paths)
    assert any("main.py" in p for p in paths)

    assert "python" in lang_percentages
    assert lang_percentages["python"] == 100.0


def test_binary_file_detection(tmp_path):
    text_file = tmp_path / "test.txt"
    text_file.write_text("Hello World\nLine 2", encoding="utf-8")
    assert is_binary_file(text_file) is False

    bin_file = tmp_path / "test.bin"
    bin_file.write_bytes(b"\x00\x01\x02\x03\x00")
    assert is_binary_file(bin_file) is True
