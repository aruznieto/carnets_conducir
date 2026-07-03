const DATASETS = {
  b: {
    file: "data/b/manifest.json",
    basePath: "data/b",
    label: "Carnet B",
    shortLabel: "B",
    eyebrow: "Permiso B",
    mark: "B",
    storagePrefix: "car-b-tests",
    exportName: "carnet-b",
  },
  moto: {
    file: "data/moto/manifest.json",
    basePath: "data/moto",
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
  loadedPages: new Set(),
  marked: new Set(),
  statusFilter: "all",
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
  statusFilter: document.getElementById("statusFilter"),
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
  doneTestsValue: document.getElementById("doneTestsValue"),
  passedTestsValue: document.getElementById("passedTestsValue"),
  failedQuestionsValue: document.getElementById("failedQuestionsValue"),
  markedQuestionsValue: document.getElementById("markedQuestionsValue"),
  progressBar: document.getElementById("progressBar"),
  questionRail: document.getElementById("questionRail"),
  questionCounter: document.getElementById("questionCounter"),
  prevButton: document.getElementById("prevButton"),
  markButton: document.getElementById("markButton"),
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
  if (isMarkedCategory()) return markedCategory();
  return state.categories[state.categoryIndex];
}

function currentTest() {
  return currentCategory()?.tests[state.testIndex];
}

function currentQuestion() {
  return currentTest()?.questions[state.questionIndex];
}

function questionsCount(test) {
  return test?.questions_count || test?.questions?.length || 0;
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
    return normalizeProgress(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeProgress({});
  }
}

function saveProgress() {
  const result = state.reviewed ? score() : null;
  localStorage.setItem(storageKey(), JSON.stringify({
    answers: state.answers,
    reviewed: state.reviewed,
    marked: [...state.marked],
    result: result && typeof result.ok === "number" ? result : null,
  }));
}

function normalizeProgress(progress) {
  return {
    answers: progress.answers && typeof progress.answers === "object" ? progress.answers : {},
    reviewed: Boolean(progress.reviewed),
    marked: Array.isArray(progress.marked) ? progress.marked : [],
    result: progress.result || null,
  };
}

function allTests() {
  return state.categories.flatMap((category) => category.tests);
}

function pageKey(categoryIndex, pageIndex) {
  return `${state.datasetKey}:${categoryIndex}:${pageIndex}`;
}

function pageIndexForTest(index) {
  return Math.floor(index / TESTS_PER_PAGE);
}

async function hydrateCategoryPage(categoryIndex, pageIndex) {
  const category = state.categories[categoryIndex];
  if (!category?.page_files?.[pageIndex]) return;
  const key = pageKey(categoryIndex, pageIndex);
  if (state.loadedPages.has(key)) return;
  const dataset = activeDataset();
  const response = await fetch(`${dataset.basePath}/${category.page_files[pageIndex]}`);
  if (!response.ok) throw new Error(`No se pudo cargar la página de tests (${response.status})`);
  const payload = await response.json();
  const start = pageIndex * TESTS_PER_PAGE;
  (payload.tests || []).forEach((test, offset) => {
    category.tests[start + offset] = {
      ...category.tests[start + offset],
      ...test,
    };
  });
  state.loadedPages.add(key);
}

async function hydrateVisibleTests(category, tests) {
  if (!category || category.tip === "failed") return;
  const categoryIndex = state.categories.indexOf(category);
  if (categoryIndex < 0) return;
  const pages = new Set(tests.map(({ index }) => pageIndexForTest(index)));
  await Promise.all([...pages].map((pageIndex) => hydrateCategoryPage(categoryIndex, pageIndex)));
}

async function hydrateCurrentTest() {
  if (isFailedCategory()) return;
  await hydrateCategoryPage(state.categoryIndex, pageIndexForTest(state.testIndex));
}

async function hydrateReviewedPages() {
  const pages = new Map();
  state.categories.forEach((category, categoryIndex) => {
    category.tests.forEach((test, testIndex) => {
      const saved = loadProgress(test);
      if (!saved.reviewed) return;
      if (!pages.has(categoryIndex)) pages.set(categoryIndex, new Set());
      pages.get(categoryIndex).add(pageIndexForTest(testIndex));
    });
  });
  await Promise.all([...pages.entries()].flatMap(([categoryIndex, pageIndexes]) => (
    [...pageIndexes].map((pageIndex) => hydrateCategoryPage(categoryIndex, pageIndex))
  )));
}

async function hydrateMarkedPages() {
  const pages = new Map();
  state.categories.forEach((category, categoryIndex) => {
    category.tests.forEach((test, testIndex) => {
      const saved = loadProgress(test);
      if (!saved.marked.length) return;
      if (!pages.has(categoryIndex)) pages.set(categoryIndex, new Set());
      pages.get(categoryIndex).add(pageIndexForTest(testIndex));
    });
  });
  await Promise.all([...pages.entries()].flatMap(([categoryIndex, pageIndexes]) => (
    [...pageIndexes].map((pageIndex) => hydrateCategoryPage(categoryIndex, pageIndex))
  )));
}

function isFailedCategory(index = state.categoryIndex) {
  return index === state.categories.length;
}

function isMarkedCategory(index = state.categoryIndex) {
  return index === state.categories.length + 1;
}

function failedQuestions() {
  return allTests().flatMap((test) => {
    const saved = loadProgress(test);
    if (!saved.reviewed) return [];
    return (test.questions || [])
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

function markedQuestions() {
  return allTests().flatMap((test) => {
    const saved = loadProgress(test);
    if (!saved.marked.length) return [];
    const markedIds = new Set(saved.marked);
    return (test.questions || [])
      .filter((question) => markedIds.has(question.question_id))
      .map((question) => ({
        ...question,
        question_id: `marked:${publicTestId(test)}:${question.question_id}`,
        original_question_id: question.question_id,
        origin_test_id: publicTestId(test),
        origin_test_title: testDisplayName(test),
        origin_topic_title: test.topic_title || "",
      }));
  });
}

function markedCategory() {
  const questions = markedQuestions();
  return {
    title: "Marcadas",
    tip: "marked",
    tests: [{
      id: "marcadas",
      test_id: "marcadas",
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
  const markedProgress = loadProgress(markedCategory().tests[0]);
  if (Object.keys(markedProgress.answers || {}).length || markedProgress.reviewed) {
    progress.marcadas = markedProgress;
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
    const knownIds = new Set([...allTests().map(publicTestId), "falladas", "marcadas"]);
    let imported = 0;

    Object.entries(progress).forEach(([id, value]) => {
      if (!knownIds.has(id) || !value || typeof value !== "object") return;
      const answers = value.answers && typeof value.answers === "object" ? value.answers : {};
      localStorage.setItem(`${activeDataset().storagePrefix}:${id}`, JSON.stringify({
        answers,
        reviewed: Boolean(value.reviewed),
        marked: Array.isArray(value.marked) ? value.marked : [],
        result: value.result || null,
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
  if (category.tip === "marked") return "Marcadas";
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
  if (publicTestId(test) === "marcadas") return "Preguntas marcadas";
  return `Test ${publicTestId(test)}`;
}

function testSubtitle(test) {
  return "";
}

function answeredCount(test = currentTest()) {
  if (!test) return 0;
  return (test.questions || []).filter((question) => state.answers[question.question_id]).length;
}

function score() {
  const test = currentTest();
  if (!test || !state.reviewed) return { ok: "-", fail: "-" };
  let ok = 0;
  let fail = 0;
  (test.questions || []).forEach((question) => {
    const answer = state.answers[question.question_id];
    if (!answer) return;
    if (answer === question.correct) ok += 1;
    else fail += 1;
  });
  return { ok, fail };
}

function updateReviewButtonState(test = currentTest()) {
  if (!test) return;
  const total = questionsCount(test);
  els.reviewButton.disabled = !total || (!state.reviewed && answeredCount(test) < total);
}

function savedResult(test, saved) {
  if (!saved?.reviewed) return null;
  if (saved.result && typeof saved.result.fail === "number") return saved.result;
  let ok = 0;
  let fail = 0;
  if (!test.questions?.length) return null;
  test.questions.forEach((question) => {
    const answer = saved.answers?.[question.question_id];
    if (!answer) return;
    if (answer === question.correct) ok += 1;
    else fail += 1;
  });
  return { ok, fail };
}

function testStatus(test) {
  const saved = loadProgress(test);
  const total = questionsCount(test);
  const answered = Math.min(Object.keys(saved.answers || {}).length, total);
  const result = savedResult(test, saved);
  if (result) {
    if (result.fail === 0) return "perfect";
    if (result.fail <= 2) return "pass";
    return "fail";
  }
  if (saved.reviewed) return "reviewed";
  if (answered > 0) return "started";
  return "pending";
}

function matchesStatusFilter(test) {
  const filter = state.statusFilter;
  if (filter === "all" || publicTestId(test) === "falladas" || publicTestId(test) === "marcadas") return true;
  const status = testStatus(test);
  if (filter === "reviewed") return ["reviewed", "perfect", "pass", "fail"].includes(status);
  return status === filter;
}

function datasetSummary() {
  const tests = allTests();
  let done = 0;
  let passed = 0;
  let failedQuestions = 0;
  let marked = 0;
  tests.forEach((test) => {
    const saved = loadProgress(test);
    if (saved.reviewed) done += 1;
    marked += saved.marked.length;
    const result = savedResult(test, saved);
    if (!result) return;
    failedQuestions += result.fail;
    if (result.fail <= 2) passed += 1;
  });
  return { total: tests.length, done, passed, failedQuestions, marked };
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

async function switchTest(categoryIndex, testIndex) {
  state.categoryIndex = categoryIndex;
  state.testIndex = testIndex;
  state.questionIndex = 0;
  await hydrateCurrentTest();
  const progress = loadProgress(currentTest());
  state.answers = progress.answers || {};
  state.reviewed = Boolean(progress.reviewed);
  state.marked = new Set(progress.marked || []);
  openSidebar(false);
  render();
}

async function switchTestPage(page) {
  const category = currentCategory();
  if (!category) return;
  const tests = filteredTests(category);
  const maxPage = Math.max(Math.ceil(tests.length / TESTS_PER_PAGE) - 1, 0);
  state.testPage = Math.max(0, Math.min(page, maxPage));
  const firstVisibleTest = tests[state.testPage * TESTS_PER_PAGE];
  await hydrateVisibleTests(category, tests.slice(state.testPage * TESTS_PER_PAGE, state.testPage * TESTS_PER_PAGE + TESTS_PER_PAGE));
  if (firstVisibleTest) {
    state.testIndex = firstVisibleTest.index;
    state.questionIndex = 0;
    const progress = loadProgress(currentTest());
    state.answers = progress.answers || {};
    state.reviewed = Boolean(progress.reviewed);
    state.marked = new Set(progress.marked || []);
  }
  render();
}

function selectQuestion(index) {
  const test = currentTest();
  if (!test) return;
  if (!test.questions?.length) {
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
  if (test?.questions?.length && state.questionIndex < test.questions.length - 1 && !state.reviewed) {
    state.questionIndex += 1;
  }
  renderQuestion();
  renderStats();
}

function toggleMarkedQuestion() {
  const question = currentQuestion();
  if (!question) return;
  const id = question.original_question_id || question.question_id;
  if (state.marked.has(id)) {
    state.marked.delete(id);
    showToast("Pregunta desmarcada.");
  } else {
    state.marked.add(id);
    showToast("Pregunta marcada.");
  }
  saveProgress();
  renderQuestion();
  renderStats();
}

function reviewTest() {
  const test = currentTest();
  if (!test) return;
  if (!test.questions?.length) {
    showToast("No hay preguntas para corregir.");
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
  if (state.marked.size) {
    saveProgress();
  } else {
    localStorage.removeItem(storageKey(test));
  }
  render();
  showToast("Test reiniciado.");
}

function filteredTests(category) {
  const query = state.query.trim().toLowerCase();
  const withIndex = category.tests
    .map((test, index) => ({ test, index }))
    .filter(({ test }) => matchesStatusFilter(test));
  if (!query) return withIndex;
  return withIndex
    .filter(({ test }) => {
      const haystack = [
        testDisplayName(test),
        test.topic_title,
        test.id,
        test.test_id,
        ...(test.questions || []).map((question) => question.question),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
}

function renderCategories() {
  els.categoryTabs.innerHTML = "";
  const categories = [...state.categories, failedCategory(), markedCategory()];
  categories.forEach((category, index) => {
    const button = document.createElement("button");
    button.className = `category-tab${index === state.categoryIndex ? " active" : ""}`;
    button.type = "button";
    button.textContent = categoryShortTitle(category);
    button.addEventListener("click", async () => {
      state.categoryIndex = index;
      state.testIndex = 0;
      state.testPage = 0;
      state.questionIndex = 0;
      if (isFailedCategory(index)) await hydrateReviewedPages();
      else if (isMarkedCategory(index)) await hydrateMarkedPages();
      else await hydrateCategoryPage(index, 0);
      const progress = loadProgress(currentTest());
      state.answers = progress.answers || {};
      state.reviewed = Boolean(progress.reviewed);
      state.marked = new Set(progress.marked || []);
      render();
    });
    els.categoryTabs.appendChild(button);
  });
}

function renderTests() {
  const category = currentCategory();
  els.testList.innerHTML = "";
  if (["failed", "marked"].includes(category.tip) && !category.tests[0].questions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = category.tip === "failed"
      ? "Cuando corrijas tests, aquí aparecerán las preguntas falladas."
      : "Marca preguntas con la estrella para repasarlas aquí.";
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
    const total = questionsCount(test);
    const count = test.questions?.length
      ? test.questions.filter((question) => progressForCard.answers?.[question.question_id]).length
      : Math.min(Object.keys(progressForCard.answers || {}).length, total);
    const result = savedResult(test, progressForCard);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `test-item${isActive ? " active" : ""}${resultClass(result)}`;
    const subtitle = testSubtitle(test);
    const details = ["falladas", "marcadas"].includes(publicTestId(test))
      ? `${test.questions.length} preguntas`
      : [
        subtitle,
        `${total} preguntas`,
        `ID ${publicTestId(test)}`,
      ].filter(Boolean).join(" · ");
    button.innerHTML = `
      <span>
        <strong>${testDisplayName(test)}</strong>
        <span>${details}</span>
      </span>
      <span class="mini-score">${count}/${total}</span>
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
  if (!test?.questions?.length) return;
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
    els.markButton.disabled = true;
    els.markButton.classList.remove("active");
    els.nextButton.disabled = true;
    els.answers.innerHTML = "";
    els.explanationBox.hidden = true;
    els.explanationText.textContent = "";
    renderQuestionRail();
    return;
  }

  const specialOrigin = ["falladas", "marcadas"].includes(publicTestId(test)) && question.origin_test_title
    ? `${question.origin_test_title} · `
    : "";
  els.questionCounter.textContent = `${specialOrigin}Pregunta ${state.questionIndex + 1} de ${test.questions.length}`;
  els.questionText.textContent = question.question;
  els.imageFrame.hidden = !question.image;
  els.questionImage.src = imageSrc(question.image);
  els.questionImage.alt = question.question;
  els.prevButton.disabled = state.questionIndex === 0;
  els.nextButton.disabled = state.questionIndex === test.questions.length - 1;
  const markId = question.original_question_id || question.question_id;
  els.markButton.disabled = publicTestId(test) === "falladas" || publicTestId(test) === "marcadas";
  els.markButton.classList.toggle("active", state.marked.has(markId));

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
  const total = questionsCount(test);
  const percent = total ? Math.round((answered / total) * 100) : 0;
  els.progressValue.textContent = `${answered}/${total}`;
  els.scoreValue.textContent = result.ok;
  els.missValue.textContent = result.fail;
  els.progressBar.style.width = `${percent}%`;
  renderSummary();
  updateReviewButtonState(test);
}

function renderSummary() {
  const summary = datasetSummary();
  els.doneTestsValue.textContent = `${summary.done}/${summary.total}`;
  els.passedTestsValue.textContent = String(summary.passed);
  els.failedQuestionsValue.textContent = String(summary.failedQuestions);
  els.markedQuestionsValue.textContent = String(summary.marked);
}

function render() {
  const category = currentCategory();
  const test = currentTest();
  if (!category || !test) return;

  els.categoryLabel.textContent = ["failed", "marked"].includes(category.tip)
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
  state.loadedPages = new Set();
  state.marked = new Set();
  state.statusFilter = "all";
  els.searchInput.value = "";
  els.statusFilter.value = "all";
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
  els.markButton.disabled = true;
  els.markButton.classList.remove("active");
  els.nextButton.disabled = true;
  els.answers.innerHTML = "";
  els.explanationBox.hidden = true;
  els.progressValue.textContent = "0/0";
  els.scoreValue.textContent = "-";
  els.missValue.textContent = "-";
  els.progressBar.style.width = "0%";
  els.reviewButton.disabled = true;
  els.markButton.disabled = true;
  renderSummary();
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
    await hydrateCategoryPage(0, 0);
    const progress = loadProgress(currentTest());
    state.answers = progress.answers || {};
    state.reviewed = Boolean(progress.reviewed);
    state.marked = new Set(progress.marked || []);
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
  els.markButton.addEventListener("click", toggleMarkedQuestion);
  els.nextButton.addEventListener("click", () => selectQuestion(state.questionIndex + 1));
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.testPage = 0;
    renderTests();
  });
  els.statusFilter.addEventListener("change", async (event) => {
    state.statusFilter = event.target.value;
    state.testPage = 0;
    const category = currentCategory();
    const first = filteredTests(category)[0];
    if (first) {
      state.testIndex = first.index;
      await hydrateCurrentTest();
      const progress = loadProgress(currentTest());
      state.answers = progress.answers || {};
      state.reviewed = Boolean(progress.reviewed);
      state.marked = new Set(progress.marked || []);
    }
    render();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.imageModal.hidden) closeImageModal();
    if (event.key === "ArrowLeft") selectQuestion(state.questionIndex - 1);
    if (event.key === "ArrowRight") selectQuestion(state.questionIndex + 1);
    if (/^[abc]$/i.test(event.key)) answerQuestion(event.key.toUpperCase());
  });
}

init();
