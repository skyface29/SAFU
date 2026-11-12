/* Сцена шапки: полярная ночь — звёзды, северное сияние, айсберг и его подводная часть, отражение в воде.
   Рисуется одним шейдером WebGL в уменьшенном разрешении (сцена мягкая, так дешевле для телефона).
   Нет WebGL или включено «уменьшить движение» — остаётся неподвижный фон из CSS. */
(function () {
  'use strict';
  const canvas = document.getElementById('scene');
  if (!canvas) return;
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

/* силуэт айсберга: несколько мягких вершин + рваная кромка из шума. x в [-1,1], высота 0..1 */
float g2(float x,float c,float w){ float d=(x-c)/w; return exp(-d*d); }
float prof(float x){
  float h = .95*g2(x,-.12,.20) + .62*g2(x,.24,.16) + .40*g2(x,-.46,.20) + .25*g2(x,.55,.18);
  h = pow(clamp(h,0.,1.2), .6);                                   // крутые обрывы у воды, высокие макушки                                              // макушки чуть площе — как у настоящих
  h += .045*(noise(vec2(x*4.,3.1))-.5) + .03*(noise(vec2(x*9.,5.))-.5) + .03*(noise(vec2(x*30.,7.))-.5); // три октавы вместо fbm — дешевле // рваная кромка
  return max(0., h*smoothstep(1.,.70,abs(x)) - .02);
}
/* рельеф поверхности льда — из него берётся объём (нормаль) */
float ice(vec2 p){ float r = 1.-abs(2.*noise(p*vec2(9.,3.))-1.); return .5*fbm(p*vec2(2.2,1.4)) + .18*r*r; }
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

  /* айсберг */
  float bx = (uv.x*aspect - uBergX*aspect - m.x*.035) / uBergS;   // нормированный x
  float bh = uBergS*.64;                                            // высота надводной части в долях высоты экрана
  if(uv.y >= hz){
    col = sky(q, t, m);
    if(abs(bx)<1.){
      float h = prof(bx) * bh;
      float yy = uv.y - hz;
      if(yy < h + .003){
        vec2 pp = vec2(bx, yy/bh);
        float e = .015, k = .6;
        float fx = ice(pp+vec2(e,0.)) - ice(pp-vec2(e,0.));
        float fy = ice(pp+vec2(0.,e)) - ice(pp-vec2(0.,e));
        float sl = (prof(bx+.02)-prof(bx-.02))*6.;                  // общий наклон склона: левый к свету, правый в тени
        vec3 n = normalize(vec3(-fx/(2.*e)*k*.35 - sl*.55, -fy/(2.*e)*k*.35 + .25, 1.));
        vec3 L = normalize(vec3(-.6,.5,.65));
        float dif = clamp(dot(n,L), 0., 1.);
        vec3 c = mix(vec3(.07,.19,.36), vec3(.42,.64,.86), smoothstep(.05,.55,dif));
        c = mix(c, vec3(.93,.97,1.), smoothstep(.55,.95,dif));
        float cav = smoothstep(.62,.30, ice(pp*1.3+3.));            // впадины светятся голубым изнутри
        c = mix(c, vec3(.18,.58,.88), cav*.14);
        c *= .94 + .06*fbm(vec2(bx*26., yy*3.));                     // вертикальные борозды на обрывах
        c = mix(c, vec3(.97,.99,1.), smoothstep(h-.012,h,yy)*smoothstep(-.2,.6,n.y)*.55); // снег на макушках
        c += vec3(.25,.95,.75)*.05*(1.-dif);                        // отсвет сияния в тени
        c += vec3(.75,.9,1.)*exp(-(h-yy)*260.)*.35;                  // светлая кромка
        c = mix(c, vec3(.35,.85,.92), smoothstep(.035,0.,yy)*.45);   // бирюза у воды
        c += vec3(.8,.97,1.)*exp(-yy*500.)*.35;                      // пена по ватерлинии
        float aa = smoothstep(h+.0015, h-.0015, yy);
        col = mix(col, c, aa);
      }
    }
  } else {
    /* вода: отражение неба и айсберга, рябь, подводная часть */
    float depth = (hz-uv.y)/hz;                                     // 0 у горизонта, 1 внизу
    float rip = (fbm(vec2(uv.x*aspect*6., depth*28. - t*.6)) - .5) * (.012 + .05*depth);
    vec2 rq = vec2(q.x + rip*3., (hz-uv.y + rip*.6)/(1.-hz)*1.05);
    vec3 refl = sky(rq, t, m) * (.42 - .22*depth);
    /* отражение айсберга */
    if(abs(bx+rip*2.)<1.){
      float h = prof(bx+rip*2.) * bh;
      float yy = hz-uv.y;
      if(yy < h) refl = mix(refl, vec3(.36,.52,.7)*(.55-.3*depth), smoothstep(h, h-.01, yy)*.8);
    }
    col = mix(vec3(.012,.035,.07), vec3(.0,.008,.02), depth) + refl;
    /* подводная часть — главная метафора: огромная, светится сквозь толщу */
    float ux = bx / 1.6;
    if(abs(ux)<1.){
      float yy = hz-uv.y;
      float under = (prof(ux*.85)*.75 + .28*smoothstep(1.,.15,abs(ux)) + .05*(noise(vec2(ux*4.,9.))-.5)) * bh * 2.4;
      float inside = smoothstep(under, under-.03, yy) * smoothstep(0.,.02,yy) * smoothstep(1.,.82,abs(ux));
      float fade = exp(-yy/max(under,.01)*1.6);                       // уходит в темноту с глубиной
      vec2 cp = vec2(ux*5., yy*8.) + vec2(t*.03, -t*.02);
      float caus = pow(1.-abs(2.*fbm(cp)-1.), 5.);                     // каустика — свет сквозь воду
      float rim = exp(-abs(under-yy)*90.) * smoothstep(0.,.02,yy) * smoothstep(1.,.8,abs(ux));
      col += inside * (.35 + .65*fade) * (vec3(.07,.34,.56) + vec3(.30,.80,1.)*caus*.45);
      col += vec3(.35,.85,1.)*rim*.4*(1.-depth*.5);
    }
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
