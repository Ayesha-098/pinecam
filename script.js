document.addEventListener("DOMContentLoaded", () => {
  const previewCanvas = document.getElementById("previewCanvas");
  const ctx = previewCanvas.getContext("2d");
  const hiddenVideo = document.getElementById("hiddenVideo");
  const shutterBtn = document.getElementById("shutterBtn");
  const filterTrack = document.getElementById("filterTrack");

  // Toggles
  const lightLeakToggle = document.getElementById("lightLeakToggle");
  const grainToggle = document.getElementById("grainToggle");
  const flashToggle = document.getElementById("flashToggle");
  const timerToggle = document.getElementById("timerToggle");
  const vignetteToggle = document.getElementById("vignetteToggle");
  const dateStampToggle = document.getElementById("dateStampToggle");
  const flipCamBtn = document.getElementById("flipCamBtn");
  const downloadLatestBtn = document.getElementById("downloadLatestBtn");

  // Overlays
  const flashOverlay = document.getElementById("flashOverlay");
  const toast = document.getElementById("toast");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const recDot = document.getElementById("recDot");
  const recTimer = document.getElementById("recTimer");
  const liveDot = document.getElementById("liveDot");
  const filterHudTag = document.getElementById("filterHudTag");

  // Single Save Modal
  const singleSaveModal = document.getElementById("singleSaveModal");
  const singlePreviewImg = document.getElementById("singlePreviewImg");
  const closeSaveModal = document.getElementById("closeSaveModal");
  const discardSingleBtn = document.getElementById("discardSingleBtn");
  const confirmSaveSingleBtn = document.getElementById("confirmSaveSingleBtn");

  // Photobooth Elements
  const photoboothModal = document.getElementById("photoboothModal");
  const closePhotobooth = document.getElementById("closePhotobooth");
  const stripCanvas = document.getElementById("stripCanvas");
  const stripCtx = stripCanvas.getContext("2d");
  const frameColorRow = document.getElementById("frameColorRow");
  const downloadStripBtn = document.getElementById("downloadStripBtn");
  const retakeStripBtn = document.getElementById("retakeStripBtn");

  // State Variables
  let currentStream = null;
  let activeFilter = "cpm35";
  let activeMode = "photo";
  let lightLeaksEnabled = true;
  let grainEnabled = true;
  let flashEnabled = false;
  let timerDuration = 0;
  let isFacingUser = true;
  let vignetteEnabled = true;
  let dateStampEnabled = true;

  // Recording & Captures
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let recStartTime = 0;
  let recInterval = null;
  let pendingImageBlob = null;
  let lastCapturedBlob = null;
  let capturedBurstPhotos = [];
  let selectedFrameColor = "#ffffff";

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

  function renderLoop() {
    if (hiddenVideo.readyState === hiddenVideo.HAVE_ENOUGH_DATA) {
      previewCanvas.width = hiddenVideo.videoWidth;
      previewCanvas.height = hiddenVideo.videoHeight;

      const w = previewCanvas.width;
      const h = previewCanvas.height;

      ctx.save();

      if (isFacingUser) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }

      // Draw Video Base
      ctx.drawImage(hiddenVideo, 0, 0, w, h);
      ctx.restore();

      // Dazz Pixel Processing & Film Overlays
      applyDazzColorGrading(ctx, w, h, activeFilter);

      if (
        lightLeaksEnabled &&
        activeFilter !== "mono" &&
        activeFilter !== "grd"
      ) {
        applyDazzLightLeak(ctx, w, h);
      }
      if (vignetteEnabled) applyDazzVignette(ctx, w, h);
      if (grainEnabled) applyDazzGrain(ctx, w, h);
      if (dateStampEnabled) applyDazzDateStamp(ctx, w, h);

      updateHUDTime();
    }
    requestAnimationFrame(renderLoop);
  }

  // Multi-Filter Color Matrix
  function applyDazzColorGrading(context, w, h, preset) {
    const imgData = context.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      switch (preset) {
        case "cpm35": // Warm Kodak Film
          r = r * 1.25 + 15;
          g = g * 1.05 + 5;
          b = b * 0.82;
          break;

        case "mono": // Smooth Analog Black & White
          let m = 0.299 * r + 0.587 * g + 0.114 * b;
          r = g = b = m * 1.05;
          break;

        case "dclassic": // Early 2000s Green Tint CCD
          r = r * 0.88 + 5;
          g = g * 1.2 + 12;
          b = b * 0.92;
          break;

        case "classicFilm": // Desaturated 90s Grainy Film
          r = r * 1.08 + 10;
          g = g * 0.98 + 8;
          b = b * 0.88 + 12;
          break;

        case "instantC": // High-Contrast Polaroid
          r = r > 120 ? r * 1.15 : r * 0.85;
          g = g > 120 ? g * 1.08 : g * 0.9;
          b = b * 0.9 + 25;
          break;

        case "fx70": // Retro VHS RGB Shift
          r = r * 1.2 + 20;
          g = g * 0.85;
          b = b * 1.15 + 15;
          break;

        case "grd": // High-Contrast Street B&W
          let avg = 0.299 * r + 0.587 * g + 0.114 * b;
          avg = avg < 100 ? avg * 0.65 : avg * 1.3;
          r = g = b = Math.min(255, avg);
          break;

        case "fuji400": // Vibrant Green/Teal Tone
          r = r * 1.1 + 10;
          g = g * 1.05;
          b = b < 100 ? b * 1.3 + 15 : b * 0.85;
          break;

        case "sunset": // Golden Hour Wash
          r = r * 1.3 + 20;
          g = g * 1.1 + 10;
          b = b * 0.7;
          break;
      }

      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }

    context.putImageData(imgData, 0, 0);
  }

  function applyDazzLightLeak(context, w, h) {
    context.save();
    context.globalCompositeOperation = "screen";

    const g1 = context.createRadialGradient(0, 0, 10, 0, 0, w * 0.8);
    g1.addColorStop(0, "rgba(255, 120, 40, 0.65)");
    g1.addColorStop(0.5, "rgba(255, 50, 0, 0.25)");
    g1.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = g1;
    context.fillRect(0, 0, w, h);

    context.restore();
  }

  function applyDazzVignette(context, w, h) {
    context.save();
    context.globalCompositeOperation = "multiply";
    const grad = context.createRadialGradient(
      w / 2,
      h / 2,
      w * 0.3,
      w / 2,
      h / 2,
      w * 0.75,
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(10, 5, 8, 0.7)");
    context.fillStyle = grad;
    context.fillRect(0, 0, w, h);
    context.restore();
  }

  function applyDazzGrain(context, w, h) {
    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.08)";
    for (let i = 0; i < 900; i++) {
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
    context.shadowBlur = 6;
    context.fillText(dateStr, w - 165, h - 28);
    context.restore();
  }

  function updateHUDTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("hudTimestamp").textContent =
      `'${String(d.getFullYear()).slice(2)} ${pad(d.getMonth() + 1)} ${pad(d.getDate())}`;
  }

  // Toggles
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
    dateStampToggle.textContent = `Date Stamp: ${dateStampEnabled ? "ON" : "OFF"}`;
  });

  flipCamBtn.addEventListener("click", () => {
    isFacingUser = !isFacingUser;
    initCamera();
  });

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
    });
  });

  // Main Shutter Trigger
  shutterBtn.addEventListener("click", async () => {
    if (activeMode === "video") {
      if (!isRecording) startRecording();
      else stopRecording();
      return;
    }

    if (timerDuration > 0) await runCountdown(timerDuration);

    if (activeMode === "photobooth") {
      startPhotoboothSequence();
    } else {
      if (flashEnabled) triggerFlash();
      promptSaveSinglePhoto();
    }
  });

  // Video Engine
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
    lastCapturedBlob = blob;
    saveBlobToDevice(blob, `dazz-video-${Date.now()}.webm`);
  }

  // Single Photo Prompt Flow
  function promptSaveSinglePhoto() {
    previewCanvas.toBlob((blob) => {
      pendingImageBlob = blob;
      singlePreviewImg.src = URL.createObjectURL(blob);
      singleSaveModal.classList.remove("hidden");
    });
  }

  confirmSaveSingleBtn.addEventListener("click", () => {
    if (pendingImageBlob) {
      lastCapturedBlob = pendingImageBlob;
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

  downloadLatestBtn.addEventListener("click", () => {
    if (lastCapturedBlob) {
      const ext = lastCapturedBlob.type.includes("video") ? "webm" : "png";
      saveBlobToDevice(lastCapturedBlob, `dazz-export-${Date.now()}.${ext}`);
    } else {
      showToast("No capture history");
    }
  });

  // Photobooth Strip Engine
  async function startPhotoboothSequence() {
    capturedBurstPhotos = [];
    for (let i = 0; i < 4; i++) {
      await runCountdown(3);
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
      "DAZZ ANALOG STUDIO • PHOTOSTRIP",
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

  closePhotobooth.addEventListener("click", () =>
    photoboothModal.classList.add("hidden"),
  );
  retakeStripBtn.addEventListener("click", () => {
    photoboothModal.classList.add("hidden");
    startPhotoboothSequence();
  });

  downloadStripBtn.addEventListener("click", () => {
    stripCanvas.toBlob((blob) => {
      saveBlobToDevice(blob, `dazz-photostrip-${Date.now()}.png`);
    });
  });

  // Helpers
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
      const timer = setInterval(() => {
        count--;
        if (count > 0) {
          countdownOverlay.textContent = count;
        } else {
          clearInterval(timer);
          countdownOverlay.classList.add("hidden");
          resolve();
        }
      }, 700);
    });
  }

  async function saveBlobToDevice(blob, filename) {
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
