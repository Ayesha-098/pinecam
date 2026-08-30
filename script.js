(function () {
  "use strict";

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // DOM Elements
  const liveCanvas = document.getElementById("liveCanvas");
  const offscreenCanvas = document.getElementById("offscreenCanvas");
  const liveCtx = liveCanvas
    ? liveCanvas.getContext("2d", { willReadFrequently: true })
    : null;
  const offCtx = offscreenCanvas
    ? offscreenCanvas.getContext("2d", { willReadFrequently: true })
    : null;

  const videoRecordCanvas = document.createElement("canvas");
  const videoRecordCtx = videoRecordCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  const flashOverlay = document.getElementById("flashOverlay");
  const toastEl = document.getElementById("toast");
  const gridOverlay = document.getElementById("gridOverlay");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const countdownNumber = document.getElementById("countdownNumber");

  const hudMode = document.getElementById("hudMode");
  const recIndicator = document.getElementById("recIndicator");
  const recTimer = document.getElementById("recTimer");
  const hudFilter = document.getElementById("hudFilter");
  const cameraHardwareInfo = document.getElementById("cameraHardwareInfo");

  const filterTrack = document.getElementById("filterTrack");
  const modePhoto = document.getElementById("modePhoto");
  const modeVideo = document.getElementById("modeVideo");
  const btnShutter = document.getElementById("btnShutter");
  const btnSwitchCam = document.getElementById("btnSwitchCam");
  const btnGallery = document.getElementById("btnGallery");
  const galleryThumb = document.getElementById("galleryThumb");
  const btnQuickFlash = document.getElementById("btnQuickFlash");
  const btnQuickTimer = document.getElementById("btnQuickTimer");
  const zoomControls = document.getElementById("zoomControls");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomOut = document.getElementById("btnZoomOut");
  const zoomLevel = document.getElementById("zoomLevel");
  const btnSettings = document.getElementById("btnSettings");
  const btnUpload = document.getElementById("btnUpload");
  const fileInput = document.getElementById("fileInput");

  // Modals & Controls
  const photoResultModal = document.getElementById("photoResultModal");
  const resultImage = document.getElementById("resultImage");
  const btnRetakePhoto = document.getElementById("btnRetakePhoto");
  const btnSavePhoto = document.getElementById("btnSavePhoto");
  const btnDeletePhoto = document.getElementById("btnDeletePhoto");

  const videoResultModal = document.getElementById("videoResultModal");
  const resultVideo = document.getElementById("resultVideo");
  const btnRetakeVideo = document.getElementById("btnRetakeVideo");
  const btnSaveVideo = document.getElementById("btnSaveVideo");
  const btnDeleteVideo = document.getElementById("btnDeleteVideo");

  const galleryModal = document.getElementById("galleryModal");
  const btnCloseGallery = document.getElementById("btnCloseGallery");
  const galleryGrid = document.getElementById("galleryGrid");
  const galleryDetail = document.getElementById("galleryDetail");
  const galleryCount = document.getElementById("galleryCount");
  const detailImg = document.getElementById("detailImg");
  const detailVid = document.getElementById("detailVid");
  const btnDetailPrev = document.getElementById("btnDetailPrev");
  const btnDetailNext = document.getElementById("btnDetailNext");
  const btnDetailDownload = document.getElementById("btnDetailDownload");
  const btnDetailDelete = document.getElementById("btnDetailDelete");

  const settingsModal = document.getElementById("settingsModal");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const settingFlash = document.getElementById("settingFlash");
  const settingTimer = document.getElementById("settingTimer");
  const settingMirrorPreview = document.getElementById("settingMirrorPreview");
  const settingMirrorPhoto = document.getElementById("settingMirrorPhoto");
  const settingGrid = document.getElementById("settingGrid");
  const settingDateStamp = document.getElementById("settingDateStamp");
  const settingDateFormat = document.getElementById("settingDateFormat");
  const settingGrain = document.getElementById("settingGrain");
  const settingSound = document.getElementById("settingSound");
  const settingHaptics = document.getElementById("settingHaptics");

  // App State
  let currentStream = null;
  const videoElement = document.createElement("video");
  videoElement.setAttribute("playsinline", "");
  videoElement.setAttribute("muted", "");
  videoElement.muted = true;

  let state = {
    mode: "photo",
    facingMode: "environment",
    filter: "cybershot",
    flash: "off",
    timer: 0,
    previewMirror: true,
    captureMirror: false,
    grid: false,
    dateStamp: true,
    dateFormat: "YYMMDD",
    grain: "med",
    sound: true,
    haptics: true,
    zoom: 1.0,
    maxZoom: 1.0,
    isRecording: false,
    recordedChunks: [],
    recStartTime: 0,
    recInterval: null,
    pendingPhotoBlob: null,
    pendingVideoBlob: null,
    galleryItems: [],
    detailIndex: -1,
    zoom: 1.0,
    maxZoom: 4.0,
  };

  const FILTERS = [
    { id: "cybershot", name: "Cyber-shot (Y2K)" },
    { id: "y2kflash", name: "Direct Flash" },
    { id: "ixus_cool", name: "IXUS Cool Cyan" },
    { id: "ccd_sunset", name: "CCD Sunset" },
    { id: "vhs", name: "Analog VHS" },
    { id: "disposable", name: "Disposable 35mm" },
    { id: "original", name: "Original" },
  ];

  function calculate4to3Crop(srcWidth, srcHeight) {
    const targetAspect = 4 / 3;
    let cropWidth = srcWidth;
    let cropHeight = srcHeight;
    let cropX = 0;
    let cropY = 0;

    if (srcWidth / srcHeight > targetAspect) {
      cropWidth = Math.floor(srcHeight * targetAspect);
      cropX = Math.floor((srcWidth - cropWidth) / 2);
    } else {
      cropHeight = Math.floor(srcWidth / targetAspect);
      cropY = Math.floor((srcHeight - cropHeight) / 2);
    }

    return { cropX, cropY, cropWidth, cropHeight };
  }

  async function applyFlashState(enableHardwareOnly = false) {
    if (state.flash === "off") return;

    if (flashOverlay) {
      flashOverlay.style.opacity = "1";
      setTimeout(() => {
        flashOverlay.style.opacity = "0";
      }, 200);
    }

    if (currentStream) {
      const track = currentStream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
          try {
            await track.applyConstraints({
              advanced: [
                { torch: state.flash !== "off" || enableHardwareOnly },
              ],
            });
          } catch (e) {
            console.warn("Hardware torch access issue:", e);
          }
        }
      }
    }
  }

  async function saveBlobToDevice(blob, filename) {
    if (!blob) {
      showToast("No media to save!");
      return;
    }

    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const rawBase64 = base64Data.includes(",")
        ? base64Data.split(",")[1]
        : base64Data;

      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        const Filesystem = window.Capacitor.Plugins.Filesystem;

        if (Filesystem) {
          if (typeof Filesystem.requestPermissions === "function") {
            await Filesystem.requestPermissions();
          }

          await Filesystem.writeFile({
            path: filename,
            data: rawBase64,
            directory: "DOCUMENTS",
          });

          const file = new File([blob], filename, { type: blob.type });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "PineCam Photo",
            });
            showToast("Saved to Gallery!");
            return;
          }

          showToast("Saved to Gallery!");
          return;
        }
      }

      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "PineCam",
          text: "Saved from PineCam",
        });
        showToast("Saved to Device!");
        return;
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Save Error:", err);
      showToast("Err: " + (err.message || "Save failed"));
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      showToast("Media Downloaded!");
    }, 400);
  }

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(type) {
    if (!state.sound) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === "shutter") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
          200,
          audioCtx.currentTime + 0.08,
        );
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      } else if (type === "beep") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function triggerHaptic() {
    if (state.haptics && navigator.vibrate) navigator.vibrate(40);
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2000);
  }

  async function initCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: state.facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: state.mode === "video",
      };

      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = currentStream;
      await videoElement.play();

      const track = currentStream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};

      if (caps.zoom && zoomControls) {
        state.maxZoom = caps.zoom.max;
        zoomControls.classList.remove("hidden");
        if (zoomLevel) zoomLevel.textContent = `${state.zoom.toFixed(1)}x`;
      } else if (zoomControls) {
        zoomControls.classList.add("hidden");
      }

      const settings = track.getSettings ? track.getSettings() : {};
      if (cameraHardwareInfo) {
        cameraHardwareInfo.textContent = `Camera: ${track.label || "Standard"} (${settings.width || 0}x${settings.height || 0})`;
      }
    } catch (err) {
      console.error("Camera Init Error:", err);
      showToast("Camera Unavailable");
    }
  }

  function startRenderLoop() {
    function render() {
      if (
        liveCanvas &&
        videoElement.readyState === videoElement.HAVE_ENOUGH_DATA
      ) {
        const vw = videoElement.videoWidth;
        const vh = videoElement.videoHeight;
        const crop = calculate4to3Crop(vw, vh);

        if (
          liveCanvas.width !== crop.cropWidth ||
          liveCanvas.height !== crop.cropHeight
        ) {
          liveCanvas.width = crop.cropWidth;
          liveCanvas.height = crop.cropHeight;
        }

        const activeFilter = FILTERS.find((f) => f.id === state.filter);

        // Apply the CSS filter directly to the DOM element for hardware preview
        liveCanvas.style.filter =
          activeFilter && activeFilter.css ? activeFilter.css : "none";

        liveCtx.save();

        if (state.facingMode === "user" && state.previewMirror) {
          liveCtx.translate(crop.cropWidth, 0);
          liveCtx.scale(-1, 1);
        }

        // Plain video draw (Fastest possible frame render)
        liveCtx.drawImage(
          videoElement,
          crop.cropX,
          crop.cropY,
          crop.cropWidth,
          crop.cropHeight,
          0,
          0,
          crop.cropWidth,
          crop.cropHeight,
        );

        liveCtx.restore();

        // Tint overlay layer if needed
        if (activeFilter && activeFilter.tintColor) {
          renderFilterOverlay(
            liveCtx,
            crop.cropWidth,
            crop.cropHeight,
            activeFilter,
          );
        }
      }
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }

  function applyFilterPipeline(ctx, w, h, filterName, isCapture) {
    if (filterName === "original") return;

    let recipe;
    if (filterName === "cybershot") {
      recipe = {
        grain: 24,
        lift: 8,
        warmR: 32,
        warmG: 10,
        warmB: -24,
        cFactor: 1.3,
        sat: 1.2,
        vAlpha: 0.4,
        vRadius: 0.6,
        lightLeak: "amber",
      };
    } else if (filterName === "y2kflash") {
      recipe = {
        grain: 18,
        lift: 2,
        warmR: 12,
        warmG: 8,
        warmB: 18,
        cFactor: 1.5,
        sat: 1.1,
        vAlpha: 0.6,
        vRadius: 0.45,
        flashGlow: true,
      };
    } else if (filterName === "ixus_cool") {
      recipe = {
        grain: 20,
        lift: 10,
        warmR: -12,
        warmG: 16,
        warmB: 10,
        cFactor: 1.2,
        sat: 1.15,
        vAlpha: 0.35,
        vRadius: 0.65,
      };
    } else if (filterName === "ccd_sunset") {
      recipe = {
        grain: 26,
        lift: 8,
        warmR: 38,
        warmG: 2,
        warmB: -18,
        cFactor: 1.25,
        sat: 1.3,
        vAlpha: 0.45,
        vRadius: 0.55,
        lightLeak: "warm",
      };
    } else if (filterName === "vhs") {
      recipe = {
        grain: 28,
        lift: 16,
        warmR: -4,
        warmG: 8,
        warmB: 6,
        cFactor: 1.1,
        sat: 0.85,
        vAlpha: 0.3,
        vRadius: 0.75,
        scanlines: true,
      };
    } else {
      recipe = {
        grain: 30,
        lift: 12,
        warmR: 24,
        warmG: 12,
        warmB: -6,
        cFactor: 1.15,
        sat: 1.25,
        vAlpha: 0.35,
        vRadius: 0.7,
        lightLeak: "amber",
      };
    }

    const grainMult =
      state.grain === "high"
        ? 1.5
        : state.grain === "low"
          ? 0.5
          : state.grain === "off"
            ? 0
            : 1.0;
    const finalGrain = recipe.grain * grainMult;

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const c = recipe.cFactor;
    const sat = recipe.sat;
    const len = data.length;

    // Fast integer-based pixel loop optimization
    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      r = ((r / 255 - 0.5) * c + 0.5) * 255;
      g = ((g / 255 - 0.5) * c + 0.5) * 255;
      b = ((b / 255 - 0.5) * c + 0.5) * 255;

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + sat * (r - gray) + recipe.warmR + recipe.lift;
      g = gray + sat * (g - gray) + recipe.warmG + recipe.lift;
      b = gray + sat * (b - gray) + recipe.warmB + recipe.lift;

      if (finalGrain > 0) {
        const noise = (Math.random() - 0.5) * finalGrain;
        r += noise;
        g += noise;
        b += noise;
      }

      data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    ctx.putImageData(imgData, 0, 0);

    if (recipe.vAlpha > 0) {
      ctx.save();
      const grad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * recipe.vRadius * 0.5,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75,
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${recipe.vAlpha})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (recipe.lightLeak) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const lg = ctx.createRadialGradient(
        w * 0.05,
        h * 0.05,
        0,
        w * 0.05,
        h * 0.05,
        w * 0.65,
      );
      const leakColor =
        recipe.lightLeak === "amber" ? "255, 140, 40" : "255, 180, 90";
      lg.addColorStop(0, "rgba(" + leakColor + ", 0.5)");
      lg.addColorStop(1, "rgba(" + leakColor + ", 0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (recipe.flashGlow) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const fg = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        0,
        w * 0.5,
        h * 0.45,
        w * 0.55,
      );
      fg.addColorStop(0, "rgba(255,255,255,0.3)");
      fg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (recipe.scanlines) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 2);
      }
      ctx.restore();
    }

    if (isCapture && state.dateStamp) {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const dateStr =
        state.dateFormat === "DDMMYY"
          ? `${dd} ${mm} '${yy}`
          : `'${yy} ${mm} ${dd}`;

      ctx.save();
      ctx.font = `900 ${Math.floor(h * 0.055)}px 'Share Tech Mono', monospace`;
      ctx.fillStyle = "#ff9900";
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 8;
      ctx.textAlign = "right";
      ctx.fillText(dateStr, w - 20, h - 20);
      ctx.restore();
    }
  }

  function capturePhoto() {
    if (!videoElement.videoWidth) return;

    applyFlashState();
    playSound("shutter");
    triggerHaptic();

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    const crop = calculate4to3Crop(vw, vh);

    offscreenCanvas.width = crop.cropWidth;
    offscreenCanvas.height = crop.cropHeight;

    offCtx.save();
    if (state.facingMode === "user" && state.captureMirror) {
      offCtx.translate(crop.cropWidth, 0);
      offCtx.scale(-1, 1);
    }
    offCtx.drawImage(
      videoElement,
      crop.cropX,
      crop.cropY,
      crop.cropWidth,
      crop.cropHeight,
      0,
      0,
      crop.cropWidth,
      crop.cropHeight,
    );
    offCtx.restore();

    applyFilterPipeline(
      offCtx,
      crop.cropWidth,
      crop.cropHeight,
      state.filter,
      true,
    );

    offscreenCanvas.toBlob(
      (blob) => {
        state.pendingPhotoBlob = blob;
        if (resultImage) resultImage.src = URL.createObjectURL(blob);
        if (photoResultModal) photoResultModal.classList.remove("hidden");
      },
      "image/jpeg",
      0.95,
    );
  }

  let mediaRecorder = null;
  let recordAnimFrame = null;

  function getSupportedMimeType() {
    const types = ["video/webm;codecs=vp8", "video/webm", "video/mp4"];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function startVideoRecording() {
    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      showToast("Video Recording Unsupported");
      return;
    }

    const vw = videoElement.videoWidth || 640;
    const vh = videoElement.videoHeight || 480;
    const crop = calculate4to3Crop(vw, vh);

    videoRecordCanvas.width = Math.min(640, crop.cropWidth);
    videoRecordCanvas.height = Math.min(480, crop.cropHeight);

    let lastVidFrame = 0;
    const vidInterval = 1000 / 30;

    function renderVideoFrame(now) {
      if (state.isRecording) {
        recordAnimFrame = requestAnimationFrame(renderVideoFrame);
      }
      if (now - lastVidFrame < vidInterval) return;
      lastVidFrame = now;

      if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        const w = videoRecordCanvas.width;
        const h = videoRecordCanvas.height;

        videoRecordCtx.save();
        if (state.facingMode === "user" && state.previewMirror) {
          videoRecordCtx.translate(w, 0);
          videoRecordCtx.scale(-1, 1);
        }
        videoRecordCtx.drawImage(
          videoElement,
          crop.cropX,
          crop.cropY,
          crop.cropWidth,
          crop.cropHeight,
          0,
          0,
          w,
          h,
        );
        videoRecordCtx.restore();

        applyFilterPipeline(videoRecordCtx, w, h, state.filter, false);
      }
    }

    state.recordedChunks = [];
    state.isRecording = true;
    requestAnimationFrame(renderVideoFrame);

    const stream = videoRecordCanvas.captureStream(30);

    if (currentStream && currentStream.getAudioTracks().length > 0) {
      stream.addTrack(currentStream.getAudioTracks()[0]);
    }

    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType });
    } catch (e) {
      showToast("Video Stream Error");
      state.isRecording = false;
      if (recordAnimFrame) cancelAnimationFrame(recordAnimFrame);
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      if (recordAnimFrame) cancelAnimationFrame(recordAnimFrame);
      const blob = new Blob(state.recordedChunks, { type: mimeType });
      state.pendingVideoBlob = blob;
      if (resultVideo) resultVideo.src = URL.createObjectURL(blob);
      if (videoResultModal) videoResultModal.classList.remove("hidden");
    };

    mediaRecorder.start(100);
    if (btnShutter) btnShutter.classList.add("recording");
    if (recIndicator) recIndicator.classList.add("active");
    state.recStartTime = Date.now();

    state.recInterval = setInterval(() => {
      const diff = Math.floor((Date.now() - state.recStartTime) / 1000);
      const m = String(Math.floor(diff / 60)).padStart(2, "0");
      const s = String(diff % 60).padStart(2, "0");
      if (recTimer) recTimer.textContent = `${m}:${s}`;
    }, 1000);

    playSound("beep");
    triggerHaptic();
  }

  function stopVideoRecording() {
    if (mediaRecorder && state.isRecording) {
      state.isRecording = false;
      mediaRecorder.stop();
      if (btnShutter) btnShutter.classList.remove("recording");
      if (recIndicator) recIndicator.classList.remove("active");
      clearInterval(state.recInterval);
      playSound("beep");
      triggerHaptic();
    }
  }

  const DB_NAME = "MochiCamDB";
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("gallery")) {
          db.createObjectStore("gallery", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveItemToDB(item) {
    try {
      const db = await openDB();
      const tx = db.transaction("gallery", "readwrite");
      tx.objectStore("gallery").put(item);
    } catch (e) {
      console.error("DB Save Error", e);
    }
  }

  async function loadItemsFromDB() {
    try {
      const db = await openDB();
      const tx = db.transaction("gallery", "readonly");
      const req = tx.objectStore("gallery").getAll();
      req.onsuccess = () => {
        state.galleryItems = req.result.sort(
          (a, b) => b.timestamp - a.timestamp,
        );
        updateGalleryUI();
      };
    } catch (e) {
      console.error("DB Load Error", e);
    }
  }

  async function deleteItemFromDB(id) {
    try {
      const db = await openDB();
      const tx = db.transaction("gallery", "readwrite");
      tx.objectStore("gallery").delete(id);
      state.galleryItems = state.galleryItems.filter((i) => i.id !== id);
      updateGalleryUI();
    } catch (e) {
      console.error("DB Delete Error", e);
    }
  }

  function updateGalleryUI() {
    if (galleryCount) galleryCount.textContent = state.galleryItems.length;
    if (galleryGrid) galleryGrid.innerHTML = "";

    if (state.galleryItems.length > 0 && galleryThumb) {
      const latest = state.galleryItems[0];
      const url = URL.createObjectURL(latest.blob);
      if (latest.type === "image") {
        galleryThumb.innerHTML = `<img src="${url}" alt="Latest" />`;
      } else {
        galleryThumb.innerHTML = `🎥`;
      }
    } else if (galleryThumb) {
      galleryThumb.innerHTML = `📷`;
    }

    state.galleryItems.forEach((item, index) => {
      if (!galleryGrid) return;
      const div = document.createElement("div");
      div.className = "gallery-item";
      const url = URL.createObjectURL(item.blob);

      if (item.type === "image") {
        div.innerHTML = `<img src="${url}" />`;
      } else {
        div.innerHTML = `<video src="${url}#t=0.5"></video><span class="video-badge">VIDEO</span>`;
      }

      div.addEventListener("click", () => openGalleryDetail(index));
      galleryGrid.appendChild(div);
    });
  }

  function openGalleryDetail(index) {
    state.detailIndex = index;
    const item = state.galleryItems[index];
    if (!item) return;

    if (galleryDetail) galleryDetail.classList.remove("hidden");
    if (galleryGrid) galleryGrid.classList.add("hidden");

    const url = URL.createObjectURL(item.blob);
    if (item.type === "image") {
      if (detailImg) {
        detailImg.src = url;
        detailImg.classList.remove("hidden");
      }
      if (detailVid) detailVid.classList.add("hidden");
    } else {
      if (detailVid) {
        detailVid.src = url;
        detailVid.classList.remove("hidden");
      }
      if (detailImg) detailImg.classList.add("hidden");
    }

    if (btnDetailPrev) btnDetailPrev.disabled = index === 0;
    if (btnDetailNext)
      btnDetailNext.disabled = index === state.galleryItems.length - 1;
  }

  async function applyZoom(newZoom) {
    state.zoom = Math.min(Math.max(1.0, newZoom), state.maxZoom);
    if (zoomLevel) zoomLevel.textContent = `${state.zoom.toFixed(1)}x`;

    const track = currentStream ? currentStream.getVideoTracks()[0] : null;

    // Try hardware zoom first if available
    if (track && track.getCapabilities) {
      const caps = track.getCapabilities();
      if (caps.zoom && track.applyConstraints) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: state.zoom }] });
          return; // Hardware zoom successful, return early
        } catch (e) {
          console.warn(
            "Hardware zoom unsupported, falling back to canvas crop:",
            e,
          );
        }
      }
    }
  }
  function renderFilterTrack() {
    if (!filterTrack) return;
    filterTrack.innerHTML = "";
    FILTERS.forEach((f) => {
      const chip = document.createElement("button");
      chip.className = `filter-chip ${f.id === state.filter ? "active" : ""}`;
      chip.textContent = f.name;
      chip.addEventListener("click", () => {
        state.filter = f.id;
        document
          .querySelectorAll(".filter-chip")
          .forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        if (hudFilter) hudFilter.textContent = f.name.toUpperCase();
        triggerHaptic();
      });
      filterTrack.appendChild(chip);
    });
  }

  function bindEvents() {
    if (modePhoto) {
      modePhoto.addEventListener("click", () => {
        state.mode = "photo";
        modePhoto.classList.add("active");
        if (modeVideo) modeVideo.classList.remove("active");
        if (hudMode) hudMode.textContent = "PHOTO";
        initCamera();
      });
    }

    if (modeVideo) {
      modeVideo.addEventListener("click", () => {
        state.mode = "video";
        modeVideo.classList.add("active");
        if (modePhoto) modePhoto.classList.remove("active");
        if (hudMode) hudMode.textContent = "VIDEO";
        initCamera();
      });
    }

    if (btnShutter) {
      btnShutter.addEventListener("click", () => {
        if (state.mode === "photo") {
          if (state.timer > 0) {
            let count = state.timer;
            if (countdownOverlay) countdownOverlay.classList.remove("hidden");
            if (countdownNumber) countdownNumber.textContent = count;
            playSound("beep");

            const timerInterval = setInterval(() => {
              count--;
              if (count > 0) {
                if (countdownNumber) countdownNumber.textContent = count;
                playSound("beep");
              } else {
                clearInterval(timerInterval);
                if (countdownOverlay) countdownOverlay.classList.add("hidden");
                capturePhoto();
              }
            }, 1000);
          } else {
            capturePhoto();
          }
        } else {
          if (state.isRecording) stopVideoRecording();
          else startVideoRecording();
        }
      });
    }

    if (btnSwitchCam) {
      btnSwitchCam.addEventListener("click", () => {
        state.facingMode =
          state.facingMode === "environment" ? "user" : "environment";
        initCamera();
        triggerHaptic();
      });
    }

    if (btnQuickFlash) {
      btnQuickFlash.addEventListener("click", () => {
        state.flash =
          state.flash === "off" ? "on" : state.flash === "on" ? "torch" : "off";
        btnQuickFlash.textContent = `FLASH: ${state.flash.toUpperCase()}`;
        if (settingFlash) settingFlash.value = state.flash;
        applyFlashState();
      });
    }

    if (btnQuickTimer) {
      btnQuickTimer.addEventListener("click", () => {
        state.timer =
          state.timer === 0
            ? 3
            : state.timer === 3
              ? 5
              : state.timer === 5
                ? 10
                : 0;
        btnQuickTimer.textContent = `TIMER: ${state.timer ? state.timer + "S" : "OFF"}`;
        if (settingTimer) settingTimer.value = String(state.timer);
      });
    }

    if (btnZoomIn) {
      btnZoomIn.addEventListener("click", async () => {
        if (state.zoom < state.maxZoom) {
          state.zoom = Math.min(state.maxZoom, state.zoom + 0.5);
          if (zoomLevel) zoomLevel.textContent = `${state.zoom.toFixed(1)}x`;
          const track = currentStream
            ? currentStream.getVideoTracks()[0]
            : null;
          if (track && track.applyConstraints) {
            await track.applyConstraints({ advanced: [{ zoom: state.zoom }] });
          }
        }
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener("click", async () => {
        if (state.zoom > 1.0) {
          state.zoom = Math.max(1.0, state.zoom - 0.5);
          if (zoomLevel) zoomLevel.textContent = `${state.zoom.toFixed(1)}x`;
          const track = currentStream
            ? currentStream.getVideoTracks()[0]
            : null;
          if (track && track.applyConstraints) {
            await track.applyConstraints({ advanced: [{ zoom: state.zoom }] });
          }
        }
      });
    }

    if (btnUpload && fileInput) {
      btnUpload.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
          const crop = calculate4to3Crop(img.naturalWidth, img.naturalHeight);
          offscreenCanvas.width = crop.cropWidth;
          offscreenCanvas.height = crop.cropHeight;
          offCtx.drawImage(
            img,
            crop.cropX,
            crop.cropY,
            crop.cropWidth,
            crop.cropHeight,
            0,
            0,
            crop.cropWidth,
            crop.cropHeight,
          );
          applyFilterPipeline(
            offCtx,
            crop.cropWidth,
            crop.cropHeight,
            state.filter,
            true,
          );
          offscreenCanvas.toBlob(
            (blob) => {
              state.pendingPhotoBlob = blob;
              if (resultImage) resultImage.src = URL.createObjectURL(blob);
              if (photoResultModal) photoResultModal.classList.remove("hidden");
            },
            "image/jpeg",
            0.95,
          );
        };
        img.src = URL.createObjectURL(file);
      });
    }

    if (btnRetakePhoto)
      btnRetakePhoto.addEventListener("click", () =>
        photoResultModal.classList.add("hidden"),
      );
    if (btnDeletePhoto)
      btnDeletePhoto.addEventListener("click", () =>
        photoResultModal.classList.add("hidden"),
      );

    if (btnSavePhoto) {
      btnSavePhoto.addEventListener("click", async () => {
        if (state.pendingPhotoBlob) {
          const item = {
            id: "photo_" + Date.now(),
            type: "image",
            blob: state.pendingPhotoBlob,
            timestamp: Date.now(),
          };
          await saveItemToDB(item);
          loadItemsFromDB();
          if (photoResultModal) photoResultModal.classList.add("hidden");
          await saveBlobToDevice(
            state.pendingPhotoBlob,
            `mochicam_${item.id}.jpg`,
          );
        }
      });
    }

    if (btnRetakeVideo)
      btnRetakeVideo.addEventListener("click", () =>
        videoResultModal.classList.add("hidden"),
      );
    if (btnDeleteVideo)
      btnDeleteVideo.addEventListener("click", () =>
        videoResultModal.classList.add("hidden"),
      );

    if (btnSaveVideo) {
      btnSaveVideo.addEventListener("click", async () => {
        if (state.pendingVideoBlob) {
          const item = {
            id: "video_" + Date.now(),
            type: "video",
            blob: state.pendingVideoBlob,
            timestamp: Date.now(),
          };
          await saveItemToDB(item);
          loadItemsFromDB();
          if (videoResultModal) videoResultModal.classList.add("hidden");
          await saveBlobToDevice(
            state.pendingVideoBlob,
            `mochicam_${item.id}.mp4`,
          );
        }
      });
    }

    if (btnGallery) {
      btnGallery.addEventListener("click", () => {
        if (galleryModal) galleryModal.classList.remove("hidden");
        if (galleryDetail) galleryDetail.classList.add("hidden");
        if (galleryGrid) galleryGrid.classList.remove("hidden");
      });
    }

    if (btnCloseGallery)
      btnCloseGallery.addEventListener("click", () =>
        galleryModal.classList.add("hidden"),
      );

    if (btnDetailPrev) {
      btnDetailPrev.addEventListener("click", () => {
        if (state.detailIndex > 0) openGalleryDetail(state.detailIndex - 1);
      });
    }

    if (btnDetailNext) {
      btnDetailNext.addEventListener("click", () => {
        if (state.detailIndex < state.galleryItems.length - 1)
          openGalleryDetail(state.detailIndex + 1);
      });
    }

    if (btnDetailDelete) {
      btnDetailDelete.addEventListener("click", async () => {
        const item = state.galleryItems[state.detailIndex];
        if (item) {
          await deleteItemFromDB(item.id);
          if (galleryDetail) galleryDetail.classList.add("hidden");
          if (galleryGrid) galleryGrid.classList.remove("hidden");
        }
      });
    }

    if (btnDetailDownload) {
      btnDetailDownload.addEventListener("click", async () => {
        const item = state.galleryItems[state.detailIndex];
        if (!item) return;
        const ext = item.type === "image" ? "jpg" : "mp4";
        await saveBlobToDevice(item.blob, `mochicam_${item.id}.${ext}`);
      });
    }

    if (btnSettings)
      btnSettings.addEventListener("click", () =>
        settingsModal.classList.remove("hidden"),
      );
    if (btnCloseSettings)
      btnCloseSettings.addEventListener("click", () =>
        settingsModal.classList.add("hidden"),
      );

    if (settingFlash) {
      settingFlash.addEventListener("change", (e) => {
        state.flash = e.target.value;
        if (btnQuickFlash)
          btnQuickFlash.textContent = `FLASH: ${state.flash.toUpperCase()}`;
        applyFlashState();
      });
    }

    if (settingTimer) {
      settingTimer.addEventListener("change", (e) => {
        state.timer = parseInt(e.target.value, 10);
        if (btnQuickTimer)
          btnQuickTimer.textContent = `TIMER: ${state.timer ? state.timer + "S" : "OFF"}`;
      });
    }

    if (settingMirrorPreview)
      settingMirrorPreview.addEventListener(
        "change",
        (e) => (state.previewMirror = e.target.checked),
      );
    if (settingMirrorPhoto)
      settingMirrorPhoto.addEventListener(
        "change",
        (e) => (state.captureMirror = e.target.checked),
      );
    if (settingGrid) {
      settingGrid.addEventListener("change", (e) => {
        state.grid = e.target.checked;
        if (gridOverlay) gridOverlay.classList.toggle("hidden", !state.grid);
      });
    }
    if (settingDateStamp)
      settingDateStamp.addEventListener(
        "change",
        (e) => (state.dateStamp = e.target.checked),
      );
    if (settingDateFormat)
      settingDateFormat.addEventListener(
        "change",
        (e) => (state.dateFormat = e.target.value),
      );
    if (settingGrain)
      settingGrain.addEventListener(
        "change",
        (e) => (state.grain = e.target.value),
      );
    if (settingSound)
      settingSound.addEventListener(
        "change",
        (e) => (state.sound = e.target.checked),
      );
    if (settingHaptics)
      settingHaptics.addEventListener(
        "change",
        (e) => (state.haptics = e.target.checked),
      );
  }

  async function init() {
    renderFilterTrack();
    bindEvents();
    await initCamera();
    startRenderLoop();
    await loadItemsFromDB();

    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist();
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
