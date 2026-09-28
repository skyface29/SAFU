# ROSTFALL — дизайн-пакет

Концепт AAA стелс-экшен-триллера на Unreal Engine 5: фотореальный мир Machinarium, шпион в духе бондианы эпохи Крейга и Rammstein в роли «Индустриальных Богов», чей живой концерт — главная локация игры.

> Этот каталог не связан с iOS-приложением САФУ в корне репозитория и не участвует в его сборке.

| Файл | Что внутри |
|---|---|
| [`GDD.md`](GDD.md) | Game Design Document: логлайн, лор, арт-дирекшен, Rammstein в лоре, core-геймплей, миссия на концерте по актам, эндгейм, сетевая архитектура мультивселенной, стек UE5, адаптивный звук, риски |
| [`Source/Rostfall/Audio/ConcertAudioTypes.h`](Source/Rostfall/Audio/ConcertAudioTypes.h) | Типы: музыкальные состояния, снапшоты микса, песня сет-листа, решатель beat-warp |
| [`Source/Rostfall/Audio/ConcertAudioDirector.h`](Source/Rostfall/Audio/ConcertAudioDirector.h) / [`.cpp`](Source/Rostfall/Audio/ConcertAudioDirector.cpp) | Менеджер динамического аудио на MetaSound + Quartz |
| [`Source/Rostfall/Tests/ConcertBeatMathTests.cpp`](Source/Rostfall/Tests/ConcertBeatMathTests.cpp) | Automation-тесты beat-warp |
| [`Source/Rostfall/Rostfall.Build.cs`](Source/Rostfall/Rostfall.Build.cs) | Зависимости модуля |

**Код** рассчитан на API UE 5.4+ и переносится в игровой модуль `Rostfall`. В репозитории нет проекта UE, поэтому код здесь не компилировался. Чистая математика beat-warp проверена отдельно (см. тесты).

**Лицензирование.** Имена, образы и музыка Rammstein требуют лицензии правообладателей (GDD §13.1). Архитектура data-driven, поэтому группу можно заменить без переписывания систем.
