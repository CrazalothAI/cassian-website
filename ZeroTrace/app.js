'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = size => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;
  const state = { files:[], selected:null, busy:false, ready:false, generation:0, serial:0, suffix:'_clean' };
  let worker, pending;
  const status = message => { $('status').textContent = message; };
  function startWorker() {
    state.ready = false;
    worker = new Worker('worker.js');
    worker.onmessage = ({data}) => {
      if (data.ready) { state.ready = true; controls(); if (!state.busy) status('Ready. Your PDFs stay on your device.'); return; }
      if (!pending || data.id !== pending.id) return;
      if (data.progress !== undefined) { pending.progress?.(data.progress); return; }
      const task = pending; pending = null; clearTimeout(task.timer);
      if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
    };
    worker.onerror = event => { event.preventDefault(); state.ready = false; if (pending) { clearTimeout(pending.timer); pending.reject(new Error('The local PDF engine could not run. Reload the page and try again.')); pending = null; } status('The local engine is unavailable. Reload this page to retry.'); controls(); };
  }
  function run(operation, payload = {}, progress) {
    return new Promise((resolve, reject) => {
      if (!state.ready) return reject(new Error('The local engine is not ready. Reload the page.'));
      const id = ++state.serial;
      const timer = setTimeout(() => { worker.terminate(); pending = null; reject(new Error('Processing took too long. Try a smaller or simpler PDF.')); startWorker(); }, 45000);
      pending = { id, resolve, reject, progress, timer };
      worker.postMessage({ id, operation, ...payload });
    });
  }
  function controls() {
    $('dropzone').disabled = state.busy || !state.ready;
    $('btn-sample').disabled = state.busy || !state.ready;
    $('suffix-select').disabled = state.busy;
    $('btn-download-zip').disabled = state.busy || !state.files.some(f => f.status === 'ready');
    $('batch-progress').hidden = !state.busy;
    $('btn-download-zip').textContent = state.files.filter(f => f.status === 'ready').length > 1 ? 'Download all as ZIP' : 'Download clean PDF';
  }
  function outputName(name) {
    const base = name.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/^\.+|[. ]+$/g, '').slice(0, 150) || 'document';
    return `${base}${state.suffix}.pdf`;
  }
  function uniqueNames(files) {
    const used = new Set();
    return files.map(file => {
      const base = outputName(file.name).replace(/\.pdf$/i, '');
      let name = `${base}.pdf`, n = 2;
      while (used.has(name.toLowerCase())) name = `${base}_${n++}.pdf`;
      used.add(name.toLowerCase()); return name;
    });
  }
  function render() {
    $('workspace-section').hidden = !state.files.length;
    const ready = state.files.filter(f => f.status === 'ready');
    const removed = ready.reduce((sum,f) => sum + f.result.beforeReport.fields.length, 0);
    $('queue-summary').textContent = `${state.files.length} files · ${ready.length} verified · ${removed} findings removed`;
    $('file-list').innerHTML = state.files.map(f => `<div class="file-entry" data-status="${f.status}"><button type="button" class="file-select" data-id="${f.id}" aria-current="${f.id === state.selected}"><strong>${escape(f.name)}</strong><span>${f.status === 'ready' ? `${format(f.size)} · ${f.result.beforeReport.fields.length} findings removed` : f.status === 'error' ? 'Unable to process' : f.status === 'processing' ? 'Inspecting and verifying…' : 'Queued'}</span></button></div>`).join('');
    document.querySelectorAll('.file-select').forEach(button => button.addEventListener('click', () => { state.selected = Number(button.dataset.id); render(); }));
    inspector(); controls();
  }
  function inspector() {
    const item = state.files.find(f => f.id === state.selected);
    const target = $('inspector-content');
    if (!item) { target.replaceChildren(); return; }
    if (item.status === 'error') { target.innerHTML = `<h3>${escape(item.name)}</h3><div class="error-panel"><strong>No cleaned download was created.</strong><p>${escape(item.error)}</p></div>`; return; }
    if (item.status !== 'ready') { target.innerHTML = `<h3>${escape(item.name)}</h3><p class="after-copy">${item.status === 'processing' ? 'Inspecting, rebuilding and reloading your PDF locally…' : 'Waiting in the local queue…'}</p>`; return; }
    const { beforeReport:before, afterReport:after, warnings } = item.result;
    const fields = [...before.fields].sort((a,b) => ({high:0,medium:1,low:2}[String(a.risk).toLowerCase()] ?? 3) - ({high:0,medium:1,low:2}[String(b.risk).toLowerCase()] ?? 3));
    target.innerHTML = `<h3>${escape(item.name)}</h3><p class="inspector-summary">${before.pageCount} pages · ${format(item.size)} → ${format(item.result.cleanedBytes.byteLength)}</p><div class="risk-summary"><span class="badge ${escape(String(before.riskLevel).toLowerCase())}">Exposure: ${escape(before.riskLevel)} · ${before.riskScore}/100</span><span aria-hidden="true">→</span><span class="badge success">0/100 in checked scope</span></div><div class="comparison-grid"><section class="comparison-col"><h4>Before <span class="count" data-before-count="${before.fields.length}">${before.fields.length} findings</span></h4>${fields.length ? `<dl class="fields">${fields.map(f => `<dt><span>${escape(f.key)}</span><span class="risk-label ${escape(String(f.risk).toLowerCase())}">${escape(f.risk)}</span></dt><dd><span class="field-location">${escape(f.location)}</span>${escape(f.value)}</dd>`).join('')}</dl>` : '<p class="after-copy">No supported metadata findings were detected.</p>'}${before.xmpPreviews.map(x => `<details><summary>XMP preview · ${escape(x.location)}</summary><pre>${escape(x.text || 'Preview unavailable for this encoding. The metadata stream was still removed.')}</pre></details>`).join('')}</section><section class="comparison-col"><h4>After <span class="badge success">Reload verified</span></h4><div class="after-clear" data-after-count="${after.fields.length}">${after.fields.length}</div><p class="after-copy">Checked metadata fields remaining.</p><p class="after-copy">The saved bytes were reopened and inspected. This result covers metadata removal, not content redaction or anonymity.</p><details><summary>What this check covers</summary><p>All trailer Info entries, Metadata streams, PieceInfo, SpiderInfo and trailer document IDs. Unreachable objects are discarded when rebuilding.</p></details></section></div><ul class="warnings">${(warnings || []).map(w => `<li>${escape(w)}</li>`).join('')}</ul><div class="inspector-actions"><button id="btn-download-single" type="button" class="btn primary">Download cleaned PDF</button><button id="btn-audit-json" type="button" class="btn">Audit JSON</button><button id="btn-audit-txt" type="button" class="btn">Audit TXT</button></div><p class="audit-note">Output: ${escape(outputName(item.name))}. Audit logs include filenames, field names and SHA-256 hashes, but omit original field values. They are unsigned technical records.</p>`;
    $('btn-download-single').addEventListener('click', () => save(item.result.cleanedBytes, outputName(item.name), 'application/pdf'));
    $('btn-audit-json').addEventListener('click', () => audit(item, 'json'));
    $('btn-audit-txt').addEventListener('click', () => audit(item, 'txt'));
  }
  function save(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function audit(item, extension) {
    const record = { ...item.result.audit, originalName:item.name, outputName:outputName(item.name) };
    const text = extension === 'json' ? JSON.stringify(record, null, 2) : `ZeroTrace PDF — scoped metadata audit\n\n${JSON.stringify(record, null, 2)}\n\nThis is not a signed certificate or proof of content redaction.\n`;
    save(text, outputName(item.name).replace(/\.pdf$/i, `.audit.${extension}`), extension === 'json' ? 'application/json' : 'text/plain;charset=utf-8');
  }
  async function process(files, sample = false) {
    if (state.busy || !state.ready) return;
    if (!sample && !files.length) return;
    const generation = state.generation;
    const added = [];
    let total = state.files.filter(f => f.status !== 'error').reduce((sum,f) => sum + f.size, 0), skipped = 0;
    for (const file of sample ? [{ name:'ZeroTrace-Sample-Dirty.pdf', size:0 }] : files) {
      if (state.files.length >= 25) { skipped++; continue; }
      const item = {id:++state.serial,name:file.name,size:file.size,status:'queued',file};
      if (!/\.pdf$/i.test(file.name)) {item.status = 'error';item.error = 'Choose a file with a .pdf extension.';}
      else if (file.size > 25 * 1024 * 1024 || total + file.size > 100 * 1024 * 1024) {item.status = 'error';item.error = 'The limit is 25 MB per file and 100 MB per workspace. Clear files or choose a smaller batch.';}
      else total += file.size;
      state.files.push(item); added.push(item);
    }
    state.busy = true; render(); $('batch-progress').value = 0;
    for (let i = 0; i < added.length; i++) {
      if (generation !== state.generation) return;
      const item = added[i]; state.selected = item.id;
      if (item.status === 'error') {delete item.file;render();continue;}
      item.status = 'processing'; render(); status(`Processing ${i + 1} of ${added.length}: ${item.name}`);
      try {
        const bytes = sample ? undefined : await item.file.arrayBuffer();
        if (generation !== state.generation) return;
        const result = await run(sample ? 'sample' : 'clean', {bytes,originalName:item.name,outputName:outputName(item.name)}, percent => { $('batch-progress').value = 100 * (i + percent/100) / added.length; });
        if (generation !== state.generation) return;
        if (!result.verification?.passed || result.afterReport.fields.length !== 0) throw new Error('The output did not pass metadata verification. No download was created.');
        item.result = result; item.size = result.inputSize; item.status = 'ready';
      } catch (error) { if (generation !== state.generation) return; item.error = error.message; item.status = 'error'; }
      delete item.file; $('batch-progress').value = 100 * (i + 1) / added.length; render();
    }
    state.busy = false; render();
    const failures = added.filter(f => f.status === 'error').length;
    status(`${added.length - failures} PDFs verified${failures ? ` · ${failures} could not be processed` : ''}${skipped ? ` · ${skipped} skipped (25-file limit)` : ''}.`);
  }
  $('dropzone').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; process(files); });
  for (const name of ['dragover','drop']) $('dropzone').addEventListener(name, event => {event.preventDefault(); if (state.busy || !state.ready) return; if (name === 'dragover') $('dropzone').classList.add('drag-over'); else { $('dropzone').classList.remove('drag-over'); process([...event.dataTransfer.files]); }});
  $('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('drag-over'));
  window.addEventListener('dragover', event => event.preventDefault()); window.addEventListener('drop', event => event.preventDefault());
  $('btn-sample').addEventListener('click', () => process([], true));
  $('suffix-select').addEventListener('change', event => {state.suffix = event.target.value;inspector();});
  $('btn-clear-all').addEventListener('click', () => {
    state.generation++; state.files = []; state.selected = null;
    if (state.busy) { worker.terminate(); if (pending) {clearTimeout(pending.timer);pending.reject(new Error('Cleared'));pending = null;} startWorker(); }
    state.busy = false; render(); status('Files cleared from this workspace. Downloads on your device are unchanged.');
  });
  $('btn-download-zip').addEventListener('click', async () => {
    if (state.busy) return;
    const files = state.files.filter(f => f.status === 'ready');
    if (files.length === 1) return save(files[0].result.cleanedBytes, outputName(files[0].name), 'application/pdf');
    if (!files.length) return;
    const generation = state.generation; state.busy = true; controls(); status('Packaging your verified PDFs…');
    try { const names = uniqueNames(files); const {bytes} = await run('zip', {files:files.map((f,i) => ({name:names[i],bytes:f.result.cleanedBytes}))}, percent => {$('batch-progress').value = percent;}); if (generation === state.generation) {save(bytes, 'ZeroTrace-cleaned-PDFs.zip', 'application/zip');status(`${files.length} verified PDFs packaged for download.`);} }
    catch(error) { if (generation === state.generation) status(error.message); }
    finally { if (generation === state.generation) {state.busy = false;controls();} }
  });
  $('privacy-options').addEventListener('click', () => { if (typeof window.__tcfapi === 'function') { window.__tcfapi('displayConsentUi', 2, () => {}); } else $('privacy-dialog').showModal(); });
  $('close-privacy').addEventListener('click', () => $('privacy-dialog').close());
  if (!window.Worker || !window.crypto?.subtle) status('This browser needs Web Workers and secure-context cryptography. Use a current browser on HTTPS or localhost.');
  else startWorker();
})();
