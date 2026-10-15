const $ = id => document.getElementById(id);
const colors = { a: '#1b6287', b: '#b65c3d', mean: '#437760' };
const WEBR_URL = 'https://webr.r-wasm.org/v0.6.0/webr.mjs';
const defaults = { 'kind-a': 'normal', 'mu-a': 2, 'sd-a': 3, 'kind-b': 'normal', 'mu-b': 8, 'sd-b': 3, shape: 'curve', n: 300, sigma: 5, seed: 20261013 };
let webR, shelter, modelSource = '', ready = false, busy = false;
let revision = 0, completedRevision = -1, pending = false, debounce;
let current = null, currentSettings = null, repeated = null;
let shown = 300, playing = false, animationFrame = 0, animationStart = 0, animationFrom = 5;
const fmt = (x, digits = 4) => Number.isFinite(x) ? x.toFixed(digits) : '—';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asArray = value => Array.isArray(value) ? value : [value];
const axisLabel = text => esc(text).replace(/\b[XY]\b/g, '<tspan class="math">$&</tspan>').replace(/b₁/g, '<tspan class="math">b</tspan><tspan class="math" style="font-style:normal;font-size:8px" baseline-shift="sub">1</tspan>');

function decodeR(r) {
  if (r.type === 'list') return Object.fromEntries(r.names.map((name, i) => [name, decodeR(r.values[i])]));
  if (r.names?.length && r.names.every(Boolean)) return Object.fromEntries(r.names.map((name, i) => [name, r.values[i]]));
  return r.values.length === 1 ? r.values[0] : r.values;
}
function error(message = '') { $('error').textContent = message; $('error').hidden = !message; }
function updateButtons() {
  const fresh = ready && !busy && current && completedRevision === revision;
  for (const id of ['resample', 'run-repeat']) $(id).disabled = !ready || busy || pending || completedRevision !== revision;
  for (const id of ['play', 'show-all', 'visible-n', 'download-r']) $(id).disabled = !fresh;
}
function syncControls() {
  for (const id of ['mu-a', 'sd-a', 'mu-b', 'sd-b', 'sigma']) $(`${id}-value`).value = fmt(Number($(id).value), 1);
  for (const g of ['a', 'b']) {
    const uniform = $(`kind-${g}`).value === 'uniform';
    $(`normal-${g}`).hidden = uniform;
    $(`mu-${g}`).disabled = uniform;
    $(`sd-${g}`).disabled = uniform;
  }
}
function selectMobileGroup(group) {
  $('experiment').dataset.mobileGroup = group;
  for (const button of document.querySelectorAll('[data-view-group]')) {
    button.setAttribute('aria-pressed', String(button.dataset.viewGroup === group));
  }
}
function setupResponsiveLayout() {
  const mobile = matchMedia('(max-width: 800px)');
  const controls = $('simulation-controls');
  const shared = $('shared-settings');
  const actions = $('sample-actions');
  const arrange = () => {
    const focused = document.activeElement;
    for (const switcher of document.querySelectorAll('.mobile-group-switch')) {
      switcher.hidden = !mobile.matches;
    }
    if (mobile.matches) {
      $('mobile-settings-slot').append(controls);
      $('mobile-secondary-settings').append(shared, actions);
    } else {
      $('settings').append(shared, actions);
      $('experiment').prepend(controls);
    }
    shared.open = !mobile.matches;
    if (focused instanceof HTMLElement && focused !== document.body) focused.focus({ preventScroll: true });
  };
  for (const button of document.querySelectorAll('[data-view-group]')) {
    button.addEventListener('click', () => selectMobileGroup(button.dataset.viewGroup));
  }
  mobile.addEventListener('change', arrange);
  arrange();
}
function settings() {
  if (!$('settings').checkValidity()) throw Error('標本サイズは20〜2,000の整数，乱数シードは1〜1,000,000,000の整数で入力してください。');
  const out = {};
  for (const id of Object.keys(defaults)) out[id.replaceAll('-', '_')] = ['kind-a', 'kind-b', 'shape'].includes(id) ? $(id).value : Number($(id).value);
  if (!['normal','uniform'].includes(out.kind_a) || !['normal','uniform'].includes(out.kind_b) || !['curve','line'].includes(out.shape)) throw Error('分布または平均曲線の選択を確認してください。');
  return out;
}
function argumentsR(s) {
  return Object.entries(s).map(([k,v]) => `${k} = ${typeof v === 'string' ? JSON.stringify(v) : v}`).join(', ');
}
function clearRepeated() {
  repeated = null;
  $('repeat-result').hidden = true;
  $('repeat-empty').hidden = false;
  $('repeat-status').textContent = '';
}
function changed() {
  stopAnimation();
  syncControls();
  revision++;
  pending = true;
  clearRepeated();
  $('run-status').textContent = '設定を反映しています…';
  updateButtons();
  clearTimeout(debounce);
  debounce = setTimeout(calculate, 180);
}
async function evaluate(code) {
  try {
    const result = await shelter.evalR(code);
    return decodeR(await result.toJs());
  } finally { await shelter.purge(); }
}
async function calculate() {
  if (!ready || busy || !pending) return;
  let config;
  try { config = settings(); error(); }
  catch (e) { pending = false; error(e.message); $('run-status').textContent = '入力を確認してください。'; updateButtons(); return; }
  const token = revision;
  pending = false;
  busy = true;
  updateButtons();
  $('run-status').textContent = 'Rで標本と母集団の係数を計算中…';
  try {
    const result = await evaluate(`experiment(${argumentsR(config)})`);
    if (token !== revision) return;
    current = result;
    currentSettings = config;
    completedRevision = token;
    shown = config.n;
    $('visible-n').max = String(config.n);
    $('visible-n').value = String(shown);
    renderAll();
    $('run-status').textContent = `各集団 n = ${config.n.toLocaleString('ja-JP')} · シード ${config.seed}`;
    $('runtime-status').textContent = 'WebR 準備完了 · ブラウザ内でRを実行';
    $('status-dot').className = 'status-dot ready';
  } catch (e) {
    if (token === revision) { error(`計算できませんでした：${e.message}`); $('run-status').textContent = '設定を変更して再実行してください。'; }
  } finally {
    busy = false;
    updateButtons();
    if (pending) void calculate();
  }
}
async function withTimeout(promise, milliseconds, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function initialise() {
  ready = false;
  $('retry').hidden = true;
  $('status-dot').className = 'status-dot';
  error();
  updateButtons();
  if (location.protocol === 'file:') {
    error('このページはHTTPまたはHTTPSで開いてください。GitHub Pagesに配置するか，同梱のstart.ps1でローカル表示できます。');
    $('runtime-status').textContent = 'Webサーバーから開いてください';
    $('status-dot').className = 'status-dot error';
    return;
  }
  let instance;
  const slow = setTimeout(() => { $('runtime-status').textContent = 'Rの実行環境を取得中です。初回は通信に時間がかかります。'; }, 15000);
  try {
    const [module, response] = await withTimeout(Promise.all([import(WEBR_URL), fetch(new URL('./model.R', import.meta.url))]), 75000, '読み込みが時間内に完了しませんでした。');
    if (!response.ok) throw Error(`model.R の読み込みに失敗しました（HTTP ${response.status}）。`);
    modelSource = await response.text();
    instance = new module.WebR({ channelType: module.ChannelType.PostMessage });
    await withTimeout(instance.init(), 90000, 'WebRの起動が時間内に完了しませんでした。');
    webR = instance;
    shelter = await new webR.Shelter();
    try { await shelter.evalR(modelSource); } finally { await shelter.purge(); }
    ready = true;
    pending = true;
    $('runtime-status').textContent = 'WebR 準備完了';
    $('status-dot').className = 'status-dot ready';
    await calculate();
  } catch (e) {
    ready = false;
    if (instance) { try { await instance.close(); } catch {} }
    error(`WebRを起動できませんでした。インターネット接続と webr.r-wasm.org への接続を確認し，「再読込」を押してください。詳細：${e.message}`);
    $('runtime-status').textContent = 'WebRの読み込みに失敗しました';
    $('status-dot').className = 'status-dot error';
    $('retry').hidden = false;
    $('run-status').textContent = 'Rの起動後にグラフを表示します。';
  } finally { clearTimeout(slow); updateButtons(); }
}

// SVG rendering only: all population quantities, observations and OLS fits
// come from R. Histogram binning and axis layout are display operations.
function ticks(lo, hi, count = 5) {
  const raw = (hi - lo) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const fraction = raw / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const out = [];
  for (let v = Math.ceil(lo/step)*step; v <= hi + step*1e-7; v += step) out.push(Math.abs(v) < step*1e-8 ? 0 : v);
  return out;
}
function tickText(v) { return Number(v.toPrecision(4)).toString(); }
function plotFrame(id, height, xlim, ylim, xLabel, yLabel, description, draw, customTicks) {
  const width = 460, margin = { l: 52, r: 18, t: 24, b: 43 };
  const pw = width - margin.l - margin.r, ph = height - margin.t - margin.b;
  const x = v => margin.l + (v-xlim[0])/(xlim[1]-xlim[0])*pw;
  const y = v => margin.t + ph - (v-ylim[0])/(ylim[1]-ylim[0])*ph;
  const yTicks = ticks(...ylim, height < 200 ? 3 : 5);
  const xTicks = customTicks || ticks(...xlim, 5);
  const grid = yTicks.map(v => `<line class="grid" x1="${margin.l}" y1="${y(v)}" x2="${width-margin.r}" y2="${y(v)}"/><text class="tick" x="${margin.l-9}" y="${y(v)+4}" text-anchor="end">${tickText(v)}</text>`).join('');
  const axes = `<line class="axis" x1="${margin.l}" y1="${height-margin.b}" x2="${width-margin.r}" y2="${height-margin.b}"/>${xTicks.map(v => `<text class="tick" x="${x(v)}" y="${height-margin.b+18}" text-anchor="middle">${tickText(v)}</text>`).join('')}<text class="axis-label" x="${margin.l}" y="14">${axisLabel(yLabel)}</text><text class="axis-label" x="${margin.l+pw/2}" y="${height-7}" text-anchor="middle">${axisLabel(xLabel)}</text>`;
  const clipId = `clip-${id}`;
  $(id).innerHTML = `<svg class="plot-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title-${id} desc-${id}" xmlns="http://www.w3.org/2000/svg"><title id="title-${id}">${esc(description)}</title><desc id="desc-${id}">${esc(yLabel)}。横軸：${esc(xLabel)}。</desc><defs><clipPath id="${clipId}"><rect x="${margin.l}" y="${margin.t}" width="${pw}" height="${ph}"/></clipPath></defs>${grid}<g clip-path="url(#${clipId})">${draw({x,y,xlim,ylim,margin,width,height})}</g>${axes}</svg>`;
}
function path(xs, ys, x, y) { return xs.map((v,i) => `${i ? 'L' : 'M'}${x(v).toFixed(2)},${y(ys[i]).toFixed(2)}`).join(' '); }
function area(xs, ys, x, y) { return `${path(xs,ys,x,y)} L${x(xs.at(-1))},${y(0)} L${x(xs[0])},${y(0)} Z`; }
function coef(g) { return { intercept: current[g].prefix.intercept[shown-1], slope: current[g].prefix.slope[shown-1] }; }
function conditionalMeanLimits() {
  const lo = Math.min(...current.curve), hi = Math.max(...current.curve);
  const padding = Math.max(5, (hi-lo)/2);
  return [Math.floor((lo-padding)/5)*5, Math.ceil((hi+padding)/5)*5];
}
function renderSample() {
  if (!current) return;
  $('visible-n-value').value = `${shown.toLocaleString('ja-JP')} / ${current.n.toLocaleString('ja-JP')}`;
  $('visible-n').value = String(shown);
  const ylim = conditionalMeanLimits();
  for (const g of ['a','b']) {
    const d = current[g], c = coef(g), color = colors[g];
    plotFrame(`scatter-${g}`, 320, [0,10], ylim, '補習時間 X（時間）', '試験得点 Y', `分布${g.toUpperCase()}：${shown}人の散布図，平均曲線，母集団の線形射影，標本OLS`, ({x,y}) => {
      const dots = d.x.slice(0,shown).map((v,i) => `<circle class="data-point" cx="${x(v).toFixed(2)}" cy="${y(d.y[i]).toFixed(2)}" r="2.7" fill="${color}"/>`).join('');
      const mean = $('show-mean').checked ? `<path class="mean-line" d="${path(current.grid,current.curve,x,y)}"/>` : '';
      const pop = $('show-pop').checked ? `<path class="pop-line" stroke="${color}" d="${path(current.grid,d.line,x,y)}"/>` : '';
      const ols = $('show-ols').checked && Number.isFinite(c.slope) ? `<path class="ols-line" d="${path([0,10],[c.intercept,c.intercept+10*c.slope],x,y)}"/>` : '';
      return dots + mean + pop + ols;
    }, [0,2,4,6,8,10]);
    $(`sample-slope-${g}`).textContent = fmt(c.slope);
  }
  renderCoefficientTable();
}
function row(label, a, b, digits = 4) { return `<tr><th scope="row">${label}</th><td>${fmt(a,digits)}</td><td>${fmt(b,digits)}</td></tr>`; }
function renderCoefficientTable() {
  const a = current.a.population, b = current.b.population, ca = coef('a'), cb = coef('b');
  $('coefficient-table').innerHTML = row('母集団の切片 <span class="math">β<sub>0</sub></span>',a.intercept,b.intercept) + row('母集団の傾き <span class="math">β<sub>1</sub></span>',a.slope,b.slope) + row(`標本OLSの切片 <span class="math"><i>b</i><sub>0</sub></span>（${shown}人）`,ca.intercept,cb.intercept) + row(`標本OLSの傾き <span class="math"><i>b</i><sub>1</sub></span>（${shown}人）`,ca.slope,cb.slope) + row('母集団の平均補習時間 <span class="math">E[<i>X</i>]</span>',a.mean_x,b.mean_x);
}
function renderAll() {
  $('model-equation').innerHTML = current.shape === 'curve' ? '<i>m</i>(<i>x</i>) = 60 + 6<i>x</i> − 0.3<i>x</i><sup>2</sup>' : '<i>m</i>(<i>x</i>) = 60 + 3<i>x</i>';
  renderSample();
  const densityMax = Math.max(...current.a.density,...current.b.density)*1.14;
  for (const g of ['a','b']) {
    const d = current[g], color = colors[g], p = d.population;
    $(`description-${g}`).innerHTML = currentSettings[`kind_${g}`] === 'uniform' ? '0〜10時間の一様分布' : `<span class="math">μ = ${fmt(currentSettings[`mu_${g}`],1)}</span>，<span class="math"><i>s</i> = ${fmt(currentSettings[`sd_${g}`],1)}</span>`;
    $(`pop-slope-${g}`).textContent = fmt(p.slope);
    $(`probability-${g}`).textContent = `6〜10時間：${fmt(100*p.probability,2)}%`;
    plotFrame(`density-${g}`, 160, [0,10], [0,densityMax], '補習時間 X（時間）', '密度', `分布${g.toUpperCase()}の密度。6〜10時間の確率は${fmt(100*p.probability,2)}%。`, ({x,y}) => {
      const k = current.grid.findIndex(v=>v>=6);
      return `<path fill="${color}" fill-opacity=".06" d="${area(current.grid,d.density,x,y)}"/><path fill="${color}" fill-opacity=".28" d="${area(current.grid.slice(k),d.density.slice(k),x,y)}"/><path fill="none" stroke="${color}" stroke-width="2" d="${path(current.grid,d.density,x,y)}"/><line x1="${x(6)}" x2="${x(6)}" y1="${y(0)}" y2="${y(d.density[k])}" stroke="${color}" stroke-dasharray="3 3"/>`;
    }, [0,2,4,6,8,10]);
  }
}
function stopAnimation() { playing = false; cancelAnimationFrame(animationFrame); $('play').textContent = '観測を順に表示'; }
function play() {
  if (playing) { stopAnimation(); return; }
  if (!current || busy) return;
  if (shown >= current.n) shown = 5;
  animationFrom = shown;
  animationStart = performance.now();
  playing = true;
  $('play').textContent = '一時停止';
  let last = 0;
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 10000 : 7000;
  const tick = now => {
    if (!playing) return;
    if (now-last > 65) {
      shown = Math.min(current.n, Math.floor(animationFrom+(current.n-animationFrom)*(now-animationStart)/duration));
      renderSample(); last = now;
    }
    if (shown >= current.n) stopAnimation(); else animationFrame = requestAnimationFrame(tick);
  };
  renderSample();
  animationFrame = requestAnimationFrame(tick);
}
function histogram(values, lo, hi, count = 28) {
  const binWidth = (hi-lo)/count, bins = Array(count).fill(0);
  for (const v of values) bins[Math.min(count-1,Math.max(0,Math.floor((v-lo)/binWidth)))]++;
  return {bins, binWidth};
}
function renderRepeated() {
  let lo = Math.min(...repeated.a,...repeated.b,repeated.population_a,repeated.population_b);
  let hi = Math.max(...repeated.a,...repeated.b,repeated.population_a,repeated.population_b);
  const padding = Math.max(0.06,(hi-lo)*.06); lo -= padding; hi += padding;
  const ha = histogram(repeated.a,lo,hi), hb = histogram(repeated.b,lo,hi);
  const yMax = Math.max(...ha.bins,...hb.bins)*1.15;
  for (const [g,h] of [['a',ha],['b',hb]]) {
    const truth = repeated[`population_${g}`], color = colors[g];
    plotFrame(`hist-${g}`,250,[lo,hi],[0,yMax],'標本OLSの傾き b₁','度数',`分布${g.toUpperCase()}，${repeated.repetitions}回の標本OLSの傾き。母集団の傾きは${fmt(truth)}。`,({x,y}) => h.bins.map((v,i)=>`<rect x="${x(lo+i*h.binWidth)+.5}" y="${y(v)}" width="${Math.max(0,x(lo+h.binWidth)-x(lo)-1)}" height="${y(0)-y(v)}" fill="${color}" fill-opacity=".5"/>`).join('') + `<line x1="${x(truth)}" x2="${x(truth)}" y1="${y(0)}" y2="${y(yMax)}" stroke="${color}" stroke-width="2.5"/>`);
  }
  $('repeat-table').innerHTML = row('母集団の傾き <span class="math">β<sub>1</sub></span>',repeated.population_a,repeated.population_b) + row('標本OLSの傾きの平均',repeated.mean_a,repeated.mean_b) + row('標本OLSの傾きの標準偏差',repeated.sd_a,repeated.sd_b);
  $('repeat-result').hidden = false;
  $('repeat-empty').hidden = true;
}
async function runRepeated() {
  if (!ready || busy || completedRevision !== revision) return;
  stopAnimation();
  const token = revision, count = Number($('repetitions').value);
  busy = true; updateButtons(); error();
  $('repeat-status').textContent = `各集団 ${count.toLocaleString('ja-JP')}回，Rで計算中…`;
  const start = performance.now();
  try {
    const result = await evaluate(`repeat_experiment(${argumentsR(currentSettings)}, repetitions = ${count})`);
    if (token !== revision) return;
    repeated = result;
    repeated.a = asArray(repeated.a); repeated.b = asArray(repeated.b);
    renderRepeated();
    $('repeat-status').textContent = `${count.toLocaleString('ja-JP')}回完了 · ${fmt((performance.now()-start)/1000,1)}秒`;
  } catch (e) { if (token === revision) { error(`繰り返し実験を実行できませんでした：${e.message}`); $('repeat-status').textContent = '再実行してください。'; } }
  finally { busy = false; updateButtons(); if (pending) void calculate(); }
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text],{type}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function downloadR() {
  const count = Number($('repetitions').value);
  const appendix = `\n# ---- Settings used on the page ----\nresult <- experiment(${argumentsR(currentSettings)})\nvisible_n <- ${shown}\nmc <- repeat_experiment(${argumentsR(currentSettings)}, repetitions = ${count})\n\n# Population coefficients and the OLS coefficients of the visible sample.\nprint(lapply(result[c("a", "b")], function(d) {\n  list(population = d$population,\n       visible_ols = coef(lm(y ~ x, data = data.frame(\n         x = d$x[seq_len(visible_n)], y = d$y[seq_len(visible_n)]))))\n}))\nprint(result$losses)\nprint(mc[c("mean_a", "mean_b", "sd_a", "sd_b")])\n\n# Axes depend only on the conditional mean, as on the page.\npar(mfrow = c(1, 2))\nylim <- range(result$curve)\npadding <- max(5, diff(ylim) / 2)\nylim <- c(floor((ylim[1] - padding) / 5) * 5,\n          ceiling((ylim[2] + padding) / 5) * 5)\nfor (g in c("a", "b")) {\n  d <- result[[g]]\n  idx <- seq_len(visible_n)\n  plot(d$x[idx], d$y[idx], xlim = c(0, 10), ylim = ylim,\n       xaxs = "i", yaxs = "i",\n       xlab = "Tutoring hours X", ylab = "Score Y", main = toupper(g),\n       pch = 16, col = adjustcolor("#1b6287", 0.4))\n  lines(result$grid, result$curve, col = "#437760", lwd = 2)\n  lines(result$grid, d$line, col = "#b65c3d", lwd = 2)\n  abline(lm(d$y[idx] ~ d$x[idx]), lty = 2, lwd = 2)\n}\n`;
  download(`projection-seed-${current.seed}.R`,modelSource+appendix,'text/plain;charset=utf-8');
}

$('settings').addEventListener('submit', e=>e.preventDefault());
for (const id of Object.keys(defaults)) $(id).addEventListener($(id).type === 'range' ? 'input' : 'change', changed);
for (const id of ['n','seed']) $(id).addEventListener('input', changed);
for (const button of document.querySelectorAll('[data-mu]')) button.addEventListener('click',()=>{
  $(`kind-${button.dataset.group}`).value = 'normal'; $(`mu-${button.dataset.group}`).value = button.dataset.mu; $(`sd-${button.dataset.group}`).value = '3'; changed();
});
$('reset').addEventListener('click',()=>{ for (const [id,value] of Object.entries(defaults)) $(id).value = value; changed(); });
$('resample').addEventListener('click',()=>{ $('seed').value = String(Number($('seed').value) >= 1000000000 ? 1 : Number($('seed').value)+2); changed(); });
for (const id of ['show-mean','show-pop','show-ols']) $(id).addEventListener('change', renderSample);
$('visible-n').addEventListener('input',()=>{ stopAnimation(); shown = Number($('visible-n').value); renderSample(); });
$('play').addEventListener('click',play);
$('show-all').addEventListener('click',()=>{ stopAnimation(); shown = current.n; renderSample(); });
$('run-repeat').addEventListener('click',runRepeated);
$('repetitions').addEventListener('change',()=>{ if (repeated) $('repeat-status').textContent = `${repeated.repetitions.toLocaleString('ja-JP')}回の結果を表示中です。新しい回数は実行時に反映します。`; });
$('download-r').addEventListener('click',downloadR);
$('retry').addEventListener('click',initialise);
document.addEventListener('visibilitychange',()=>{ if (document.hidden) stopAnimation(); });
setupResponsiveLayout();
syncControls();
void initialise();
