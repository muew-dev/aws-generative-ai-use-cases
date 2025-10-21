#!/usr/bin/env python3
"""OpenAPI JSON generation script

Python equivalent of TypeScript generate-openapi-yaml.ts
Generates OpenAPI JSON file from FastAPI application
"""

import json
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app


def generate_openapi_json_at_root() -> str:
    """Generate OpenAPI JSON file at project root (2 levels up)"""
    try:
        # Get OpenAPI spec from FastAPI app
        openapi_spec = app.openapi()

        # Convert to JSON string with pretty formatting
        json_string = json.dumps(
            openapi_spec, indent=2, ensure_ascii=False, sort_keys=False
        )

        # Generate at project root (2 levels up from packages/backend)
        current_dir = Path(__file__).resolve().parent
        root_path = current_dir.parent.parent.parent.parent / "openapi.json"

        # Write JSON file
        with open(root_path, "w", encoding="utf-8") as f:
            f.write(json_string)

        print(f"OpenAPI JSON generated at: {root_path}")
        return str(root_path)

    except Exception as e:
        print(f"Error generating OpenAPI JSON: {e}")
        raise e


def generate_openapi_json(output_dir: str | None = None) -> str:
    """Generate OpenAPI JSON file in specified directory or docs/"""
    try:
        # Get OpenAPI spec from FastAPI app
        openapi_spec = app.openapi()

        # Convert to JSON string with pretty formatting
        json_string = json.dumps(
            openapi_spec, indent=2, ensure_ascii=False, sort_keys=False
        )

        # Default to docs directory, or use custom output directory
        if output_dir:
            output_path = Path(output_dir) / "openapi.json"
        else:
            output_path = Path.cwd() / "docs" / "openapi.json"

        # Ensure directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Write JSON file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(json_string)

        print(f"OpenAPI JSON generated at: {output_path}")
        return str(output_path)

    except Exception as e:
        print(f"Error generating OpenAPI JSON: {e}")
        raise e


if __name__ == "__main__":
    # 既存のルートファイルのFastAPI注釈からOpenAPI仕様書を生成
    generate_openapi_json_at_root()
