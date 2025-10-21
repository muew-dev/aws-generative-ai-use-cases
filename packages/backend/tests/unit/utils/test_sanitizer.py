"""Tests for TextSanitizer utility"""

import pytest
from utils.sanitizer import TextSanitizer


class TestTextSanitizer:
    """Test cases for TextSanitizer"""

    def test_sanitize_script_tag(self):
        """<script>タグが適切にサニタイズされることをテスト"""
        malicious_input = "<script>alert('XSS')</script>Hello"
        result = TextSanitizer.sanitize_text(malicious_input)
        
        assert "<script>" not in result
        assert "&lt;script&gt;" in result
        assert "Hello" in result

    def test_sanitize_javascript_protocol(self):
        """javascript:プロトコルが除去されることをテスト"""
        malicious_input = "javascript:alert('XSS')"
        result = TextSanitizer.sanitize_text(malicious_input)
        
        assert "javascript:" not in result
        assert "alert" in result

    def test_sanitize_event_handlers(self):
        """イベントハンドラーが除去されることをテスト"""
        malicious_input = "onclick=\"alert('XSS')\""
        result = TextSanitizer.sanitize_text(malicious_input)
        
        assert "onclick" not in result

    def test_sanitize_html_entities(self):
        """HTML特殊文字がエスケープされることをテスト"""
        input_text = "<>&\"'"
        result = TextSanitizer.sanitize_text(input_text)
        
        assert "&lt;" in result
        assert "&gt;" in result
        assert "&amp;" in result
        assert "&#x27;" in result or "&quot;" in result

    def test_sanitize_none_input(self):
        """None入力が適切に処理されることをテスト"""
        result = TextSanitizer.sanitize_text(None)
        assert result is None

    def test_sanitize_empty_string(self):
        """空文字列が適切に処理されることをテスト"""
        result = TextSanitizer.sanitize_text("")
        assert result == ""

    def test_sanitize_normal_text(self):
        """通常のテキストが変更されないことをテスト"""
        normal_text = "Hello World 123"
        result = TextSanitizer.sanitize_text(normal_text)
        assert result == normal_text

    def test_sanitize_chat_title(self):
        """チャットタイトル用のサニタイズ関数をテスト"""
        malicious_title = "<script>alert('XSS')</script>My Chat"
        result = TextSanitizer.sanitize_chat_title(malicious_title)
        
        assert "<script>" not in result
        assert "My Chat" in result

    def test_case_insensitive_script_removal(self):
        """大文字小文字を無視したscriptタグ除去をテスト"""
        inputs = [
            "<SCRIPT>alert('XSS')</SCRIPT>",
            "<Script>alert('XSS')</Script>",
            "<script>alert('XSS')</script>",
        ]
        
        for malicious_input in inputs:
            result = TextSanitizer.sanitize_text(malicious_input)
            # HTMLエスケープされるがscript除去パターンも適用される
            assert "<script>" not in result.lower()