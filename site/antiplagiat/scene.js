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
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uHorizon; uniform float uBergX; uniform float uBergS;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}

/* профиль айсберга: ломаная по точкам, x в [-1,1], высота 0..1 */
float prof(float x){
  float xs[11]; float hs[11];
  xs[0]=-1.;hs[0]=0.; xs[1]=-.80;hs[1]=.16; xs[2]=-.60;hs[2]=.30; xs[3]=-.44;hs[3]=.58; xs[4]=-.26;hs[4]=.66;
  xs[5]=-.08;hs[5]=1.; xs[6]=.10;hs[6]=.72; xs[7]=.28;hs[7]=.82; xs[8]=.50;hs[8]=.42; xs[9]=.74;hs[9]=.22; xs[10]=1.;hs[10]=0.;
  float h=0.;
  for(int i=0;i<10;i++){ if(x>=xs[i]&&x<=xs[i+1]){ h=mix(hs[i],hs[i+1],(x-xs[i])/(xs[i+1]-xs[i])); } }
  return h;
}
float slope(float x){ return prof(x+.004)-prof(x-.004); }

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
  float bh = uBergS*.62;                                            // высота надводной части в долях высоты экрана
  if(uv.y >= hz){
    col = sky(q, t, m);
    if(abs(bx)<1.){
      float h = prof(bx) * bh;
      float yy = uv.y - hz;
      if(yy < h){
        float s = slope(bx);
        float lit = s>0. ? 1. : .5;                                 // свет слева-сверху
        float bandI = floor(bx*4.5 + yy*7.);                        // грани
        float tone = lit*(.80 + .20*hash(vec2(bandI, 3.)));
        tone *= .66 + .34*smoothstep(0., h, yy);                    // к вершине светлее
        vec3 ice = mix(vec3(.24,.42,.70), vec3(.95,.98,1.), tone);
        ice *= .94 + .06*noise(vec2(bx*40., yy*90.));               // едва заметная фактура
        ice = mix(ice, vec3(.45,.86,.96), smoothstep(.03,0.,yy)*.55); // бирюза у воды
        ice += vec3(.10,.36,.30)*.12*lit;                           // отсвет сияния
        ice += vec3(.6,.8,1.)*smoothstep(h-.004,h,yy)*.25;          // светлая кромка
        float aa = smoothstep(h, h-.0025, yy);
        col = mix(col, ice*(.82+.18*sin(t*.3)), aa);
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
    float ux = bx / 1.55;
    if(abs(ux)<1.){
      float under = prof(ux)*bh*2.2;
      float yy = hz-uv.y;
      float body = smoothstep(under, under-.05, yy) * smoothstep(0.,.03,yy) * smoothstep(1.,.8,abs(ux));
      float vein = fbm(vec2(ux*5. + t*.02, yy*9.));
      float rim = smoothstep(under-.05, under-.012, yy) * smoothstep(under, under-.012, yy);
      col += vec3(.10,.46,.68) * body * (.42 + .30*vein) * (1.-depth*.5) + vec3(.3,.8,.95)*rim*.25*(1.-depth*.6);
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
  const scale = phone ? .5 : .55;
  let W = 0, H = 0, visible = true, mouse = [0, 0], target = [0, 0], start = performance.now(), last = 0;
  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
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
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (now - last < (phone ? 40 : 30)) return;       // 25–33 кадра в секунду хватает для неба
    last = now;
    draw(now);
  }
  layout(); draw(performance.now());
  document.documentElement.classList.add('gl');
  addEventListener('resize', () => { layout(); draw(performance.now()); });
  if ('IntersectionObserver' in window) new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(canvas);
  if (!calm) {
    if (matchMedia('(hover: hover)').matches) {
      addEventListener('pointermove', e => { target = [e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)]; });
    }
    requestAnimationFrame(loop);
  }
})();
