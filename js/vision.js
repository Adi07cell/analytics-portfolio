/* f. Vision: MediaPipe Hand Landmarker in the browser + a simple finger-state gesture classifier. */
(function () {
  'use strict';
  var PF = window.PF, $ = PF.$;

  var MP_VER = '0.10.14';
  var MP_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
  var MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  var CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  var FINGERS = [{ name: 'Thumb', mcp: 2, pip: 3, tip: 4 }, { name: 'Index', mcp: 5, pip: 6, tip: 8 },
    { name: 'Middle', mcp: 9, pip: 10, tip: 12 }, { name: 'Ring', mcp: 13, pip: 14, tip: 16 }, { name: 'Little', mcp: 17, pip: 18, tip: 20 }];
  var NOTES = [['C4', 261.63], ['D4', 293.66], ['E4', 329.63], ['F4', 349.23], ['G4', 392.0], ['A4', 440.0]];

  // ---- Sample landmark sets (hand-made coordinates for demonstration, not a real recording) ----
  var OPEN = [[.50, .90], [.40, .84], [.33, .76], [.28, .68], [.24, .61], [.42, .58], [.40, .45], [.39, .37], [.38, .30],
    [.50, .56], [.50, .42], [.50, .33], [.50, .25], [.57, .58], [.59, .45], [.60, .37], [.61, .31], [.64, .62], [.67, .52], [.69, .46], [.71, .40]];
  function fold(base, which) {
    var p = base.map(function (q) { return q.slice(); });
    var w = p[0];
    which.forEach(function (f) {
      if (f === 0) { p[3] = [.36, .70]; p[4] = [.45, .66]; return; }
      var m = [5, 9, 13, 17][f - 1], mcp = p[m];
      p[m + 1] = [mcp[0] + (mcp[0] - w[0]) * 0.15, mcp[1] - 0.06];
      p[m + 2] = [mcp[0] + (w[0] - mcp[0]) * 0.05, mcp[1] + 0.02];
      p[m + 3] = [mcp[0] + (w[0] - mcp[0]) * 0.2, mcp[1] + (w[1] - mcp[1]) * 0.25];
    });
    return p;
  }
  var SAMPLES = [
    { name: 'Open palm', pts: OPEN },
    { name: 'Fist', pts: fold(OPEN, [0, 1, 2, 3, 4]) },
    { name: 'Peace', pts: fold(OPEN, [0, 3, 4]) },
    { name: 'Pointing', pts: fold(OPEN, [0, 2, 3, 4]) },
    { name: 'Three', pts: fold(OPEN, [0, 4]) }
  ];

  function d(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function toPts(arr) { return arr.map(function (p) { return { x: p[0], y: p[1] }; }); }

  /** Classify a hand from 21 landmarks. Rotation-tolerant: compares distances, not raw y. */
  function classify(lm) {
    var w = lm[0];
    var up = FINGERS.map(function (f, i) {
      if (i === 0) return d(lm[4], lm[17]) > d(lm[3], lm[17]) * 1.05 && d(lm[4], lm[5]) > d(lm[2], lm[5]) * 0.9;
      return d(w, lm[f.tip]) > d(w, lm[f.pip]) * 1.08;
    });
    var n = up.filter(Boolean).length;
    var key = up.map(function (u) { return u ? 1 : 0; }).join('');
    var name = {
      '00000': 'Fist', '11111': 'Open palm', '01000': 'Pointing', '01100': 'Peace / victory', '10000': 'Thumbs up',
      '01001': 'Rock on', '11000': 'L shape', '01110': 'Three', '01111': 'Four', '10001': 'Call me'
    }[key] || (n + ' fingers');
    return { up: up, count: n, name: name };
  }

  var canvas, ctx, video, landmarker = null, mode = null, stream = null, raf = null, lastT = -1;
  var fps = 0, lastFrame = 0, lastCount = -1, audio = null, sampleIdx = 0;

  function draw(hands, source, mirror) {
    var W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.fillStyle = '#0f1114'; ctx.fillRect(0, 0, W, H);
    if (source) {
      var sw = source.videoWidth || source.naturalWidth || source.width, sh = source.videoHeight || source.naturalHeight || source.height;
      var s = Math.min(W / sw, H / sh), dw = sw * s, dh = sh * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
      if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(source, dx, dy, dw, dh);
      ctx.restore(); ctx.save();
      var map = function (p) { var x = dx + p.x * dw; return { x: mirror ? W - x : x, y: dy + p.y * dh }; };
    } else {
      var map = function (p) { return { x: p.x * W, y: p.y * H }; };
      ctx.fillStyle = '#9aa3ae'; ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('Sample landmark set (demonstration)', 14, 24);
    }
    hands.forEach(function (lm) {
      var res = classify(lm);
      ctx.lineWidth = 3; ctx.strokeStyle = '#2dd4bf';
      CONNECTIONS.forEach(function (c) {
        var a = map(lm[c[0]]), b = map(lm[c[1]]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      lm.forEach(function (p, i) {
        var q = map(p), tipOf = FINGERS.findIndex(function (f) { return f.tip === i; });
        ctx.beginPath(); ctx.arc(q.x, q.y, tipOf >= 0 ? 6 : 4, 0, 2 * Math.PI);
        ctx.fillStyle = tipOf >= 0 ? (res.up[tipOf] ? '#fbbf24' : '#64748b') : '#ffffff';
        ctx.fill();
      });
    });
    ctx.restore();
  }

  function report(hands, extra) {
    if (!hands.length) {
      $('#visGesture').textContent = 'No hand detected';
      $('#visStats').innerHTML = (extra || '');
      return;
    }
    var r = classify(hands[0]);
    $('#visGesture').textContent = r.name;
    var note = NOTES[Math.min(r.count, NOTES.length - 1)];
    $('#visStats').innerHTML = '<dt>Fingers up</dt><dd>' + r.count + '</dd><dt>Pattern</dt><dd class="mono">' +
      FINGERS.map(function (f, i) { return f.name[0] + (r.up[i] ? '↑' : '·'); }).join(' ') + '</dd><dt>Hands</dt><dd>' + hands.length +
      '</dd><dt>Note</dt><dd>' + note[0] + '</dd>' + (extra || '');
    if (r.count !== lastCount) { lastCount = r.count; if ($('#visSound').checked) beep(note[1]); }
  }

  function beep(freq) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), gn = audio.createGain();
      o.frequency.value = freq; o.type = 'sine';
      gn.gain.setValueAtTime(0.0001, audio.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
      o.connect(gn).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.4);
    } catch (e) { /* audio not available */ }
  }

  function showSample(i) {
    sampleIdx = i;
    PF.$$('#visSamples .chip').forEach(function (b, j) { b.classList.toggle('on', j === i); b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
    var hands = [toPts(SAMPLES[i].pts)];
    draw(hands, null, false);
    report(hands, '<dt>Source</dt><dd>Sample landmarks</dd>');
  }

  async function loadModel(running) {
    if (!landmarker) {
      $('#visMsg').textContent = 'Loading MediaPipe model (about 8 MB, one time)...';
      var vision = await import(MP_URL + '/vision_bundle.mjs');
      var files = await vision.FilesetResolver.forVisionTasks(MP_URL + '/wasm');
      var opts = function (del) { return { baseOptions: { modelAssetPath: MODEL_URL, delegate: del }, runningMode: running, numHands: 2 }; };
      try { landmarker = await vision.HandLandmarker.createFromOptions(files, opts('GPU')); }
      catch (e) { landmarker = await vision.HandLandmarker.createFromOptions(files, opts('CPU')); }
      mode = running;
      $('#visMsg').textContent = 'Model ready. Processing on this device.';
    }
    if (mode !== running) { await landmarker.setOptions({ runningMode: running }); mode = running; }
    return landmarker;
  }

  function stopCamera() {
    if (raf) cancelAnimationFrame(raf); raf = null;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    if (video) video.srcObject = null;
    $('#visCam').textContent = 'Start camera';
  }

  async function startCamera() {
    if (stream) { stopCamera(); showSample(sampleIdx); $('#visMsg').textContent = 'Camera stopped.'; return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#visMsg').textContent = 'No camera API here (needs HTTPS or localhost). Use an image instead.'; return;
    }
    $('#visCam').disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      await loadModel('VIDEO');
      $('#visCam').textContent = 'Stop camera';
      loop();
    } catch (e) {
      stopCamera();
      $('#visMsg').textContent = (e && e.name === 'NotAllowedError') ? 'Camera permission was declined. You can upload an image instead.'
        : (e && e.name === 'NotFoundError') ? 'No camera found. Upload an image instead.'
        : 'Could not start: ' + (e && e.message ? e.message : e) + '. Try uploading an image.';
    } finally { $('#visCam').disabled = false; }
  }

  function loop() {
    if (!stream) return;
    var now = performance.now();
    if (video.readyState >= 2 && video.currentTime !== lastT) {
      lastT = video.currentTime;
      var res = landmarker.detectForVideo(video, now);
      var hands = res.landmarks || [];
      fps = 0.9 * fps + 0.1 * (1000 / Math.max(1, now - lastFrame)); lastFrame = now;
      draw(hands, video, true);
      report(hands, '<dt>FPS</dt><dd>' + fps.toFixed(0) + '</dd>');
    }
    raf = requestAnimationFrame(loop);
  }

  function onImage(file) {
    if (!file) return;
    stopCamera();
    var img = new Image();
    img.alt = 'Uploaded hand image';
    img.onload = async function () {
      try {
        await loadModel('IMAGE');
        var res = landmarker.detect(img);
        draw(res.landmarks || [], img, false);
        report(res.landmarks || [], '<dt>Source</dt><dd>Your image (local)</dd>');
      } catch (e) { $('#visMsg').textContent = 'Could not analyse the image: ' + (e && e.message ? e.message : e); }
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  function init() {
    canvas = $('#visCanvas'); ctx = canvas.getContext('2d'); video = $('#visVideo');
    $('#visSamples').innerHTML = '<span class="field-label" style="width:100%;margin:0">Sample landmark sets</span>' +
      SAMPLES.map(function (s) { return '<button type="button" class="chip" aria-pressed="false">' + s.name + '</button>'; }).join('');
    PF.$$('#visSamples .chip').forEach(function (b, i) { b.addEventListener('click', function () { stopCamera(); showSample(i); }); });
    $('#visCam').addEventListener('click', startCamera);
    $('#visFile').addEventListener('change', function () { onImage(this.files && this.files[0]); this.value = ''; });
    $('#visMsg').textContent = 'Showing the classifier on sample landmarks. Start the camera to try it live.';
    showSample(0);
  }

  PF.demos.vision = { init: init, hide: function () { if (stream) { stopCamera(); $('#visMsg').textContent = 'Camera stopped when you left this demo.'; } } };
  PF._vision = { classify: classify, samples: SAMPLES, toPts: toPts };
})();
