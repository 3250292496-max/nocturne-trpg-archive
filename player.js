(function () {
  'use strict';

  var config = window.NG_PLAYER_DATA || {};
  var CHANNEL_NAME = config.channelName || 'null-grail-player';
  var MESSAGE_PROTOCOL = config.protocol || 'null-grail-player-v3';
  var SESSION_KEY = 'ng-player-current-handout:v3';
  var CHARACTER_KEY = 'ng-player-character:v2';
  var RESULTS_KEY = 'ng-player-check-results:v1';
  var channel = null;
  var currentHandoutId = null;
  var curtain = document.getElementById('curtain');
  var view = document.getElementById('handout-view');
  var mode = new URLSearchParams(location.search).get('mode');
  var character = null;
  var results = [];
  var pendingSubmissionId = null;

  function safeText(value, maximum) { return (typeof value === 'string' ? value : '').slice(0, maximum); }
  function clamp(value, minimum, maximum, fallback) { var number = Number(value); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }
  function makeId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  function normalizePayload(value) {
    if (!value || typeof value !== 'object') return null;
    var id = safeText(value.id, 16).toUpperCase();
    if (!/^[A-Z][A-Z0-9-]{0,15}$/.test(id)) return null;
    var image = safeText(value.image, 200).replace(/\\/g, '/');
    if (!/^assets\/art\/[a-z0-9._-]+$/i.test(image)) image = 'assets/art/hero-null-grail.webp';
    return { id:id, title:safeText(value.title,160), day:safeText(value.day,40), image:image, source:safeText(value.source,180), factLabel:safeText(value.factLabel,80), body:safeText(value.body,2400), playerFacts:Array.isArray(value.playerFacts) ? value.playerFacts.slice(0,16).map(function (fact) { return safeText(fact,600); }) : [], playerPrompt:safeText(value.playerPrompt,1200) };
  }

  function rememberHandout(payload) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload)); } catch (error) {} }
  function forgetHandout() { try { sessionStorage.removeItem(SESSION_KEY); } catch (error) {} }

  function showHandout(rawPayload) {
    var item = normalizePayload(rawPayload); if (!item) return false;
    currentHandoutId = item.id;
    document.getElementById('handout-image').src = item.image;
    document.getElementById('handout-image').alt = item.title + '完整视觉手卡';
    document.getElementById('handout-id').textContent = 'PLAYER SAFE · ' + item.id + (item.day ? ' · ' + item.day : '');
    document.getElementById('handout-title').textContent = item.title;
    document.getElementById('handout-source').textContent = item.source || 'PLAYER SAFE 资料';
    document.getElementById('handout-body').textContent = item.body;
    var factsSection = document.getElementById('handout-facts-section'); var facts = document.getElementById('handout-facts'); facts.textContent = '';
    item.playerFacts.forEach(function (fact) { var row = document.createElement('li'); row.textContent = fact; facts.appendChild(row); });
    factsSection.hidden = item.playerFacts.length === 0;
    document.getElementById('handout-facts-label').textContent = item.factLabel || '资料要点';
    var promptSection = document.getElementById('handout-prompt-section'); document.getElementById('handout-prompt').textContent = item.playerPrompt; promptSection.hidden = !item.playerPrompt;
    curtain.hidden = true; view.hidden = false; document.title = item.title + ' · 零之圣杯'; rememberHandout(item); return true;
  }

  function showCurtain() { currentHandoutId = null; view.hidden = true; curtain.hidden = false; document.title = '零之圣杯 · PLAYER SAFE'; forgetHandout(); }

  function blankCharacter() {
    var base = config.blankCharacter || {};
    return { protocol:config.characterProtocol || 'null-grail-character-v2', rulesetId:config.rulesetId || 'null-grail-v3.2-light-d20', id:makeId('character'), name:'', playerName:'', pronouns:'', origin:'', identity:'', wish:'', fearedIdentity:'', anchor:'', existenceType:'present', approaches:Object.assign({ physique:3, insight:2, lore:2, rapport:1, will:0 }, base.approaches || {}), specialties:[], resolve:3, stress:0, injury:'none', trauma:[], coreLoad:0, noblePhantasmReady:true, notes:'' };
  }

  function normalizeCharacter(raw) {
    if (!raw || typeof raw !== 'object') return blankCharacter();
    if (raw.rulesetId && raw.rulesetId !== config.rulesetId) throw new Error('ruleset');
    var normalized = blankCharacter();
    normalized.id = safeText(raw.id,80); if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(normalized.id))normalized.id=makeId('character'); normalized.name = safeText(raw.name,80).trim(); normalized.playerName = safeText(raw.playerName,80).trim(); normalized.pronouns = safeText(raw.pronouns,80).trim(); normalized.origin = safeText(raw.origin,120).trim();
    normalized.identity = safeText(raw.identity,400); normalized.wish = safeText(raw.wish,600); normalized.fearedIdentity = safeText(raw.fearedIdentity,400); normalized.anchor = safeText(raw.anchor,400);
    normalized.existenceType = ['present','master','servant'].indexOf(raw.existenceType) !== -1 ? raw.existenceType : 'present';
    (config.approaches || []).forEach(function (item) { normalized.approaches[item.id] = clamp(raw.approaches && raw.approaches[item.id],0,3,0); });
    normalized.specialties = Array.isArray(raw.specialties) ? raw.specialties.map(function (item) { return safeText(item,80).trim(); }).filter(Boolean).slice(0,3) : [];
    normalized.resolve = clamp(raw.resolve,0,3,3); normalized.stress = clamp(raw.stress,0,3,0); normalized.injury = ['none','light','serious','critical'].indexOf(raw.injury) !== -1 ? raw.injury : 'none';
    normalized.trauma = Array.isArray(raw.trauma) ? raw.trauma.map(function (item) { return safeText(item,200).trim(); }).filter(Boolean).slice(0,8) : [];
    normalized.coreLoad = clamp(raw.coreLoad,0,3,0); normalized.noblePhantasmReady = raw.noblePhantasmReady !== false; normalized.notes = safeText(raw.notes,1600); return normalized;
  }

  function readStoredCharacter() { try { return normalizeCharacter(JSON.parse(localStorage.getItem(CHARACTER_KEY) || 'null')); } catch (error) { return blankCharacter(); } }
  function saveCharacter(next) { character = normalizeCharacter(next); localStorage.setItem(CHARACTER_KEY, JSON.stringify(character)); document.getElementById('character-save-status').textContent = '已本地保存 ' + new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}); updateCheckOptions(); }

  function initializeApproaches() {
    document.getElementById('player-approach-inputs').innerHTML = (config.approaches || []).map(function (item) { return '<label><span>' + item.label + '</span><input type="number" min="0" max="3" step="1" data-approach="' + item.id + '" aria-label="' + item.label + '"></label>'; }).join('');
    document.getElementById('player-check-approach').innerHTML = (config.approaches || []).map(function (item) { return '<option value="' + item.id + '">' + item.label + '</option>'; }).join('');
    document.getElementById('player-check-dc').innerHTML = (config.difficulties || []).map(function (item) { return '<option value="' + item.value + '">' + item.label + '</option>'; }).join('');
  }

  function fillCharacterForm(value) {
    character = normalizeCharacter(value);
    var fields = { 'character-name':'name','character-player-name':'playerName','character-pronouns':'pronouns','character-origin':'origin','character-identity':'identity','character-wish':'wish','character-feared-identity':'fearedIdentity','character-anchor':'anchor','character-existence':'existenceType','character-resolve':'resolve','character-stress':'stress','character-injury':'injury','character-core-load':'coreLoad','character-notes':'notes' };
    Object.keys(fields).forEach(function (id) { document.getElementById(id).value = character[fields[id]]; });
    document.getElementById('character-noble-ready').value = character.noblePhantasmReady ? 'ready' : 'used';
    document.getElementById('character-trauma').value = character.trauma.join('\n');
    document.querySelectorAll('[data-approach]').forEach(function (input) { input.value = character.approaches[input.getAttribute('data-approach')]; });
    document.querySelectorAll('.character-specialty').forEach(function (input,index) { input.value = character.specialties[index] || ''; });
    updateServantFields(); updateCheckOptions();
  }

  function collectCharacter() {
    var raw = Object.assign({}, character || blankCharacter());
    var fields = { 'character-name':'name','character-player-name':'playerName','character-pronouns':'pronouns','character-origin':'origin','character-identity':'identity','character-wish':'wish','character-feared-identity':'fearedIdentity','character-anchor':'anchor','character-existence':'existenceType','character-resolve':'resolve','character-stress':'stress','character-injury':'injury','character-core-load':'coreLoad','character-notes':'notes' };
    Object.keys(fields).forEach(function (id) { raw[fields[id]] = document.getElementById(id).value; });
    raw.noblePhantasmReady = document.getElementById('character-noble-ready').value === 'ready'; raw.trauma = document.getElementById('character-trauma').value.split(/\r?\n/);
    raw.approaches = {}; document.querySelectorAll('[data-approach]').forEach(function (input) { raw.approaches[input.getAttribute('data-approach')] = input.value; });
    raw.specialties = Array.from(document.querySelectorAll('.character-specialty')).map(function (input) { return input.value; }); raw.updatedAt = new Date().toISOString(); return normalizeCharacter(raw);
  }

  function validBuild(value) { return Object.keys(value.approaches).map(function (key) { return value.approaches[key]; }).sort().join(',') === '0,1,2,2,3' && value.specialties.length === 3; }
  function updateServantFields() { var servant = document.getElementById('character-existence').value === 'servant'; document.getElementById('character-core-load-field').hidden = !servant; document.getElementById('character-noble-field').hidden = !servant; }
  function updateCheckOptions() { var select = document.getElementById('player-check-specialty'); select.innerHTML = '<option value="">不使用专长</option>' + (character && character.specialties || []).map(function (item) { return '<option value="' + item.replace(/&/g,'&amp;').replace(/"/g,'&quot;') + '">' + item.replace(/</g,'&lt;') + '（＋2）</option>'; }).join(''); }

  function sendToKeeper(message) {
    message.protocol = MESSAGE_PROTOCOL;
    if (channel) { channel.postMessage(message); return true; }
    if (window.opener && !window.opener.closed) { window.opener.postMessage(message, window.location.origin); return true; }
    return false;
  }

  function showSync(message) { document.getElementById('player-sync-status').textContent = message; }
  function downloadJson(filename,payload) { var blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); var link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=filename; link.click(); URL.revokeObjectURL(link.href); }

  function normalizeResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id=safeText(raw.id,80); var dice=Array.isArray(raw.dice)?raw.dice.slice(0,2).map(function(value){return clamp(value,1,20,1);}):[];
    if(!id||!dice.length)return null;
    return { id:id, requestId:safeText(raw.requestId,80), targetCharacterId:safeText(raw.targetCharacterId,80)||'all', characterName:safeText(raw.characterName,80), total:clamp(raw.total,-99,99,0), dc:clamp(raw.dc,1,99,13), tier:['exceptional','success','costly','severe'].indexOf(raw.tier)!==-1?raw.tier:'severe', tierLabel:safeText(raw.tierLabel,80), goal:safeText(raw.goal,500), risk:safeText(raw.risk,500), publicNote:safeText(raw.publicNote,800), costOwner:safeText(raw.costOwner,80), approachLabel:safeText(raw.approachLabel,40), approachValue:clamp(raw.approachValue,0,5,0), specialty:safeText(raw.specialty,80), specialtyBonus:clamp(raw.specialtyBonus,0,2,0), assist:clamp(raw.assist,0,3,0), modifier:clamp(raw.modifier,-20,20,0), mode:['normal','advantage','disadvantage'].indexOf(raw.mode)!==-1?raw.mode:'normal', dice:dice, kept:clamp(raw.kept,1,20,dice[0]), createdAt:safeText(raw.createdAt,40) };
  }

  function renderResults() {
    var list=document.getElementById('player-result-list');
    list.innerHTML=results.length?results.map(function (result) { var time=result.createdAt?new Date(result.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''; var modeLabel=result.mode==='advantage'?'优势':result.mode==='disadvantage'?'劣势':'正常'; var formula=result.dice.join(' / ')+'（'+modeLabel+'取 '+result.kept+'）＋'+(result.approachLabel||'行动方式')+' '+result.approachValue+(result.specialty?'＋'+result.specialty+' '+result.specialtyBonus:'')+'＋协助 '+result.assist+'＋修正 '+result.modifier; return '<li class="player-result-item"><div class="player-result-tier '+result.tier+'"><strong>'+result.total+'</strong><span>'+escapeHtml(result.tierLabel)+'</span></div><div class="player-result-copy"><h4>'+escapeHtml(result.goal||'公开判定')+'</h4><span>'+escapeHtml(result.characterName||'公开判定')+' · DC '+result.dc+'</span><p>'+escapeHtml(formula)+'</p>'+(result.risk?'<p>已公开风险：'+escapeHtml(result.risk)+'</p>':'')+(result.publicNote?'<p>现场结果：'+escapeHtml(result.publicNote)+'</p>':'')+(result.costOwner?'<p>代价选择者：'+escapeHtml(result.costOwner)+'</p>':'')+'</div><time class="player-result-time">'+time+'</time></li>'; }).join(''):'<li class="player-result-empty">尚未收到守秘人的判定结果。</li>';
  }
  function escapeHtml(value) { return String(value||'').replace(/[&<>"']/g,function (char) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]; }); }
  function rememberResults() { try { localStorage.setItem(RESULTS_KEY,JSON.stringify(results)); } catch(error){} }

  function handleMessage(message) {
    if (!message || typeof message !== 'object') return;
    if(message.protocol&&message.protocol!==MESSAGE_PROTOCOL)return;
    if (message.type === 'show' && message.handout) showHandout(message.handout);
    if (message.type === 'curtain') showCurtain();
    if (message.type === 'retract' && String(message.handoutId||'').toUpperCase()===currentHandoutId) showCurtain();
    if (message.type === 'character-ack' && character && message.characterId === character.id && (!pendingSubmissionId||message.submissionId===pendingSubmissionId)) { showSync(message.accepted ? '守秘人已确认角色' : '守秘人未接收这份角色卡'); if(message.submissionId===pendingSubmissionId)pendingSubmissionId=null; }
    if (message.type === 'check-ack' && character && message.characterId === character.id) showSync('守秘人已收到判定申请');
    if (message.type === 'check-result') { var result=normalizeResult(message.result); if (result && (result.targetCharacterId==='all' || character && result.targetCharacterId===character.id) && !results.some(function(item){return item.id===result.id;})) { results.unshift(result); results=results.slice(0,50); rememberResults(); renderResults(); showSync('已收到判定结果：'+result.tierLabel); } }
  }

  initializeApproaches();
  character=readStoredCharacter(); fillCharacterForm(character);
  try { results=JSON.parse(localStorage.getItem(RESULTS_KEY)||'[]').map(normalizeResult).filter(Boolean); } catch(error) { results=[]; } renderResults();

  document.getElementById('player-character-form').addEventListener('submit',function(event){ event.preventDefault(); var next=collectCharacter(); if(!next.name){showSync('请先填写角色名');return;} saveCharacter(next); showSync(validBuild(next)?'角色已保存；可提交给守秘人':'角色已保存；行动方式或三项专长尚未完成标准分配'); });
  document.getElementById('character-existence').addEventListener('change',updateServantFields);
  document.getElementById('player-submit-character').addEventListener('click',function(){ var next=collectCharacter(); if(!next.name){showSync('请先填写角色名');return;} if(!validBuild(next)){showSync('提交前请使用 +3/+2/+2/+1/+0，并填写三项专长');return;} saveCharacter(next); pendingSubmissionId=makeId('submission'); showSync(sendToKeeper({type:'character-submit',submissionId:pendingSubmissionId,sentAt:new Date().toISOString(),character:next})?'角色已提交，等待守秘人确认':'未找到同源本机守秘人标签页；可导出 JSON 交付'); });
  document.getElementById('player-export-character').addEventListener('click',function(){ var next=collectCharacter(); saveCharacter(next); downloadJson('零之圣杯-角色-'+(next.name||'未命名')+'.json',next); });
  document.getElementById('player-import-character').addEventListener('click',function(){document.getElementById('player-character-file').click();});
  document.getElementById('player-character-file').addEventListener('change',function(event){var file=event.target.files[0];if(!file)return;if(file.size>262144){showSync('角色 JSON 过大，上限 256 KB');event.target.value='';return;}var reader=new FileReader();reader.onload=function(){try{var parsed=JSON.parse(reader.result);if((parsed.protocol!==config.characterProtocol&&parsed.protocol!=='null-grail-character-v1')||parsed.rulesetId!==config.rulesetId)throw new Error('protocol');var imported=normalizeCharacter(parsed);saveCharacter(imported);fillCharacterForm(imported);showSync(parsed.protocol===config.characterProtocol?'角色 JSON 已导入':'旧版角色 JSON 已迁移并导入');}catch(error){showSync('角色 JSON 无效或规则版本不兼容');}};reader.readAsText(file);event.target.value='';});
  document.getElementById('player-check-request-form').addEventListener('submit',function(event){event.preventDefault();var next=collectCharacter();if(!next.name){showSync('请先保存角色卡');return;}saveCharacter(next);var approachId=document.getElementById('player-check-approach').value;var specialty=document.getElementById('player-check-specialty').value;var request={id:makeId('request'),protocol:config.checkProtocol||'null-grail-check-v1',rulesetId:config.rulesetId,characterId:next.id,characterName:next.name,approachId:approachId,approachValue:next.approaches[approachId],specialty:specialty,specialtyBonus:specialty?2:0,mode:document.getElementById('player-check-mode').value,assist:document.getElementById('player-check-assist').value,modifier:document.getElementById('player-check-modifier').value,suggestedDc:document.getElementById('player-check-dc').value,goal:document.getElementById('player-check-goal').value,risk:document.getElementById('player-check-risk').value,createdAt:new Date().toISOString()};showSync(sendToKeeper({type:'check-request',request:request})?'判定申请已发送；等待守秘人公开风险并掷骰':'未找到同源本机守秘人标签页');});
  document.getElementById('player-clear-results').addEventListener('click',function(){results=[];rememberResults();renderResults();});

  try { channel=new BroadcastChannel(CHANNEL_NAME); channel.onmessage=function(event){handleMessage(event.data);}; channel.postMessage({protocol:MESSAGE_PROTOCOL,type:'ready',mode:mode||'player',characterId:character&&character.id}); } catch(error){channel=null;}
  window.addEventListener('message',function(event){if(event.origin===window.location.origin)handleMessage(event.data);});
  try { var restored=JSON.parse(sessionStorage.getItem(SESSION_KEY)||sessionStorage.getItem('ng-player-current-handout:v2')||'null'); if(!showHandout(restored))showCurtain(); } catch(error){showCurtain();}
  if(mode==='projection'){document.body.classList.add('projection-mode');}else{document.getElementById('projection-note').hidden=true;}
  document.getElementById('fullscreen-button').addEventListener('click',function(){if(!document.fullscreenElement){if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();}else if(document.exitFullscreen)document.exitFullscreen();});
}());
