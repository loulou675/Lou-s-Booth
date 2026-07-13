const LIBRARY_STORAGE_KEY = "lous-booth-library";
const LIBRARY_ITEM_CATEGORY = 0x0002;
const LIBRARY_BOUNDARY_CATEGORY = 0x0004;
const LIBRARY_DRAG_CLICK_THRESHOLD = 8;

let libraryPhysics = null;
let activeLibraryPreview = null;
let libraryConfirmResolve = null;
let libraryConfirmPreviousFocus = null;

const els = {
    libraryStage: document.getElementById("libraryStage"),
    libraryViewer: document.getElementById("libraryViewer"),
    libraryViewerBackdrop: document.getElementById("libraryViewerBackdrop"),
    libraryViewerClose: document.getElementById("libraryViewerClose"),
    libraryViewerImage: document.getElementById("libraryViewerImage"),
    libraryViewerSave: document.getElementById("libraryViewerSave"),
    libraryViewerDelete: document.getElementById("libraryViewerDelete"),
    libraryConfirm: document.getElementById("libraryConfirm"),
    libraryConfirmBackdrop: document.getElementById("libraryConfirmBackdrop"),
    libraryConfirmCancel: document.getElementById("libraryConfirmCancel"),
    libraryConfirmDelete: document.getElementById("libraryConfirmDelete")
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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
        return false;
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

function suppressLibraryItemClick(itemElement) {
    itemElement.dataset.dragSuppress = "true";

    window.setTimeout(() => {
        delete itemElement.dataset.dragSuppress;
    }, 240);
}

function showLibraryConfirm() {
    if (!els.libraryConfirm) return Promise.resolve(false);

    if (libraryConfirmResolve) {
        closeLibraryConfirm(false);
    }

    libraryConfirmPreviousFocus = document.activeElement;
    els.libraryConfirm.hidden = false;
    document.body.classList.add("site-dialog-open");

    requestAnimationFrame(() => {
        els.libraryConfirmCancel?.focus({ preventScroll: true });
    });

    return new Promise((resolve) => {
        libraryConfirmResolve = resolve;
    });
}

function closeLibraryConfirm(confirmed) {
    if (!els.libraryConfirm || els.libraryConfirm.hidden) return;

    els.libraryConfirm.hidden = true;
    document.body.classList.remove("site-dialog-open");

    if (libraryConfirmPreviousFocus && typeof libraryConfirmPreviousFocus.focus === "function") {
        libraryConfirmPreviousFocus.focus({ preventScroll: true });
    }

    libraryConfirmPreviousFocus = null;

    if (!libraryConfirmResolve) return;

    const resolve = libraryConfirmResolve;

    libraryConfirmResolve = null;
    resolve(confirmed);
}

async function deleteLibraryItem(itemId, itemIndex) {
    const confirmed = await showLibraryConfirm();

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

async function deleteActiveLibraryPreview() {
    if (!activeLibraryPreview) return;

    await deleteLibraryItem(activeLibraryPreview.id, activeLibraryPreview.index);
}

function stopLibraryPhysics() {
    if (libraryPhysics) {
        libraryPhysics.destroy();
        libraryPhysics = null;
    }

    if (els.libraryStage) {
        els.libraryStage.classList.remove("has-physics");
    }
}

function queueLibraryPhysics(items) {
    if (!items.length || !window.Matter) return false;

    els.libraryStage.classList.add("has-physics");

    if (libraryPhysics) {
        libraryPhysics.addItems(items);
        return true;
    }

    libraryPhysics = new LibraryPhysicsScene(els.libraryStage, Array.from(els.libraryStage.querySelectorAll(".library-item")));
    libraryPhysics.init();
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
        this.mouse = null;
        this.mouseConstraint = null;
        this.handleMatterStartDrag = null;
        this.handleMatterEndDrag = null;
        this.updateFrame = null;
        this.resizeFrame = null;
        this.groundInset = 56;
        this.handleResize = this.handleResize.bind(this);

        this.world.gravity.x = 0;
        this.world.gravity.y = 1.18;
    }

    init() {
        this.updateBoundaries();
        this.addItems(this.items);
        this.bindRenderLoop();
        this.enableDrag();

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
        const wall = Math.max(140, width * .18);
        const groundTop = height - this.getGroundInset(height);
        const groundY = groundTop + wall / 2;
        const boundaryOptions = {
            isStatic: true,
            collisionFilter: {
                category: LIBRARY_BOUNDARY_CATEGORY,
                mask: 0xFFFFFFFF,
                group: 0
            }
        };

        if (!this.boundaries.length) {
            this.boundaries = [
                Bodies.rectangle(width / 2, groundY, width * 2.4, wall, boundaryOptions),
                Bodies.rectangle(-wall / 2, height / 2, wall, height * 2.8, boundaryOptions),
                Bodies.rectangle(width + wall / 2, height / 2, wall, height * 2.8, boundaryOptions)
            ];

            Composite.add(this.world, this.boundaries);
            return;
        }

        this.setBoundary(this.boundaries[0], width / 2, groundY, width * 2.4, wall);
        this.setBoundary(this.boundaries[1], -wall / 2, height / 2, wall, height * 2.8);
        this.setBoundary(this.boundaries[2], width + wall / 2, height / 2, wall, height * 2.8);
    }

    getGroundInset(height) {
        this.groundInset = Math.max(24, Math.min(48, height * .045));

        return this.groundInset;
    }

    addItems(items) {
        const { Bodies, Body, Composite } = window.Matter;
        const { height } = this.getStageSize();
        const spawnTop = -Math.max(220, height * .28);
        const options = {
            restitution: .74,
            friction: .2,
            frictionAir: .008,
            density: .0017,
            collisionFilter: {
                category: LIBRARY_ITEM_CATEGORY,
                mask: 0xFFFFFFFF,
                group: 0
            }
        };
        const newItems = items.filter((item) => item && !this.bodyByElement.has(item));

        newItems.forEach((item, index) => {
            const rect = item.getBoundingClientRect();
            const bodyWidth = rect.width || 80;
            const bodyHeight = rect.height || bodyWidth * 3;
            const x = this.getRandomSpawnX(bodyWidth);
            const y = spawnTop - index * (Math.min(70, bodyHeight * .38) + Math.random() * 52);
            const body = Bodies.rectangle(x, y, bodyWidth, bodyHeight, options);
            const startAngle = ((Math.random() * 48 - 24) * Math.PI) / 180;

            body.el = item;
            body.baseWidth = bodyWidth;
            body.baseHeight = bodyHeight;

            Body.setAngle(body, startAngle);
            Body.setVelocity(body, {
                x: (Math.random() - .5) * 1.35,
                y: 0
            });
            Body.setAngularVelocity(body, (Math.random() - .5) * .08);

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
        const minX = bodyWidth / 2 + 24;
        const maxX = Math.max(minX, width - bodyWidth / 2 - 24);

        return minX + Math.random() * (maxX - minX);
    }

    enableDrag() {
        if (!window.matchMedia("(pointer: fine)").matches) return;

        const { Body, Composite, Events, Mouse, MouseConstraint } = window.Matter;

        if (!Mouse || !MouseConstraint) return;

        this.mouse = Mouse.create(this.stage);
        this.mouseConstraint = MouseConstraint.create(this.engine, {
            mouse: this.mouse,
            collisionFilter: {
                category: 0x0001,
                mask: LIBRARY_ITEM_CATEGORY,
                group: 0
            },
            constraint: {
                stiffness: .2,
                damping: .08,
                render: {
                    visible: false
                }
            }
        });

        this.handleMatterStartDrag = (event) => {
            const body = event.body;

            if (!body || !body.el) return;

            body.el.classList.add("is-dragging");
            body.el.style.zIndex = "8";
            Body.setAngularVelocity(body, 0);
        };

        this.handleMatterEndDrag = (event) => {
            const body = event.body;

            if (!body || !body.el) return;

            body.el.classList.remove("is-dragging");
            body.el.style.zIndex = "";
        };

        Events.on(this.mouseConstraint, "startdrag", this.handleMatterStartDrag);
        Events.on(this.mouseConstraint, "enddrag", this.handleMatterEndDrag);
        Composite.add(this.world, this.mouseConstraint);
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
            const { width, height } = this.getStageSize();

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

                this.keepBodyInside(body, width, height);
                Body.setAngularVelocity(body, nextAngularVelocity);
                body.el.style.left = `${body.position.x}px`;
                body.el.style.top = `${body.position.y}px`;
                body.el.style.transform = `translate(-50%, -50%) rotate(${uprightAngle}rad)`;
            });
        };

        Events.on(this.engine, "afterUpdate", this.updateFrame);
    }

    keepBodyInside(body, width, height) {
        const { Body } = window.Matter;
        const minX = body.baseWidth / 2 + 8;
        const maxX = width - body.baseWidth / 2 - 8;
        const rescueY = height + body.baseHeight;

        if (body.position.x < minX || body.position.x > maxX) {
            Body.setPosition(body, {
                x: clamp(body.position.x, minX, maxX),
                y: body.position.y
            });
        }

        if (body.position.y > rescueY) {
            Body.setPosition(body, {
                x: this.getRandomSpawnX(body.baseWidth),
                y: -body.baseHeight
            });
            Body.setVelocity(body, { x: 0, y: 0 });
        }
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
                const nextY = Math.min(body.position.y, height - this.groundInset - body.baseHeight / 2);

                Body.setPosition(body, { x: nextX, y: nextY });
            });
        });
    }

    destroy() {
        const { Composite, Events, Runner, Engine, Mouse } = window.Matter;

        window.removeEventListener("resize", this.handleResize);

        if (this.resizeFrame) {
            cancelAnimationFrame(this.resizeFrame);
        }

        if (this.updateFrame) {
            Events.off(this.engine, "afterUpdate", this.updateFrame);
        }

        if (this.mouseConstraint) {
            Events.off(this.mouseConstraint, "startdrag", this.handleMatterStartDrag);
            Events.off(this.mouseConstraint, "enddrag", this.handleMatterEndDrag);
            Composite.remove(this.world, this.mouseConstraint);
        }

        if (this.mouse && Mouse && typeof Mouse.clearSourceEvents === "function") {
            Mouse.clearSourceEvents(this.mouse);
        }

        Runner.stop(this.runner);
        Composite.clear(this.world, false);
        Engine.clear(this.engine);
        this.bodies = [];
        this.bodyByElement.clear();
        this.mouse = null;
        this.mouseConstraint = null;
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
    const bottom = 28 + Math.random() * 18;
    const rotate = Math.random() * 28 - 14;
    const photoSize = getLibraryPhotoSize(index);

    itemElement.className = "library-item";
    itemElement.style.setProperty("--library-x", `${x}%`);
    itemElement.style.setProperty("--library-bottom", `${bottom}px`);
    itemElement.style.setProperty("--library-rotate", `${rotate}deg`);
    itemElement.style.setProperty("--library-delay", "0s");
    itemElement.style.setProperty("--library-width", photoSize);
    itemElement.dataset.rotate = String(rotate);

    let dragStart = null;

    itemElement.addEventListener("pointerdown", (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (event.button !== undefined && event.button !== 0) return;
        if (target && target.closest(".library-delete-button")) return;

        dragStart = {
            x: event.clientX,
            y: event.clientY
        };
    });

    itemElement.addEventListener("pointerup", (event) => {
        if (!dragStart) return;

        const distance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y);

        dragStart = null;

        if (distance > LIBRARY_DRAG_CLICK_THRESHOLD) {
            suppressLibraryItemClick(itemElement);
        }
    });

    itemElement.addEventListener("pointercancel", () => {
        dragStart = null;
    });

    previewButton.type = "button";
    previewButton.className = "library-preview-button";
    previewButton.draggable = false;
    previewButton.setAttribute("aria-label", "Open saved photo preview");
    image.alt = "";
    image.draggable = false;
    previewButton.appendChild(image);
    previewButton.addEventListener("click", (event) => {
        if (itemElement.dataset.dragSuppress === "true") {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

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

function bindLibraryEvents() {
    els.libraryViewerBackdrop.addEventListener("click", closeLibraryViewer);
    els.libraryViewerClose.addEventListener("click", closeLibraryViewer);
    els.libraryViewerSave.addEventListener("click", saveActiveLibraryPreview);
    els.libraryViewerDelete.addEventListener("click", deleteActiveLibraryPreview);
    els.libraryConfirmBackdrop.addEventListener("click", () => closeLibraryConfirm(false));
    els.libraryConfirmCancel.addEventListener("click", () => closeLibraryConfirm(false));
    els.libraryConfirmDelete.addEventListener("click", () => closeLibraryConfirm(true));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !els.libraryConfirm.hidden) {
            closeLibraryConfirm(false);
            return;
        }

        if (event.key !== "Escape" || els.libraryViewer.hidden) return;

        closeLibraryViewer();
    });
}

function initLibrary() {
    if (!els.libraryStage) return;

    bindLibraryEvents();
    renderLibraryItems();
}

initLibrary();
