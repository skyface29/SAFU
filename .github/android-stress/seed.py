#!/usr/bin/env python3
"""Готовое состояние для стресс-теста: регистрация пройдена, расписание на всю неделю,
домашка, задачи и заметки. Пишет files/defaults.json в формате Defaults (Android)."""
import base64
import json
import sys
import time
import uuid

APPLE_EPOCH = 978_307_200  # 1 января 2001, как Date в iOS


def apple(ts: float) -> float:
    return ts - APPLE_EPOCH


def uid() -> str:
    return str(uuid.uuid4()).upper()


def data(value) -> dict:
    raw = json.dumps(value, ensure_ascii=False).encode("utf-8")
    return {"t": "data", "v": base64.b64encode(raw).decode("ascii")}


now = time.time()
day = 86_400

subjects = [
    ("Математический анализ", "Лекция", "Иванов И. И."),
    ("Программирование на Kotlin", "Лабораторная", "Петрова А. С."),
    ("Физика", "Практика", "Сидоров П. П."),
    ("История России", "Семинар", "Кузнецова Е. В."),
    ("Иностранный язык", "Практика", "Астахова М. Н."),
    ("Линейная алгебра", "Лекция", "Смирнов Д. А."),
    ("Физическая культура", "Физкультура", ""),
]

lessons = []
for weekday in range(1, 7):
    for pair in range(1, 5 if weekday < 6 else 3):
        name, kind, teacher = subjects[(weekday * 3 + pair) % len(subjects)]
        lessons.append({
            "id": uid(), "subject": name, "kind": kind, "weekday": weekday, "pair": pair,
            "parity": (pair + weekday) % 3, "room": f"{weekday}{pair}0{pair}",
            "building": "наб. Северной Двины, 17", "teacher": teacher,
        })

schedule = {"lessons": lessons, "ruzGroupNumber": "151621", "source": 0}

homework = []
for i, (name, kind, _) in enumerate(subjects):
    homework.append({
        "id": uid(), "subject": name,
        "text": ["стр. 45, № 5, 6", "1) прочитать главу 3\n2) конспект\n3) задачи 1–10",
                 "Лабораторная №4: отчёт и защита", "доклад на 5 минут", "", "№ 123–130 (чётные)",
                 "сдать норматив"][i],
        "kind": "exercises", "givenAt": apple(now - (i + 1) * day), "due": apple(now + (i - 2) * day),
        "anchor": apple(now - day), "rule": "date", "done": i == 3,
    })

tasks = [{"id": uid(), "title": f"Задача {i}", "subject": subjects[i % len(subjects)][0],
          "due": apple(now + (i - 3) * day), "note": "проверка" * i, "done": i % 4 == 0, "remind": True}
         for i in range(8)]

notes = [{"id": uid(), "title": t, "text": x, "subject": subjects[i][0], "color": i, "pinned": i == 0,
          "created": apple(now - i * day), "updated": apple(now - i * day / 2)}
         for i, (t, x) in enumerate([
             ("Формулы", "∫ x² dx = x³/3 + C\nlim (1 + 1/n)^n = e"),
             ("", "Очень длинная заметка " * 200),
             ("Эмодзи 🎓📚", "Проверка юникода: ёЁ ü 中文 עברית 🧪"),
             ("Пустая", ""),
         ])]

defaults = {
    "onboarded": {"t": "b", "v": True},
    "lock.app": {"t": "b", "v": False},
    "schedule.v1": data(schedule),
    "homework.v1": data(homework),
    "tasks.v1": data(tasks),
    "notes.v2": data(notes),
}

json.dump(defaults, sys.stdout, ensure_ascii=False)
