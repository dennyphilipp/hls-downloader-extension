// popup.js

let streams = [];
const recordingTabs = new Set(); // tabIds com gravação ativa

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function statusLabel(status) {
  const map = {
    'detectado': ['detectado', 'status-detectado'],
  };
  return map[status] || [status, 'status-detectado'];
}

function render() {
  const list = document.getElementById('stream-list');
  const count = document.getElementById('count');
  const footer = document.getElementById('footer');

  count.textContent = streams.length;

  if (streams.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <p>Nenhum stream detectado ainda.<br>Abra uma aula e dê play no vídeo.</p>
      </div>`;
    footer.textContent = 'aguardando streams...';
    return;
  }

  footer.textContent = `${streams.length} stream(s) capturado(s)`;

  list.innerHTML = streams.map((s, i) => {
    const [label, cls] = statusLabel(s.status);
    const shortUrl = s.url.replace(/https?:\/\//, '').substring(0, 55) + '...';
    const shortTitle = s.title.substring(0, 50);
    const isRec = recordingTabs.has(s.tabId);
    const recClass = isRec ? 'recording' : 'record';
    const recLabel = isRec ? '■ Parar' : '● Gravar';
    const recAction = isRec ? 'stopRecording' : 'startRecording';
    return `
      <div class="stream-card">
        <div class="stream-title" title="${s.title}">${shortTitle}</div>
        <div class="stream-url" title="${s.url}">${shortUrl}</div>
        <div class="stream-meta">
          <span class="status-badge ${cls}">${label}</span>
          <div class="card-actions">
            <button class="icon-btn" data-action="copy" data-idx="${i}" title="Copiar URL">📋</button>
            <button class="icon-btn ${recClass}" data-action="${recAction}" data-idx="${i}" title="Gravar o que está sendo reproduzido">${recLabel}</button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Eventos dos botões dos cards
  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const stream = streams[idx];
      if (btn.dataset.action === 'copy') {
        navigator.clipboard.writeText(stream.url).then(() => showToast('URL copiada!'));
      }
      if (btn.dataset.action === 'startRecording') {
        chrome.runtime.sendMessage({ action: 'startRecording', tabId: stream.tabId, title: stream.title }, (res) => {
          if (chrome.runtime.lastError || !res?.ok) {
            showToast('Erro: ' + (res?.error || chrome.runtime.lastError?.message || 'não foi possível gravar'));
          } else {
            recordingTabs.add(stream.tabId);
            showToast('Gravação iniciada!');
            render();
          }
        });
      }
      if (btn.dataset.action === 'stopRecording') {
        chrome.runtime.sendMessage({ action: 'stopRecording', tabId: stream.tabId }, (res) => {
          if (chrome.runtime.lastError || !res?.ok) {
            showToast('Erro ao parar: ' + (res?.error || chrome.runtime.lastError?.message));
          } else {
            recordingTabs.delete(stream.tabId);
            showToast('Gravação salva! Verifique os downloads.');
            render();
          }
        });
      }
    });
  });
}

function loadStreams() {
  chrome.runtime.sendMessage({ action: 'getStreams' }, (res) => {
    streams = (res?.streams || []).sort((a, b) => b.timestamp - a.timestamp);
    // Sincroniza o estado de gravação com cada aba
    const checks = streams.map(s =>
      new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'recordingStatus', tabId: s.tabId }, (r) => {
          if (r?.recording) recordingTabs.add(s.tabId);
          else recordingTabs.delete(s.tabId);
          resolve();
        });
      })
    );
    Promise.all(checks).then(() => render());
  });
}

document.getElementById('btn-refresh').addEventListener('click', loadStreams);

document.getElementById('btn-clear').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clearStreams' }, () => {
    streams = [];
    render();
    showToast('Lista limpa!');
  });
});

// Carrega ao abrir
loadStreams();

// Auto-refresh a cada 3s enquanto popup está aberto
setInterval(loadStreams, 3000);
