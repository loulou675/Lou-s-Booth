const STRIP_WIDTH = 600;
const STRIP_HEIGHT = 1800;

if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
}

function resetLandingPosition() {
    if (window.location.hash) {
        const target = document.querySelector(window.location.hash);

        if (target) {
            target.scrollIntoView({ behavior: "auto", block: "start" });
            return;
        }
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

resetLandingPosition();
window.addEventListener("load", resetLandingPosition);

const backgrounds = [
    { id: "bg-01", name: "01", src: "frame/01.jpeg" },
    { id: "bg-02", name: "02", src: "frame/02.jpg" },
    { id: "bg-03", name: "03", src: "frame/03.png" },
    { id: "bg-04", name: "04", src: "frame/04.jpg" },
    { id: "bg-05", name: "05", src: "frame/05.jpg" },
    { id: "bg-06", name: "06", src: "frame/06.jpg" },
    { id: "bg-07", name: "07", src: "frame/07.jpg" },
    { id: "bg-08", name: "08", src: "frame/08.jpg" },
    { id: "bg-09", name: "09", src: "frame/09.jpg" },
    { id: "bg-010", name: "010", src: "frame/010.jpg" },
    { id: "bg-011", name: "011", src: "frame/011.jpg" },
    { id: "bg-013", name: "013", src: "frame/013.jpg" },
    { id: "bg-023", name: "023", src: "frame/023.jpg" },
    { id: "bg-024", name: "024", src: "frame/024.png" },
    { id: "bg-025", name: "025", src: "frame/025.jpg" },
    { id: "bg-026", name: "026", src: "frame/026.png" },
    { id: "bg-027", name: "027", src: "frame/027.png" }
];

const filters = [
    { id: "normal", name: "Normal", canvas: "none" },
    { id: "bw", name: "B&W", canvas: "grayscale(1) contrast(1.08)" },
    { id: "retro", name: "Retro", canvas: "sepia(.46) saturate(1.35) contrast(1.08) brightness(1.03)" },
    { id: "soft", name: "Soft", canvas: "saturate(1.12) brightness(1.07) contrast(.94)" }
];

const stickers = Array.from({ length: 33 }, (_, index) => {
    const number = index + 1;

    return {
        id: `sticker-${number}`,
        name: `Sticker ${number}`,
        src: `sticker/${number}.png`
    };
});

const DEFAULT_STICKER_SIZE = 132;
const MIN_STICKER_SIZE = 52;
const MAX_STICKER_SIZE = 320;
const LIBRARY_STORAGE_KEY = "lous-booth-library";
const MAX_LIBRARY_ITEMS = 18;

const state = {
    stage: "setup",
    stream: null,
    cameraReady: false,
    orientation: "landscape",
    captureMode: "auto",
    mirror: true,
    shots: [],
    currentShotIndex: 0,
    selectedShotIndex: null,
    isCapturing: false,
    isRenderingStrip: false,
    sessionComplete: false,
    backgroundId: backgrounds[0].id,
    filterId: filters[0].id,
    stickers: [],
    selectedStickerId: null,
    finalDataUrl: ""
};

const imageCache = new Map();
let renderSequence = 0;
let soundContext = null;
let stickerInstanceId = 0;
let libraryPhysics = null;
let libraryPhysicsObserver = null;
let activeLibraryPreview = null;
const SOUND_VOLUME = 1.35;

const els = {
    video: document.getElementById("camera"),
    cameraWindow: document.getElementById("cameraWindow"),
    captureCanvas: document.getElementById("captureCanvas"),
    stripCanvas: document.getElementById("stripCanvas"),
    stripPreview: document.querySelector(".strip-preview"),
    stickerLayer: document.getElementById("stickerLayer"),
    boothWorkspace: document.querySelector(".booth-workspace"),
    startCamera: document.getElementById("startCamera"),
    permissionLayer: document.getElementById("permissionLayer"),
    mirrorToggle: document.getElementById("mirrorToggle"),
    shutterButton: document.getElementById("shutterButton"),
    retakeButton: document.getElementById("retakeButton"),
    shotTray: document.getElementById("shotTray"),
    statusLabel: document.getElementById("statusLabel"),
    shotCounter: document.getElementById("shotCounter"),
    countdown: document.getElementById("countdown"),
    backgroundChoices: document.getElementById("backgroundChoices"),
    filterChoices: document.getElementById("filterChoices"),
    backgroundTools: document.getElementById("backgroundTools"),
    stickerTools: document.getElementById("stickerTools"),
    stickerChoices: document.getElementById("stickerChoices"),
    setupStatus: document.getElementById("setupStatus"),
    retakeNote: document.getElementById("retakeNote"),
    toBackgroundButton: document.getElementById("toBackgroundButton"),
    toStickerButton: document.getElementById("toStickerButton"),
    restartBoothButton: document.getElementById("restartBoothButton"),
    addLibraryButton: document.getElementById("addLibraryButton"),
    downloadButton: document.getElementById("downloadButton"),
    saveStatus: document.getElementById("saveStatus"),
    libraryStage: document.getElementById("libraryStage"),
    libraryEmpty: document.getElementById("libraryEmpty"),
    libraryViewer: document.getElementById("libraryViewer"),
    libraryViewerBackdrop: document.getElementById("libraryViewerBackdrop"),
    libraryViewerClose: document.getElementById("libraryViewerClose"),
    libraryViewerImage: document.getElementById("libraryViewerImage"),
    libraryViewerSave: document.getElementById("libraryViewerSave")
};

function totalShots() {
    return state.orientation === "portrait" ? 2 : 4;
}

function activeBackground() {
    return backgrounds.find((item) => item.id === state.backgroundId) || backgrounds[0];
}

function activeFilter() {
    return filters.find((item) => item.id === state.filterId) || filters[0];
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getSoundContext() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) return null;

    if (!soundContext) {
        soundContext = new AudioContextConstructor();
    }

    return soundContext;
}

async function unlockSoundEffects() {
    const context = getSoundContext();

    if (!context || context.state !== "suspended") return;

    try {
        await context.resume();
    } catch (error) {
        console.error(error);
    }
}

function playTone(frequency, duration, type = "sine", volume = .08, startOffset = 0) {
    const context = getSoundContext();

    if (!context) return;

    const now = context.currentTime + startOffset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * SOUND_VOLUME, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
}

function playCountdownSound(number) {
    const notes = {
        3: [523.25, 1046.5],
        2: [587.33, 1174.66],
        1: [659.25, 1318.51]
    };
    const [base, overtone] = notes[number] || notes[2];

    playTone(base, .12, "triangle", .055);
    playTone(overtone, .09, "sine", .024, .01);
    window.setTimeout(() => playTone(base * 1.5, .06, "sine", .018), 54);
}

function playUiClickSound() {
    playTone(920, .055, "sine", .046);
    playTone(1440, .06, "triangle", .032, .018);
    window.setTimeout(() => playTone(1960, .035, "sine", .024), 34);
    playNoiseClick(.012, .034, 4800, 5.8);
}

function playShutterSound() {
    playNoiseClick(.009, .31, 8200, 10.5);
    playTone(420, .026, "square", .074, .002);
    window.setTimeout(() => playNoiseClick(.014, .3, 5600, 7.6), 22);
    window.setTimeout(() => playTone(740, .03, "triangle", .086), 24);
    window.setTimeout(() => playNoiseClick(.008, .24, 9600, 12), 50);
    window.setTimeout(() => playTone(1680, .022, "sine", .072), 52);
}

function playNoiseClick(duration = .03, volume = .04, frequency = 1800, q = 1.9) {
    const context = getSoundContext();

    if (!context) return;

    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < sampleCount; index += 1) {
        const fade = 1 - index / sampleCount;
        data[index] = (Math.random() * 2 - 1) * fade;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, now);
    filter.Q.setValueAtTime(q, now);
    gain.gain.setValueAtTime(volume * SOUND_VOLUME, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);

    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start(now);
}

function setSaveStatus(message) {
    if (els.statusLabel) {
        els.statusLabel.textContent = message;
    }

    if (els.saveStatus) {
        els.saveStatus.textContent = message;
    }
}

function setSetupStatus(message) {
    if (els.statusLabel) {
        els.statusLabel.textContent = message;
    }

    if (els.setupStatus) {
        els.setupStatus.textContent = message;
    }
}

function isFilePage() {
    return window.location.protocol === "file:";
}

function stopCamera() {
    if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
    }

    state.stream = null;
    state.cameraReady = false;
    els.video.srcObject = null;
}

function setStage(stage) {
    state.stage = stage;
    updateUi();
}

function resetShots() {
    state.shots = Array.from({ length: totalShots() }, () => null);
    state.currentShotIndex = 0;
    state.selectedShotIndex = null;
    state.sessionComplete = false;
    state.stickers = [];
    state.selectedStickerId = null;
    state.finalDataUrl = "";
    updateStickerLayer();
}

function resetStripCustomizations() {
    state.finalDataUrl = "";

    if (els.saveStatus) {
        els.saveStatus.textContent = "";
    }
}

function restartBoothSession() {
    state.isCapturing = false;
    stopCamera();
    resetShots();
    resetStripCustomizations();
    updateShotTray();
    setCameraPermissionMessage("Choose your setup first.");
    setSetupStatus("");
    setStage("setup");
    void renderStripCanvas();
}

function setActiveButton(buttons, activeButton) {
    buttons.forEach((button) => {
        button.classList.toggle("active", button === activeButton);
    });
}

function setupChoices() {
    backgrounds.forEach((background) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "swatch-button";
        button.style.background = `url("${background.src}") center / cover`;
        button.dataset.backgroundId = background.id;
        button.setAttribute("aria-label", background.name);
        button.title = background.name;
        button.addEventListener("click", () => {
            playUiClickSound();
            state.backgroundId = background.id;
            resetStripCustomizations();
            setupActiveChoiceStates();
            void renderStripCanvas();
        });
        els.backgroundChoices.appendChild(button);
    });

    filters.forEach((filter) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "filter-button";
        button.dataset.filterId = filter.id;
        button.textContent = filter.name;
        button.setAttribute("aria-label", filter.name);
        button.title = filter.name;
        button.addEventListener("click", () => {
            playUiClickSound();
            state.filterId = filter.id;
            resetStripCustomizations();
            setupActiveChoiceStates();
            void renderStripCanvas();
        });
        els.filterChoices.appendChild(button);
    });

    stickers.forEach((sticker) => {
        const button = document.createElement("button");
        const image = document.createElement("img");

        button.type = "button";
        button.className = "sticker-button";
        button.draggable = true;
        button.dataset.stickerSrc = sticker.src;
        button.setAttribute("aria-label", sticker.name);
        button.title = sticker.name;
        image.src = sticker.src;
        image.alt = "";
        button.appendChild(image);
        button.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/plain", sticker.src);
            event.dataTransfer.effectAllowed = "copy";
        });
        button.addEventListener("click", () => {
            playUiClickSound();
            addStickerAtCenter(sticker.src);
        });
        els.stickerChoices.appendChild(button);
    });
}

function setupActiveChoiceStates() {
    document.querySelectorAll("[data-background-id]").forEach((button) => {
        button.classList.toggle("active", button.dataset.backgroundId === state.backgroundId);
    });

    document.querySelectorAll("[data-filter-id]").forEach((button) => {
        button.classList.toggle("active", button.dataset.filterId === state.filterId);
    });
}

function bindEvents() {
    document.querySelectorAll("[data-orientation]").forEach((button) => {
        button.addEventListener("click", () => {
            if (state.isCapturing) return;
            playUiClickSound();
            state.orientation = button.dataset.orientation;
            resetShots();
            resetStripCustomizations();
            setActiveButton(document.querySelectorAll("[data-orientation]"), button);
            updateUi();
            updateShotTray();
            void renderStripCanvas();
        });
    });

    document.querySelectorAll("[data-capture-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            if (state.isCapturing) return;
            playUiClickSound();
            state.captureMode = button.dataset.captureMode;
            setActiveButton(document.querySelectorAll("[data-capture-mode]"), button);
            updateUi();
        });
    });

    els.mirrorToggle.addEventListener("change", () => {
        if (state.isCapturing) return;
        playUiClickSound();
        state.mirror = els.mirrorToggle.checked;
        state.finalDataUrl = "";
        updateUi();
    });

    els.startCamera.addEventListener("click", () => {
        playUiClickSound();
        void startCamera();
    });
    els.shutterButton.addEventListener("click", handleShutterPress);
    els.retakeButton.addEventListener("click", () => {
        playUiClickSound();
        void retakeSelectedShot();
    });
    els.toBackgroundButton.addEventListener("click", () => {
        if (!state.sessionComplete || state.isCapturing) return;
        playUiClickSound();
        stopCamera();
        setStage("background");
        void renderStripCanvas();
    });
    els.toStickerButton.addEventListener("click", () => {
        if (!state.sessionComplete || state.isCapturing || state.stage !== "background") return;
        playUiClickSound();
        setStage("sticker");
        updateStickerLayer();
        void renderStripCanvas();
    });
    els.downloadButton.addEventListener("click", () => {
        playUiClickSound();
        void downloadStrip();
    });
    els.addLibraryButton.addEventListener("click", () => {
        playUiClickSound();
        void addCurrentStripToLibrary();
    });
    els.restartBoothButton.addEventListener("click", () => {
        playUiClickSound();
        restartBoothSession();
    });
    if (els.libraryViewer) {
        els.libraryViewerBackdrop.addEventListener("click", () => {
            playUiClickSound();
            closeLibraryViewer();
        });
        els.libraryViewerClose.addEventListener("click", () => {
            playUiClickSound();
            closeLibraryViewer();
        });
        els.libraryViewerSave.addEventListener("click", () => {
            playUiClickSound();
            saveActiveLibraryPreview();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || els.libraryViewer.hidden) return;

            closeLibraryViewer();
        });
    }
    els.stripPreview.addEventListener("dragover", (event) => {
        if (state.stage !== "sticker") return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    });
    els.stripPreview.addEventListener("drop", (event) => {
        if (state.stage !== "sticker") return;
        event.preventDefault();

        const src = event.dataTransfer.getData("text/plain");
        if (!src) return;

        playUiClickSound();
        addStickerAtPoint(src, event.clientX, event.clientY);
    });
    els.stripPreview.addEventListener("pointerdown", (event) => {
        if (state.stage !== "sticker") return;
        if (event.target.closest(".placed-sticker")) return;

        state.selectedStickerId = null;
        updateStickerLayer();
    });
    document.addEventListener("pointerdown", (event) => {
        if (state.stage !== "sticker") return;
        if (event.target.closest(".placed-sticker")) return;
        if (event.target.closest(".sticker-tools")) return;

        state.selectedStickerId = null;
        updateStickerLayer();
    });
}

async function startCamera() {
    if (state.isCapturing) return;

    await unlockSoundEffects();

    if (state.cameraReady) {
        await beginSession();
        await playCameraPreview();
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setSetupStatus("Camera is not supported here.");
        return;
    }

    try {
        resetShots();
        resetStripCustomizations();
        updateShotTray();
        setCameraPermissionMessage("Allow camera access to start.");
        setSetupStatus("Allow camera access to start.");
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            }
        });

        state.stream = stream;
        state.cameraReady = true;
        els.video.srcObject = stream;
        els.permissionLayer.hidden = true;
        await beginSession();
        await playCameraPreview();
    } catch (error) {
        stopCamera();
        setStage("setup");
        setCameraPermissionMessage("Choose your setup first.");
        setSetupStatus("Camera blocked. Allow camera access, then press Start again.");
        console.error(error);
    }

    updateUi();
}

async function playCameraPreview() {
    try {
        await els.video.play();
    } catch (error) {
        setSetupStatus("Camera opened. Tap Start again if the preview is paused.");
        console.error(error);
    }
}

function setCameraPermissionMessage(message) {
    const messageElement = els.permissionLayer.querySelector("p");

    if (messageElement) {
        messageElement.textContent = message;
    }
}

async function beginSession() {
    if (!state.cameraReady || state.isCapturing || !["setup", "capture"].includes(state.stage)) return;

    resetShots();
    resetStripCustomizations();
    state.isCapturing = false;
    state.finalDataUrl = "";
    updateShotTray();
    setStage("capture");
    els.statusLabel.textContent = state.captureMode === "auto" ? "Ready for auto capture" : "Ready for manual capture";
    updateUi();
    await renderStripCanvas();
}

async function handleShutterPress() {
    if (state.stage !== "capture" || state.isCapturing || !state.cameraReady) return;

    await unlockSoundEffects();

    if (state.captureMode === "auto") {
        state.isCapturing = true;
        els.statusLabel.textContent = "Auto capture";
        updateUi();
        await runAutoCapture();
        return;
    }

    await captureManualShot();
}

async function runAutoCapture() {
    while (state.stage === "capture" && state.isCapturing && state.currentShotIndex < totalShots()) {
        await runCountdown();
        captureShotAt(state.currentShotIndex);
        state.currentShotIndex += 1;
        updateShotTray();
        updateUi();
        await renderStripCanvas();
        await sleep(420);
    }

    if (state.isCapturing) {
        finishSession();
    }
}

async function captureManualShot() {
    if (state.stage !== "capture" || state.captureMode !== "manual" || state.isCapturing) return;
    state.isCapturing = true;
    captureShotAt(state.currentShotIndex);
    state.currentShotIndex += 1;
    state.isCapturing = false;
    updateShotTray();
    updateUi();
    await renderStripCanvas();

    if (state.currentShotIndex >= totalShots()) {
        finishSession();
    }
}

function finishSession() {
    state.isCapturing = false;
    state.sessionComplete = true;
    state.selectedShotIndex = 0;
    setStage("retake");
    els.statusLabel.textContent = "Choose a photo to retake";
    updateShotTray();
    updateUi();
}

async function retakeSelectedShot() {
    if (state.stage !== "retake" || !state.sessionComplete || state.selectedShotIndex === null || !state.cameraReady) return;
    await unlockSoundEffects();
    state.isCapturing = true;
    updateUi();

    if (state.captureMode === "auto") {
        await runCountdown();
    }

    captureShotAt(state.selectedShotIndex);
    state.isCapturing = false;
    setStage("retake");
    state.finalDataUrl = "";
    els.statusLabel.textContent = `Retook photo ${state.selectedShotIndex + 1}`;
    updateShotTray();
    updateUi();
    await renderStripCanvas();
}

function captureShotAt(index) {
    if (!els.video.videoWidth || !els.video.videoHeight) return;

    playShutterSound();

    const canvas = els.captureCanvas;
    const target = state.orientation === "portrait"
        ? { width: 900, height: 1350 }
        : { width: 1200, height: 800 };

    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext("2d");
    context.save();

    if (state.mirror) {
        context.translate(target.width, 0);
        context.scale(-1, 1);
    }

    drawImageCover(context, els.video, 0, 0, target.width, target.height);
    context.restore();

    state.shots[index] = canvas.toDataURL("image/png", .96);
    state.finalDataUrl = "";
}

async function runCountdown() {
    for (let number = 3; number >= 1; number -= 1) {
        els.countdown.textContent = number;
        els.countdown.classList.add("show");
        playCountdownSound(number);
        await sleep(660);
        els.countdown.classList.remove("show");
        await sleep(150);
    }

    els.countdown.textContent = "Snap";
    els.countdown.classList.add("show");
    await sleep(230);
    els.countdown.classList.remove("show");
}

function updateUi() {
    const total = totalShots();
    const completed = state.shots.filter(Boolean).length;
    const stageOrder = ["setup", "capture", "retake", "background", "sticker"];
    const activeStageIndex = stageOrder.indexOf(state.stage);

    els.cameraWindow.classList.toggle("portrait-preview", state.orientation === "portrait");
    els.cameraWindow.classList.toggle("mirror-preview", state.mirror);
    els.mirrorToggle.checked = state.mirror;
    els.shotCounter.textContent = `${completed} / ${total}`;

    if (els.boothWorkspace) {
        els.boothWorkspace.dataset.stage = state.stage;
    }

    document.querySelectorAll("[data-stage-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.stagePanel !== state.stage;
    });

    document.querySelectorAll("[data-step]").forEach((step) => {
        step.classList.toggle("active", stageOrder.indexOf(step.dataset.step) <= activeStageIndex);
    });

    els.permissionLayer.hidden = !["setup", "capture"].includes(state.stage) || state.cameraReady;
    els.startCamera.disabled = state.isCapturing || state.stage !== "setup";
    els.startCamera.textContent = "Start";
    els.shutterButton.hidden = state.stage !== "capture";
    els.shutterButton.disabled = !state.cameraReady || state.isCapturing || state.currentShotIndex >= total;
    els.shutterButton.setAttribute(
        "aria-label",
        state.captureMode === "auto" ? "Start auto capture" : "Take photo"
    );
    els.retakeButton.disabled = state.isCapturing || state.selectedShotIndex === null;
    els.toBackgroundButton.disabled = state.isCapturing || !state.sessionComplete;
    els.toStickerButton.disabled = state.stage !== "background" || !state.sessionComplete || state.isRenderingStrip;
    els.downloadButton.disabled = state.stage !== "sticker" || !state.sessionComplete || state.isRenderingStrip;
    els.addLibraryButton.disabled = state.stage !== "sticker" || !state.sessionComplete || state.isRenderingStrip;
    els.restartBoothButton.disabled = state.isCapturing || state.isRenderingStrip;
    els.shotTray.hidden = !["capture", "retake"].includes(state.stage);
    els.backgroundTools.hidden = state.stage !== "background";
    els.stickerTools.hidden = state.stage !== "sticker";

    if (!state.sessionComplete) {
        els.retakeNote.textContent = completed ? "Finish all photos first." : "Choose a photo above.";
    } else if (state.selectedShotIndex === null) {
        els.retakeNote.textContent = "Choose a photo above.";
    } else {
        els.retakeNote.textContent = "Select photo to retake.";
    }
}

function updateShotTray() {
    els.shotTray.innerHTML = "";

    state.shots.forEach((shot, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `shot-tile ${state.orientation === "portrait" ? "portrait" : ""}`;
        button.classList.toggle("active", index === state.selectedShotIndex);
        button.setAttribute("aria-label", `Photo ${index + 1}`);

        if (shot) {
            const image = document.createElement("img");
            image.src = shot;
            image.alt = "";
            button.appendChild(image);
        } else {
            const placeholder = document.createElement("span");
            placeholder.className = "shot-empty";
            placeholder.textContent = index + 1;
            button.appendChild(placeholder);
        }

        button.addEventListener("click", () => {
            if (!state.sessionComplete || !state.shots[index]) return;
            playUiClickSound();
            state.selectedShotIndex = index;
            updateShotTray();
            updateUi();
        });

        els.shotTray.appendChild(button);
    });
}

function addStickerAtCenter(src) {
    const rect = els.stripPreview.getBoundingClientRect();

    addStickerAtPoint(src, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function addStickerAtPoint(src, clientX, clientY) {
    const point = getStripCanvasPoint(clientX, clientY);

    state.stickers.push({
        id: `placed-sticker-${stickerInstanceId += 1}`,
        src,
        x: point.x,
        y: point.y,
        size: clamp(DEFAULT_STICKER_SIZE, MIN_STICKER_SIZE, MAX_STICKER_SIZE)
    });
    state.selectedStickerId = state.stickers[state.stickers.length - 1].id;

    resetStripCustomizations();
    updateStickerLayer();
    updateUi();
}

function getStripCanvasPoint(clientX, clientY) {
    const rect = els.stripPreview.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width * STRIP_WIDTH, 0, STRIP_WIDTH);
    const y = clamp((clientY - rect.top) / rect.height * STRIP_HEIGHT, 0, STRIP_HEIGHT);

    return { x, y };
}

function updateStickerLayer() {
    if (!els.stickerLayer) return;

    els.stickerLayer.innerHTML = "";

    state.stickers.forEach((sticker) => {
        const button = document.createElement("div");
        const image = document.createElement("img");
        const widthPercent = sticker.size / STRIP_WIDTH * 100;

        button.className = "placed-sticker";
        button.classList.toggle("selected", sticker.id === state.selectedStickerId);
        button.dataset.stickerId = sticker.id;
        button.style.left = `${sticker.x / STRIP_WIDTH * 100}%`;
        button.style.top = `${sticker.y / STRIP_HEIGHT * 100}%`;
        button.style.width = `${widthPercent}%`;
        button.style.transform = "translate(-50%, -50%)";
        button.setAttribute("aria-label", "Move sticker");
        image.src = sticker.src;
        image.alt = "";
        button.appendChild(image);

        if (sticker.id === state.selectedStickerId) {
            const deleteButton = document.createElement("button");

            deleteButton.type = "button";
            deleteButton.className = "sticker-delete-button";
            deleteButton.textContent = "x";
            deleteButton.setAttribute("aria-label", "Delete sticker");
            deleteButton.addEventListener("pointerdown", (event) => {
                event.stopPropagation();
            });
            deleteButton.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                playUiClickSound();
                removeSticker(sticker.id);
            });
            button.appendChild(deleteButton);

            ["ne", "sw", "se"].forEach((corner) => {
                const resizeHandle = document.createElement("span");

                resizeHandle.className = "sticker-resize-handle";
                resizeHandle.dataset.corner = corner;
                resizeHandle.setAttribute("aria-hidden", "true");
                resizeHandle.addEventListener("pointerdown", (event) => startStickerResize(event, sticker.id, corner));
                button.appendChild(resizeHandle);
            });
        }

        button.addEventListener("pointerdown", (event) => startPlacedStickerDrag(event, sticker.id));
        button.addEventListener("dblclick", () => {
            playUiClickSound();
            removeSticker(sticker.id);
        });
        els.stickerLayer.appendChild(button);
    });
}

function removeSticker(stickerId) {
    state.stickers = state.stickers.filter((item) => item.id !== stickerId);

    if (state.selectedStickerId === stickerId) {
        state.selectedStickerId = null;
    }

    resetStripCustomizations();
    updateStickerLayer();
    updateUi();
}

function startPlacedStickerDrag(event, stickerId) {
    if (state.stage !== "sticker") return;

    const sticker = state.stickers.find((item) => item.id === stickerId);
    if (!sticker) return;

    const startPoint = getStripCanvasPoint(event.clientX, event.clientY);
    const startX = sticker.x;
    const startY = sticker.y;
    const target = event.currentTarget;

    event.preventDefault();
    state.selectedStickerId = stickerId;
    updateStickerLayer();
    playUiClickSound();
    const selectedTarget = els.stickerLayer.querySelector(`[data-sticker-id="${stickerId}"]`);
    if (!selectedTarget) return;

    selectedTarget.setPointerCapture(event.pointerId);

    function moveSticker(moveEvent) {
        const point = getStripCanvasPoint(moveEvent.clientX, moveEvent.clientY);

        sticker.x = clamp(startX + point.x - startPoint.x, 0, STRIP_WIDTH);
        sticker.y = clamp(startY + point.y - startPoint.y, 0, STRIP_HEIGHT);
        selectedTarget.style.left = `${sticker.x / STRIP_WIDTH * 100}%`;
        selectedTarget.style.top = `${sticker.y / STRIP_HEIGHT * 100}%`;
        state.finalDataUrl = "";
    }

    function stopStickerDrag(upEvent) {
        selectedTarget.releasePointerCapture(upEvent.pointerId);
        selectedTarget.removeEventListener("pointermove", moveSticker);
        selectedTarget.removeEventListener("pointerup", stopStickerDrag);
        selectedTarget.removeEventListener("pointercancel", stopStickerDrag);
        resetStripCustomizations();
    }

    selectedTarget.addEventListener("pointermove", moveSticker);
    selectedTarget.addEventListener("pointerup", stopStickerDrag);
    selectedTarget.addEventListener("pointercancel", stopStickerDrag);
}

function startStickerResize(event, stickerId, corner) {
    if (state.stage !== "sticker") return;

    const sticker = state.stickers.find((item) => item.id === stickerId);
    if (!sticker) return;

    const handle = event.currentTarget;
    const target = handle.closest(".placed-sticker");
    const startPoint = getStripCanvasPoint(event.clientX, event.clientY);
    const startSize = sticker.size;
    const startX = sticker.x;
    const startY = sticker.y;
    const horizontalSign = corner.includes("e") ? 1 : -1;
    const verticalSign = corner.includes("s") ? 1 : -1;

    event.preventDefault();
    event.stopPropagation();
    state.selectedStickerId = stickerId;
    playUiClickSound();
    handle.setPointerCapture(event.pointerId);

    function resizeSticker(moveEvent) {
        const point = getStripCanvasPoint(moveEvent.clientX, moveEvent.clientY);
        const deltaX = (point.x - startPoint.x) * horizontalSign;
        const deltaY = (point.y - startPoint.y) * verticalSign;
        const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        const newSize = clamp(startSize + delta * 2, MIN_STICKER_SIZE, MAX_STICKER_SIZE);
        const centerShift = (newSize - startSize) / 2;

        sticker.size = newSize;
        sticker.x = clamp(startX + centerShift * horizontalSign, 0, STRIP_WIDTH);
        sticker.y = clamp(startY + centerShift * verticalSign, 0, STRIP_HEIGHT);
        target.style.left = `${sticker.x / STRIP_WIDTH * 100}%`;
        target.style.top = `${sticker.y / STRIP_HEIGHT * 100}%`;
        target.style.width = `${sticker.size / STRIP_WIDTH * 100}%`;
        state.finalDataUrl = "";
    }

    function stopStickerResize(upEvent) {
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener("pointermove", resizeSticker);
        handle.removeEventListener("pointerup", stopStickerResize);
        handle.removeEventListener("pointercancel", stopStickerResize);
        resetStripCustomizations();
    }

    handle.addEventListener("pointermove", resizeSticker);
    handle.addEventListener("pointerup", stopStickerResize);
    handle.addEventListener("pointercancel", stopStickerResize);
}

async function renderFinalStripDataUrl(type = "image/png", quality = .92) {
    const wasStickerLayerHidden = els.stickerLayer.hidden;

    els.stickerLayer.hidden = true;

    try {
        await renderStripCanvas({ includeStickers: true });
        const imageUrl = type === "image/png"
            ? els.stripCanvas.toDataURL("image/png")
            : els.stripCanvas.toDataURL(type, quality);

        if (type === "image/png") {
            state.finalDataUrl = imageUrl;
        }

        return imageUrl;
    } finally {
        els.stickerLayer.hidden = wasStickerLayerHidden;
        void renderStripCanvas();
    }
}

async function addCurrentStripToLibrary() {
    if (state.stage !== "sticker" || !state.sessionComplete) return;

    const originalButtonText = els.addLibraryButton.textContent;

    els.addLibraryButton.disabled = true;
    els.addLibraryButton.textContent = "Adding...";

    try {
        const imageUrl = await renderFinalStripDataUrl("image/jpeg", .86);
        const libraryItems = loadLibraryItems();

        libraryItems.unshift({
            id: `library-${Date.now()}`,
            src: imageUrl,
            createdAt: Date.now()
        });

        if (!saveLibraryItems(libraryItems.slice(0, MAX_LIBRARY_ITEMS))) return;

        setSaveStatus("Added to library.");
        window.location.href = "library.html";
    } catch (error) {
        console.error(error);
        setSaveStatus("Could not add to library.");
    } finally {
        els.addLibraryButton.textContent = originalButtonText;
        updateUi();
    }
}

function loadLibraryItems() {
    try {
        const parsedItems = JSON.parse(localStorage.getItem(LIBRARY_STORAGE_KEY) || "[]");

        if (!Array.isArray(parsedItems)) return [];

        let didNormalize = false;
        const normalizedItems = parsedItems
            .filter((item) => item && typeof item.src === "string")
            .map((item, index) => {
                if (item.id) return item;

                didNormalize = true;
                return {
                    ...item,
                    id: `library-${item.createdAt || Date.now()}-${index}`
                };
            });

        if (didNormalize) {
            localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(normalizedItems));
        }

        return normalizedItems;
    } catch (error) {
        console.error(error);
        return [];
    }
}

function saveLibraryItems(items) {
    try {
        localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(items));
        return true;
    } catch (error) {
        console.error(error);
        setSaveStatus("Library is full. Save this photo to your computer.");
        return false;
    }
}

function deleteLibraryItem(itemId, itemIndex) {
    const confirmed = window.confirm("Bạn có chắc chắn muốn xóa ảnh này không?");

    if (!confirmed) return;

    const libraryItems = loadLibraryItems();
    const nextItems = libraryItems.filter((item, index) => {
        if (itemId) return item.id !== itemId;

        return index !== itemIndex;
    });

    saveLibraryItems(nextItems);

    if (activeLibraryPreview && (activeLibraryPreview.id === itemId || activeLibraryPreview.index === itemIndex)) {
        closeLibraryViewer();
    }

    renderLibraryItems();
}

function openLibraryViewer(item, index) {
    activeLibraryPreview = {
        id: item.id || "",
        src: item.src,
        createdAt: item.createdAt || Date.now(),
        index
    };

    els.libraryViewerImage.src = item.src;
    els.libraryViewer.hidden = false;
    document.body.classList.add("library-viewer-open");
    els.libraryViewerSave.focus();
}

function closeLibraryViewer() {
    activeLibraryPreview = null;
    els.libraryViewer.hidden = true;
    els.libraryViewerImage.removeAttribute("src");
    document.body.classList.remove("library-viewer-open");
}

function saveActiveLibraryPreview() {
    if (!activeLibraryPreview) return;

    triggerDownload(activeLibraryPreview.src, `lous-booth-library-${activeLibraryPreview.createdAt}.jpg`);
}

function stopLibraryPhysics() {
    if (libraryPhysics) {
        libraryPhysics.destroy();
        libraryPhysics = null;
    }

    if (libraryPhysicsObserver) {
        libraryPhysicsObserver.disconnect();
        libraryPhysicsObserver = null;
    }

    if (els.libraryStage) {
        els.libraryStage.classList.remove("has-physics");
    }
}

function isLibraryStageVisible() {
    const rect = els.libraryStage.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

function queueLibraryPhysics(items) {
    if (!items.length || !window.Matter) return false;

    els.libraryStage.classList.add("has-physics");

    if (libraryPhysics) {
        if (isLibraryStageVisible()) {
            libraryPhysics.addItems(items);
            return true;
        }

        if (libraryPhysicsObserver) {
            libraryPhysicsObserver.disconnect();
        }

        libraryPhysicsObserver = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;

            if (libraryPhysicsObserver) {
                libraryPhysicsObserver.disconnect();
                libraryPhysicsObserver = null;
            }

            libraryPhysics.addItems(items.filter((item) => document.body.contains(item)));
        }, { threshold: .24 });

        libraryPhysicsObserver.observe(els.libraryStage);
        return true;
    }

    const startPhysics = () => {
        const currentItems = Array.from(els.libraryStage.querySelectorAll(".library-item"));

        if (!currentItems.length || !currentItems.every((item) => document.body.contains(item))) return;

        if (libraryPhysicsObserver) {
            libraryPhysicsObserver.disconnect();
            libraryPhysicsObserver = null;
        }

        if (libraryPhysics) {
            libraryPhysics.addItems(currentItems);
            return;
        }

        libraryPhysics = new LibraryPhysicsScene(els.libraryStage, currentItems);
        libraryPhysics.init();
    };

    if (isLibraryStageVisible()) {
        requestAnimationFrame(startPhysics);
        return true;
    }

    if (libraryPhysicsObserver) {
        libraryPhysicsObserver.disconnect();
    }

    libraryPhysicsObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        requestAnimationFrame(startPhysics);
    }, { threshold: .24 });

    libraryPhysicsObserver.observe(els.libraryStage);
    return true;
}

class LibraryPhysicsScene {
    constructor(stage, items) {
        const { Engine, Runner } = window.Matter;

        this.stage = stage;
        this.items = items;
        this.uprightPull = .018;
        this.rotationDamping = .075;
        this.maxAngularVelocity = .12;
        this.engine = Engine.create();
        this.runner = Runner.create();
        this.world = this.engine.world;
        this.bodies = [];
        this.bodyByElement = new Map();
        this.boundaries = [];
        this.updateFrame = null;
        this.resizeFrame = null;
        this.handleResize = this.handleResize.bind(this);

        this.world.gravity.x = 0;
        this.world.gravity.y = 1.18;
    }

    init() {
        this.updateBoundaries();
        this.addItems(this.items);
        this.bindRenderLoop();

        window.addEventListener("resize", this.handleResize);
        window.Matter.Runner.run(this.runner, this.engine);
    }

    getStageSize() {
        const rect = this.stage.getBoundingClientRect();

        return {
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height)
        };
    }

    setBoundary(body, x, y, width, height, angle = 0) {
        const { Bodies, Body } = window.Matter;

        Body.setPosition(body, { x, y });
        Body.setVertices(body, Bodies.rectangle(x, y, width, height, { isStatic: true }).vertices);
        Body.setAngle(body, angle);
    }

    updateBoundaries() {
        const { Bodies, Composite } = window.Matter;
        const { width, height } = this.getStageSize();
        const wall = Math.max(120, width * .16);
        const groundY = height + wall / 2 - 8;

        if (!this.boundaries.length) {
            this.boundaries = [
                Bodies.rectangle(width / 2, groundY, width * 2, wall, { isStatic: true }),
                Bodies.rectangle(-wall / 2, height / 2, wall, height * 2.4, { isStatic: true }),
                Bodies.rectangle(width + wall / 2, height / 2, wall, height * 2.4, { isStatic: true })
            ];

            Composite.add(this.world, this.boundaries);
            return;
        }

        this.setBoundary(this.boundaries[0], width / 2, groundY, width * 2, wall);
        this.setBoundary(this.boundaries[1], -wall / 2, height / 2, wall, height * 2.4);
        this.setBoundary(this.boundaries[2], width + wall / 2, height / 2, wall, height * 2.4);
    }

    addItems(items) {
        const { Bodies, Body, Composite } = window.Matter;
        const { width } = this.getStageSize();
        const spawnTop = -Math.max(180, window.innerHeight * .24);
        const options = {
            restitution: .72,
            friction: .18,
            frictionAir: .008,
            density: .0017
        };
        const newItems = items.filter((item) => item && !this.bodyByElement.has(item));

        newItems.forEach((item, index) => {
            const rect = item.getBoundingClientRect();
            const bodyWidth = rect.width || 76;
            const bodyHeight = rect.height || bodyWidth * 3;
            const x = this.getRandomSpawnX(bodyWidth);
            const y = spawnTop - index * (Math.min(62, bodyHeight * .38) + Math.random() * 42);
            const body = Bodies.rectangle(x, y, bodyWidth, bodyHeight, options);
            const startAngle = ((Math.random() * 44 - 22) * Math.PI) / 180;

            body.el = item;
            body.baseWidth = bodyWidth;
            body.baseHeight = bodyHeight;

            Body.setAngle(body, startAngle);
            if (typeof Body.setCentre === "function") {
                Body.setCentre(body, { x: 0, y: bodyHeight * .18 }, true);
            }

            Body.setVelocity(body, {
                x: (Math.random() - .5) * 1.2,
                y: 0
            });
            Body.setAngularVelocity(body, (Math.random() - .5) * .07);

            item.style.width = `${bodyWidth}px`;
            item.style.opacity = "1";
            this.bodies.push(body);
            this.bodyByElement.set(item, body);
        });

        if (newItems.length) {
            Composite.add(this.world, newItems.map((item) => this.bodyByElement.get(item)));
        }
    }

    getRandomSpawnX(bodyWidth) {
        const { width } = this.getStageSize();
        const minX = bodyWidth / 2 + 16;
        const maxX = Math.max(minX, width - bodyWidth / 2 - 16);

        return minX + Math.random() * (maxX - minX);
    }

    removeItem(item) {
        const { Composite } = window.Matter;
        const body = this.bodyByElement.get(item);

        if (!body) return;

        Composite.remove(this.world, body);
        this.bodies = this.bodies.filter((candidate) => candidate !== body);
        this.bodyByElement.delete(item);
    }

    bindRenderLoop() {
        const { Body, Events } = window.Matter;

        this.updateFrame = () => {
            this.bodies.forEach((body) => {
                if (!body.el) return;

                const uprightAngle = this.getUprightAngle(body.angle);
                const nextAngularVelocity = clamp(
                    body.angularVelocity - uprightAngle * this.uprightPull - body.angularVelocity * this.rotationDamping,
                    -this.maxAngularVelocity,
                    this.maxAngularVelocity
                );

                if (Math.abs(body.angle - uprightAngle) > Math.PI * 2) {
                    Body.setAngle(body, uprightAngle);
                }

                Body.setAngularVelocity(body, nextAngularVelocity);
                body.el.style.left = `${body.position.x}px`;
                body.el.style.top = `${body.position.y}px`;
                body.el.style.transform = `translate(-50%, -50%) rotate(${uprightAngle}rad)`;
            });
        };

        Events.on(this.engine, "afterUpdate", this.updateFrame);
    }

    getUprightAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    handleResize() {
        if (this.resizeFrame) {
            cancelAnimationFrame(this.resizeFrame);
        }

        this.resizeFrame = requestAnimationFrame(() => {
            const { Body } = window.Matter;
            const { width, height } = this.getStageSize();

            this.updateBoundaries();

            this.bodies.forEach((body) => {
                const nextX = clamp(body.position.x, body.baseWidth / 2 + 8, width - body.baseWidth / 2 - 8);
                const nextY = Math.min(body.position.y, height - body.baseHeight / 2 - 8);

                Body.setPosition(body, { x: nextX, y: nextY });
            });
        });
    }

    destroy() {
        const { Composite, Events, Runner, Engine } = window.Matter;

        window.removeEventListener("resize", this.handleResize);

        if (this.resizeFrame) {
            cancelAnimationFrame(this.resizeFrame);
        }

        if (this.updateFrame) {
            Events.off(this.engine, "afterUpdate", this.updateFrame);
        }

        Runner.stop(this.runner);
        Composite.clear(this.world, false);
        Engine.clear(this.engine);
        this.bodies = [];
        this.bodyByElement.clear();
        this.stage.classList.remove("has-physics");
    }
}

function renderLibraryItems() {
    const libraryItems = loadLibraryItems();
    const activeIds = new Set(libraryItems.map((item) => item.id));
    const existingElements = new Map(
        Array.from(els.libraryStage.querySelectorAll(".library-item")).map((item) => [item.dataset.libraryId, item])
    );
    const newElements = [];

    els.libraryStage.querySelectorAll(".library-empty").forEach((item) => item.remove());

    existingElements.forEach((element, id) => {
        if (activeIds.has(id)) return;

        if (libraryPhysics) {
            libraryPhysics.removeItem(element);
        }

        element.remove();
    });

    if (!libraryItems.length) {
        stopLibraryPhysics();
        els.libraryStage.innerHTML = "";

        const emptyMessage = document.createElement("p");

        emptyMessage.className = "library-empty";
        emptyMessage.textContent = "No saved photos yet.";
        els.libraryStage.appendChild(emptyMessage);
        return;
    }

    libraryItems.forEach((item, index) => {
        let itemElement = existingElements.get(item.id);

        if (itemElement) {
            updateLibraryElementData(itemElement, item, index);
            return;
        }

        itemElement = createLibraryElement(item, index);
        els.libraryStage.appendChild(itemElement);
        newElements.push(itemElement);
    });

    if (!queueLibraryPhysics(newElements)) {
        newElements.forEach((button, index) => {
            animateLibraryDrop(button, index, Number(button.dataset.rotate) || 0);
        });
    }
}

function getLibraryPhotoSize(index = 0) {
    const sizeSteps = [74, 90, 106, 122, 138, 154, 170, 186];
    const baseWidth = sizeSteps[index % sizeSteps.length];
    const fluidWidth = (baseWidth / 11.2).toFixed(2);
    const maxWidth = baseWidth + 12;

    return `clamp(${baseWidth}px, ${fluidWidth}vw, ${maxWidth}px)`;
}

function createLibraryElement(item, index) {
    const itemElement = document.createElement("div");
    const previewButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const image = document.createElement("img");
    const x = 8 + Math.random() * 84;
    const bottom = 10 + Math.random() * 28;
    const rotate = Math.random() * 28 - 14;
    const photoSize = getLibraryPhotoSize(index);

    itemElement.className = "library-item";
    itemElement.style.setProperty("--library-x", `${x}%`);
    itemElement.style.setProperty("--library-bottom", `${bottom}px`);
    itemElement.style.setProperty("--library-rotate", `${rotate}deg`);
    itemElement.style.setProperty("--library-delay", "0s");
    itemElement.style.setProperty("--library-width", photoSize);
    itemElement.dataset.rotate = String(rotate);

    previewButton.type = "button";
    previewButton.className = "library-preview-button";
    previewButton.setAttribute("aria-label", "Open saved photo preview");
    image.alt = "";
    previewButton.appendChild(image);
    previewButton.addEventListener("click", () => {
        playUiClickSound();
        openLibraryViewer(itemElement.libraryItem, Number(itemElement.dataset.libraryIndex) || 0);
    });

    deleteButton.type = "button";
    deleteButton.className = "library-delete-button";
    deleteButton.textContent = "x";
    deleteButton.setAttribute("aria-label", "Delete saved photo");
    deleteButton.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
    });
    deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        playUiClickSound();
        deleteLibraryItem(itemElement.libraryItem.id, Number(itemElement.dataset.libraryIndex) || 0);
    });

    itemElement.append(previewButton, deleteButton);
    updateLibraryElementData(itemElement, item, index);

    return itemElement;
}

function updateLibraryElementData(itemElement, item, index) {
    const image = itemElement.querySelector("img");

    itemElement.libraryItem = item;
    itemElement.dataset.libraryId = item.id;
    itemElement.dataset.libraryIndex = String(index);

    if (image && image.src !== item.src) {
        image.src = item.src;
    }
}

function makeLibraryTransform(y, rotate, x = 0, scaleX = 1, scaleY = 1) {
    return `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`;
}

function animateLibraryDrop(button, index, rotate) {
    if (typeof button.animate !== "function") return;

    button.classList.add("uses-physics");

    requestAnimationFrame(() => {
        const stageRect = els.libraryStage.getBoundingClientRect();
        const buttonHeight = button.getBoundingClientRect().height || 120;
        const finalTop = button.offsetTop;
        const dropStart = -(finalTop + buttonHeight + Math.min(stageRect.height * .5, 360));
        const bounceHeight = Math.min(92, Math.max(44, stageRect.height * .14));
        const drift = ((index % 2 === 0 ? -1 : 1) * (10 + (index % 4) * 4));
        const animation = button.animate([
            {
                opacity: 0,
                transform: makeLibraryTransform(dropStart, rotate - 6, drift),
                offset: 0,
                easing: "cubic-bezier(.45, 0, 1, .62)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(dropStart * .94, rotate - 5, drift * .8),
                offset: .12,
                easing: "cubic-bezier(.45, 0, 1, .62)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(dropStart * .68, rotate - 3, drift * .55),
                offset: .3,
                easing: "cubic-bezier(.45, 0, 1, .62)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(dropStart * .28, rotate - 1, drift * .25),
                offset: .5,
                easing: "cubic-bezier(.45, 0, 1, .62)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(0, rotate + 2, 0, 1.035, .965),
                offset: .66,
                easing: "cubic-bezier(.16, .82, .22, 1)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(-bounceHeight, rotate - 1.5, 0, .99, 1.012),
                offset: .76,
                easing: "cubic-bezier(.55, 0, 1, .45)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(0, rotate + 1, 0, 1.018, .982),
                offset: .84,
                easing: "cubic-bezier(.18, .75, .26, 1)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(-bounceHeight * .38, rotate - .6),
                offset: .91,
                easing: "cubic-bezier(.55, 0, 1, .45)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(0, rotate + .3),
                offset: .96,
                easing: "cubic-bezier(.2, .7, .3, 1)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(-bounceHeight * .12, rotate),
                offset: .985,
                easing: "cubic-bezier(.55, 0, 1, .45)"
            },
            {
                opacity: 1,
                transform: makeLibraryTransform(0, rotate),
                offset: 1
            }
        ], {
            delay: Math.min(index * 80, 720),
            duration: 1750,
            fill: "both"
        });

        animation.addEventListener("finish", () => {
            button.classList.remove("uses-physics");
            button.classList.add("is-settled");
        }, { once: true });
    });
}

async function downloadStrip() {
    if (state.stage !== "sticker" || !state.sessionComplete) return;

    if (isFilePage()) {
        setSaveStatus("Open the local booth link to save.");
        return;
    }

    const originalButtonText = els.downloadButton.textContent;
    els.downloadButton.disabled = true;
    els.downloadButton.textContent = "Saving...";

    try {
        const imageUrl = state.finalDataUrl || await renderFinalStripDataUrl("image/png");
        state.finalDataUrl = imageUrl;
        triggerDownload(imageUrl, makeDownloadFilename());
        setSaveStatus("Photo saved.");
    } catch (error) {
        try {
            await renderFinalStripDataUrl("image/png");
            const blob = await canvasToBlob(els.stripCanvas, "image/png");
            const downloadUrl = URL.createObjectURL(blob);

            triggerDownload(downloadUrl, makeDownloadFilename());
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            setSaveStatus("Photo saved.");
        } catch (fallbackError) {
            console.error(error, fallbackError);
            setSaveStatus("Save failed. Try again.");
        }
    } finally {
        els.downloadButton.textContent = originalButtonText;
        updateUi();
    }
}

function triggerDownload(href, filename) {
    const link = document.createElement("a");

    link.href = href;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function makeDownloadFilename() {
    const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, "-");

    return `lous-booth-${timestamp}.png`;
}

function canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }

                reject(new Error("Could not create image file."));
            }, type);
        } catch (error) {
            reject(error);
        }
    });
}

function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (imageCache.has(src)) return imageCache.get(src);

    const promise = new Promise((resolve) => {
        const image = new Image();
        if (/^https?:/i.test(src)) {
            image.crossOrigin = "anonymous";
        }
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
    });

    imageCache.set(src, promise);
    return promise;
}

async function renderStripCanvas(options = {}) {
    const includeStickers = Boolean(options.includeStickers);
    const sequence = renderSequence += 1;
    const canvas = els.stripCanvas;
    const context = canvas.getContext("2d");
    const background = activeBackground();

    state.isRenderingStrip = true;
    updateUi();

    canvas.width = STRIP_WIDTH;
    canvas.height = STRIP_HEIGHT;

    try {
        await drawStripBackground(context, background);
        if (sequence !== renderSequence) return;

        const slots = getPhotoSlots();
        await drawPhotoSlots(context, slots);
        if (sequence !== renderSequence) return;

        drawBrand(context);

        if (includeStickers) {
            await drawStickers(context);
            if (sequence !== renderSequence) return;
        }

        if (state.sessionComplete && includeStickers && !isFilePage()) {
            try {
                state.finalDataUrl = canvas.toDataURL("image/png");
            } catch (error) {
                state.finalDataUrl = "";
                console.error(error);
            }
        }
    } finally {
        if (sequence === renderSequence) {
            state.isRenderingStrip = false;
            updateUi();
        }
    }
}

async function drawStickers(context) {
    if (!state.stickers.length) return;

    const stickerImages = await Promise.all(state.stickers.map((sticker) => loadImage(sticker.src)));

    state.stickers.forEach((sticker, index) => {
        const image = stickerImages[index];
        if (!image) return;

        const imageRatio = (image.naturalHeight || image.height) / (image.naturalWidth || image.width || 1);
        const width = sticker.size;
        const height = width * imageRatio;

        context.save();
        context.translate(sticker.x, sticker.y);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
    });
}

async function drawStripBackground(context, background) {
    const image = await loadImage(background.src);
    if (image) {
        drawImageCover(context, image, 0, 0, STRIP_WIDTH, STRIP_HEIGHT);
        return;
    }

    context.fillStyle = "#F8ECD3";
    context.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);
}

function getPhotoSlots() {
    const count = totalShots();
    const footerHeight = 154;
    const marginTop = state.orientation === "portrait" ? 64 : 50;
    const marginX = state.orientation === "portrait" ? 56 : 46;
    const slotWidth = STRIP_WIDTH - marginX * 2;
    const photoRatio = state.orientation === "portrait" ? 2 / 3 : 3 / 2;
    const slotHeight = slotWidth / photoRatio;
    const gap = count > 1
        ? (STRIP_HEIGHT - marginTop - footerHeight - slotHeight * count) / (count - 1)
        : 0;

    return Array.from({ length: count }, (_, index) => ({
        x: marginX,
        y: marginTop + index * (slotHeight + gap),
        width: slotWidth,
        height: slotHeight
    }));
}

async function drawPhotoSlots(context, slots) {
    const photoImages = await Promise.all(state.shots.map((shot) => loadImage(shot)));
    const filter = activeFilter();

    slots.forEach((slot, index) => {
        context.save();
        context.beginPath();
        context.rect(slot.x, slot.y, slot.width, slot.height);
        context.clip();

        const image = photoImages[index];
        if (image) {
            context.filter = filter.canvas;
            drawImageCover(context, image, slot.x, slot.y, slot.width, slot.height);
            context.filter = "none";
        } else {
            drawEmptyPhoto(context, slot, index);
        }

        context.restore();
    });
}

function drawEmptyPhoto(context, slot, index) {
    context.fillStyle = "#e4cfaa";
    context.fillRect(slot.x, slot.y, slot.width, slot.height);
    context.fillStyle = "rgba(144, 65, 77, .14)";

    for (let y = slot.y; y < slot.y + slot.height; y += 26) {
        context.fillRect(slot.x, y, slot.width, 2);
    }

    context.fillStyle = "#90414d";
    context.font = "700 42px Quicksand, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(index + 1, slot.x + slot.width / 2, slot.y + slot.height / 2);
}

function drawBrand(context) {
    context.save();
    context.shadowColor = "rgba(0, 0, 0, .22)";
    context.shadowBlur = 8;
    context.shadowOffsetY = 3;
    context.fillStyle = "#fff9ec";
    context.font = "70px 'Princess Sofia', cursive";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Lou's Booth", STRIP_WIDTH / 2, STRIP_HEIGHT - 76);
    context.restore();
}

function drawImageCover(context, source, x, y, width, height) {
    const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
    const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = width / height;
    let cropX = 0;
    let cropY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (sourceRatio > targetRatio) {
        cropWidth = sourceHeight * targetRatio;
        cropX = (sourceWidth - cropWidth) / 2;
    } else {
        cropHeight = sourceWidth / targetRatio;
        cropY = (sourceHeight - cropHeight) / 2;
    }

    context.drawImage(source, cropX, cropY, cropWidth, cropHeight, x, y, width, height);
}

function init() {
    setupChoices();
    setupActiveChoiceStates();
    resetShots();
    bindEvents();
    updateShotTray();
    if (els.libraryStage) {
        renderLibraryItems();
    }
    updateUi();
    void renderStripCanvas();

    if (document.fonts) {
        document.fonts.ready.then(() => renderStripCanvas());
    }
}

init();
