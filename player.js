(function () {
  'use strict';

  var CHANNEL_NAME = 'null-grail-player';
  var SESSION_KEY = 'ng-player-current-handout:v2';
  var channel = null;
  var currentHandoutId = null;
  var curtain = document.getElementById('curtain');
  var view = document.getElementById('handout-view');
  var mode = new URLSearchParams(location.search).get('mode');

  function safeText(value, maximum) {
    var text = typeof value === 'string' ? value : '';
    return text.slice(0, maximum);
  }

  function normalizePayload(value) {
    if (!value || typeof value !== 'object') return null;
    var id = safeText(value.id, 16).toUpperCase();
    if (!/^[A-Z][A-Z0-9-]{0,15}$/.test(id)) return null;

    var image = safeText(value.image, 200).replace(/\\/g, '/');
    if (!/^assets\/art\/[a-z0-9._-]+$/i.test(image)) image = 'assets/art/hero-null-grail.webp';

    return {
      id: id,
      title: safeText(value.title, 160),
      day: safeText(value.day, 40),
      image: image,
      source: safeText(value.source, 180),
      factLabel: safeText(value.factLabel, 80),
      body: safeText(value.body, 2400),
      playerFacts: Array.isArray(value.playerFacts)
        ? value.playerFacts.slice(0, 16).map(function (fact) { return safeText(fact, 600); })
        : [],
      playerPrompt: safeText(value.playerPrompt, 1200)
    };
  }

  function remember(payload) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload)); } catch (error) {}
  }

  function forget() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (error) {}
  }

  function showHandout(rawPayload) {
    var item = normalizePayload(rawPayload);
    if (!item) return false;
    currentHandoutId = item.id;
    document.getElementById('handout-image').src = item.image;
    document.getElementById('handout-image').alt = item.title + '完整视觉手卡';
    document.getElementById('handout-id').textContent = 'PLAYER SAFE · ' + item.id + (item.day ? ' · ' + item.day : '');
    document.getElementById('handout-title').textContent = item.title;
    document.getElementById('handout-source').textContent = item.source || 'PLAYER SAFE 资料';
    document.getElementById('handout-body').textContent = item.body;

    var factsSection = document.getElementById('handout-facts-section');
    var facts = document.getElementById('handout-facts');
    facts.textContent = '';
    item.playerFacts.forEach(function (fact) {
      var row = document.createElement('li');
      row.textContent = fact;
      facts.appendChild(row);
    });
    factsSection.hidden = item.playerFacts.length === 0;
    document.getElementById('handout-facts-label').textContent = item.factLabel || '资料要点';

    var promptSection = document.getElementById('handout-prompt-section');
    document.getElementById('handout-prompt').textContent = item.playerPrompt;
    promptSection.hidden = !item.playerPrompt;
    curtain.hidden = true;
    view.hidden = false;
    document.title = item.title + ' · 零之圣杯';
    remember(item);
    return true;
  }

  function showCurtain() {
    currentHandoutId = null;
    view.hidden = true;
    curtain.hidden = false;
    document.title = '零之圣杯 · PLAYER SAFE';
    forget();
  }

  function handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'show' && message.handout) showHandout(message.handout);
    if (message.type === 'curtain') showCurtain();
    if (message.type === 'retract' && String(message.handoutId || '').toUpperCase() === currentHandoutId) showCurtain();
  }

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = function (event) { handleMessage(event.data); };
    channel.postMessage({ type: 'ready', mode: mode || 'player' });
  } catch (error) {
    channel = null;
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    handleMessage(event.data);
  });

  // Reloading the same player tab may restore only the last handout released to that tab.
  // Query-string ids are intentionally ignored: an id alone is never an access token.
  try {
    var restored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (!showHandout(restored)) showCurtain();
  } catch (error) {
    showCurtain();
  }

  if (mode !== 'projection') document.getElementById('projection-note').hidden = true;
  document.getElementById('fullscreen-button').addEventListener('click', function () {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) document.exitFullscreen();
  });
}());
