const DATASETS = {
  b: {
    file: "tests_b.json",
    label: "Carnet B",
    shortLabel: "B",
    eyebrow: "Permiso B",
    mark: "B",
    storagePrefix: "car-b-tests",
    exportName: "carnet-b",
  },
  moto: {
    file: "tests.json",
    label: "Moto A1/A2",
    shortLabel: "A1/A2",
    eyebrow: "Permiso moto",
    mark: "A",
    storagePrefix: "moto-tests",
    exportName: "moto-a1-a2",
  },
};

const TESTS_PER_PAGE = 50;

const state = {
  data: null,
  datasetKey: null,
  categories: [],
  categoryIndex: 0,
  testIndex: 0,
  testPage: 0,
  questionIndex: 0,
  answers: {},
  reviewed: false,
  query: "",
};

const els = {
  permitModal: document.getElementById("permitModal"),
  permitStatus: document.getElementById("permitStatus"),
  permitOptions: document.querySelectorAll(".permit-option"),
  sidebar: document.querySelector(".sidebar"),
  scrim: document.getElementById("sidebarScrim"),
  menuButton: document.getElementById("menuButton"),
  brandMark: document.getElementById("brandMark"),
  brandEyebrow: document.getElementById("brandEyebrow"),
  brandTitle: document.getElementById("brandTitle"),
  categoryTabs: document.getElementById("categoryTabs"),
  testList: document.getElementById("testList"),
  searchInput: document.getElementById("searchInput"),
  exportButton: document.getElementById("exportButton"),
  importButton: document.getElementById("importButton"),
  importFile: document.getElementById("importFile"),
  changePermitButton: document.getElementById("changePermitButton"),
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
  imageFrame: document.querySelector(".image-frame"),
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

function activeDataset() {
  return DATASETS[state.datasetKey] || DATASETS.moto;
}

function currentCategory() {
  if (isFailedCategory()) return failedCategory();
  return state.categories[state.categoryIndex];
}

function currentTest() {
  return currentCategory()?.tests[state.testIndex];
}

function currentQuestion() {
  return currentTest()?.questions[state.questionIndex];
}

function storageKey(test = currentTest()) {
  return test ? `${activeDataset().storagePrefix}:${publicTestId(test)}` : `${activeDataset().storagePrefix}:empty`;
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

function allTests() {
  return state.categories.flatMap((category) => category.tests);
}

function isFailedCategory(index = state.categoryIndex) {
  return index === state.categories.length;
}

function failedQuestions() {
  return allTests().flatMap((test) => {
    const saved = loadProgress(test);
    if (!saved.reviewed) return [];
    return test.questions
      .filter((question) => saved.answers?.[question.question_id] && saved.answers[question.question_id] !== question.correct)
      .map((question) => ({
        ...question,
        question_id: `failed:${publicTestId(test)}:${question.question_id}`,
        original_question_id: question.question_id,
        origin_test_id: publicTestId(test),
        origin_test_title: testDisplayName(test),
        origin_topic_title: test.topic_title || "",
      }));
  });
}

function failedCategory() {
  const questions = failedQuestions();
  return {
    title: "Falladas",
    tip: "failed",
    tests: [{
      id: "falladas",
      test_id: "falladas",
      questions_count: questions.length,
      questions,
    }],
  };
}

function exportProgress() {
  const progress = {};
  allTests().forEach((test) => {
    const saved = loadProgress(test);
    if (Object.keys(saved.answers || {}).length || saved.reviewed) {
      progress[publicTestId(test)] = saved;
    }
  });
  const failedProgress = loadProgress(failedCategory().tests[0]);
  if (Object.keys(failedProgress.answers || {}).length || failedProgress.reviewed) {
    progress.falladas = failedProgress;
  }

  const payload = {
    app: activeDataset().exportName,
    permit: state.datasetKey,
    version: 1,
    exported_at: new Date().toISOString(),
    progress,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${activeDataset().exportName}-progreso-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Progreso descargado.");
}

async function importProgressFile(file) {
  try {
    const payload = JSON.parse(await file.text());
    const progress = payload.progress && typeof payload.progress === "object" ? payload.progress : payload;
    const knownIds = new Set([...allTests().map(publicTestId), "falladas"]);
    let imported = 0;

    Object.entries(progress).forEach(([id, value]) => {
      if (!knownIds.has(id) || !value || typeof value !== "object") return;
      const answers = value.answers && typeof value.answers === "object" ? value.answers : {};
      localStorage.setItem(`${activeDataset().storagePrefix}:${id}`, JSON.stringify({
        answers,
        reviewed: Boolean(value.reviewed),
      }));
      imported += 1;
    });

    const activeProgress = loadProgress(currentTest());
    state.answers = activeProgress.answers || {};
    state.reviewed = Boolean(activeProgress.reviewed);
    render();
    showToast(imported ? `Progreso cargado: ${imported} tests.` : "No había progreso compatible en el archivo.");
  } catch {
    showToast("No se pudo cargar el archivo.");
  } finally {
    els.importFile.value = "";
  }
}

function imageSrc(image) {
  if (!image) return "";
  if (/^https?:\/\//i.test(image) || image.startsWith("images/")) return image;
  return `images/${image}`;
}

function categoryShortTitle(category) {
  if (category.tip === "failed") return "Falladas";
  const title = (category.title || `Tipo ${category.tip}`)
    .replace(/^test\s+/i, "")
    .replace(/\s+DGT$/i, " DGT");
  const normalized = title.toLowerCase();
  if (normalized.includes("dgt") || normalized.includes("oficial")) return "DGT";
  if (normalized.includes("examen")) return "EXAMEN";
  if (normalized.includes("tema")) return "TEMAS";
  return title;
}

function testDisplayName(test) {
  if (publicTestId(test) === "falladas") return "Preguntas falladas";
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

function updateReviewButtonState(test = currentTest()) {
  if (!test) return;
  els.reviewButton.disabled = !test.questions.length || (!state.reviewed && answeredCount(test) < test.questions.length);
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
  if (els.imageFrame.hidden) return;
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

function switchTestPage(page) {
  const category = currentCategory();
  if (!category) return;
  const tests = filteredTests(category);
  const maxPage = Math.max(Math.ceil(tests.length / TESTS_PER_PAGE) - 1, 0);
  state.testPage = Math.max(0, Math.min(page, maxPage));
  const firstVisibleTest = tests[state.testPage * TESTS_PER_PAGE];
  if (firstVisibleTest) {
    state.testIndex = firstVisibleTest.index;
    state.questionIndex = 0;
    const progress = loadProgress(currentTest());
    state.answers = progress.answers || {};
    state.reviewed = Boolean(progress.reviewed);
  }
  render();
}

function selectQuestion(index) {
  const test = currentTest();
  if (!test) return;
  if (!test.questions.length) {
    state.questionIndex = 0;
    renderQuestion();
    renderStats();
    return;
  }
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
  if (!test.questions.length) {
    showToast("No hay preguntas falladas.");
    return;
  }
  const missing = test.questions.length - answeredCount(test);
  if (missing) {
    const firstMissing = test.questions.findIndex((question) => !state.answers[question.question_id]);
    if (firstMissing >= 0) selectQuestion(firstMissing);
    showToast(`Te faltan ${missing} preguntas por responder.`);
    return;
  }
  state.reviewed = true;
  saveProgress();
  render();
  showToast("Test corregido.");
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
  const categories = [...state.categories, failedCategory()];
  categories.forEach((category, index) => {
    const button = document.createElement("button");
    button.className = `category-tab${index === state.categoryIndex ? " active" : ""}`;
    button.type = "button";
    button.textContent = categoryShortTitle(category);
    button.addEventListener("click", () => {
      state.categoryIndex = index;
      state.testIndex = 0;
      state.testPage = 0;
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
  if (category.tip === "failed" && !category.tests[0].questions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Cuando corrijas tests, aquí aparecerán las preguntas falladas.";
    els.testList.appendChild(empty);
    return;
  }
  let lastTopicKey = "";
  const tests = filteredTests(category);
  const pageCount = Math.max(Math.ceil(tests.length / TESTS_PER_PAGE), 1);
  state.testPage = Math.max(0, Math.min(state.testPage, pageCount - 1));
  const pageStart = state.testPage * TESTS_PER_PAGE;
  const visibleTests = tests.slice(pageStart, pageStart + TESTS_PER_PAGE);

  visibleTests.forEach(({ test, index }) => {
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
    const isActive = index === state.testIndex;
    const progressForCard = isActive ? { answers: state.answers, reviewed: state.reviewed } : saved;
    const count = test.questions.filter((question) => progressForCard.answers?.[question.question_id]).length;
    const result = savedResult(test, progressForCard);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `test-item${isActive ? " active" : ""}${resultClass(result)}`;
    const subtitle = testSubtitle(test);
    const details = publicTestId(test) === "falladas"
      ? `${test.questions.length} preguntas`
      : [
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

  if (pageCount > 1) {
    const pager = document.createElement("div");
    pager.className = "test-pagination";
    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.className = "pager-button";
    previousButton.textContent = "Anterior";
    previousButton.disabled = state.testPage === 0;
    previousButton.dataset.page = String(state.testPage - 1);

    const pageLabel = document.createElement("span");
    pageLabel.textContent = `${state.testPage + 1}/${pageCount}`;

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "pager-button";
    nextButton.textContent = "Siguiente";
    nextButton.disabled = state.testPage >= pageCount - 1;
    nextButton.dataset.page = String(state.testPage + 1);

    pager.append(previousButton, pageLabel, nextButton);
    els.testList.appendChild(pager);
  }

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
  if (!test?.questions.length) return;
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
  if (!test || !question) {
    els.questionCounter.textContent = "Sin preguntas";
    els.questionText.textContent = "Cuando corrijas tests, aquí aparecerán las preguntas que hayas fallado.";
    els.imageFrame.hidden = true;
    els.questionImage.removeAttribute("src");
    els.questionImage.alt = "";
    els.prevButton.disabled = true;
    els.nextButton.disabled = true;
    els.answers.innerHTML = "";
    els.explanationBox.hidden = true;
    els.explanationText.textContent = "";
    renderQuestionRail();
    return;
  }

  const failedOrigin = publicTestId(test) === "falladas" && question.origin_test_title
    ? `${question.origin_test_title} · `
    : "";
  els.questionCounter.textContent = `${failedOrigin}Pregunta ${state.questionIndex + 1} de ${test.questions.length}`;
  els.questionText.textContent = question.question;
  els.imageFrame.hidden = !question.image;
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
  updateReviewButtonState(test);
}

function render() {
  const category = currentCategory();
  const test = currentTest();
  if (!category || !test) return;

  els.categoryLabel.textContent = category.tip === "failed"
    ? `${test.questions.length} preguntas`
    : `${category.title || "Tests"} · ${category.tests.length} tests`;
  els.testTitle.textContent = testDisplayName(test);
  if (test.topic_title && category.tip !== "failed") {
    els.categoryLabel.textContent = `${category.title || "Tests"} · ${test.topic_title}`;
  }
  els.reviewButton.classList.toggle("primary", state.reviewed);
  updateReviewButtonState(test);
  renderCategories();
  renderTests();
  renderQuestion();
  renderStats();
}

function setPermitControlsLoading(loading, message = "") {
  els.permitOptions.forEach((button) => {
    button.disabled = loading;
  });
  els.permitStatus.textContent = message;
}

function applyDatasetBrand() {
  const dataset = activeDataset();
  document.title = `${dataset.label} · Tests`;
  els.brandMark.textContent = dataset.mark;
  els.brandEyebrow.textContent = dataset.eyebrow;
  els.brandTitle.textContent = dataset.label;
}

function resetViewState() {
  state.categoryIndex = 0;
  state.testIndex = 0;
  state.testPage = 0;
  state.questionIndex = 0;
  state.answers = {};
  state.reviewed = false;
  state.query = "";
  els.searchInput.value = "";
}

function clearQuestionView(message = "Elige un permiso para cargar los tests.") {
  els.categoryTabs.innerHTML = "";
  els.testList.innerHTML = "";
  els.categoryLabel.textContent = "Sin permiso";
  els.testTitle.textContent = "Tests de conducir";
  els.questionCounter.textContent = "Preparado";
  els.questionText.textContent = message;
  els.imageFrame.hidden = true;
  els.questionImage.removeAttribute("src");
  els.questionImage.alt = "";
  els.prevButton.disabled = true;
  els.nextButton.disabled = true;
  els.answers.innerHTML = "";
  els.explanationBox.hidden = true;
  els.progressValue.textContent = "0/0";
  els.scoreValue.textContent = "-";
  els.missValue.textContent = "-";
  els.progressBar.style.width = "0%";
  els.reviewButton.disabled = true;
}

async function loadDataset(datasetKey) {
  const dataset = DATASETS[datasetKey];
  if (!dataset) return;
  try {
    setPermitControlsLoading(true, `Cargando ${dataset.label}...`);
    state.datasetKey = datasetKey;
    resetViewState();
    applyDatasetBrand();
    clearQuestionView(`Cargando ${dataset.label}...`);
    const response = await fetch(dataset.file);
    if (!response.ok) throw new Error(`No se pudo cargar el JSON (${response.status})`);
    state.data = await response.json();
    state.categories = state.data.categories || [];
    if (!state.categories.length) throw new Error("El JSON no contiene categorías.");
    const progress = loadProgress(currentTest());
    state.answers = progress.answers || {};
    state.reviewed = Boolean(progress.reviewed);
    els.permitModal.hidden = true;
    render();
    showToast(`${dataset.label} cargado.`);
  } catch (error) {
    els.permitStatus.textContent = error.message;
    els.testTitle.textContent = "No se pudieron cargar los tests";
    els.questionText.textContent = error.message;
    showToast(error.message);
  } finally {
    setPermitControlsLoading(false, els.permitStatus.textContent);
  }
}

function showPermitModal() {
  els.permitModal.hidden = false;
  setPermitControlsLoading(false, "");
}

function init() {
  bindEvents();
  clearQuestionView();
  showPermitModal();
}

function bindEvents() {
  els.permitOptions.forEach((button) => {
    button.addEventListener("click", () => loadDataset(button.dataset.permit));
  });
  els.menuButton.addEventListener("click", () => openSidebar(true));
  els.scrim.addEventListener("click", () => openSidebar(false));
  els.changePermitButton.addEventListener("click", showPermitModal);
  els.exportButton.addEventListener("click", exportProgress);
  els.importButton.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importProgressFile(file);
  });
  els.testList.addEventListener("click", (event) => {
    const button = event.target.closest(".pager-button");
    if (!button || button.disabled) return;
    switchTestPage(Number(button.dataset.page));
  });
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
    state.testPage = 0;
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
