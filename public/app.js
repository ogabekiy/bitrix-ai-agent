const form = document.querySelector('#chat-form');
const input = document.querySelector('#message-input');
const messages = document.querySelector('#messages');
const sendButton = document.querySelector('.send-button');

function addMessage(text, role, meta = '') {
  const row = document.createElement('div');
  row.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'S' : '✳';
  const content = document.createElement('div');
  content.className = 'message-body';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  const stamp = document.createElement('span');
  stamp.className = 'message-time';
  stamp.textContent = meta;
  content.append(bubble);
  content.append(stamp);
  row.append(avatar, content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

async function send(text) {
  const question = text.trim();
  if (!question || sendButton.disabled) return;
  addMessage(question, 'user');
  input.value = '';
  input.style.height = 'auto';
  sendButton.disabled = true;
  sendButton.querySelector('span').textContent = 'Kutilmoqda';
  const loading = addMessage('Javob tayyorlayapman…', 'assistant');
  loading.classList.add('typing');
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: question }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'So‘rov bajarilmadi.');
    const source = result.source === 'Bitrix24' ? `BITRIX24 · ${result.count} TA NATIJA` : 'CLAUDE HAIKU';
    loading.querySelector('.bubble').textContent = result.answer || 'Javob matni bo‘sh qaytdi.';
    loading.querySelector('.message-time').textContent = source;
    loading.classList.remove('typing');
  } catch (error) {
    const bubble = loading.querySelector('.bubble');
    const stamp = loading.querySelector('.message-time');
    if (bubble) bubble.textContent = `Xatolik: ${error.message}`;
    if (stamp) stamp.textContent = 'XATOLIK';
    loading.classList.remove('typing');
  } finally {
    sendButton.disabled = false;
    sendButton.querySelector('span').textContent = 'Yuborish';
    input.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  send(input.value);
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
});

document.querySelectorAll('.suggestion').forEach((button) => {
  button.addEventListener('click', () => send(button.dataset.prompt));
});
