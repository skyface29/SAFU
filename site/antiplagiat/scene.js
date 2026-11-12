/* Сцена шапки: полярная ночь — звёзды, северное сияние, айсберг и его подводная часть, отражение в воде.
   Рисуется одним шейдером WebGL в уменьшенном разрешении (сцена мягкая, так дешевле для телефона).
   Нет WebGL или включено «уменьшить движение» — остаётся неподвижный фон из CSS. */
(function () {
  'use strict';
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  /* Айсберг — чёткая 3D-модель из граней (SVG). Строится один раз; двигается только transform. */
  function buildBerg(seed) {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const A = [[-470,0],[-430,-40],[-370,-70],[-320,-82],[-290,-150],[-235,-176],[-190,-232],[-140,-262],[-95,-340],[-60,-318],[-30,-268],[5,-252],[45,-300],[78,-286],[118,-222],[170,-206],[220,-150],[262,-138],[300,-96],[360,-72],[420,-30],[462,0]];
    const B = [[-470,0],[-540,70],[-590,190],[-560,320],[-470,440],[-330,560],[-170,640],[10,680],[190,630],[350,530],[480,390],[560,240],[575,110],[520,30],[462,0]];
    const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
    const dist = (P, x, y, skipWater) => { let m = 1e9; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if (skipWater && a[1] === 0 && b[1] === 0) continue; m = Math.min(m, segD(x, y, a[0], a[1], b[0], b[1])); } return m; };
    function edgePts(P, step, closeWater) {
      const out = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length]; out.push([a[0], a[1], 1]);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / step);
        for (let k = 1; k < n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 1]); }
      }
      return out;
    }
    function delaunay(pts) {
      const big = 1e5, P = pts.concat([[-big, -big], [big, -big], [0, big]]), n = pts.length;
      let tris = [[n, n + 1, n + 2]];
      const circ = t => { const [a, b, c] = t.map(i => P[i]); const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
        const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
        const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
        return [ux, uy, (a[0] - ux) ** 2 + (a[1] - uy) ** 2]; };
      let cc = tris.map(circ);
      for (let i = 0; i < n; i++) {
        const [x, y] = P[i], bad = [], keep = [], kc = [];
        tris.forEach((t, k) => { const c = cc[k]; ((x - c[0]) ** 2 + (y - c[1]) ** 2 < c[2]) ? bad.push(t) : (keep.push(t), kc.push(c)); });
        const edges = new Map();
        bad.forEach(t => [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach(([u, v]) => { const key = u < v ? u + ',' + v : v + ',' + u; edges.set(key, edges.has(key) ? null : [u, v]); }));
        tris = keep; cc = kc;
        edges.forEach(e => { if (e) { const t = [e[0], e[1], i]; tris.push(t); cc.push(circ(t)); } });
      }
      return tris.filter(t => t.every(i => i < n));
    }
    function mesh(P, minD, zf, under) {
      const pts = edgePts(P, minD * .8);
      const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      for (let k = 0; k < 12000 && pts.length < 600; k++) {
        const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        if (!inPoly(P, x, y) || dist(P, x, y) < minD * .55) continue;
        if (pts.some(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 < minD * minD)) continue;
        pts.push([x, y, 0]);
      }
      const peaks = under ? [] : P.filter((p, i) => i > 0 && i < P.length - 1 && p[1] < P[i - 1][1] && p[1] < P[i + 1][1]);
      const Z = pts.map(([x, y, e]) => {
        if (e) return 0;
        const d = dist(P, x, y, !under);
        let z = zf(d) + (rnd() - .5) * (under ? 70 : 22);
        peaks.forEach(([px, py]) => { z += 70 * Math.exp(-Math.abs(x - px) / 38) * Math.max(0, 1 - (y - py) / 420); });
        return z;
      });
      const tris = delaunay(pts.map(p => [p[0], p[1]])).filter(t => { const cx = (pts[t[0]][0] + pts[t[1]][0] + pts[t[2]][0]) / 3, cy = (pts[t[0]][1] + pts[t[1]][1] + pts[t[2]][1]) / 3; return inPoly(P, cx, cy); });
      return { pts, Z, tris };
    }
    const L = (() => { const v = [-.55, -.6, .58], m = Math.hypot(...v); return v.map(c => c / m); })();
    const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const rgb = c => 'rgb(' + c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',') + ')';
    function faces(M, under) {
      let out = '';
      M.tris.forEach(t => {
        const [a, b, c] = t.map(i => [M.pts[i][0], M.pts[i][1], M.Z[i]]);
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (n[2] < 0) n = n.map(x => -x);
        const m = Math.hypot(...n); n = n.map(x => x / m);
        const dif = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        const cy = (a[1] + b[1] + c[1]) / 3, j = (rnd() - .5) * .06;
        let col;
        if (!under) {
          col = mix([38, 82, 138], [132, 178, 222], sm(.15, .62, dif + j));
          col = mix(col, [246, 251, 255], sm(.6, .93, dif + j));
          col = mix(col, [86, 200, 225], sm(-70, 0, cy) * .45);                 // бирюза у воды
          col = mix(col, [120, 120, 230], (1 - dif) * .12);                      // фиолетовый отсвет сияния в тени
        } else {
          col = mix([16, 62, 108], [56, 140, 198], sm(.25, .9, dif + j * .6));
          col = mix(col, [120, 214, 240], sm(.86, 1, dif + j) * .45);
        }
        const d = [a, b, c].map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
        out += `<polygon points="${d}" fill="${rgb(col)}" stroke="${rgb(col)}" stroke-width=".8"/>`;
      });
      return out;
    }
    const top = mesh(A, 48, d => 150 * Math.sqrt(Math.min(d, 200) / 200), false);
    const bot = mesh(B, 56, d => 200 * Math.sqrt(Math.min(d, 150) / 150), true);
    const path = P => 'M' + P.map(p => p.join(',')).join('L');
    const topEdge = path(A.slice(0)), botEdge = path(B);
    return `<svg class="berg" viewBox="-640 -380 1280 1120" aria-hidden="true">
  <defs>
  <linearGradient id="bgUnder" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="bgMask" maskUnits="userSpaceOnUse" x="-640" y="0" width="1280" height="740"><rect x="-640" y="0" width="1280" height="740" fill="url(#bgUnder)"/></mask>
  <radialGradient id="bgGlow" cx="0" cy="0" r="1" gradientTransform="translate(0 0) scale(560 120)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8fe6ff" stop-opacity=".55"/><stop offset="1" stop-color="#8fe6ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="bgSheen" x1="0" y1="-340" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <g mask="url(#bgMask)" opacity=".9">${faces(bot, true)}<path d="${botEdge}Z" fill="none" stroke="#9be4ff" stroke-opacity=".45" stroke-width="1.6"/></g>
  <ellipse cx="0" cy="0" rx="560" ry="120" fill="url(#bgGlow)"/>
  <g>${faces(top, false)}<path d="${topEdge}Z" fill="url(#bgSheen)"/></g>
  <path d="${path(A.slice(1, -1))}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-linejoin="round"/>
  <path d="M-500,0H500" stroke="#bff3ff" stroke-opacity=".8" stroke-width="2"/>
  </svg>`;
  }

  /* айсберг кладётся поверх неба: ватерлиния совпадает с горизонтом сцены */
  canvas.insertAdjacentHTML('afterend', buildBerg(7));
  const berg = canvas.nextElementSibling;
  function placeBerg() {
    const w = canvas.clientWidth, h = canvas.clientHeight, ph = innerWidth <= 760, wide = w > 900;
    const hz = ph ? .24 : .36, bx = wide ? .79 : ph ? .78 : .74, bs = wide ? .26 : ph ? .17 : .28;
    const k = bs * h / 500;                       // единиц рисунка в пикселе: полуширина надводной части = bs·высоты
    berg.style.width = (1280 * k) + 'px'; berg.style.height = (1120 * k) + 'px';
    berg.style.left = (bx * w - 640 * k) + 'px'; berg.style.top = (h * (1 - hz) - 380 * k) + 'px';
  }
  placeBerg(); addEventListener('resize', placeBerg);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const lite = document.documentElement.classList.contains('lite');
  const FRAG = (lite ? '#define OCT 3\n' : '#define OCT 5\n') + `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uHorizon; uniform float uBergX; uniform float uBergS;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<OCT;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}

vec3 sky(vec2 q, float t, vec2 m){
  /* q.x — по горизонтали (в долях высоты), q.y — высота над горизонтом 0..1 */
  vec3 col = mix(vec3(.035,.06,.12), vec3(.008,.012,.03), smoothstep(0.,.9,q.y));
  col += vec3(.04,.09,.16)*exp(-q.y*5.);                       // свечение у горизонта
  /* звёзды */
  vec2 g = q*vec2(90.,90.) + m*3.;
  vec2 id = floor(g); vec2 f = fract(g)-.5;
  float r = hash(id);
  if(r>.965){ float tw=.55+.45*sin(t*(1.+r*3.)+r*40.); col += vec3(.85,.92,1.)*smoothstep(.09,0.,length(f))*tw*smoothstep(.0,.25,q.y); }
  /* сияние: три завесы с тонкими вертикальными лучами */
  vec3 au = vec3(0.);
  for(int k=0;k<3;k++){
    float fk=float(k);
    float x = q.x + m.x*(.04+.03*fk);
    x += .35*fbm(vec2(x*.35 + fk*5., t*.015));                   // ленты изгибаются
    float base = .38 + .11*fk + .13*sin(x*1.25 + t*.05 + fk*2.1) + .16*(fbm(vec2(x*.8 + fk*4.1, t*.035 + fk)) - .5);
    float d = q.y - base;
    float edge = smoothstep(-.07,.025,d);                       // мягкий нижний край
    float fall = exp(-max(d,0.)*(2.3+fk*1.1));                  // плавное угасание вверх
    float rays = fbm(vec2(x*14. + fk*7., t*.18 + d*1.5));
    rays = .35 + .65*smoothstep(.25,.85,rays);
    float patch = smoothstep(.38,.72, fbm(vec2(x*.6 - t*.015 + fk*11., fk*3.)));
    vec3 c = mix(vec3(.30,.98,.78), vec3(.30,.62,1.), fk*.5);
    c = mix(c, vec3(.58,.45,1.), smoothstep(.04,.30,d));         // фиолетовые макушки
    au += c * edge * fall * rays * patch * (1.15 - fk*.3);
  }
  col += au*.95*smoothstep(.02,.2,q.y);
  return col;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;                // 0..1, y вверх
  float aspect = uRes.x/uRes.y;
  float t = uTime;
  vec2 m = uMouse;
  float hz = uHorizon;                             // доля высоты, где горизонт
  vec2 q = vec2(uv.x*aspect, (uv.y-hz)/(1.-hz));   // над горизонтом
  vec3 col;

  if(uv.y >= hz){
    col = sky(q, t, m);
  } else {
    /* вода: отражение неба и айсберга, рябь, подводная часть */
    float depth = (hz-uv.y)/hz;                                     // 0 у горизонта, 1 внизу
    float rip = (fbm(vec2(uv.x*aspect*6., depth*28. - t*.6)) - .5) * (.012 + .05*depth);
    vec2 rq = vec2(q.x + rip*3., (hz-uv.y + rip*.6)/(1.-hz)*1.05);
    vec3 refl = sky(rq, t, m) * (.42 - .22*depth);
    col = mix(vec3(.012,.035,.07), vec3(.0,.008,.02), depth) + refl;
    /* световые столбы сквозь воду */
    float shafts = smoothstep(.55,.9, fbm(vec2(uv.x*aspect*3. + depth*1.5, t*.05)));
    col += vec3(.08,.22,.30) * shafts * (1.-depth) * .35;
    /* блики на воде */
    float glint = smoothstep(.78,.95, noise(vec2(uv.x*aspect*55., depth*160. - t*1.8))) * (1.-depth);
    col += vec3(.5,.9,.95) * glint * .10;
    /* светлая линия горизонта */
    col += vec3(.35,.8,.9) * exp(-depth*120.) * .35;
  }
  /* виньетка и лёгкая дымка у горизонта */
  col += vec3(.06,.12,.16) * exp(-abs(uv.y-hz)*28.) * .5;
  col *= .78 + .22*smoothstep(1.25,.25,length((uv-.5)*vec2(aspect*.8,1.)));
  gl_FragColor = vec4(pow(col, vec3(.95)), 1.);
}`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  const uRes = U('uRes'), uTime = U('uTime'), uMouse = U('uMouse'), uHorizon = U('uHorizon'), uBergX = U('uBergX'), uBergS = U('uBergS');

  const phone = matchMedia('(max-width: 760px)').matches;
  let scale = lite ? (phone ? .36 : .42) : (phone ? .5 : .55);
  const step = lite || phone ? 42 : 30;     // мс между кадрами: 24 или 33 кадра в секунду
  let dive = 0, scrolling = false;
  let W = 0, H = 0, visible = true, mouse = [0, 0], target = [0, 0], start = performance.now(), last = 0;
  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.25);   // сцена мягкая: retina-разрешение ей не нужно
    W = Math.max(2, Math.round(r.width * dpr * scale)); H = Math.max(2, Math.round(r.height * dpr * scale));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H); }
  }
  function draw(now) {
    const wide = canvas.clientWidth > 900;
    mouse[0] += (target[0] - mouse[0]) * .05; mouse[1] += (target[1] - mouse[1]) * .05;
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uTime, (now - start) / 1000 + 20);
    gl.uniform2f(uMouse, mouse[0], mouse[1]);
    gl.uniform1f(uHorizon, phone ? .24 : .36);
    gl.uniform1f(uBergX, wide ? .79 : phone ? .78 : .74);
    gl.uniform1f(uBergS, wide ? .26 : phone ? .17 : .28);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  /* Подстройка под устройство: если кадры приходят заметно реже задуманного, сцена рисуется
     в меньшем разрешении; если не помогает и это — замирает на последнем кадре (страница не тормозит). */
  const gaps = [];
  let frozen = false;
  function adapt(gap) {
    if (gap > 250) { gaps.length = 0; return; }            // вкладка просыпалась — не считаем
    gaps.push(gap);
    if (gaps.length < 40) return;
    const sorted = gaps.slice().sort((a, b) => a - b), med = sorted[gaps.length >> 1];
    gaps.length = 0;
    if (med < step * 1.45) return;
    if (scale > .26) { scale = Math.max(.25, scale * .78); layout(); }
    else frozen = true;
  }
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || document.hidden || frozen || scrolling) return;   // во время прокрутки небо не перерисовывается
    if (now - last < step) return;
    if (last) adapt(now - last);
    last = now;
    draw(now);
  }
  layout(); draw(performance.now());
  document.documentElement.classList.add('gl');
  addEventListener('resize', () => { layout(); draw(performance.now()); });
  /* При прокрутке сцена не перерисовывается, а плавно уезжает и слегка увеличивается — это делает
     видеокарта без пересчёта шейдера («погружение» под воду). Перерисовка — через 150 мс после остановки. */
  let idle = 0, ticking = false;
  if (!calm) addEventListener('scroll', () => {
    scrolling = true; clearTimeout(idle); idle = setTimeout(() => { scrolling = false; last = 0; gaps.length = 0; }, 150);
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      dive = Math.min(1, Math.max(0, scrollY / Math.max(1, canvas.clientHeight)));
      canvas.style.transform = dive ? `translate3d(0,${(dive * 18).toFixed(1)}%,0) scale(${(1 + dive * .12).toFixed(3)})` : '';
      berg.style.transform = dive ? `translate3d(0,${(dive * canvas.clientHeight * .18).toFixed(1)}px,0)` : '';
    });
  }, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(canvas);
  if (!calm) {
    if (matchMedia('(hover: hover)').matches) {
      addEventListener('pointermove', e => { target = [e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)]; });
    }
    requestAnimationFrame(loop);
  }
})();
