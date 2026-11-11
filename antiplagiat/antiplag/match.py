"""Сравнение документа с источником.

Идея та же, что у шинглов Антиплагиата, но с выравниванием: общие тройки основ
слов служат «затравками», от которых совпадение растягивается в обе стороны и
переживает замену, вставку или удаление отдельных слов. Поэтому ловится не
только копипаст, но и перефразирование с подменой слов и форм.
"""

K = 3            # длина шингла в содержательных словах
MIN_MATCH = 6    # минимум совпавших содержательных слов во фрагменте
MIN_WEAK = 4     # короткий фрагмент засчитывается, только если рядом есть ещё один
NEAR_DOC = 12    # «рядом» в документе, в содержательных словах
NEAR_SRC = 60    # «рядом» в источнике
MAX_GAP = 3      # сколько слов подряд можно пропустить с каждой стороны
MAX_CANDS = 40   # сколько мест в источнике пробовать для одной затравки


def shingle_index(stems):
    """Словарь: тройка основ -> позиции в источнике."""
    idx = {}
    for j in range(len(stems) - K + 1):
        idx.setdefault((stems[j], stems[j + 1], stems[j + 2]), []).append(j)
    return idx


def shingle_set(stems):
    return {(stems[j], stems[j + 1], stems[j + 2]) for j in range(len(stems) - K + 1)}


def _extend(D, S, i, j, lo_i, step):
    """Растягивает совпадение от пары (i, j) в направлении step (+1 или -1).

    Возвращает список совпавших пар (позиция в документе, позиция в источнике).
    """
    n, m = len(D), len(S)
    pairs = []
    pi, pj = i, j
    while lo_i <= pi < n and 0 <= pj < m:
        if D[pi] == S[pj]:
            pairs.append((pi, pj))
            pi += step
            pj += step
            continue
        found = False
        for total in range(1, 2 * MAX_GAP + 1):
            for a in range(max(0, total - MAX_GAP), min(total, MAX_GAP) + 1):
                x = pi + a * step
                y = pj + (total - a) * step
                x2, y2 = x + step, y + step
                if lo_i <= x < n and lo_i <= x2 < n and 0 <= y < m and 0 <= y2 < m \
                        and D[x] == S[y] and D[x2] == S[y2]:
                    pi, pj = x, y
                    found = True
                    break
            if found:
                break
        if not found:
            break
    return pairs


def align(doc, src, src_index=None):
    """Находит совпадающие фрагменты документа и источника.

    Возвращает список словарей:
      ws, we    — номера первого и последнего слова фрагмента в документе
      type      — 'exact' (дословно) или 'para' (перефразировано)
      matched   — число совпавших содержательных слов
      s_from, s_to — отрезок текста источника, где найден фрагмент
    """
    D, S = doc.stems, src.stems
    if len(D) < K or len(S) < K:
        return []
    if src_index is None:
        src_index = shingle_index(S)
    spans = []
    n = len(D)
    i = 0
    floor = 0  # левее этой позиции документ уже размечен
    while i <= n - K:
        cands = src_index.get((D[i], D[i + 1], D[i + 2]))
        if not cands:
            i += 1
            continue
        best = None
        for j in cands[:MAX_CANDS]:
            fwd = _extend(D, S, i, j, floor, 1)
            if best is None or len(fwd) > len(best[0]):
                best = (fwd, j)
        fwd, j = best
        if len(fwd) < MIN_WEAK:
            i += 1
            continue
        back = _extend(D, S, i - 1, j - 1, floor, -1) if i > floor and j > 0 else []
        pairs = back[::-1] + fwd
        spans.append(_make_span(doc, src, pairs))
        i = pairs[-1][0] + 1
        floor = i
    return _keep_reliable(spans)


def _keep_reliable(spans):
    """Оставляет длинные фрагменты и короткие, стоящие рядом с другими.

    Так ловится перестановка частей предложения: каждый кусок короток, но они
    идут подряд и в документе, и в источнике. Одиночные короткие совпадения —
    обычно расхожие обороты — отбрасываются.
    """
    out = []
    for k, sp in enumerate(spans):
        keep = sp["matched"] >= MIN_MATCH
        if not keep:
            for other in spans[max(0, k - 1):k] + spans[k + 1:k + 2]:
                gap_doc = max(other["_i0"] - sp["_i1"], sp["_i0"] - other["_i1"])
                gap_src = max(other["_j0"] - sp["_j1"], sp["_j0"] - other["_j1"])
                if gap_doc <= NEAR_DOC and gap_src <= NEAR_SRC:
                    keep = True
                    sp["type"] = "para"
                    break
        if keep:
            out.append(sp)
    for sp in out:
        for key in ("_i0", "_i1", "_j0", "_j1"):
            sp.pop(key, None)
    return out


def _make_span(doc, src, pairs):
    i0, j0 = pairs[0]
    i1, j1 = pairs[-1]
    matched = len(pairs)
    same_form = sum(1 for pi, pj in pairs if doc.norm[doc.cidx[pi]] == src.norm[src.cidx[pj]])
    dens_doc = matched / (i1 - i0 + 1)
    dens_src = matched / (j1 - j0 + 1)
    exact = dens_doc >= 0.93 and dens_src >= 0.93 and same_form >= 0.93 * matched
    ws, we = doc.cidx[i0], doc.cidx[i1]
    sw, se = src.cidx[j0], src.cidx[j1]
    # Захватываем служебные слова по краям, если они совпадают и в источнике.
    for _ in range(3):
        if ws > 0 and sw > 0 and doc.norm[ws - 1] == src.norm[sw - 1]:
            ws -= 1
            sw -= 1
        else:
            break
    last_d, last_s = len(doc.words) - 1, len(src.words) - 1
    for _ in range(3):
        if we < last_d and se < last_s and doc.norm[we + 1] == src.norm[se + 1]:
            we += 1
            se += 1
        else:
            break
    return {
        "ws": ws,
        "we": we,
        "type": "exact" if exact else "para",
        "matched": matched,
        "s_from": src.words[sw][0],
        "s_to": src.words[se][1],
        "_i0": i0, "_i1": i1, "_j0": j0, "_j1": j1,
    }
