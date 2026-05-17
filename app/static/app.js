const state = {
  apiKey: localStorage.getItem("leran_api_key") || "",
  user: JSON.parse(localStorage.getItem("leran_user") || "null"),
  children: JSON.parse(localStorage.getItem("leran_children") || "[]"),
  activeChildId: Number(localStorage.getItem("leran_active_child_id") || "0"),
  rewards: [],
  awardedTasks: new Set(JSON.parse(localStorage.getItem("leran_awarded_tasks") || "[]")),
  words: [],
  selectedWordIds: new Set(JSON.parse(localStorage.getItem("leran_selected_word_ids") || "[]")),
  scenario: null,
  chatHistory: [],
  lastAiText: "",
  roundLimit: Number(localStorage.getItem("leran_round_limit") || "5"),
  chatTurns: 0,
  practiceIndex: 0,
  practiceCorrect: 0,
  wordScores: {},
  wordInputDone: {},
  wordSpeechDone: {},
  storySessionId: null,
  storyText: "",
  storyWords: [],
  storyMasked: false,
  storyMaskMode: "none",
  storyVerifiedIndex: 0,
  storySentences: [],
  selectedSentenceIndex: 0,
  scores: { words: 0, chat: 0, story: 0 },
  chatScoreTotal: 0,
  storyScoreTotal: 0,
  completed: { words: false, practice: false, chat: false, story: false },
  selectedFeatures: JSON.parse(localStorage.getItem("leran_selected_features") || '{"practice":true,"chat":true,"story":true}'),
  recorders: {},
  recognizers: {},
  liveStoryText: "",
};

const $ = (id) => document.getElementById(id);

function todayTag() {
  return state.user && state.activeChildId ? `today-${state.user.id}-${state.activeChildId}` : "today";
}

function wordbookTag() {
  return state.user ? `wordbook-${state.user.id}` : "wordbook";
}

function speechRate() {
  const slider = document.querySelector(".panel.active .speechSpeed") || document.querySelector(".speechSpeed");
  const value = Number(slider?.value || 0);
  return Math.max(0.35, 1 + value * 0.35);
}

function renderLocks() {
  const rules = {
    wordPracticePanel: state.completed.words && state.selectedFeatures.practice,
    scenarioPanel: state.completed.words && state.selectedFeatures.chat && isPreviousSelectedFeatureDone("chat"),
    storyPanel: state.completed.words && state.selectedFeatures.story && isPreviousSelectedFeatureDone("story"),
    summaryPanel: state.completed.words && selectedFeaturesComplete(),
  };
  Object.entries(rules).forEach(([panelId, unlocked]) => {
    const tab = document.querySelector(`[data-tab="${panelId}"]`);
    tab.disabled = !unlocked;
    tab.classList.toggle("locked", !unlocked);
  });
}

function selectedFeatureOrder() {
  return [
    state.selectedFeatures.practice ? "wordPracticePanel" : null,
    state.selectedFeatures.chat ? "scenarioPanel" : null,
    state.selectedFeatures.story ? "storyPanel" : null,
  ].filter(Boolean);
}

function isPreviousSelectedFeatureDone(feature) {
  if (feature === "chat") return !state.selectedFeatures.practice || state.completed.practice;
  if (feature === "story") {
    return (!state.selectedFeatures.practice || state.completed.practice) && (!state.selectedFeatures.chat || state.completed.chat);
  }
  return true;
}

function selectedFeaturesComplete() {
  return (!state.selectedFeatures.practice || state.completed.practice)
    && (!state.selectedFeatures.chat || state.completed.chat)
    && (!state.selectedFeatures.story || state.completed.story);
}

function nextSelectedPanel(afterFeature = null) {
  const order = selectedFeatureOrder();
  if (!order.length) return "summaryPanel";
  if (!afterFeature) return order[0];
  const currentPanel = {
    practice: "wordPracticePanel",
    chat: "scenarioPanel",
    story: "storyPanel",
  }[afterFeature];
  const index = order.indexOf(currentPanel);
  return order[index + 1] || "summaryPanel";
}

function syncFeatureChoice() {
  state.selectedFeatures = {
    practice: $("featurePractice").checked,
    chat: $("featureChat").checked,
    story: $("featureStory").checked,
  };
  localStorage.setItem("leran_selected_features", JSON.stringify(state.selectedFeatures));
}

function switchToPanel(panelId) {
  const tab = document.querySelector(`[data-tab="${panelId}"]`);
  if (!tab || tab.disabled) return;
  document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  $(panelId).classList.add("active");
  renderSummary();
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3600);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.apiKey) headers.set("X-API-Key", state.apiKey);
  if (options.json) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(options.json);
  }
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("audio/")) {
    if (!response.ok) throw new Error(`语音生成失败：${response.status}`);
    return response.blob();
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.detail || `请求失败：${response.status}`);
  return data;
}

function saveSelectedIds() {
  localStorage.setItem("leran_selected_word_ids", JSON.stringify([...state.selectedWordIds]));
}

function saveProfile(user, apiKey) {
  state.user = user;
  state.apiKey = apiKey;
  localStorage.setItem("leran_user", JSON.stringify(user));
  localStorage.setItem("leran_api_key", apiKey);
  renderProfile();
}

function saveChildren(children) {
  state.children = children || [];
  if (!state.activeChildId && state.children.length) state.activeChildId = state.children[0].id;
  localStorage.setItem("leran_children", JSON.stringify(state.children));
  localStorage.setItem("leran_active_child_id", String(state.activeChildId || ""));
}

function renderChildren() {
  const select = $("childSelect");
  select.innerHTML = state.children.map((child) => `<option value="${child.id}">${child.name}</option>`).join("");
  if (state.activeChildId) select.value = String(state.activeChildId);
  const child = state.children.find((item) => item.id === state.activeChildId);
  $("childPoints").textContent = `积分 ${child?.points || 0}`;
  const pointsTotal = $("pointsViewTotal");
  if (pointsTotal) pointsTotal.textContent = `积分 ${child?.points || 0}`;
}

function renderProfile() {
  const hasProfile = Boolean(state.apiKey && state.user);
  $("loginView").classList.toggle("hidden", hasProfile);
  $("appView").classList.toggle("hidden", !hasProfile);
  $("profileName").textContent = hasProfile ? state.user.username : "未进入";
  if (hasProfile) {
    renderChildren();
    loadWords();
    loadRewards();
    showHomeChoice();
  }
  renderLocks();
}

function showHomeChoice() {
  $("homeChoiceView").classList.remove("hidden");
  $("studyView").classList.add("hidden");
  $("pointsView").classList.add("hidden");
  $("wordbookView").classList.add("hidden");
  renderChildren();
}

function showStudyView() {
  $("homeChoiceView").classList.add("hidden");
  $("pointsView").classList.add("hidden");
  $("wordbookView").classList.add("hidden");
  $("studyView").classList.remove("hidden");
  loadWords();
}

function showPointsView() {
  $("homeChoiceView").classList.add("hidden");
  $("studyView").classList.add("hidden");
  $("wordbookView").classList.add("hidden");
  $("pointsView").classList.remove("hidden");
  renderChildren();
  loadRewards();
}

function showWordbookView() {
  $("homeChoiceView").classList.add("hidden");
  $("studyView").classList.add("hidden");
  $("pointsView").classList.add("hidden");
  $("wordbookView").classList.remove("hidden");
  loadWords();
  loadWordbook();
}

function selectedIds() {
  return [...state.selectedWordIds].filter((id) => state.words.some((word) => word.id === id));
}

function selectedWords() {
  return state.words.filter((word) => state.selectedWordIds.has(word.id));
}

async function speakText(text) {
  if (!text) return;
  try {
    const blob = await api("/api/audio/speech", { method: "POST", json: { text } });
    const audio = new Audio(URL.createObjectURL(blob));
    audio.playbackRate = speechRate();
    await audio.play();
  } catch {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = speechRate();
      window.speechSynthesis.speak(utterance);
    }
  }
}

async function loadWords() {
  try {
    state.words = await api(`/api/words?tag=${encodeURIComponent(wordbookTag())}`);
    state.words.forEach((word) => state.selectedWordIds.add(word.id));
    state.completed.words = state.words.length > 0;
    saveSelectedIds();
    renderWords();
    renderCoreWordChips();
    renderPracticeCard();
    renderSummary();
    renderLocks();
  } catch (error) {
    showToast(error.message);
  }
}

function parseWords(text) {
  const rawWords = [...new Set(text.split(/[\s,，;；、]+/).map((word) => word.trim()).filter(Boolean))];
  const invalid = rawWords.find((word) => !/^[A-Za-z][A-Za-z'-]*$/.test(word));
  if (invalid) throw new Error(`${invalid} 不是有效英文单词，请修改后再导入。`);
  return rawWords
    .map((word) => ({
      word,
      translation: "",
      phonetic: "",
      dynamic_tags: wordbookTag(),
      textbook: $("textbookInput").value.trim() || null,
      grade: $("gradeInput").value.trim() || null,
      unit: $("unitInput").value.trim() || null,
      lesson: $("lessonInput").value.trim() || null,
    }));
}

function renderWords() {
  const list = $("wordList");
  if (!state.words.length) {
    list.innerHTML = '<div class="result-box empty">单词本还没有单词。请先回首页进入单词本导入。</div>';
    renderWordbookManageList();
    return;
  }

  list.innerHTML = state.words.map((word) => {
    const checked = state.selectedWordIds.has(word.id) ? "checked" : "";
    return `
      <div class="word-item">
        <button class="delete-word" data-delete-word-id="${word.id}" type="button" title="删除">×</button>
        <label class="word-title">
          <input type="checkbox" data-word-id="${word.id}" ${checked} />
          ${word.word}
        </label>
        <div class="word-meta">${word.translation || "释义生成中"}</div>
        <div class="word-meta">${word.phonetic || ""}</div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const id = Number(checkbox.dataset.wordId);
      if (checkbox.checked) state.selectedWordIds.add(id);
      else state.selectedWordIds.delete(id);
      saveSelectedIds();
      renderCoreWordChips();
      renderPracticeCard();
      renderSummary();
    });
  });

  list.querySelectorAll("[data-delete-word-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const id = Number(button.dataset.deleteWordId);
        await api(`/api/words/${id}`, { method: "DELETE" });
        state.selectedWordIds.delete(id);
        saveSelectedIds();
        await loadWords();
        showToast("已删除单词");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  renderWordbookManageList();
}

function renderWordbookManageList() {
  const list = $("wordbookManageList");
  if (!list) return;
  if (!state.words.length) {
    list.innerHTML = '<div class="result-box empty">单词本还没有单词。</div>';
    return;
  }
  list.innerHTML = state.words.map((word) => `
    <div class="word-item">
      <button class="delete-word" data-delete-word-id="${word.id}" type="button" title="删除">×</button>
      <div class="word-title">${word.word}</div>
      <div class="word-meta">${word.translation || ""} ${word.phonetic || ""}</div>
      <div class="word-meta">${[word.textbook, word.grade, word.unit, word.lesson].filter(Boolean).join(" / ")}</div>
    </div>
  `).join("");
  list.querySelectorAll("[data-delete-word-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/words/${Number(button.dataset.deleteWordId)}`, { method: "DELETE" });
        await loadWords();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderCoreWordChips() {
  const chips = $("coreWordChips");
  if (!chips) return;
  chips.innerHTML = selectedWords().map((word) => `<span class="chip">${word.word}</span>`).join("");
}

function currentPracticeWord() {
  const words = selectedWords();
  if (!words.length) return null;
  return words[state.practiceIndex % words.length];
}

function renderPracticeCard() {
  const word = currentPracticeWord();
  $("practiceAnswer").value = "";
  $("practiceResult").textContent = "";
  $("practiceChinese").textContent = word ? (word.translation || word.word) : "先在第 1 页输入并选择单词";
}

async function checkPracticeAnswer() {
  const word = currentPracticeWord();
  if (!word) return showToast("请先输入单词。");
  const answer = normalizeEnglish($("practiceAnswer").value);
  if (answer === normalizeEnglish(word.word)) {
    state.practiceCorrect += 1;
    state.wordInputDone[word.id] = true;
    state.wordScores[word.id] = Math.max(state.wordScores[word.id] || 0, 0.5);
    $("practiceResult").textContent = "正确";
    updateWordbookScore(word, 0.5, state.wordSpeechDone[word.id] ? 0.5 : 0);
    speakText(word.word);
  } else {
    $("practiceResult").textContent = `再试一次：${word.word}`;
    speakText(word.word);
  }
  updatePracticeCompletion();
  renderSummary();
}

function normalizeEnglish(text) {
  return (text || "").toLowerCase().replace(/[^a-z']/g, "");
}

function nextPracticeWord() {
  const words = selectedWords();
  if (!words.length) return;
  const word = currentPracticeWord();
  if (word && (!state.wordInputDone[word.id] || !state.wordSpeechDone[word.id])) {
    const inputState = state.wordInputDone[word.id] ? "输入已完成" : "还需要输入正确";
    const speechState = state.wordSpeechDone[word.id] ? "录音已完成" : "还需要录音背诵";
    showToast(`${word.word}: ${inputState}，${speechState}。`);
    return;
  }
  state.practiceIndex = (state.practiceIndex + 1) % words.length;
  renderPracticeCard();
}

function updatePracticeCompletion() {
  const words = selectedWords();
  state.completed.practice = words.length > 0 && words.every((word) => state.wordInputDone[word.id] && state.wordSpeechDone[word.id]);
  state.scores.words = words.length
    ? Math.round(words.reduce((sum, word) => {
      const score = (state.wordInputDone[word.id] ? 0.5 : 0) + (state.wordSpeechDone[word.id] ? 0.5 : 0);
      state.wordScores[word.id] = score;
      return sum + score;
    }, 0) / words.length * 100)
    : 0;
  renderLocks();
}

function discreteScore(value, maxValue) {
  if (maxValue <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, value / maxValue));
  if (ratio >= 0.9) return 2;
  if (ratio >= 0.7) return 1.5;
  if (ratio >= 0.45) return 1;
  if (ratio >= 0.2) return 0.5;
  return 0;
}

async function updateWordbookScore(word, spellingScore = 0, pronunciationScore = 0) {
  if (!state.activeChildId || !word) return;
  await api("/api/wordbook/score", {
    method: "POST",
    json: {
      child_id: state.activeChildId,
      word_id: word.id,
      spelling_score: spellingScore,
      pronunciation_score: pronunciationScore,
    },
  });
}

function renderScenario(data) {
  $("scenarioBox").classList.remove("empty");
  $("scenarioBox").innerHTML = `
    <p class="scenario-line"><strong>场景：</strong>${data.scenario_description}</p>
    <p class="scenario-line"><strong>角色：</strong>${data.ai_role} 和 ${data.child_role}</p>
  `;
  $("chatLog").innerHTML = "";
  appendBubble("ai", data.first_question);
  $("recordChatBtn").disabled = false;
  $("repeatAiBtn").disabled = false;
  state.lastAiText = data.first_question;
  state.chatTurns = 0;
  speakText(data.first_question);
}

function appendBubble(type, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${type}`;
  bubble.textContent = text;
  $("chatLog").appendChild(bubble);
}

function storyPartsFromText(text) {
  return text.match(/[A-Za-z']+|[^A-Za-z']+/g) || [];
}

function renderStoryText() {
  const box = $("storyBox");
  box.classList.remove("empty");
  box.classList.toggle("masked", state.storyMasked);
  box.classList.toggle("sentence-mask", state.storyMaskMode === "sentence");
  box.innerHTML = state.storyWords.map((part, index) => {
    if (/^[A-Za-z']+$/.test(part)) {
      const selectedClass = state.storyMaskMode === "sentence" && isPartInSelectedSentence(index) ? " in-selected-sentence" : "";
      return `<span class="story-word${selectedClass}" data-word-index="${index}">${part}</span>`;
    }
    return part;
  }).join("");
}

function selectedSentencePartRange() {
  let start = 0;
  for (let i = 0; i < state.selectedSentenceIndex; i += 1) {
    start += storyPartsFromText(state.storySentences[i] || "").length;
  }
  const end = start + storyPartsFromText(state.storySentences[state.selectedSentenceIndex] || "").length;
  return { start, end };
}

function isPartInSelectedSentence(partIndex) {
  const range = selectedSentencePartRange();
  return partIndex >= range.start && partIndex < range.end;
}

async function loadStoryAudio(text) {
  const audio = $("storyAudio");
  audio.removeAttribute("src");
  try {
    const blob = await api("/api/audio/speech", { method: "POST", json: { text } });
    audio.src = URL.createObjectURL(blob);
  } catch {
    showToast("云端音频生成失败，仍可使用浏览器朗读。");
  }
}

function renderStory(data) {
  state.storySessionId = data.session_id;
  state.storyText = data.standard_text;
  state.storyWords = storyPartsFromText(data.standard_text);
  state.storySentences = data.standard_text.match(/[^.!?]+[.!?]+/g)?.map((item) => item.trim()) || [data.standard_text];
  state.storyMasked = false;
  state.storyMaskMode = "none";
  state.storyVerifiedIndex = 0;
  $("storyControls").classList.remove("hidden");
  $("recordStoryBtn").disabled = false;
  $("verifyBox").innerHTML = "";
  $("liveTranscript").classList.add("hidden");
  renderStoryText();
  renderSentencePicker();
  loadStoryAudio(data.standard_text);
  renderSummary();
}

function activeStoryText() {
  if ($("reciteMode").value === "sentence") return state.storySentences[state.selectedSentenceIndex] || state.storyText;
  return state.storyText;
}

function renderSentencePicker() {
  const picker = $("sentencePicker");
  if ($("reciteMode").value !== "sentence" || !state.storySentences.length) {
    picker.classList.add("hidden");
    picker.innerHTML = "";
    return;
  }
  picker.classList.remove("hidden");
  picker.innerHTML = state.storySentences.map((sentence, index) => (
    `<button class="sentence-choice ${index === state.selectedSentenceIndex ? "active" : ""}" data-sentence-index="${index}" type="button">${index + 1}. ${sentence}</button>`
  )).join("");
  picker.querySelectorAll("[data-sentence-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSentenceIndex = Number(button.dataset.sentenceIndex);
      renderSentencePicker();
    });
  });
}

function highlightStoryAudio() {
  const audio = $("storyAudio");
  const wordNodes = [...document.querySelectorAll(".story-word")];
  if (!wordNodes.length || !audio.duration) return;
  const active = Math.min(wordNodes.length - 1, Math.floor((audio.currentTime / audio.duration) * wordNodes.length));
  wordNodes.forEach((node, index) => node.classList.toggle("playing", index === active));
}

function renderVerify(wordsStatus) {
  $("verifyBox").innerHTML = wordsStatus.map((item) => {
    const ok = item.error_type === "None";
    return `<span class="status-word ${ok ? "ok" : ""}">${item.word}</span>`;
  }).join("");
}

function compareTranscriptToText(transcript, referenceText) {
  const ref = referenceText.match(/[A-Za-z']+/g) || [];
  const said = (transcript.match(/[A-Za-z']+/g) || []).map((word) => word.toLowerCase());
  let verified = 0;
  const wordsStatus = ref.map((word, index) => {
    const ok = said[index] === word.toLowerCase();
    if (ok && verified === index) verified = index + 1;
    return { word, error_type: ok ? "None" : "Omission" };
  });
  return { verified_index: verified, words_status: wordsStatus, raw_assessment: { transcript } };
}

function nextHint() {
  const spokenCount = state.liveStoryText.match(/[A-Za-z']+/g)?.length || 0;
  const words = activeStoryText().match(/[A-Za-z']+/g) || [];
  const nextWord = words[Math.min(spokenCount, words.length - 1)] || "";
  $("storyRecordState").textContent = nextWord ? `提示：${nextWord}` : "已经到最后了";
  speakText(nextWord);
}

function startLiveRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognizer = new SpeechRecognition();
  recognizer.lang = "en-US";
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.onresult = (event) => {
    let text = "";
    for (let index = 0; index < event.results.length; index += 1) text += event.results[index][0].transcript;
    state.liveStoryText = text.trim();
    $("liveTranscript").classList.remove("hidden");
    $("liveTranscript").textContent = state.liveStoryText || "正在听";
    if (/提示|hint/i.test(state.liveStoryText)) nextHint();
  };
  recognizer.start();
  return recognizer;
}

async function recordOnce(button, label, withLiveRecognition = false) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持录音，请换 Chrome 或 Edge。");
  if (state.recorders[button.id]) {
    state.recorders[button.id].stop();
    state.recognizers[button.id]?.stop();
    return null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks = [];
  const recorder = new MediaRecorder(stream);
  state.recorders[button.id] = recorder;
  if (withLiveRecognition) state.recognizers[button.id] = startLiveRecognition();
  button.textContent = "停止录音";
  label.textContent = "正在听你说";

  return await new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      state.recognizers[button.id]?.stop();
      delete state.recorders[button.id];
      delete state.recognizers[button.id];
      button.textContent = button.dataset.defaultText;
      label.textContent = "正在上传";
      resolve(new Blob(chunks, { type: "audio/webm" }));
    };
    recorder.start();
  });
}

function renderSummary() {
  const selected = selectedWords().length;
  $("summaryBox").innerHTML = `
    <div class="summary-card">今日单词<span class="summary-number">${state.words.length}</span></div>
    ${state.selectedFeatures.practice ? `<div class="summary-card">单词分数<span class="summary-number">${state.scores.words}</span></div>` : ""}
    ${state.selectedFeatures.chat ? `<div class="summary-card">对话分数<span class="summary-number">${state.scores.chat}</span></div>` : ""}
    ${state.selectedFeatures.story ? `<div class="summary-card">背诵分数<span class="summary-number">${state.scores.story}</span></div>` : ""}
  `;
  loadWordbook();
}

async function loadWordbook() {
  if (!state.activeChildId || !$("wordbookList")) return;
  try {
    const items = await api(`/api/wordbook/${state.activeChildId}`);
    $("wordbookList").innerHTML = items.length ? items.map((item) => `
      <div class="wordbook-item">
        <strong>${item.word}</strong>
        <span>${item.translation || ""}</span>
        <span>${item.total_score}/1</span>
        <span>${[item.textbook, item.grade, item.unit, item.lesson].filter(Boolean).join(" / ")}</span>
      </div>
    `).join("") : '<div class="result-box empty">还没有单词学习记录。</div>';
  } catch (error) {
    $("wordbookList").innerHTML = `<div class="result-box empty">${error.message}</div>`;
  }
}

async function refreshChildren() {
  const children = await api("/api/children");
  saveChildren(children);
  renderChildren();
}

async function awardPointsOnce(taskType, points, description) {
  if (!state.activeChildId) return;
  const key = `${state.activeChildId}:${taskType}`;
  if (state.awardedTasks.has(key)) return;
  await api("/api/points/award", {
    method: "POST",
    json: { child_id: state.activeChildId, task_type: taskType, points, description },
  });
  state.awardedTasks.add(key);
  localStorage.setItem("leran_awarded_tasks", JSON.stringify([...state.awardedTasks]));
  await refreshChildren();
}

async function loadRewards() {
  if (!state.apiKey) return;
  state.rewards = await api("/api/rewards");
  renderRewards();
}

function renderRewards() {
  const list = $("rewardList");
  if (!list) return;
  const child = state.children.find((item) => item.id === state.activeChildId);
  if (!state.rewards.length) {
    list.innerHTML = '<div class="result-box empty">还没有奖品，家长可以先添加。</div>';
    return;
  }
  list.innerHTML = state.rewards.map((reward) => {
    const enough = (child?.points || 0) >= reward.points_required;
    const image = reward.image_url
      ? `<img class="reward-image" src="${reward.image_url}" alt="${reward.name}" />`
      : `<div class="reward-image reward-placeholder">奖品</div>`;
    return `
      <div class="reward-item">
        ${image}
        <div class="reward-meta">
          <strong>${reward.name}</strong>
          <p>${reward.description || "暂无描述"}</p>
        </div>
        <span>${reward.points_required} 分</span>
        <button data-reward-id="${reward.id}" ${enough ? "" : "disabled"} type="button">兑换</button>
      </div>
    `;
  }).join("");
  list.querySelectorAll("[data-reward-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const child = await api("/api/rewards/redeem", {
          method: "POST",
          json: { child_id: state.activeChildId, reward_id: Number(button.dataset.rewardId) },
        });
        state.children = state.children.map((item) => item.id === child.id ? child : item);
        saveChildren(state.children);
        renderChildren();
        renderRewards();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.disabled) return;
      switchToPanel(tab.dataset.tab);
    });
  });
}

function setupEvents() {
  $("showRegisterBtn").addEventListener("click", () => {
    $("loginBox").classList.add("hidden");
    $("registerBox").classList.remove("hidden");
  });

  $("showLoginBtn").addEventListener("click", () => {
    $("registerBox").classList.add("hidden");
    $("loginBox").classList.remove("hidden");
  });

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        json: {
          username: $("loginUsernameInput").value.trim(),
          password: $("loginPasswordInput").value,
        },
      });
      saveChildren(data.children);
      saveProfile(data.user, data.api_key);
    } catch (error) {
      showToast(error.message);
    }
  });

  $("addChildBtn").addEventListener("click", () => {
    const box = document.createElement("div");
    box.className = "child-extra";
    box.innerHTML = `
      <label>孩子姓名<input class="extraChildName" /></label>
      <label>出生年月日<input class="extraChildBirth" type="date" /></label>
    `;
    $("extraChildren").appendChild(box);
  });

  $("registerBtn").addEventListener("click", async () => {
    try {
      const children = [{ name: $("childNameInput").value.trim(), birth_date: $("childBirthInput").value }];
      document.querySelectorAll(".child-extra").forEach((row) => {
        const name = row.querySelector(".extraChildName").value.trim();
        const birth = row.querySelector(".extraChildBirth").value;
        if (name && birth) children.push({ name, birth_date: birth });
      });
      const data = await api("/api/auth/register", {
        method: "POST",
        json: {
          username: $("registerUsernameInput").value.trim(),
          password: $("registerPasswordInput").value,
          email: $("emailInput").value.trim(),
          children,
          phone: $("phoneInput").value.trim() || null,
          city: $("cityInput").value.trim() || null,
          school: $("schoolInput").value.trim() || null,
        },
      });
      saveChildren(data.children);
      saveProfile(data.user, data.api_key);
    } catch (error) {
      showToast(error.message);
    }
  });

  $("resetProfileBtn").addEventListener("click", () => {
    localStorage.removeItem("leran_user");
    localStorage.removeItem("leran_api_key");
    localStorage.removeItem("leran_children");
    localStorage.removeItem("leran_active_child_id");
    localStorage.removeItem("leran_awarded_tasks");
    localStorage.removeItem("leran_selected_word_ids");
    state.user = null;
    state.apiKey = "";
    state.words = [];
    state.children = [];
    state.activeChildId = 0;
    state.awardedTasks.clear();
    state.selectedWordIds.clear();
    renderProfile();
  });

  $("loadWordsBtn").addEventListener("click", loadWords);
  $("refreshSummaryBtn").addEventListener("click", renderSummary);
  $("childSelect").addEventListener("change", () => {
    state.activeChildId = Number($("childSelect").value);
    localStorage.setItem("leran_active_child_id", String(state.activeChildId));
    loadWords();
    renderChildren();
    renderRewards();
  });

  $("enterWordbookBtn").addEventListener("click", showWordbookView);
  $("enterStudyBtn").addEventListener("click", showStudyView);
  $("enterPointsBtn").addEventListener("click", showPointsView);
  $("backHomeFromWordbookBtn").addEventListener("click", showHomeChoice);
  $("backHomeFromStudyBtn").addEventListener("click", showHomeChoice);
  $("backHomeFromPointsBtn").addEventListener("click", showHomeChoice);

  $("addRewardBtn").addEventListener("click", async () => {
    try {
      await api("/api/rewards", {
        method: "POST",
        json: {
          name: $("rewardNameInput").value.trim(),
          points_required: Number($("rewardPointsInput").value),
          description: $("rewardDescInput").value.trim() || null,
          image_url: $("rewardImageInput").value.trim() || null,
        },
      });
      $("rewardNameInput").value = "";
      $("rewardPointsInput").value = "";
      $("rewardDescInput").value = "";
      $("rewardImageInput").value = "";
      await loadRewards();
    } catch (error) {
      showToast(error.message);
    }
  });

  $("refreshWordbookBtn").addEventListener("click", () => {
    loadWords();
    loadWordbook();
  });

  $("excelImportInput").addEventListener("change", async () => {
    try {
      const file = $("excelImportInput").files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append("file", file);
      const imported = await api("/api/words/excel", { method: "POST", body: form });
      imported.forEach((word) => state.selectedWordIds.add(word.id));
      saveSelectedIds();
      await loadWords();
      $("excelImportInput").value = "";
      showToast("Excel 单词已导入");
    } catch (error) {
      showToast(error.message);
    }
  });
  $("roundLimitInput").value = state.roundLimit;
  $("featurePractice").checked = state.selectedFeatures.practice;
  $("featureChat").checked = state.selectedFeatures.chat;
  $("featureStory").checked = state.selectedFeatures.story;
  ["featurePractice", "featureChat", "featureStory"].forEach((id) => {
    $(id).addEventListener("change", syncFeatureChoice);
  });
  $("roundLimitInput").addEventListener("input", () => {
    const value = Math.max(1, Math.min(10, Number($("roundLimitInput").value || 5)));
    state.roundLimit = value;
    $("roundLimitInput").value = value;
    localStorage.setItem("leran_round_limit", String(value));
  });

  $("importWordsBtn").addEventListener("click", async () => {
    try {
      const words = parseWords($("wordImportInput").value);
      if (!words.length) throw new Error("请至少输入一个英文单词。");
      $("importWordsBtn").disabled = true;
      $("importWordsBtn").textContent = "导入中";
      const imported = await api("/api/words/bulk", { method: "POST", json: { words } });
      imported.forEach((word) => state.selectedWordIds.add(word.id));
      saveSelectedIds();
      $("wordImportInput").value = "";
      await loadWords();
      showToast("单词已导入单词本");
    } catch (error) {
      showToast(error.message);
    } finally {
      $("importWordsBtn").disabled = false;
      $("importWordsBtn").textContent = "导入单词";
    }
  });

  $("unlockStudyBtn").addEventListener("click", () => {
    syncFeatureChoice();
    if (!selectedIds().length) return showToast("请先从单词本选择今天要学习的单词。");
    if (!state.selectedFeatures.practice && !state.selectedFeatures.chat && !state.selectedFeatures.story) {
      return showToast("请至少选择一个要练习的功能。");
    }
    state.completed.words = true;
    renderLocks();
    switchToPanel(nextSelectedPanel());
  });

  $("startWordPracticeBtn").addEventListener("click", () => {
    state.practiceIndex = 0;
    renderPracticeCard();
  });
  $("checkPracticeBtn").addEventListener("click", checkPracticeAnswer);
  $("practiceAnswer").addEventListener("keydown", (event) => {
    if (event.key === "Enter") checkPracticeAnswer();
  });
  $("hearPracticeBtn").addEventListener("click", () => {
    const word = currentPracticeWord();
    if (word) speakText(word.word);
  });
  $("nextPracticeBtn").addEventListener("click", nextPracticeWord);

  $("recordWordBtn").dataset.defaultText = $("recordWordBtn").textContent;
  $("recordWordBtn").addEventListener("click", async () => {
    try {
      const word = currentPracticeWord();
      if (!word) return showToast("请先输入单词。");
      const blob = await recordOnce($("recordWordBtn"), $("practiceResult"));
      if (!blob) return;
      state.wordSpeechDone[word.id] = true;
      await updateWordbookScore(word, state.wordInputDone[word.id] ? 0.5 : 0, 0.5);
      updatePracticeCompletion();
      renderSummary();
      const form = new FormData();
      form.append("audio", blob, "word.webm");
      const data = await api("/api/audio/transcribe", { method: "POST", body: form });
      const transcript = data.transcript.trim();
      const saidWords = transcript.split(/\s+/).map(normalizeEnglish).filter(Boolean);
      const ok = saidWords.includes(normalizeEnglish(word.word));
      $("practiceResult").textContent = ok
        ? `录音正确：${transcript}`
        : `录音已完成，听到：${transcript || "没有识别到清楚内容"}`;
      updatePracticeCompletion();
      renderSummary();
      if (state.completed.practice) {
        await awardPointsOnce("word_practice", 10, "完成单词背诵");
        renderLocks();
        switchToPanel(nextSelectedPanel("practice"));
      }
    } catch (error) {
      showToast(error.message);
    }
  });

  $("generateScenarioBtn").addEventListener("click", async () => {
    try {
      const wordIds = selectedIds();
      if (!wordIds.length) throw new Error("请先在第 1 页输入并选择单词。");
      $("scenarioBox").textContent = "正在生成更自然的开放式对话";
      const data = await api("/api/scenario/generate", { method: "POST", json: { word_ids: wordIds } });
      state.scenario = data;
      state.chatHistory = [{ role: "assistant", content: data.first_question }];
      state.chatTurns = 0;
      renderScenario(data);
    } catch (error) {
      showToast(error.message);
    }
  });

  $("repeatAiBtn").addEventListener("click", () => speakText(state.lastAiText));

  $("recordChatBtn").dataset.defaultText = $("recordChatBtn").textContent;
  $("recordChatBtn").addEventListener("click", async () => {
    try {
      const blob = await recordOnce($("recordChatBtn"), $("chatRecordState"));
      if (!blob) return;
      const isFinalTurn = state.chatTurns + 1 >= state.roundLimit;
      const form = new FormData();
      form.append("audio", blob, "chat.webm");

      let data;
      if (isFinalTurn) {
        data = await api("/api/audio/transcribe", { method: "POST", body: form });
        data = { transcript: data.transcript, ai_reply: "" };
      } else {
        form.append("history_json", JSON.stringify(state.chatHistory));
        form.append("ai_role", state.scenario?.ai_role || "");
        form.append("child_role", state.scenario?.child_role || "");
        form.append("core_words_json", JSON.stringify(selectedWords().map((word) => word.word)));
        data = await api("/api/scenario/chat", { method: "POST", body: form });
      }

      appendBubble("child", data.transcript);
      state.chatTurns += 1;
      const targetWords = selectedWords().map((word) => normalizeEnglish(word.word));
      const saidWords = data.transcript.split(/\s+/).map(normalizeEnglish);
      const usedCoreWords = targetWords.filter((word) => saidWords.includes(word)).length;
      const turnScore = discreteScore(usedCoreWords + (data.transcript.length > 8 ? 1 : 0), Math.max(2, targetWords.length));
      state.chatScoreTotal += turnScore;
      state.scores.chat = Math.round((state.chatScoreTotal / (state.roundLimit * 2)) * 100);
      if (state.chatTurns >= state.roundLimit) {
        state.completed.chat = true;
        await awardPointsOnce("scenario_chat", 15, "完成场景对话");
        $("recordChatBtn").disabled = true;
        $("repeatAiBtn").disabled = true;
        $("chatRecordState").textContent = "对话完成";
        renderLocks();
        switchToPanel(nextSelectedPanel("chat"));
      } else {
        appendBubble("ai", data.ai_reply);
        state.lastAiText = data.ai_reply;
        state.chatHistory.push({ role: "user", content: data.transcript }, { role: "assistant", content: data.ai_reply });
        $("chatRecordState").textContent = `第 ${state.chatTurns}/${state.roundLimit} 轮`;
        speakText(data.ai_reply);
      }
      renderLocks();
      renderSummary();
    } catch (error) {
      $("chatRecordState").textContent = "";
      showToast(error.message);
    }
  });

  $("generateStoryBtn").addEventListener("click", async () => {
    try {
      const wordIds = selectedIds();
      if (!wordIds.length) throw new Error("请先在第 1 页输入并选择单词。");
      $("storyBox").textContent = "正在生成短文和音频";
      const data = await api("/api/story/generate", {
        method: "POST",
        json: { user_id: state.user.id, word_ids: wordIds },
      });
      renderStory(data);
    } catch (error) {
      showToast(error.message);
    }
  });

  $("storyAudio").addEventListener("timeupdate", highlightStoryAudio);
  $("storyAudio").addEventListener("ended", () => document.querySelectorAll(".story-word").forEach((node) => node.classList.remove("playing")));
  $("hintBtn").addEventListener("click", nextHint);
  $("reciteMode").addEventListener("change", renderSentencePicker);

  document.querySelectorAll(".speechSpeed").forEach((slider) => {
    const label = slider.parentElement.querySelector(".speedText");
    slider.addEventListener("input", () => {
      const value = Number(slider.value);
      label.textContent = value === 0 ? "正常" : `${value > 0 ? "+" : ""}${value}`;
      $("storyAudio").playbackRate = speechRate();
    });
  });

  $("recordStoryBtn").dataset.defaultText = $("recordStoryBtn").textContent;
  $("recordStoryBtn").addEventListener("click", async () => {
    try {
      if (!state.recorders.recordStoryBtn) {
        if ($("reciteMode").value === "sentence") {
          state.storyWords = storyPartsFromText(state.storyText);
          state.storyMasked = false;
          state.storyMaskMode = "sentence";
        } else {
          state.storyWords = storyPartsFromText(state.storyText);
          state.storyMasked = true;
          state.storyMaskMode = "full";
        }
        renderStoryText();
      }
      const blob = await recordOnce($("recordStoryBtn"), $("storyRecordState"), true);
      if (!blob) return;
      state.storyMasked = false;
      state.storyMaskMode = "none";
      state.storyWords = storyPartsFromText(state.storyText);
      renderStoryText();
      const form = new FormData();
      form.append("audio", blob, "story.webm");
      let data;
      if ($("reciteMode").value === "sentence") {
        const transcribed = await api("/api/audio/transcribe", { method: "POST", body: form });
        data = compareTranscriptToText(transcribed.transcript, activeStoryText());
      } else {
        data = await api(`/api/story/verify?session_id=${state.storySessionId}`, { method: "POST", body: form });
      }
      state.storyVerifiedIndex = data.verified_index;
      const total = (activeStoryText().match(/[A-Za-z']+/g) || []).length || 1;
      const sentenceScore = discreteScore(data.verified_index, total);
      state.storyScoreTotal += sentenceScore;
      const denominator = $("reciteMode").value === "sentence" ? Math.max(1, state.storySentences.length * 2) : 2;
      state.scores.story = Math.min(100, Math.round((state.storyScoreTotal / denominator) * 100));
      state.completed.story = state.scores.story >= 60;
      if (state.completed.story) await awardPointsOnce("story_recitation", 20, "完成短文背诵");
      renderVerify(data.words_status);
      const transcript = data.raw_assessment?.transcript;
      if (transcript) {
        $("liveTranscript").classList.remove("hidden");
        $("liveTranscript").textContent = transcript;
      }
      $("storyRecordState").textContent = `读到第 ${data.verified_index} 个词`;
      renderSummary();
      renderLocks();
      if (state.completed.story) switchToPanel(nextSelectedPanel("story"));
    } catch (error) {
      state.storyMasked = false;
      renderStoryText();
      $("storyRecordState").textContent = "";
      showToast(error.message);
    }
  });
}

setupTabs();
setupEvents();
renderProfile();
