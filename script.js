document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const previewCanvas = document.getElementById("previewCanvas");
  const ctx = previewCanvas.getContext("2d");
  const hiddenVideo = document.getElementById("hiddenVideo");
  const shutterBtn = document.getElementById("shutterBtn");
  const filterTrack = document.getElementById("filterTrack");
  const viewfinderContainer = document.getElementById("viewfinderContainer");

  // Hardware & FX Toggles
  const lightLeakToggle = document.getElementById("lightLeakToggle");
  const grainToggle = document.getElementById("grainToggle");
  const flashToggle = document.getElementById("flashToggle");
  const timerToggle = document.getElementById("timerToggle");
  const vignetteToggle = document.getElementById("vignetteToggle");
  const dateStampToggle = document.getElementById("dateStampToggle");
  const flipCamBtn = document.getElementById("flipCamBtn");
  const aspectBtn = document.getElementById("aspectBtn");
  const wbBtn = document.getElementById("wbBtn");
  const leakAngleBtn = document.getElementById("leakAngleBtn");
  const isoSlider = document.getElementById("isoSlider");
  const focusSlider = document.getElementById("focusSlider");

  // Viewfinder HUD Elements
  const flashOverlay = document.getElementById("flashOverlay");
  const toast = document.getElementById("toast");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const timerLed = document.getElementById("timerLed");
  const recDot = document.getElementById("recDot");
  const recTimer = document.getElementById("recTimer");
  const liveDot = document.getElementById("liveDot");
  const filterHudTag = document.getElementById("filterHudTag");
  const wbHudTag = document.getElementById("wbHudTag");

  // Single Photo Save Modal
  const singleSaveModal = document.getElementById("singleSaveModal");
  const singlePreviewImg = document.getElementById("singlePreviewImg");
  const closeSaveModal = document.getElementById("closeSaveModal");
  const discardSingleBtn = document.getElementById("discardSingleBtn");
  const confirmSaveSingleBtn = document.getElementById("confirmSaveSingleBtn");

  // Photobooth Studio Modal
  const photoboothModal = document.getElementById("photoboothModal");
  const closePhotobooth = document.getElementById("closePhotobooth");
  const stripCanvas = document.getElementById("stripCanvas");
  const stripCtx = stripCanvas.getContext("2d");
  const frameColorRow = document.getElementById("frameColorRow");
  const stripTextInput = document.getElementById("stripTextInput");
  const downloadStripBtn = document.getElementById("downloadStripBtn");
  const retakeStripBtn = document.getElementById("retakeStripBtn");

  // Gallery Drawer Elements
  const openGalleryBtn = document.getElementById("openGalleryBtn");
  const galleryModal = document.getElementById("galleryModal");
  const closeGalleryModal = document.getElementById("closeGalleryModal");
  const galleryGrid = document.getElementById("galleryGrid");
  const emptyGalleryMsg = document.getElementById("emptyGalleryMsg");

  // --- Web Audio Synthesizer (Zero External Assets Required) ---
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playShutterSound() {
    if (audioCtx.state === "suspended") audioCtx.resume();

    // Mechanical click oscillation
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      0.01,
      audioCtx.currentTime + 0.12,
    );

    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);

    if ("vibrate" in navigator) navigator.vibrate([20, 40, 20]);
  }

  // --- State Variables ---
  let currentStream = null;
  let activeFilter = "cpm35";
  let activeMode = "photo"; // photo, video, photobooth, double
  let lightLeaksEnabled = true;
  let grainEnabled = true;
  let flashEnabled = false;
  let timerDuration = 0;
  let isFacingUser = true;
  let vignetteEnabled = true;
  let dateStampEnabled = true;
  let currentAspect = "4:3";
  let currentWB = "5500K";
  let leakAngle = 0; // 0, 90, 180, 270 degrees
  let isoValue = 400;
  let focusBlur = 0;

  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recStartTime = 0;
  let recInterval = null;

  let pendingImageBlob = null;
  let capturedBurstPhotos = [];
  let selectedFrameColor = "#ffffff";
  let storedGalleryBlobs = [];
  let doubleExposureFirstFrame = null;

  // --- Fast GPU-Accelerated Filter Mapping ---
  const filterStyles = {
    cpm35: "sepia(0.35) contrast(1.15) saturate(1.25) hue-rotate(-10deg)",
    mono: "grayscale(1) contrast(1.3) brightness(0.95)",
    dclassic: "hue-rotate(30deg) saturate(1.1) contrast(1.05)",
    classicFilm: "sepia(0.25) contrast(1.05) saturate(0.9) brightness(1.05)",
    instantC: "contrast(1.2) saturate(1.3) brightness(1.1) sepia(0.15)",
    fx70: "hue-rotate(-20deg) contrast(1.25) saturate(1.4)",
    grd: "grayscale(1) contrast(1.8) brightness(0.9)",
    fuji400: "hue-rotate(15deg) saturate(1.15) contrast(1.1)",
    sunset: "sepia(0.5) saturate(1.6) contrast(1.1)",
  };

  // --- Camera Initialization ---
  async function initCamera() {
    try {
      if (currentStream)
        currentStream.getTracks().forEach((track) => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: isFacingUser ? "user" : "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      currentStream = stream;
      hiddenVideo.srcObject = stream;
      hiddenVideo.play();
      requestAnimationFrame(renderLoop);
    } catch (err) {
      showToast("Camera & Audio Access Required");
    }
  }

  // --- High-Performance Render Loop ---
  function renderLoop() {
    if (hiddenVideo.readyState === hiddenVideo.HAVE_ENOUGH_DATA) {
      if (previewCanvas.width !== hiddenVideo.videoWidth) {
        previewCanvas.width = hiddenVideo.videoWidth;
        previewCanvas.height = hiddenVideo.videoHeight;
      }

      const w = previewCanvas.width;
      const h = previewCanvas.height;

      // Build CSS Filter string dynamically to offload execution to GPU
      let filterString = filterStyles[activeFilter] || "";
      if (focusBlur > 0) filterString += ` blur(${focusBlur}px)`;
      if (isoValue > 400)
        filterString += ` brightness(${1 + (isoValue - 400) / 2000})`;
      if (currentWB === "Tungsten")
        filterString += " sepia(0.3) hue-rotate(-15deg)";
      if (currentWB === "Fluorescent")
        filterString += " hue-rotate(20deg) saturate(0.9)";

      ctx.filter = filterString;

      ctx.save();
      if (isFacingUser) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(hiddenVideo, 0, 0, w, h);
      ctx.restore();

      // Reset filter context for custom overlays
      ctx.filter = "none";

      // Double Exposure Dynamic Overlay
      if (doubleExposureFirstFrame) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = "screen";
        ctx.drawImage(doubleExposureFirstFrame, 0, 0, w, h);
        ctx.restore();
      }

      // Fast Light Leak Overlays
      if (
        lightLeaksEnabled &&
        activeFilter !== "mono" &&
        activeFilter !== "grd"
      ) {
        applyDazzLightLeak(ctx, w, h, leakAngle);
      }
      if (vignetteEnabled) applyDazzVignette(ctx, w, h);
      if (grainEnabled) applyDazzGrain(ctx, w, h);
      if (dateStampEnabled) applyDazzDateStamp(ctx, w, h);

      updateHUDTime();
    }
    requestAnimationFrame(renderLoop);
  }

  // --- Analog Effects ---
  function applyDazzLightLeak(context, w, h, angle) {
    context.save();
    context.globalCompositeOperation = "screen";

    let cx = 0,
      cy = 0;
    if (angle === 90) cx = w;
    else if (angle === 180) {
      cx = w;
      cy = h;
    } else if (angle === 270) cy = h;

    const grad = context.createRadialGradient(cx, cy, 10, cx, cy, w * 0.85);
    grad.addColorStop(0, "rgba(255, 120, 40, 0.55)");
    grad.addColorStop(0.5, "rgba(255, 50, 0, 0.2)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = grad;
    context.fillRect(0, 0, w, h);
    context.restore();
  }

  function applyDazzVignette(context, w, h) {
    context.save();
    context.globalCompositeOperation = "multiply";
    const grad = context.createRadialGradient(
      w / 2,
      h / 2,
      w * 0.35,
      w / 2,
      h / 2,
      w * 0.8,
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(10, 5, 8, 0.65)");
    context.fillStyle = grad;
    context.fillRect(0, 0, w, h);
    context.restore();
  }

  function applyDazzGrain(context, w, h) {
    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let i = 0; i < 400; i++) {
      context.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    context.restore();
  }

  function applyDazzDateStamp(context, w, h) {
    context.save();
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `'${String(d.getFullYear()).slice(2)} ${pad(d.getMonth() + 1)} ${pad(d.getDate())}`;
    context.font = '700 24px "Share Tech Mono", monospace';
    context.fillStyle = "#ff9e3b";
    context.shadowColor = "#000";
    context.shadowBlur = 4;
    context.fillText(dateStr, w - 165, h - 28);
    context.restore();
  }

  function updateHUDTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("hudTimestamp").textContent =
      `'${String(d.getFullYear()).slice(2)} ${pad(d.getMonth() + 1)} ${pad(d.getDate())}`;
  }

  // --- Dynamic Slider Controls ---
  isoSlider.addEventListener(
    "input",
    (e) => (isoValue = parseInt(e.target.value)),
  );
  focusSlider.addEventListener(
    "input",
    (e) => (focusBlur = parseFloat(e.target.value)),
  );

  // --- Hardware Action Bar Handlers ---
  aspectBtn.addEventListener("click", () => {
    if (currentAspect === "4:3") {
      currentAspect = "1:1";
      viewfinderContainer.style.aspectRatio = "1 / 1";
    } else if (currentAspect === "1:1") {
      currentAspect = "16:9";
      viewfinderContainer.style.aspectRatio = "16 / 9";
    } else {
      currentAspect = "4:3";
      viewfinderContainer.style.aspectRatio = "4 / 3";
    }
    aspectBtn.textContent = `Ratio: ${currentAspect}`;
  });

  wbBtn.addEventListener("click", () => {
    if (currentWB === "5500K") currentWB = "Tungsten";
    else if (currentWB === "Tungsten") currentWB = "Fluorescent";
    else currentWB = "5500K";

    wbBtn.textContent = `WB: ${currentWB}`;
    wbHudTag.textContent = currentWB;
  });

  leakAngleBtn.addEventListener("click", () => {
    leakAngle = (leakAngle + 90) % 360;
    const arrows = { 0: "↗️", 90: "↘️", 180: "↙️", 270: "↖️" };
    leakAngleBtn.textContent = `Leak: ${arrows[leakAngle]}`;
  });

  lightLeakToggle.addEventListener("click", () => {
    lightLeaksEnabled = !lightLeaksEnabled;
    lightLeakToggle.classList.toggle("active", lightLeaksEnabled);
  });

  grainToggle.addEventListener("click", () => {
    grainEnabled = !grainEnabled;
    grainToggle.classList.toggle("active", grainEnabled);
  });

  flashToggle.addEventListener("click", () => {
    flashEnabled = !flashEnabled;
    flashToggle.classList.toggle("active", flashEnabled);
    flashToggle.textContent = flashEnabled ? "⚡ ON" : "⚡ OFF";
  });

  timerToggle.addEventListener("click", () => {
    timerDuration = timerDuration === 0 ? 3 : timerDuration === 3 ? 5 : 0;
    timerToggle.textContent = `⏱️ ${timerDuration}s`;
    timerToggle.classList.toggle("active", timerDuration > 0);
  });

  vignetteToggle.addEventListener("click", () => {
    vignetteEnabled = !vignetteEnabled;
    vignetteToggle.classList.toggle("active", vignetteEnabled);
    vignetteToggle.textContent = `Vignette: ${vignetteEnabled ? "HEAVY" : "OFF"}`;
  });

  dateStampToggle.addEventListener("click", () => {
    dateStampEnabled = !dateStampEnabled;
    dateStampToggle.classList.toggle("active", dateStampEnabled);
    dateStampToggle.textContent = `Date: ${dateStampEnabled ? "ON" : "OFF"}`;
  });

  flipCamBtn.addEventListener("click", () => {
    isFacingUser = !isFacingUser;
    initCamera();
  });

  // Filter Selector
  filterTrack.addEventListener("click", (e) => {
    if (e.target.classList.contains("filter-chip")) {
      document
        .querySelectorAll(".filter-chip")
        .forEach((c) => c.classList.remove("active"));
      e.target.classList.add("active");
      activeFilter = e.target.dataset.filter;
      filterHudTag.textContent = activeFilter.toUpperCase();
    }
  });

  // Camera Mode Switcher
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isRecording) stopRecording();
      document
        .querySelectorAll(".mode-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeMode = btn.dataset.mode;
      document.getElementById("hudModeTag").textContent =
        activeMode.toUpperCase();
      doubleExposureFirstFrame = null;
    });
  });

  // --- Main Shutter Click Execution ---
  shutterBtn.addEventListener("click", async () => {
    if (activeMode === "video") {
      if (!isRecording) startRecording();
      else stopRecording();
      return;
    }

    if (timerDuration > 0) await runCountdown(timerDuration);
    playShutterSound();

    if (activeMode === "photobooth") {
      startPhotoboothSequence();
    } else if (activeMode === "double") {
      if (!doubleExposureFirstFrame) {
        doubleExposureFirstFrame = document.createElement("canvas");
        doubleExposureFirstFrame.width = previewCanvas.width;
        doubleExposureFirstFrame.height = previewCanvas.height;
        doubleExposureFirstFrame
          .getContext("2d")
          .drawImage(previewCanvas, 0, 0);
        showToast("Frame 1 Saved! Take Frame 2");
      } else {
        if (flashEnabled) triggerFlash();
        promptSaveSinglePhoto();
        doubleExposureFirstFrame = null;
      }
    } else {
      if (flashEnabled) triggerFlash();
      promptSaveSinglePhoto();
    }
  });

  // --- Video Recording Logic ---
  function startRecording() {
    recordedChunks = [];
    const stream = previewCanvas.captureStream(30);
    if (currentStream && currentStream.getAudioTracks().length > 0) {
      stream.addTrack(currentStream.getAudioTracks()[0]);
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = saveVideo;

    mediaRecorder.start();
    isRecording = true;
    shutterBtn.classList.add("recording");
    recDot.classList.remove("hidden");
    liveDot.classList.add("hidden");

    recStartTime = Date.now();
    recInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      recTimer.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopRecording() {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    isRecording = false;
    shutterBtn.classList.remove("recording");
    recDot.classList.add("hidden");
    liveDot.classList.remove("hidden");
    clearInterval(recInterval);
  }

  function saveVideo() {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    addBlobToGallery(blob);
    saveBlobToDevice(blob, `dazz-video-${Date.now()}.webm`);
  }

  // --- Single Photo Workflow ---
  function promptSaveSinglePhoto() {
    previewCanvas.toBlob((blob) => {
      pendingImageBlob = blob;
      singlePreviewImg.src = URL.createObjectURL(blob);
      singleSaveModal.classList.remove("hidden");
    });
  }

  confirmSaveSingleBtn.addEventListener("click", () => {
    if (pendingImageBlob) {
      addBlobToGallery(pendingImageBlob);
      saveBlobToDevice(pendingImageBlob, `dazz-photo-${Date.now()}.png`);
      pendingImageBlob = null;
    }
    singleSaveModal.classList.add("hidden");
  });

  discardSingleBtn.addEventListener("click", () => {
    pendingImageBlob = null;
    singleSaveModal.classList.add("hidden");
    showToast("Capture Discarded");
  });

  closeSaveModal.addEventListener("click", () =>
    singleSaveModal.classList.add("hidden"),
  );

  // --- Photobooth Strip Workflow ---
  async function startPhotoboothSequence() {
    capturedBurstPhotos = [];
    for (let i = 0; i < 4; i++) {
      await runCountdown(3);
      playShutterSound();
      if (flashEnabled) triggerFlash();

      const snapCanvas = document.createElement("canvas");
      snapCanvas.width = previewCanvas.width;
      snapCanvas.height = previewCanvas.height;
      const snapCtx = snapCanvas.getContext("2d");
      snapCtx.drawImage(previewCanvas, 0, 0);
      capturedBurstPhotos.push(snapCanvas);
    }
    renderPhotoStrip();
    photoboothModal.classList.remove("hidden");
  }

  function renderPhotoStrip() {
    if (capturedBurstPhotos.length < 4) return;
    const targetW = 400;
    const targetH = 300;
    const margin = 16;
    const topPadding = 18;
    const bottomPadding = 46;

    stripCanvas.width = targetW + margin * 2;
    stripCanvas.height = topPadding + targetH * 4 + margin * 3 + bottomPadding;

    stripCtx.fillStyle = selectedFrameColor;
    stripCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);

    capturedBurstPhotos.forEach((sourceCanvas, idx) => {
      const destX = margin;
      const destY = topPadding + idx * (targetH + margin);
      stripCtx.drawImage(
        sourceCanvas,
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height,
        destX,
        destY,
        targetW,
        targetH,
      );
    });

    const isDark = selectedFrameColor === "#1e1e24";
    stripCtx.fillStyle = isDark ? "#ffffff" : "#1c1c20";
    stripCtx.font = '700 13px "JetBrains Mono", monospace';
    stripCtx.textAlign = "center";
    stripCtx.fillText(
      stripTextInput.value.toUpperCase(),
      stripCanvas.width / 2,
      stripCanvas.height - 18,
    );
  }

  frameColorRow.addEventListener("click", (e) => {
    if (e.target.classList.contains("color-dot")) {
      document
        .querySelectorAll(".color-dot")
        .forEach((d) => d.classList.remove("active"));
      e.target.classList.add("active");
      selectedFrameColor = e.target.dataset.color;
      renderPhotoStrip();
    }
  });

  stripTextInput.addEventListener("input", renderPhotoStrip);
  closePhotobooth.addEventListener("click", () =>
    photoboothModal.classList.add("hidden"),
  );

  retakeStripBtn.addEventListener("click", () => {
    photoboothModal.classList.add("hidden");
    startPhotoboothSequence();
  });

  downloadStripBtn.addEventListener("click", () => {
    stripCanvas.toBlob((blob) => {
      addBlobToGallery(blob);
      saveBlobToDevice(blob, `dazz-photostrip-${Date.now()}.png`);
    });
  });

  // --- Gallery Drawer Workflow ---
  openGalleryBtn.addEventListener("click", () => {
    renderGalleryGrid();
    galleryModal.classList.remove("hidden");
  });

  closeGalleryModal.addEventListener("click", () =>
    galleryModal.classList.add("hidden"),
  );

  function addBlobToGallery(blob) {
    storedGalleryBlobs.unshift({ id: Date.now(), blob });
  }

  function renderGalleryGrid() {
    galleryGrid.innerHTML = "";
    if (storedGalleryBlobs.length === 0) {
      emptyGalleryMsg.classList.remove("hidden");
      galleryGrid.appendChild(emptyGalleryMsg);
      return;
    }

    storedGalleryBlobs.forEach((item) => {
      const url = URL.createObjectURL(item.blob);
      const isVid = item.blob.type.includes("video");

      let el;
      if (isVid) {
        el = document.createElement("video");
        el.src = url;
        el.muted = true;
      } else {
        el = document.createElement("img");
        el.src = url;
      }
      el.classList.add("gallery-item");
      el.addEventListener("click", () => {
        const ext = isVid ? "webm" : "png";
        saveBlobToDevice(item.blob, `dazz-export-${item.id}.${ext}`);
      });
      galleryGrid.appendChild(el);
    });
  }

  // --- Utility Functions ---
  function triggerFlash() {
    flashOverlay.classList.add("active");
    setTimeout(() => flashOverlay.classList.remove("active"), 200);
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function runCountdown(seconds) {
    return new Promise((resolve) => {
      let count = seconds;
      countdownOverlay.textContent = count;
      countdownOverlay.classList.remove("hidden");
      timerLed.classList.remove("hidden");

      const timer = setInterval(() => {
        count--;
        if (count > 0) {
          countdownOverlay.textContent = count;
        } else {
          clearInterval(timer);
          countdownOverlay.classList.add("hidden");
          timerLed.classList.add("hidden");
          resolve();
        }
      }, 700);
    });
  }

  function saveBlobToDevice(blob, filename) {
    if (!blob) return;
    try {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        showToast("Saved to device!");
      }, 400);
    } catch (err) {
      showToast("Export failed!");
    }
  }

  initCamera();
});
