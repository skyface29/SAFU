/* Сцена шапки: полярная ночь — звёзды, северное сияние, айсберг и его подводная часть, отражение в воде.
   Рисуется одним шейдером WebGL в уменьшенном разрешении (сцена мягкая, так дешевле для телефона).
   Нет WebGL или включено «уменьшить движение» — остаётся неподвижный фон из CSS. */
(function () {
  'use strict';
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  /* Айсберг: 3D-рельеф (трассировка лучей по карте высот), рисуется ОДИН раз — дальше это просто картинка. */
  function renderBerg(cv, W, H) {
    const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    cv.width = W; cv.height = H;
    const FS = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform vec2 R;
  float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
  float ridged(vec2 p){ float s=0., a=.5, w=1.; mat2 m=mat2(1.6,1.2,-1.2,1.6);
    for(int i=0;i<7;i++){ float n=1.-abs(noise(p)*2.-1.); n*=n; s+=n*a*w; w=clamp(n*1.6,0.,1.); p=m*p; a*=.5; } return s; }
  float fbm(vec2 p){ float s=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ s+=a*noise(p); p=m*p; a*=.5; } return s; }
  /* форма горы: главный пик + плечи; высота над водой */
  float mass(vec2 q){
    float b = 1.0*exp(-dot(q*vec2(.9,1.3),q*vec2(.9,1.3))*1.4);
    vec2 s1=q-vec2(.75,.15); b += .55*exp(-dot(s1,s1)*3.5);
    vec2 s2=q-vec2(-.8,-.1); b += .42*exp(-dot(s2,s2)*3.);
    return b;
  }
  float H(vec2 q){
    vec2 w = q + .25*vec2(fbm(q*1.3+3.), fbm(q*1.3+7.));   // изгиб гребней
    float b = mass(q);
    return b*(.6 + .55*ridged(w*1.5)) - .38;
  }
  vec3 nrm(vec2 q){ float e=.0025; return normalize(vec3(H(q-vec2(e,0.))-H(q+vec2(e,0.)), 2.*e, H(q-vec2(0.,e))-H(q+vec2(0.,e)))); }
  /* подводная часть — больше и шире, уходит вниз */
  float U(vec2 q){ float b = 2.2*exp(-dot(q*vec2(.78,1.),q*vec2(.78,1.))*1.5); return b*(.7+.45*fbm(q*1.8)) - .7; }
  vec3 unrm(vec2 q){ float e=.01; return normalize(vec3(U(q+vec2(e,0.))-U(q-vec2(e,0.)), 2.*e, U(q+vec2(0.,e))-U(q-vec2(0.,e)))); }
  void main(){
    vec2 uv = (gl_FragCoord.xy - .5*R)/R.y; uv.x = -uv.x;   // вершина справа — подальше от заголовка
    vec3 ro = vec3(0., .07, -6.2);
    vec3 rd = normalize(vec3(uv.x, uv.y + .02, 3.1));
    vec3 L = normalize(vec3(.65,.55,-.45));
    vec4 o = vec4(0.);
    float t = 3.; bool hit=false; vec3 p;
    for(int i=0;i<420;i++){
      p = ro + rd*t;
      if(p.y < 0.) break;
      float h = H(p.xz);
      float d = p.y - h;
      if(d < .0015*t){ hit=true; break; }
      t += max(.003, d*.25);
      if(t > 10.) break;
    }
    if(hit){
      vec3 n = nrm(p.xz);
      float dif = clamp(dot(n,L),0.,1.);
      float sky = .5+.5*n.y;
      float sl = n.y;                                  // 1 — горизонтально, 0 — отвесно
      float hgt = clamp(p.y/1.4,0.,1.);
      float sh = 1.;                                   // мягкая тень от соседних гребней
      float st = .02;
      for(int j=0;j<40;j++){ vec3 q=p+L*st; float dd=q.y-H(q.xz); sh=min(sh, 10.*dd/st); st+=max(.01,dd*.5); if(sh<0.||st>2.5) break; }
      sh = clamp(sh,0.,1.);
      float ao = clamp(.45 + 1.2*(p.y - (H(p.xz+vec2(.06,0.))+H(p.xz-vec2(.06,0.))+H(p.xz+vec2(0.,.06))+H(p.xz-vec2(0.,.06)))*.25) + .4*hgt, 0., 1.);
      vec3 ice  = vec3(.55,.75,.92);
      vec3 deep = vec3(.10,.35,.62);
      vec3 snow = vec3(.96,.98,1.);
      float sn = smoothstep(.35,.75,sl + .15*fbm(p.xz*18.) + .25*hgt);
      vec3 alb = mix(mix(deep, ice, .35+.65*sl), snow, sn);
      vec3 c = alb*(1.35*dif*sh*vec3(1.,.98,.95) + .42*sky*vec3(.6,.75,1.));
      c += deep*(1.-dif*sh)*.22*(1.-sn);                 // свет сквозь лёд в тени
      c += vec3(.2,.9,.7)*.05*(1.-dif);                  // отсвет сияния
      c *= .6+.4*ao;
      c = mix(c, vec3(.45,.85,.95), smoothstep(.06,0.,p.y)*.55);   // бирюза у воды
      c += vec3(.8,.95,1.)*smoothstep(.015,0.,p.y)*.5;             // пена
      c = mix(c, vec3(.12,.2,.35), clamp((t-5.)*.06,0.,.25));      // воздушная дымка
      o = vec4(c,1.);
    } else if(rd.y < 0.) {
      float tw = -ro.y/rd.y; vec3 w = ro + rd*tw;
      {
        vec3 d2 = rd;                                         // классический «разрез»: вода прозрачная, видно массу подо льдом     // преломление: под водой луч уходит круче
        float s = 0.; bool uh=false; vec3 q;
        for(int i=0;i<300;i++){ q = w + d2*s; float dd = U(q.xz) + q.y; if(dd > 0.){ uh = true; break; } s += .02; if(s>6.) break; }
        if(uh){
          float sh=0.;                                      // уточнение точки
          vec3 n = unrm(q.xz);
          float lit = clamp(dot(n, normalize(vec3(-.4,-.8,-.3)))*-1.,0.,1.);
          float depth = -q.y;
          vec3 c = mix(vec3(.30,.70,.92), vec3(.03,.14,.30), clamp(depth/1.6,0.,1.));
          c *= .75 + .45*clamp(dot(n, normalize(vec3(.5,.3,-.8))),0.,1.);
          c *= .7 + .3*fbm(q.xz*5.);
          float caus = pow(1.-abs(fbm(q.xz*7.+3.)*2.-1.), 6.);
          c += vec3(.4,.9,1.)*caus*.25*(1.-clamp(depth/1.5,0.,1.));
          float a = (1.-clamp(depth/2.4,0.,1.))*.88*exp(-s*.12);
          o = vec4(c*a, a);
        }
      }
    }
    gl_FragColor = o;
  }`;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(x)); return null; } return x; };
    const v = sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'), f = sh(gl.FRAGMENT_SHADER, FS);
    if (!v || !f) return false;
    const pr = gl.createProgram(); gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const l = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, W, H); gl.uniform2f(gl.getUniformLocation(pr, 'R'), W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  /* Айсберг — отдельный холст поверх неба. Рисуется один раз (и заново только при смене размера),
     ватерлиния (55,4% высоты холста) совпадает с горизонтом сцены. */
  const berg = document.createElement('canvas');
  berg.className = 'berg'; berg.setAttribute('aria-hidden', 'true');
  canvas.after(berg);
  let bergKey = '';
  function placeBerg() {
    const w = canvas.clientWidth, h = canvas.clientHeight, ph = innerWidth <= 760, wide = w > 900;
    const hz = ph ? .24 : .36, cx = wide ? .785 : ph ? .74 : .72;
    const above = Math.min(w * (ph ? .62 : .42), h * (ph ? .5 : .6));   // ширина надводной части, px
    const cw = above / .825, ch = cw * .7;
    berg.style.width = cw + 'px'; berg.style.height = ch + 'px';
    berg.style.left = (cx * w - cw / 2) + 'px'; berg.style.top = (h * (1 - hz) - ch * .554) + 'px';
    const dpr = Math.min(devicePixelRatio || 1, 2), W = Math.round(cw * dpr), H = Math.round(ch * dpr), key = W + 'x' + H;
    if (key !== bergKey) { bergKey = key; if (!renderBerg(berg, W, H)) berg.remove(); }
  }
  placeBerg();
  let bergT = 0; addEventListener('resize', () => { clearTimeout(bergT); bergT = setTimeout(placeBerg, 200); });
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
