
const API_KEY = 'AIzaSyB8GSOii1m4eCN_zatEL5KeSRiNj_yiDMA';//api key
const MODEL_NAME = 'gemini-2.5-flash-lite';//modello api(gemini 2.5 flash lite), non toccate se non volete essere tagliati le dita

//bellissima state machine che assolutamente non odio usare
const state = {
  messages: [],      
  attachments: [],   
  isLoading: false,
};

//resto della variabili
const html               = document.documentElement;
const themeToggle        = document.getElementById('theme-toggle');//cambio tema
const newChatBtn         = document.getElementById('new-chat-btn');//nuova chat
const welcomeScreen      = document.getElementById('welcome-screen');
const chatContainer      = document.getElementById('chat-container');//spazio della chat
const messagesList       = document.getElementById('messages-list');//messaggi della chat
const userInput          = document.getElementById('user-input');//autoesplicativo
const sendBtn            = document.getElementById('send-btn');//non ha senso continuare a commentare ste cose
const attachBtn          = document.getElementById('attach-btn');
const fileInput          = document.getElementById('file-input');
const attachmentsPreview = document.getElementById('attachments-preview');

//avvio 
function init() {
  
  const savedTheme = localStorage.getItem('gemini_theme') || 'dark';//carica l'ultimo tema salvato
  setTheme(savedTheme);

  //gestione degli eventi possibili(non verranno commentati)
  themeToggle.addEventListener('click', toggleTheme);
  newChatBtn.addEventListener('click', resetChat);
  sendBtn.addEventListener('click', handleSend);
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  //tranne questo
  userInput.addEventListener('keydown', (e) => {//"e" viene usato per salvare i tasti premuti
    if (e.key === 'Enter' && !e.shiftKey) {//in questo modo si può andare a capo trattenendo shift+ enter
      e.preventDefault();
      handleSend();
    }
  });

  userInput.addEventListener('input', () => {
    autoResizeTextarea();
    updateSendBtn();
  });
}

//autoesplicativo
function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem('gemini_theme', theme);
}

function toggleTheme() {
  const current = html.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

//resetta tutto
function resetChat() {
  state.messages = [];
  state.attachments = [];
  messagesList.innerHTML = '';
  attachmentsPreview.innerHTML = '';
  chatContainer.classList.remove('visible');
  welcomeScreen.style.display = 'flex';
  userInput.value = '';
  autoResizeTextarea();
  updateSendBtn();
}

//cambia la grandezza del textArea quando non c'è più spazio visibile
function autoResizeTextarea() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
}

function updateSendBtn() {
  const hasText = userInput.value.trim() !== '';
  const hasAttachments = state.attachments.length > 0;
  sendBtn.disabled = (!hasText && !hasAttachments) || state.isLoading;
}

//poi vi mando il link del video per gli allegati
function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl  = ev.target.result;
      const mimeType = file.type || 'application/octet-stream';

      state.attachments.push({ file, dataUrl, mimeType, name: file.name });
      renderAttachmentChip(file, dataUrl, mimeType, state.attachments.length - 1);
      updateSendBtn();
    };
    reader.readAsDataURL(file);
  });

  
  fileInput.value = '';
}
//preview del file/immagine nella chat e nella textarea
function renderAttachmentChip(file, dataUrl, mimeType, index) {
  const chip = document.createElement('div');
  chip.className = 'attachment-chip';
  chip.dataset.index = index;

  if (mimeType.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = dataUrl;
    chip.appendChild(img);
  } else {
    const icon = document.createElement('span');
    icon.textContent = '📄';
    chip.appendChild(icon);
  }

  const name = document.createElement('span');
  name.className = 'chip-name';
  name.textContent = file.name;
  chip.appendChild(name);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'chip-remove';
  removeBtn.textContent = '×';
  removeBtn.title = 'Rimuovi';
  removeBtn.addEventListener('click', () => {
    state.attachments.splice(index, 1);
    chip.remove();
    // Aggiorna gli indici dei chip rimanenti
    document.querySelectorAll('.attachment-chip').forEach((c, i) => {
      c.dataset.index = i;
    });
    updateSendBtn();
  });
  chip.appendChild(removeBtn);

  attachmentsPreview.appendChild(chip);
}

//gestione dell'invio del messaggio
async function handleSend() {
  const text = userInput.value.trim();//messaggio
  const attachments = [...state.attachments];//allegati

  if ((!text && !attachments.length) || state.isLoading) return;

  //mostra chat e nascondi welcome
  welcomeScreen.style.display = 'none';
  chatContainer.classList.add('visible');

  //costruzione messaggio(sempre che vi mando il link del video)
  const parts = [];
  for (const att of attachments) {
    if (att.mimeType.startsWith('image/')) {
      
      const base64 = att.dataUrl.split(',')[1];
      parts.push({ inline_data: { mime_type: att.mimeType, data: base64 } });
    } else {
      
      parts.push({ text: `[File allegato: ${att.name}]` });
    }
  }
  if (text) parts.push({ text });

  //mostra il messaggio
  appendUserMessage(text, attachments);


  state.messages.push({ role: 'user', parts });

  //pulisce la textArea
  userInput.value = '';
  state.attachments = [];
  attachmentsPreview.innerHTML = '';
  autoResizeTextarea();
  state.isLoading = true;
  updateSendBtn();

  
  const typingEl = appendTypingIndicator();
  //letteralmente l'unica parte del codice utile ai fini del compito
  try {
    const reply = await callGeminiAPI();
    typingEl.remove();
    appendAiMessage(reply);
    state.messages.push({ role: 'model', parts: [{ text: reply }] });
  } catch (err) {
    typingEl.remove();
    appendAiMessage(`⚠ Errore: ${err.message}`);
  } finally {
    state.isLoading = false;
    updateSendBtn();
  }
}

//insieme a questa(gentilmente spiegata dal sito Google Studio)
async function callGeminiAPI() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;//si poteva mettere anche qui la apikey in realtà ma è più easy cambiarla

  const body = {
    contents: state.messages,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg  = errData?.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  const data = await response.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('Risposta vuota.');
  return reply;
}

//visualizzazione dei messaggi
function appendUserMessage(text, attachments) {
  const msgEl = createMessageShell('user');
  const contentEl = msgEl.querySelector('.message-content');

  // mostra eventuali immagini allegate
  attachments.forEach(att => {
    if (att.mimeType.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = att.dataUrl;
      img.className = 'message-image';
      contentEl.appendChild(img);
    } else {
      const chip = document.createElement('div');
      chip.style.cssText = 'font-size:0.82rem;color:var(--text-muted);margin-bottom:4px;';
      chip.textContent = `📄 ${att.name}`;
      contentEl.appendChild(chip);
    }
  });

  //testo
  if (text) {
    const p = document.createElement('span');
    p.textContent = text;
    contentEl.appendChild(p);
  }

  messagesList.appendChild(msgEl);
  scrollToBottom();
}

function appendAiMessage(text) {
  const msgEl = createMessageShell('ai');
  const contentEl = msgEl.querySelector('.message-content');
  contentEl.innerHTML = renderMarkdown(text);
  messagesList.appendChild(msgEl);
  scrollToBottom();
}

function appendTypingIndicator() {
  const msgEl = createMessageShell('ai');
  const bodyEl = msgEl.querySelector('.message-body');
  const contentEl = msgEl.querySelector('.message-content');
  contentEl.remove();

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  bodyEl.appendChild(indicator);

  messagesList.appendChild(msgEl);
  scrollToBottom();
  return msgEl;
}

function createMessageShell(role) {
  const isUser = role === 'user';
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;

  const avatarEl = document.createElement('div');
  avatarEl.className = 'message-avatar';
  avatarEl.textContent = isUser ? 'Tu' : '✦';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'message-body';

  const nameEl = document.createElement('div');
  nameEl.className = 'message-name';
  nameEl.textContent = isUser ? 'Tu' : 'Gemini';

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';

  bodyEl.appendChild(nameEl);
  bodyEl.appendChild(contentEl);
  msgEl.appendChild(avatarEl);
  msgEl.appendChild(bodyEl);
  return msgEl;
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

//formattazione html non lo so dovrebbe impedire di scrivere robe tipo <b>Ciao</b> nel testo e vederle come se fossero nel codice
function renderMarkdown(text) {
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  let r = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code>${escapeHtml(code.trim())}</code></pre>`
  );
  r = r.replace(/`([^`\n]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  r = r.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  r = r.replace(/\*(.+?)\*/g,     '<em>$1</em>');
  r = r.replace(/\n/g,            '<br>');
  return r;
}

//avvio
document.addEventListener('DOMContentLoaded', init);
