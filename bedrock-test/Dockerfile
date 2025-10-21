FROM python:3.13-slim

WORKDIR /app

# Poetryのインストール
RUN pip install poetry

# Poetry設定 (仮想環境を作らない)
RUN poetry config virtualenvs.create false

# プロジェクトファイルをコピー
COPY pyproject.toml ./

# 依存関係をインストール
RUN poetry install --without dev --no-root

# アプリケーションコードをコピー
COPY . .

# メインスクリプトを実行
CMD ["python", "main.py"]