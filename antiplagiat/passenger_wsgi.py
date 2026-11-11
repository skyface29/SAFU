"""Точка входа для хостинга с Passenger (например, виртуальный хостинг Beget).

Сервер сам импортирует этот файл и вызывает `application` на каждый запрос.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
os.environ.setdefault("ICEBERG_PUBLIC", "1")

from app import application  # noqa: E402,F401
