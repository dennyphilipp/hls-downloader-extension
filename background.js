// background.js — Service Worker da extensão

const capturedStreams = new Map(); // url -> { url, title, tabId, timestamp, status }
const autoRecordingTabs = new Set(); // tabIds onde auto-gravação já foi iniciada

// Intercepta requisições de rede procurando por .m3u8
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    if (url.includes('.m3u8') && !capturedStreams.has(url)) {
      chrome.tabs.get(details.tabId, (tab) => {
        const title = tab?.title || 'Vídeo sem título';
        const stream = {
          url,
          title,
          tabId: details.tabId,
          timestamp: Date.now(),
          status: 'detectado'
        };
        capturedStreams.set(url, stream);
        saveToStorage();

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'Stream HLS detectado!',
          message: title
        });

        // Inicia gravação automática para esta aba (apenas uma vez por aba)
        if (!autoRecordingTabs.has(details.tabId)) {
          autoRecordingTabs.add(details.tabId);
          autoStartRecording(details.tabId, stream);
        }
      });
    }
  },
  { urls: ['<all_urls>'] }
);

// Limpa o controle quando a aba é fechada ou navega para outra página
chrome.tabs.onRemoved.addListener((tabId) => autoRecordingTabs.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') autoRecordingTabs.delete(tabId);
});

function saveToStorage() {
  const list = Array.from(capturedStreams.values());
  chrome.storage.local.set({ streams: list });
}

// Tenta iniciar a gravação assim que o vídeo começar a reproduzir.
// Retenta até 8 vezes (com intervalo de 2s) caso o elemento ainda não exista.
function autoStartRecording(tabId, stream, attempt = 0) {
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: 'MAIN',
    args: [stream.title],
    func: (streamTitle) => {
      if (window.__hlsRecorder) return { ok: false, alreadyRecording: true };
      const video = document.querySelector('video');
      if (!video) return { ok: false, noVideo: true };

      function showIndicator() {
        if (document.getElementById('__hls_rec_indicator')) return;
        const s = document.createElement('style');
        s.textContent = '@keyframes __hls_pulse{0%,100%{opacity:1}50%{opacity:.5}}';
        document.head.appendChild(s);
        const el = document.createElement('div');
        el.id = '__hls_rec_indicator';
        el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#e53e3e;color:#fff;font-family:sans-serif;font-size:13px;font-weight:700;padding:6px 16px;border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,.5);pointer-events:none;animation:__hls_pulse 1.5s infinite';
        el.textContent = '● REC — não saia desta página';
        document.body.appendChild(el);
      }

      function startRec() {
        if (window.__hlsRecorder) return;
        window.__hlsChunks = [];
        const captureStream = video.captureStream();
        const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
          .find(t => MediaRecorder.isTypeSupported(t)) || '';
        window.__hlsRecorder = new MediaRecorder(captureStream, mimeType ? { mimeType } : {});
        window.__hlsRecorder.ondataavailable = (e) => {
          if (e.data?.size > 0) window.__hlsChunks.push(e.data);
        };
        window.__hlsRecorder.onstop = () => {
          document.getElementById('__hls_rec_indicator')?.remove();
          const blob = new Blob(window.__hlsChunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = (streamTitle || document.title || 'gravacao').replace(/[/\\?%*:|"<>]/g, '-') + '.webm';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.__hlsRecorder = null;
          window.__hlsChunks = [];
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        };
        window.__hlsRecorder.start(1000);
        showIndicator();
        video.addEventListener('ended', () => {
          if (window.__hlsRecorder?.state === 'recording') window.__hlsRecorder.stop();
        }, { once: true });
        window.addEventListener('pagehide', () => {
          if (window.__hlsRecorder?.state === 'recording') window.__hlsRecorder.stop();
        }, { once: true });
      }

      if (!video.paused && !video.ended && video.readyState >= 3) {
        startRec();
        return { ok: true, started: true };
      } else {
        video.addEventListener('play', startRec, { once: true });
        return { ok: true, waiting: true };
      }
    }
  }, (results) => {
    if (chrome.runtime.lastError) return;
    const noVideo = results?.every(r => r.result?.noVideo);
    if (noVideo && attempt < 8) {
      setTimeout(() => autoStartRecording(tabId, stream, attempt + 1), 2000);
    }
  });
}

// Escuta mensagens do popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getStreams') {
    sendResponse({ streams: Array.from(capturedStreams.values()) });
  }

  if (msg.action === 'clearStreams') {
    capturedStreams.clear();
    saveToStorage();
    sendResponse({ ok: true });
  }

  if (msg.action === 'startRecording') {
    chrome.scripting.executeScript({
      target: { tabId: msg.tabId, allFrames: true },
      world: 'MAIN',
      args: [msg.title || ''],
      func: (streamTitle) => {
        if (window.__hlsRecorder) return { ok: false, error: 'Gravação já em andamento.' };
        const video = document.querySelector('video');
        if (!video) return { ok: false, noVideo: true };
        window.__hlsChunks = [];
        const stream = video.captureStream();
        const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
          .find(t => MediaRecorder.isTypeSupported(t)) || '';
        window.__hlsRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        window.__hlsRecorder.ondataavailable = (e) => {
          if (e.data?.size > 0) window.__hlsChunks.push(e.data);
        };
        window.__hlsRecorder.onstop = () => {
          document.getElementById('__hls_rec_indicator')?.remove();
          const blob = new Blob(window.__hlsChunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = (streamTitle || document.title || 'gravacao').replace(/[/\\?%*:|"<>]/g, '-') + '.webm';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.__hlsRecorder = null;
          window.__hlsChunks = [];
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        };
        window.__hlsRecorder.start(1000);
        if (!document.getElementById('__hls_rec_indicator')) {
          const s = document.createElement('style');
          s.textContent = '@keyframes __hls_pulse{0%,100%{opacity:1}50%{opacity:.5}}';
          document.head.appendChild(s);
          const el = document.createElement('div');
          el.id = '__hls_rec_indicator';
          el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#e53e3e;color:#fff;font-family:sans-serif;font-size:13px;font-weight:700;padding:6px 16px;border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,.5);pointer-events:none;animation:__hls_pulse 1.5s infinite';
          el.textContent = '● REC — não saia desta página';
          document.body.appendChild(el);
        }
        video.addEventListener('ended', () => {
          if (window.__hlsRecorder?.state === 'recording') window.__hlsRecorder.stop();
        }, { once: true });
        window.addEventListener('pagehide', () => {
          if (window.__hlsRecorder?.state === 'recording') window.__hlsRecorder.stop();
        }, { once: true });
        return { ok: true };
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      const success = results?.find(r => r.result?.ok === true);
      sendResponse(success ? { ok: true } : { ok: false, error: 'Nenhum elemento <video> encontrado (nem em iframes).' });
    });
    return true;
  }

  if (msg.action === 'stopRecording') {
    chrome.scripting.executeScript({
      target: { tabId: msg.tabId, allFrames: true },
      world: 'MAIN',
      func: () => {
        if (!window.__hlsRecorder || window.__hlsRecorder.state !== 'recording') {
          return { ok: false, noRecorder: true };
        }
        window.__hlsRecorder.stop();
        return { ok: true };
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      const success = results?.find(r => r.result?.ok === true);
      sendResponse(success ? { ok: true } : { ok: false, error: 'Nenhuma gravação em andamento.' });
    });
    return true;
  }

  if (msg.action === 'recordingStatus') {
    chrome.scripting.executeScript({
      target: { tabId: msg.tabId, allFrames: true },
      world: 'MAIN',
      func: () => !!(window.__hlsRecorder && window.__hlsRecorder.state === 'recording')
    }, (results) => {
      if (chrome.runtime.lastError) { sendResponse({ recording: false }); return; }
      sendResponse({ recording: results?.some(r => r.result === true) });
    });
    return true;
  }

  return true;
});

