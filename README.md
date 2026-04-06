# HLS Video Downloader

Extensão para Chrome que detecta streams HLS (`.m3u8`) em páginas web e grava automaticamente o vídeo sendo reproduzido, sem necessidade de apps externos.

## Como funciona

A extensão intercepta requisições de rede em busca de URLs `.m3u8`. Quando detecta um stream, injeta um gravador diretamente no elemento `<video>` da página usando a API `captureStream()` + `MediaRecorder` do navegador.

Por usar o próprio player do Chrome como fonte, a gravação funciona mesmo em streams protegidos por autenticação — o navegador já está autenticado e reproduzindo o vídeo.

## Funcionalidades

- Detecção automática de streams HLS em qualquer aba
- Gravação inicia automaticamente quando o vídeo começa a reproduzir
- Para automaticamente quando o vídeo termina
- Indicador visual `● REC` na página durante a gravação
- Controle manual (iniciar/parar) via popup da extensão
- Funciona com vídeos dentro de `<iframe>` (comum em plataformas de cursos)
- Áudio capturado independente do volume do sistema
- Arquivo salvo em `.webm` (VP9) diretamente na pasta de Downloads

## Estrutura do projeto

```
hls-downloader-extension/
├── manifest.json     # Configuração da extensão (Manifest V3)
├── background.js     # Service worker: intercepta streams e gerencia gravação
├── popup.html        # Interface do popup
├── popup.js          # Lógica do popup
├── icon16.png
├── icon48.png
└── icon128.png
```

## Instalação

### Pré-requisitos

- Google Chrome (versão 95 ou superior)

### Passos

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/hls-downloader.git
   ```

2. Abra o Chrome e acesse `chrome://extensions`

3. Ative o **Modo do desenvolvedor** (canto superior direito)

4. Clique em **Carregar sem compactação** e selecione a pasta `hls-downloader-extension`

5. A extensão aparecerá na barra de ferramentas do Chrome

## Como usar

1. Acesse uma página com vídeo em stream HLS (plataformas de cursos, aulas online, etc.)
2. Dê play no vídeo
3. A gravação inicia automaticamente — o indicador **● REC — não saia desta página** aparece no canto da página
4. Quando o vídeo terminar, o arquivo `.webm` é baixado automaticamente para a sua pasta de Downloads
5. Para controle manual, clique no ícone da extensão na barra do Chrome

### Popup da extensão

O popup exibe todos os streams detectados na sessão atual e permite:

| Botão | Ação |
|---|---|
| `📋` | Copia a URL do stream `.m3u8` |
| `● Gravar` | Inicia a gravação manualmente |
| `■ Parar` | Para a gravação e salva o arquivo |
| `↺ Atualizar` | Atualiza a lista de streams |
| `✕ Limpar lista` | Remove todos os streams da lista |

## Observações

- **Não navegue para outra página** enquanto a gravação estiver ativa. Os dados ficam na memória da aba atual e serão perdidos se você sair.
- O arquivo é salvo em `.webm` (codec VP9), compatível com Chrome, Firefox e VLC. Para converter para `.mp4`:
  ```bash
  ffmpeg -i gravacao.webm -c copy gravacao.mp4
  ```
- O volume do sistema **não afeta** o áudio gravado. Apenas o botão mute do próprio player interfere.
- Se a gravação não iniciar automaticamente, use o botão `● Gravar` no popup.

## Permissões utilizadas

| Permissão | Motivo |
|---|---|
| `webRequest` | Interceptar requisições para detectar URLs `.m3u8` |
| `scripting` | Injetar o gravador nos frames da página |
| `tabs` | Obter o título da aba ao detectar o stream |
| `storage` | Persistir a lista de streams detectados |
| `notifications` | Notificar quando um stream é detectado |

## Tecnologias

- Chrome Extension Manifest V3
- `HTMLMediaElement.captureStream()` — captura o stream do elemento `<video>`
- `MediaRecorder` API — grava e codifica em VP9/WebM
- `chrome.scripting.executeScript` com `allFrames: true` — suporte a iframes