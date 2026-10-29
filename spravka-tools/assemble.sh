#!/bin/sh
# Собирает site/spravka/index.html: шапка и стили + поиск (engine.js) + интерфейс (ui.js)
cd "$(dirname "$0")"
{ cat page_head.html; sed '/^if(typeof module/d' engine.js; cat ui.js; printf '</script>\n</body>\n</html>\n'; } > ../site/spravka/index.html
