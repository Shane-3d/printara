(function () {
  'use strict';

  const API = '/.netlify/functions/support-chat';
  const SESSION_KEY = 'printara_support_session';

  let sessionId = localStorage.getItem(SESSION_KEY) || null;
  let open = false;
  let nameCollected = false;
  let userName = '';
  let userEmail = '';

  // ── Styles ─────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #sc-fab {
      position: fixed; bottom: 28px; right: 28px; z-index: 9998;
      width: 56px; height: 56px; border-radius: 50%;
      background: #e02020; color: #fff; border: none;
      font-size: 24px; cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,.35);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s;
    }
    #sc-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,.45); }
    #sc-fab .sc-badge {
      position: absolute; top: -4px; right: -4px;
      background: #fff; color: #e02020; border-radius: 50%;
      width: 18px; height: 18px; font-size: 11px; font-weight: 700;
      display: none; align-items: center; justify-content: center;
      border: 2px solid #e02020;
    }

    #sc-panel {
      position: fixed; bottom: 96px; right: 28px; z-index: 9999;
      width: 340px; max-height: 520px;
      background: #0d0d14; border: 1px solid rgba(255,255,255,.1);
      border-radius: 18px; box-shadow: 0 12px 48px rgba(0,0,0,.55);
      display: flex; flex-direction: column; overflow: hidden;
      transform: translateY(20px) scale(.96); opacity: 0;
      pointer-events: none; transition: transform .25s, opacity .25s;
    }
    #sc-panel.sc-open {
      transform: translateY(0) scale(1); opacity: 1; pointer-events: all;
    }

    #sc-header {
      background: #e02020; color: #fff;
      padding: 14px 18px; display: flex; align-items: center; gap: 10px;
      font-family: 'Inter', sans-serif; font-weight: 700; font-size: 15px;
    }
    #sc-header-sub { font-size: 12px; font-weight: 400; opacity: .85; margin-top: 2px; }
    #sc-close {
      margin-left: auto; background: none; border: none; color: #fff;
      font-size: 20px; cursor: pointer; line-height: 1; padding: 0 2px;
    }

    #sc-messages {
      flex: 1; overflow-y: auto; padding: 14px 14px 8px;
      display: flex; flex-direction: column; gap: 10px;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent;
    }

    .sc-msg {
      max-width: 82%; padding: 9px 13px; border-radius: 14px;
      font-family: 'Inter', sans-serif; font-size: 13.5px; line-height: 1.45;
      word-break: break-word;
    }
    .sc-msg.user {
      align-self: flex-end; background: #e02020; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .sc-msg.bot {
      align-self: flex-start; background: rgba(255,255,255,.08); color: #e8e8f0;
      border-bottom-left-radius: 4px;
    }
    .sc-msg.system {
      align-self: center; background: none; color: rgba(255,255,255,.4);
      font-size: 12px; padding: 2px 8px; max-width: 100%; text-align: center;
    }

    #sc-typing {
      align-self: flex-start; padding: 9px 14px;
      background: rgba(255,255,255,.08); border-radius: 14px;
      border-bottom-left-radius: 4px; display: none;
    }
    #sc-typing span {
      display: inline-block; width: 7px; height: 7px; border-radius: 50%;
      background: rgba(255,255,255,.5); margin: 0 2px;
      animation: scBounce 1.2s infinite;
    }
    #sc-typing span:nth-child(2) { animation-delay: .2s; }
    #sc-typing span:nth-child(3) { animation-delay: .4s; }
    @keyframes scBounce {
      0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); }
    }

    #sc-intake {
      padding: 12px 14px 14px;
      border-top: 1px solid rgba(255,255,255,.08);
      display: flex; flex-direction: column; gap: 8px;
    }
    #sc-intake input {
      width: 100%; padding: 9px 12px; border-radius: 10px; box-sizing: border-box;
      background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
      color: #e8e8f0; font-family: 'Inter', sans-serif; font-size: 13px;
      outline: none;
    }
    #sc-intake input:focus { border-color: #e02020; }
    #sc-intake input::placeholder { color: rgba(255,255,255,.3); }
    #sc-intake button {
      padding: 9px; border-radius: 10px; border: none;
      background: #e02020; color: #fff; font-weight: 700;
      font-family: 'Inter', sans-serif; font-size: 13px; cursor: pointer;
    }
    #sc-intake button:hover { background: #c41a1a; }

    #sc-footer {
      padding: 8px 14px 12px;
      border-top: 1px solid rgba(255,255,255,.08);
      display: flex; gap: 8px; align-items: flex-end;
    }
    #sc-input {
      flex: 1; resize: none; border-radius: 12px; padding: 9px 12px;
      background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
      color: #e8e8f0; font-family: 'Inter', sans-serif; font-size: 13px;
      outline: none; max-height: 100px; line-height: 1.4; box-sizing: border-box;
    }
    #sc-input:focus { border-color: #e02020; }
    #sc-input::placeholder { color: rgba(255,255,255,.3); }
    #sc-send {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      background: #e02020; color: #fff; font-size: 16px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background .15s;
    }
    #sc-send:hover { background: #c41a1a; }
    #sc-send:disabled { background: rgba(255,255,255,.15); cursor: not-allowed; }

    @media (max-width: 420px) {
      #sc-panel { width: calc(100vw - 24px); right: 12px; bottom: 86px; }
      #sc-fab { bottom: 18px; right: 18px; }
    }
  `;
  document.head.appendChild(style);

  // ── HTML ───────────────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <button id="sc-fab" title="Report a problem">
      <span>💬</span>
      <span class="sc-badge" id="sc-badge">!</span>
    </button>

    <div id="sc-panel">
      <div id="sc-header">
        <div>
          <div>Printara Support</div>
          <div id="sc-header-sub">We typically reply instantly</div>
        </div>
        <button id="sc-close" title="Close">✕</button>
      </div>

      <div id="sc-messages">
        <div class="sc-msg bot">Hi there! 👋 How can we help you today? Describe your problem and we'll assist you right away.</div>
        <div id="sc-typing"><span></span><span></span><span></span></div>
      </div>

      <!-- Name/email intake (shown before first message) -->
      <div id="sc-intake">
        <input id="sc-name-input" type="text" placeholder="Your name (optional)" autocomplete="name" />
        <input id="sc-email-input" type="email" placeholder="Your email (optional)" autocomplete="email" />
        <button id="sc-start-btn">Start Chat →</button>
      </div>

      <!-- Message input (shown after intake) -->
      <div id="sc-footer" style="display:none;">
        <textarea id="sc-input" rows="1" placeholder="Describe your problem…"></textarea>
        <button id="sc-send" title="Send">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const fab       = document.getElementById('sc-fab');
  const panel     = document.getElementById('sc-panel');
  const closeBtn  = document.getElementById('sc-close');
  const messages  = document.getElementById('sc-messages');
  const typing    = document.getElementById('sc-typing');
  const intake    = document.getElementById('sc-intake');
  const footer    = document.getElementById('sc-footer');
  const nameInput = document.getElementById('sc-name-input');
  const emailInput= document.getElementById('sc-email-input');
  const startBtn  = document.getElementById('sc-start-btn');
  const inputEl   = document.getElementById('sc-input');
  const sendBtn   = document.getElementById('sc-send');
  const badge     = document.getElementById('sc-badge');

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function addMsg(text, role) {
    const div = document.createElement('div');
    div.className = 'sc-msg ' + role;
    div.textContent = text;
    messages.insertBefore(div, typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function setTyping(show) {
    typing.style.display = show ? 'flex' : 'none';
    if (show) messages.scrollTop = messages.scrollHeight;
  }

  function togglePanel() {
    open = !open;
    panel.classList.toggle('sc-open', open);
    fab.querySelector('span').textContent = open ? '✕' : '💬';
    badge.style.display = 'none';
    if (open && sessionId) showMessageInput();
  }

  function showMessageInput() {
    intake.style.display = 'none';
    footer.style.display = 'flex';
    inputEl.focus();
  }

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  });

  // ── Events ──────────────────────────────────────────────────────────────────
  fab.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', togglePanel);

  startBtn.addEventListener('click', () => {
    userName  = nameInput.value.trim() || 'Anonymous';
    userEmail = emailInput.value.trim();
    nameCollected = true;
    showMessageInput();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;
    addMsg(text, 'user');
    setTyping(true);

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          name: userName,
          email: userEmail,
          session_id: sessionId,
        }),
      });
      const data = await res.json();
      if (data.session_id) {
        sessionId = data.session_id;
        localStorage.setItem(SESSION_KEY, sessionId);
      }
      setTyping(false);
      addMsg(data.reply || "Thanks! We'll get back to you soon.", 'bot');
    } catch {
      setTyping(false);
      addMsg('Sorry, something went wrong. Please try again.', 'bot');
    } finally {
      sendBtn.disabled = false;
    }
  }
})();
