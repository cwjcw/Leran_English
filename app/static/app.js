const state = {
  apiKey: localStorage.getItem("leran_api_key") || "",
  user: JSON.parse(localStorage.getItem("leran_user") || "null"),
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
  completed: { words: false, practice: false, chat: false, story: false },
  selectedFeatures: JSON.parse(localStorage.getItem("leran_selected_features") || '{"practice":true,"chat":true,"story":true}'),
  recorders: {},
  recognizers: {},
  liveStoryText: "",
};

const $ = (id) => document.getElementById(id);

function todayTag() {
  return state.user ? `today-${state.user.id}` : "today";
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

function renderProfile() {
  const hasProfile = Boolean(state.apiKey && state.user);
  $("loginView").classList.toggle("hidden", hasProfile);
  $("appView").classList.toggle("hidden", !hasProfile);
  $("profileName").textContent = hasProfile ? state.user.username : "未进入";
  if (hasProfile) loadWords();
  renderLocks();
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
    state.words = await api(`/api/words?tag=${encodeURIComponent(todayTag())}`);
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
    .map((word) => ({ word, translation: "", phonetic: "", dynamic_tags: todayTag() }));
}

function renderWords() {
  const list = $("wordList");
  if (!state.words.length) {
    list.innerHTML = '<div class="result-box empty">第 1 页是今天的单词本。请输入英文单词后导入。</div>';
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

function checkPracticeAnswer() {
  const word = currentPracticeWord();
  if (!word) return showToast("请先输入单词。");
  const answer = normalizeEnglish($("practiceAnswer").value);
  if (answer === normalizeEnglish(word.word)) {
    state.practiceCorrect += 1;
    state.wordInputDone[word.id] = true;
    state.wordScores[word.id] = Math.max(state.wordScores[word.id] || 0, 50);
    $("practiceResult").textContent = "正确";
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
      const score = (state.wordInputDone[word.id] ? 50 : 0) + (state.wordSpeechDone[word.id] ? 50 : 0);
      state.wordScores[word.id] = score;
      return sum + score;
    }, 0) / words.length)
    : 0;
  renderLocks();
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
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const username = $("usernameInput").value.trim();
      const data = await api("/api/users", { method: "POST", json: { username } });
      saveProfile({ id: data.id, username: data.username, total_stars: data.total_stars }, data.api_key);
    } catch (error) {
      showToast(error.message);
    }
  });

  $("useKeyBtn").addEventListener("click", async () => {
    try {
      state.apiKey = $("apiKeyInput").value.trim();
      const user = await api("/api/users/me");
      saveProfile(user, state.apiKey);
    } catch (error) {
      showToast(error.message);
    }
  });

  $("resetProfileBtn").addEventListener("click", () => {
    localStorage.removeItem("leran_user");
    localStorage.removeItem("leran_api_key");
    localStorage.removeItem("leran_selected_word_ids");
    state.user = null;
    state.apiKey = "";
    state.words = [];
    state.selectedWordIds.clear();
    renderProfile();
  });

  $("loadWordsBtn").addEventListener("click", loadWords);
  $("refreshSummaryBtn").addEventListener("click", renderSummary);
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
      syncFeatureChoice();
      if (!state.selectedFeatures.practice && !state.selectedFeatures.chat && !state.selectedFeatures.story) {
        throw new Error("请至少选择一个要练习的功能。");
      }
      $("importWordsBtn").disabled = true;
      $("importWordsBtn").textContent = "导入中";
      const imported = await api("/api/words/bulk", { method: "POST", json: { words } });
      imported.forEach((word) => state.selectedWordIds.add(word.id));
      saveSelectedIds();
      $("wordImportInput").value = "";
      await loadWords();
      state.completed.words = true;
      renderLocks();
      switchToPanel(nextSelectedPanel());
      showToast("单词已导入");
    } catch (error) {
      showToast(error.message);
    } finally {
      $("importWordsBtn").disabled = false;
      $("importWordsBtn").textContent = "导入单词";
    }
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
      state.scores.chat = Math.min(100, Math.round((state.chatTurns / state.roundLimit) * 100));
      if (state.chatTurns >= state.roundLimit) {
        state.completed.chat = true;
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
      state.scores.story = Math.min(100, Math.round((data.verified_index / total) * 100));
      state.completed.story = state.scores.story >= 60;
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
