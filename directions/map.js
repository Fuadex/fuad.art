/* ============================================================
   createJourneyMap(mount, opts)
   A dark, stylized equirectangular "journey" map:
   faint dotted continents + graticule, accurately-projected
   location blips connected by arcs to a categorized list.
   Hover a blip OR a list row to cross-highlight.
   ============================================================ */
(function () {
  // lat/lon → projected x/y in a 1000×500 equirectangular space
  function project(lat, lon) {
    return { x: (lon + 180) / 360 * 1000, y: (90 - lat) / 180 * 500 };
  }

  // very loose continent blobs (projected coords) — rendered as faint dots
  const LAND = [
    [150, 333, 70, 200],  // North America
    [300, 340, 175, 215], // Central America
    [278, 392, 210, 392], // South America
    [470, 615, 80, 150],  // Europe
    [515, 590, 50, 92],   // Scandinavia
    [455, 640, 150, 345], // Africa
    [620, 905, 65, 225],  // Asia
    [690, 748, 165, 230], // India
    [845, 900, 120, 162], // Japan / Korea
    [760, 892, 225, 280], // SE Asia
    [815, 920, 280, 360], // Australia
  ];

  function makeDots(step) {
    let d = '';
    for (const [x0, x1, y0, y1] of LAND) {
      for (let x = x0; x <= x1; x += step) {
        for (let y = y0; y <= y1; y += step) {
          if (Math.random() < 0.32) continue;
          const jx = x + (Math.random() - 0.5) * step * 0.8;
          const jy = y + (Math.random() - 0.5) * step * 0.8;
          const r = (0.7 + Math.random() * 0.7).toFixed(2);
          const o = (0.10 + Math.random() * 0.16).toFixed(2);
          d += `<circle cx="${jx.toFixed(1)}" cy="${jy.toFixed(1)}" r="${r}" fill="var(--jm-land)" opacity="${o}"/>`;
        }
      }
    }
    return d;
  }

  function arcPath(a, b) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // lift control point perpendicular for a great-circle feel
    const lift = Math.min(120, len * 0.28);
    const cx = mx + (-dy / len) * lift;
    const cy = my + (dx / len) * lift - 6;
    return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  }

  function injectStyle() {
    if (document.getElementById('jm-style')) return;
    const s = document.createElement('style');
    s.id = 'jm-style';
    s.textContent = `
      .jm { display:grid; grid-template-columns: 1.5fr 1fr; gap:0; align-items:stretch;
            --jm-accent:#c8a96a; --jm-land:#9a978f; --jm-fg:#f3f1ec; --jm-fg2:#9a978f; --jm-fg3:#5a5852; --jm-rule:rgba(243,241,236,0.1); }
      .jm-map { position:relative; }
      .jm-map svg { width:100%; height:100%; display:block; }
      .jm-grat { stroke:var(--jm-rule); stroke-width:0.5; fill:none; }
      .jm-arc { stroke:var(--jm-accent); stroke-width:1; fill:none; opacity:0.18;
                transition:opacity .25s, stroke-width .25s; stroke-dasharray:3 4; }
      .jm-arc.on { opacity:0.9; stroke-width:1.4; stroke-dasharray:none; }
      .jm-blip { cursor:pointer; }
      .jm-blip .hit { fill:transparent; }
      .jm-blip .ring { fill:none; stroke:var(--jm-fg2); stroke-width:1; opacity:0.5; transition:all .25s; transform-box:fill-box; transform-origin:center; }
      .jm-blip .core { transition:all .25s; }
      .jm-blip.t-origin .core { fill:var(--jm-accent); }
      .jm-blip.t-study  .core { fill:var(--jm-fg); }
      .jm-blip.t-work   .core { fill:#4dd0ff; }
      .jm-blip.t-base   .core { fill:var(--jm-accent); }
      .jm-blip .lbl { font-family:"IBM Plex Mono",monospace; font-size:8.5px; letter-spacing:0.14em;
                      text-transform:uppercase; fill:var(--jm-fg2); opacity:0; transition:opacity .25s; }
      .jm-blip.on .ring, .jm-blip.hover .ring { stroke:var(--jm-accent); opacity:1; r:11; }
      .jm-blip.on .lbl, .jm-blip.hover .lbl { opacity:1; }
      .jm-pulse { fill:none; stroke:var(--jm-accent); }

      .jm-list { border-left:1px solid var(--jm-rule); padding:0; display:flex; flex-direction:column; }
      .jm-cat { padding:16px 26px 6px; }
      .jm-cat .h { font-family:"IBM Plex Mono",monospace; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--jm-fg3); }
      .jm-row { display:grid; grid-template-columns:14px 1fr auto; gap:12px; align-items:baseline;
                padding:9px 26px; cursor:pointer; transition:background .2s, padding-left .2s; }
      .jm-row:hover, .jm-row.on { background:rgba(255,255,255,0.03); padding-left:32px; }
      .jm-row .pin { width:7px; height:7px; border-radius:50%; align-self:center; background:var(--jm-fg3); transition:background .2s; }
      .jm-row.t-origin .pin, .jm-row.t-base .pin { background:var(--jm-accent); }
      .jm-row.t-work .pin { background:#4dd0ff; }
      .jm-row .nm { font-family:"Cormorant Garamond",serif; font-size:19px; color:var(--jm-fg); line-height:1.1; }
      .jm-row .nm .it { font-style:italic; }
      .jm-row .pl { font-family:"IBM Plex Mono",monospace; font-size:10px; color:var(--jm-fg3); letter-spacing:0.04em; }
      .jm-row .yr { font-family:"IBM Plex Mono",monospace; font-size:11px; color:var(--jm-fg2); }
    `;
    document.head.appendChild(s);
  }

  window.createJourneyMap = function (mount, opts) {
    opts = opts || {};
    injectStyle();
    const hub = { lat: -33.87, lon: 151.21 };
    const hubP = project(hub.lat, hub.lon);

    // id, name, place, lat, lon, type, year, cat
    const DATA = [
      { id:'pol', nm:'Grew up', pl:'Poland', lat:52.23, lon:21.01, t:'origin', yr:'', cat:'Origin' },
      { id:'syd', nm:'Home base', pl:'Sydney, AU', lat:-33.87, lon:151.21, t:'base', yr:'now', cat:'Origin' },
      { id:'par', nm:'Parsons', pl:'New York', lat:40.71, lon:-74.0, t:'study', yr:'’19', cat:'Education' },
      { id:'lmu', nm:'LMU', pl:'Munich', lat:48.14, lon:11.58, t:'study', yr:'’17', cat:'Education' },
      { id:'kai', nm:'KAIST', pl:'Daejeon, KR', lat:36.37, lon:127.36, t:'study', yr:'’18', cat:'Education' },
      { id:'aal', nm:'Aalto', pl:'Helsinki', lat:60.17, lon:24.94, t:'study', yr:'’18', cat:'Education' },
      { id:'usy', nm:'Univ. Sydney', pl:'Sydney, AU', lat:-33.89, lon:151.19, t:'study', yr:'’21', cat:'Education' },
      { id:'van', nm:'DNEG', pl:'Vancouver', lat:49.28, lon:-123.12, t:'work', yr:'’24', cat:'Experience' },
      { id:'mum', nm:'DNEG', pl:'Mumbai', lat:19.08, lon:72.88, t:'work', yr:'’24', cat:'Experience' },
      { id:'syw', nm:'DNEG · Fin D+E', pl:'Sydney, AU', lat:-33.86, lon:151.22, t:'work', yr:'’21–', cat:'Experience' },
    ];

    // ---- build SVG ----
    let grat = '';
    for (let lon = -150; lon <= 180; lon += 30) { const a = project(85, lon), b = project(-60, lon); grat += `<path class="jm-grat" d="M ${a.x} ${a.y} L ${b.x} ${b.y}"/>`; }
    for (let lat = 60; lat >= -45; lat -= 30) { const a = project(lat, -170), b = project(lat, 180); grat += `<path class="jm-grat" d="M ${a.x} ${a.y} L ${b.x} ${b.y}"/>`; }

    let arcs = '', blips = '';
    DATA.forEach(d => {
      const p = project(d.lat, d.lon);
      if (d.t !== 'base') arcs += `<path class="jm-arc" data-id="${d.id}" d="${arcPath(hubP, p)}"/>`;
      const labelAnchor = p.x > 760 ? 'end' : 'start';
      const lx = p.x > 760 ? -10 : 10;
      blips += `<g class="jm-blip t-${d.t}" data-id="${d.id}" transform="translate(${p.x},${p.y})">
          <circle class="hit" r="16"/>
          <circle class="ring" r="8"/>
          <circle class="core" r="${d.t==='base'?4:3}"/>
          <text class="lbl" x="${lx}" y="3" text-anchor="${labelAnchor}">${d.pl}</text>
        </g>`;
    });

    const svg = `<svg viewBox="120 55 840 330" preserveAspectRatio="xMidYMid meet">
        <g>${makeDots(13)}</g>
        <g>${grat}</g>
        <g>${arcs}</g>
        <g>${blips}</g>
      </svg>`;

    // ---- build list ----
    const cats = ['Origin', 'Education', 'Experience'];
    let list = '';
    cats.forEach(c => {
      list += `<div class="jm-cat"><div class="h">${c}</div></div>`;
      DATA.filter(d => d.cat === c).forEach(d => {
        list += `<div class="jm-row t-${d.t}" data-id="${d.id}">
            <span class="pin"></span>
            <span><span class="nm">${d.nm}</span> <span class="pl">— ${d.pl}</span></span>
            <span class="yr">${d.yr}</span>
          </div>`;
      });
    });

    mount.innerHTML = `<div class="jm"><div class="jm-map">${svg}</div><div class="jm-list">${list}</div></div>`;

    // ---- wire cross-highlight ----
    const root = mount.querySelector('.jm');
    function setOn(id, on) {
      root.querySelectorAll(`.jm-blip[data-id="${id}"], .jm-row[data-id="${id}"], .jm-arc[data-id="${id}"]`)
        .forEach(el => el.classList.toggle('on', on));
    }
    root.querySelectorAll('.jm-blip, .jm-row').forEach(el => {
      const id = el.dataset.id;
      el.addEventListener('mouseenter', () => setOn(id, true));
      el.addEventListener('mouseleave', () => setOn(id, false));
    });
  };
})();
