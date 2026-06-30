const state = {
  data: null,
  categories: [],
  categoryIndex: 0,
  testIndex: 0,
  questionIndex: 0,
  answers: {},
  reviewed: false,
  query: "",
};

const els = {
  sidebar: document.querySelector(".sidebar"),
  scrim: document.getElementById("sidebarScrim"),
  menuButton: document.getElementById("menuButton"),
  categoryTabs: document.getElementById("categoryTabs"),
  testList: document.getElementById("testList"),
  searchInput: document.getElementById("searchInput"),
  categoryLabel: document.getElementById("categoryLabel"),
  testTitle: document.getElementById("testTitle"),
  reviewButton: document.getElementById("reviewButton"),
  resetButton: document.getElementById("resetButton"),
  progressValue: document.getElementById("progressValue"),
  scoreValue: document.getElementById("scoreValue"),
  missValue: document.getElementById("missValue"),
  progressBar: document.getElementById("progressBar"),
  questionRail: document.getElementById("questionRail"),
  questionCounter: document.getElementById("questionCounter"),
  prevButton: document.getElementById("prevButton"),
  nextButton: document.getElementById("nextButton"),
  questionImage: document.getElementById("questionImage"),
  imageModal: document.getElementById("imageModal"),
  imageModalImg: document.getElementById("imageModalImg"),
  imageModalClose: document.getElementById("imageModalClose"),
  questionText: document.getElementById("questionText"),
  answers: document.getElementById("answers"),
  explanationBox: document.getElementById("explanationBox"),
  explanationText: document.getElementById("explanationText"),
  toast: document.getElementById("toast"),
};

function currentCategory() {
  return state.categories[state.categoryIndex];
}

function currentTest() {
  return currentCategory()?.tests[state.testIndex];
}

function currentQuestion() {
  return currentTest()?.questions[state.questionIndex];
}

function storageKey(test = currentTest()) {
  return test ? `moto-tests:${publicTestId(test)}` : "moto-tests:empty";
}

function publicTestId(test) {
  return test.id || test.test_id;
}

function loadProgress(test) {
  try {
    const raw = localStorage.getItem(storageKey(test));
    return raw ? JSON.parse(raw) : { answers: {}, reviewed: false };
  } catch {
    return { answers: {}, reviewed: false };
  }
}

function saveProgress() {
  localStorage.setItem(storageKey(), JSON.stringify({
    answers: state.answers,
    reviewed: state.reviewed,
  }));
}

function imageSrc(image) {
  if (!image) return "";
  if (/^https?:\/\//i.test(image) || image.startsWith("images/")) return image;
  return `images/${image}`;
}

function categoryShortTitle(category) {
  const title = (category.title || `Tipo ${category.tip}`)
    .replace(/^test\s+/i, "")
    .replace(/\s+DGT$/i, " DGT");
  return title.toLowerCase() === "oficiales dgt" ? "DGT" : title;
}

function testDisplayName(test) {
  return `Test ${publicTestId(test)}`;
}

function testSubtitle(test) {
  return "";
}

function answeredCount(test = currentTest()) {
  if (!test) return 0;
  return test.questions.filter((question) => state.answers[question.question_id]).length;
}

function score() {
  const test = currentTest();
  if (!test || !state.reviewed) return { ok: "-", fail: "-" };
  let ok = 0;
  let fail = 0;
  test.questions.forEach((question) => {
    const answer = state.answers[question.question_id];
    if (!answer) return;
    if (answer === question.correct) ok += 1;
    else fail += 1;
  });
  return { ok, fail };
}

function savedResult(test, saved) {
  if (!saved?.reviewed) return null;
  let ok = 0;
  let fail = 0;
  test.questions.forEach((question) => {
    const answer = saved.answers?.[question.question_id];
    if (!answer) return;
    if (answer === question.correct) ok += 1;
    else fail += 1;
  });
  return { ok, fail };
}

function resultClass(result) {
  if (!result) return "";
  if (result.fail === 0) return " result-perfect";
  if (result.fail <= 2) return " result-pass";
  return " result-fail";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function openSidebar(open) {
  els.sidebar.classList.toggle("open", open);
  els.scrim.hidden = !open;
}

function openImageModal() {
  if (!els.questionImage.src) return;
  els.imageModalImg.src = els.questionImage.src;
  els.imageModalImg.alt = els.questionImage.alt;
  els.imageModal.hidden = false;
}

function closeImageModal() {
  els.imageModal.hidden = true;
  els.imageModalImg.removeAttribute("src");
}

function switchTest(categoryIndex, testIndex) {
  state.categoryIndex = categoryIndex;
  state.testIndex = testIndex;
  state.questionIndex = 0;
  const progress = loadProgress(currentTest());
  state.answers = progress.answers || {};
  state.reviewed = Boolean(progress.reviewed);
  openSidebar(false);
  render();
}

function selectQuestion(index) {
  const test = currentTest();
  if (!test) return;
  state.questionIndex = Math.max(0, Math.min(index, test.questions.length - 1));
  renderQuestion();
  renderStats();
}

function answerQuestion(letter) {
  const question = currentQuestion();
  const test = currentTest();
  if (state.reviewed) return;
  if (!question) return;
  state.answers[question.question_id] = letter;
  saveProgress();
  if (test && state.questionIndex < test.questions.length - 1 && !state.reviewed) {
    state.questionIndex += 1;
  }
  renderQuestion();
  renderStats();
}

function reviewTest() {
  const test = currentTest();
  if (!test) return;
  const missing = test.questions.length - answeredCount(test);
  state.reviewed = true;
  saveProgress();
  render();
  showToast(missing ? `Corregido. Quedan ${missing} preguntas sin responder.` : "Test corregido.");
}

function resetTest() {
  const test = currentTest();
  if (!test) return;
  state.answers = {};
  state.reviewed = false;
  state.questionIndex = 0;
  localStorage.removeItem(storageKey(test));
  render();
  showToast("Test reiniciado.");
}

function filteredTests(category) {
  const query = state.query.trim().toLowerCase();
  if (!query) return category.tests.map((test, index) => ({ test, index }));
  return category.tests
    .map((test, index) => ({ test, index }))
    .filter(({ test }) => {
      const haystack = [
        testDisplayName(test),
        test.topic_title,
        test.id,
        test.test_id,
        ...test.questions.map((question) => question.question),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
}

function renderCategories() {
  els.categoryTabs.innerHTML = "";
  state.categories.forEach((category, index) => {
    const button = document.createElement("button");
    button.className = `category-tab${index === state.categoryIndex ? " active" : ""}`;
    button.type = "button";
    button.textContent = categoryShortTitle(category);
    button.addEventListener("click", () => {
      state.categoryIndex = index;
      state.testIndex = 0;
      state.questionIndex = 0;
      const progress = loadProgress(currentTest());
      state.answers = progress.answers || {};
      state.reviewed = Boolean(progress.reviewed);
      render();
    });
    els.categoryTabs.appendChild(button);
  });
}

function renderTests() {
  const category = currentCategory();
  els.testList.innerHTML = "";
  let lastTopicKey = "";
  filteredTests(category).forEach(({ test, index }) => {
    const topicKey = test.topic_title ? `${test.topic_number}:${test.topic_title}` : "";
    if (topicKey && topicKey !== lastTopicKey) {
      const heading = document.createElement("div");
      heading.className = "topic-heading";
      heading.innerHTML = `
        <span>${test.topic_number}</span>
        <strong>${test.topic_title}</strong>
      `;
      els.testList.appendChild(heading);
      lastTopicKey = topicKey;
    }
    const saved = loadProgress(test);
    const count = test.questions.filter((question) => saved.answers?.[question.question_id]).length;
    const result = savedResult(test, saved);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `test-item${index === state.testIndex ? " active" : ""}${resultClass(result)}`;
    const subtitle = testSubtitle(test);
    const details = [
      subtitle,
      `${test.questions_count || test.questions.length} preguntas`,
      `ID ${publicTestId(test)}`,
    ].filter(Boolean).join(" · ");
    button.innerHTML = `
      <span>
        <strong>${testDisplayName(test)}</strong>
        <span>${details}</span>
      </span>
      <span class="mini-score">${count}/${test.questions.length}</span>
    `;
    button.addEventListener("click", () => switchTest(state.categoryIndex, index));
    els.testList.appendChild(button);
  });

  if (!els.testList.children.length) {
    const empty = document.createElement("p");
    empty.className = "eyebrow";
    empty.textContent = "Sin resultados";
    els.testList.appendChild(empty);
  }
}

function renderQuestionRail() {
  const test = currentTest();
  els.questionRail.innerHTML = "";
  test.questions.forEach((question, index) => {
    const answer = state.answers[question.question_id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "question-dot";
    if (index === state.questionIndex) button.classList.add("active");
    if (answer) button.classList.add("answered");
    if (state.reviewed && answer) {
      button.classList.add(answer === question.correct ? "correct" : "wrong");
    }
    button.textContent = String(index + 1);
    button.addEventListener("click", () => selectQuestion(index));
    els.questionRail.appendChild(button);
  });
}

function renderQuestion() {
  const test = currentTest();
  const question = currentQuestion();
  if (!test || !question) return;

  els.questionCounter.textContent = `Pregunta ${state.questionIndex + 1} de ${test.questions.length}`;
  els.questionText.textContent = question.question;
  els.questionImage.src = imageSrc(question.image);
  els.questionImage.alt = question.question;
  els.prevButton.disabled = state.questionIndex === 0;
  els.nextButton.disabled = state.questionIndex === test.questions.length - 1;

  els.answers.innerHTML = "";
  const selected = state.answers[question.question_id];
  question.answers.forEach((answer) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button";
    if (selected === answer.letter) button.classList.add("selected");
    if (state.reviewed) {
      if (answer.letter === question.correct) button.classList.add("correct");
      if (selected === answer.letter && selected !== question.correct) button.classList.add("wrong");
      button.disabled = true;
    }
    button.innerHTML = `
      <span class="answer-letter">${answer.letter}</span>
      <span>${answer.text}</span>
    `;
    button.addEventListener("click", () => answerQuestion(answer.letter));
    els.answers.appendChild(button);
  });

  const showExplanation = state.reviewed && question.explanation;
  els.explanationBox.hidden = !showExplanation;
  els.explanationText.textContent = showExplanation ? question.explanation : "";
  renderQuestionRail();
}

function renderStats() {
  const test = currentTest();
  if (!test) return;
  const answered = answeredCount(test);
  const result = score();
  const percent = test.questions.length ? Math.round((answered / test.questions.length) * 100) : 0;
  els.progressValue.textContent = `${answered}/${test.questions.length}`;
  els.scoreValue.textContent = result.ok;
  els.missValue.textContent = result.fail;
  els.progressBar.style.width = `${percent}%`;
}

function render() {
  const category = currentCategory();
  const test = currentTest();
  if (!category || !test) return;

  els.categoryLabel.textContent = `${category.title || "Tests"} · ${category.tests.length} tests`;
  els.testTitle.textContent = testDisplayName(test);
  if (test.topic_title) {
    els.categoryLabel.textContent = `${category.title || "Tests"} · ${test.topic_title}`;
  }
  els.reviewButton.classList.toggle("primary", state.reviewed);
  renderCategories();
  renderTests();
  renderQuestion();
  renderStats();
}

async function init() {
  try {
    const response = await fetch("tests.json");
    if (!response.ok) throw new Error(`No se pudo cargar el JSON (${response.status})`);
    state.data = await response.json();
    state.categories = state.data.categories || [];
    if (!state.categories.length) throw new Error("El JSON no contiene categorías.");
    const progress = loadProgress(currentTest());
    state.answers = progress.answers || {};
    state.reviewed = Boolean(progress.reviewed);
    bindEvents();
    render();
  } catch (error) {
    els.testTitle.textContent = "No se pudieron cargar los tests";
    els.questionText.textContent = error.message;
    showToast(error.message);
  }
}

function bindEvents() {
  els.menuButton.addEventListener("click", () => openSidebar(true));
  els.scrim.addEventListener("click", () => openSidebar(false));
  els.questionImage.addEventListener("click", openImageModal);
  els.imageModalClose.addEventListener("click", closeImageModal);
  els.imageModal.addEventListener("click", (event) => {
    if (event.target === els.imageModal) closeImageModal();
  });
  els.reviewButton.addEventListener("click", reviewTest);
  els.resetButton.addEventListener("click", resetTest);
  els.prevButton.addEventListener("click", () => selectQuestion(state.questionIndex - 1));
  els.nextButton.addEventListener("click", () => selectQuestion(state.questionIndex + 1));
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderTests();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.imageModal.hidden) closeImageModal();
    if (event.key === "ArrowLeft") selectQuestion(state.questionIndex - 1);
    if (event.key === "ArrowRight") selectQuestion(state.questionIndex + 1);
    if (/^[abc]$/i.test(event.key)) answerQuestion(event.key.toUpperCase());
  });
}

init();
