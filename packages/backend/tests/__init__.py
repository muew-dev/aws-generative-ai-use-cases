"""テストパッケージ

TDDアプローチに基づく包括的なテストスイート

テスト実行コマンド:
    pytest                          # 全テスト実行
    pytest tests/unit/              # 単体テストのみ
    pytest tests/integration/       # 統合テストのみ
    pytest -k "rag"                 # RAG関連テストのみ
    pytest --cov=src --cov-report=html  # カバレッジレポート付き
"""