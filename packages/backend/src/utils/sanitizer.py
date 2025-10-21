"""Text Sanitization Utilities

Provides functions to sanitize user input to prevent XSS attacks
"""

import html
import re
from typing import ClassVar


class TextSanitizer:
    """Text sanitization utility for preventing XSS attacks"""

    # Dangerous HTML tags that should be removed
    DANGEROUS_TAGS: ClassVar[list[str]] = [
        "script",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "textarea",
        "button",
        "select",
        "option",
        "link",
        "meta",
        "style",
    ]

    # Dangerous attributes that should be removed
    DANGEROUS_ATTRIBUTES: ClassVar[list[str]] = [
        "onclick",
        "onload",
        "onmouseover",
        "onmouseout",
        "onfocus",
        "onblur",
        "onerror",
        "onsubmit",
        "onchange",
        "onkeydown",
        "onkeyup",
        "onkeypress",
        "javascript:",
        "vbscript:",
        "data:",
    ]

    @classmethod
    def sanitize_text(cls, text: str | None) -> str | None:
        """Sanitize text input to prevent XSS attacks

        Args:
            text: Input text to sanitize

        Returns:
            Sanitized text safe for storage and display
        """
        if text is None:
            return None

        if not isinstance(text, str):
            text = str(text)

        # HTML escape to convert < > & " ' to entities
        sanitized = html.escape(text, quote=True)

        # Remove dangerous script patterns (case-insensitive)
        script_pattern = re.compile(r"<\s*/?script[^>]*>", re.IGNORECASE)
        sanitized = script_pattern.sub("", sanitized)

        # Remove javascript: and other dangerous protocols
        for dangerous_attr in cls.DANGEROUS_ATTRIBUTES:
            pattern = re.compile(re.escape(dangerous_attr), re.IGNORECASE)
            sanitized = pattern.sub("", sanitized)

        return sanitized

    @classmethod
    def sanitize_chat_title(cls, title: str | None) -> str | None:
        """Sanitize chat title specifically

        Args:
            title: Chat title to sanitize

        Returns:
            Sanitized chat title
        """
        return cls.sanitize_text(title)
