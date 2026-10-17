let audioCtx = null;
let intervals = [];
let isRunning = false;
let isPaused = false;

let currentBlockIdx = 0;
let isTransitioning = false;
let transitionTimeRemaining = 5.0;
let timeRemainingSeconds = 0;
let currentSPM = 160;
let nextNoteTime = 0;
let timerID = null;
let activePresetIdx = 0;

const DEFAULT_PRESETS = [
  {
    name: "Routine 1",
    intervals: [
      { time: 2.5, spm: 160 },
      { time: 2.5, spm: 170 },
      { time: 5,   spm: 180 }
    ]
  },
  {
    name: "Routine 2",
    intervals: [
      { time: 5,   spm: 130 },
      { time: 5,   spm: 140 }
    ]
  },
  {
    name: "Default",
    intervals: [
      { time: 5,   spm: 150 }
    ]
  }
];

let userPresets = JSON.parse(localStorage.getItem('cadtimer_user_presets_v3')) || JSON.parse(JSON.stringify(DEFAULT_PRESETS));

window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updatePresetButtonLabels();
  loadPreset(0);
});

function setupEventListeners() {
  document.getElementById('btn-minus').addEventListener('click', () => adjustSPM(-1));
  document.getElementById('btn-plus').addEventListener('click', () => adjustSPM(1));
  document.getElementById('start-btn').addEventListener('click', togglePlay);
  document.getElementById('reset-btn').addEventListener('click', reset);

  document.getElementById('btn-preset-0').addEventListener('click', () => loadPreset(0));
  document.getElementById('btn-preset-1').addEventListener('click', () => loadPreset(1));
  document.getElementById('btn-preset-2').addEventListener('click', () => loadPreset(2));

  document.getElementById('btn-edit-0').addEventListener('click', () => renamePreset(0));
  document.getElementById('btn-edit-1').addEventListener('click', () => renamePreset(1));
  document.getElementById('btn-edit-2').addEventListener('click', () => renamePreset(2));

  document.getElementById('btn-save-preset').addEventListener('click', saveCurrentPreset);
  document.getElementById('btn-reset-defaults').addEventListener('click', resetPresetsToDefault);
  document.getElementById('btn-add-block').addEventListener('click', () => addBlock());
}

function updatePresetButtonLabels() {
  userPresets.forEach((preset, index) => {
    const btn = document.getElementById(`btn-preset-${index}`);
    if (btn) btn.innerText = preset.name;
  });
}

function loadPreset(index) {
  if (isRunning) reset();
  activePresetIdx = index;
  
  const container = document.getElementById('blocks-container');
  container.innerHTML = '';

  const preset = userPresets[index];
  preset.intervals.forEach(item => addBlock(item.time, item.spm));
  
  if (preset.intervals.length > 0) {
    currentSPM = preset.intervals[0].spm;
    timeRemainingSeconds = preset.intervals[0].time * 60;
    updateDisplay();
  }
}

function renamePreset(index) {
  const currentName = userPresets[index].name;
  const newName = prompt(`Rename slot "${currentName}":`, currentName);
  if (newName !== null && newName.trim() !== "") {
    userPresets[index].name = newName.trim();
    localStorage.setItem('cadtimer_user_presets_v3', JSON.stringify(userPresets));
    updatePresetButtonLabels();
  }
}

function saveCurrentPreset() {
  const times = document.querySelectorAll('.block-time');
  const spms = document.querySelectorAll('.block-spm');
  const newIntervals = [];

  for (let i = 0; i < times.length; i++) {
    const t = parseFloat(times[i].value);
    const s = parseInt(spms[i].value);
    if (t > 0 && s > 0) {
      newIntervals.push({ time: t, spm: s });
    }
  }

  if (newIntervals.length === 0) {
    alert('Please add at least one valid interval before saving.');
    return;
  }

  userPresets[activePresetIdx].intervals = newIntervals;
  localStorage.setItem('cadtimer_user_presets_v3', JSON.stringify(userPresets));
  alert(`Slot "${userPresets[activePresetIdx].name}" successfully saved!`);
}

function resetPresetsToDefault() {
  if (confirm("Reset all routines and the default slot back to factory settings?")) {
    localStorage.removeItem('cadtimer_user_presets_v3');
    userPresets = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    updatePresetButtonLabels();
    loadPreset(0);
  }
}

function adjustSPM(delta) {
  if (currentSPM + delta >= 30 && currentSPM + delta <= 300) {
    currentSPM += delta;
    updateDisplay();
  }
}

function addBlock(minutes = 5, spm = 160) {
  const container = document.getElementById('blocks-container');
  const div = document.createElement('div');
  div.className = 'block-item';
  div.innerHTML = `
    <div class="input-group">
      <label>Minutes</label>
      <input type="number" class="block-time" value="${minutes}" min="0.1" step="0.1">
    </div>
    <div class="input-group">
      <label>SPM (Cadence)</label>
      <input type="number" class="block-spm" value="${spm}" min="30" max="300">
    </div>
    <button class="btn-remove" type="button">×</button>
  `;
  
  div.querySelector('.btn-remove').addEventListener('click', () => {
    div.remove();
  });

  container.appendChild(div);
  
  if (!isRunning && container.children.length === 1) {
    currentSPM = spm;
    timeRemainingSeconds = minutes * 60;
    updateDisplay();
  }
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, type = 'sine', duration = 0.06) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);

  const flashEl = document.getElementById('flash');
  flashEl.className = freq > 1200 ? 'visual-flash warn' : 'visual-flash active';
  setTimeout(() => flashEl.className = 'visual-flash', 50);
}

function playEndTune() {
  const notes = [859.25, 983.99, 1187.77, 1518.51];
  notes.forEach((freq, index) => {
    setTimeout(() => {
      playTone(freq, 'triangle', 0.25);
    }, index * 140);
  });
}

function readInputs() {
  const times = document.querySelectorAll('.block-time');
  const spms = document.querySelectorAll('.block-spm');
  intervals = [];
  for (let i = 0; i < times.length; i++) {
    const t = parseFloat(times[i].value);
    const s = parseInt(spms[i].value);
    if (t > 0 && s > 0) {
      intervals.push({ duration: t * 60, spm: s, rawMinutes: t, rawSpm: s });
    }
  }
}

function updateDisplay() {
  document.getElementById('tempo-display').innerText = `${currentSPM} SPM`;
  
  let totalBlocks = intervals.length || 1;
  let currentDisplayBlock = Math.min(currentBlockIdx + 1, totalBlocks);
  let currentBlockObj = intervals[currentBlockIdx] || { rawMinutes: 5, rawSpm: currentSPM };
  
  if (isTransitioning) {
    document.getElementById('phase').innerText = `Transition to Block ${currentDisplayBlock}/${totalBlocks}`;
  } else {
    document.getElementById('phase').innerText = `Block ${currentDisplayBlock}/${totalBlocks} - ${currentBlockObj.rawMinutes} min / ${currentBlockObj.rawSpm} spm`;
  }

  let activeSeconds = isTransitioning ? transitionTimeRemaining : timeRemainingSeconds;
  let mins = Math.floor(Math.max(0, activeSeconds) / 60);
  let secs = Math.floor(Math.max(0, activeSeconds) % 60);
  document.getElementById('time-display').innerText = 
    String(mins).padStart(2, '0') + ":" + String(secs).padStart(2, '0');
}

function togglePlay() {
  initAudio();
  const startBtn = document.getElementById('start-btn');

  if (!isRunning) {
    readInputs();
    if (intervals.length === 0) {
      alert('Please add at least one valid interval.');
      return;
    }
    isRunning = true;
    isPaused = false;
    currentBlockIdx = 0;
    isTransitioning = true;
    transitionTimeRemaining = 5.0;
    currentSPM = intervals[0].spm;
    
    startBtn.innerText = "Pause";
    startBtn.className = "main-btn btn-pause";
    
    nextNoteTime = audioCtx.currentTime + 0.1;
    timerID = setInterval(scheduler, 25);
  } else if (!isPaused) {
    isPaused = true;
    clearInterval(timerID);
    startBtn.innerText = "Resume";
    startBtn.className = "main-btn btn-start";
  } else {
    isPaused = false;
    nextNoteTime = audioCtx.currentTime + 0.1;
    timerID = setInterval(scheduler, 25);
    startBtn.innerText = "Pause";
    startBtn.className = "main-btn btn-pause";
  }
}

function reset() {
  isRunning = false;
  isPaused = false;
  isTransitioning = false;
  clearInterval(timerID);
  
  const startBtn = document.getElementById('start-btn');
  startBtn.innerText = "Start";
  startBtn.className = "main-btn btn-start";
  
  currentBlockIdx = 0;
  const firstSpmInput = document.querySelector('.block-spm');
  const firstTimeInput = document.querySelector('.block-time');
  
  if (firstSpmInput) currentSPM = parseInt(firstSpmInput.value) || 160;
  if (firstTimeInput) timeRemainingSeconds = (parseFloat(firstTimeInput.value) || 5) * 60;
  
  document.getElementById('phase').innerText = "Ready";
  updateDisplay();
}

function scheduler() {
  while (nextNoteTime < audioCtx.currentTime + 0.1) {
    let beatInterval = 60.0 / currentSPM;

    if (isTransitioning) {
      playTone(600, 'sine', 0.06);
      transitionTimeRemaining -= beatInterval;

      if (transitionTimeRemaining <= 0) {
        isTransitioning = false;
        timeRemainingSeconds = intervals[currentBlockIdx].duration;
        currentSPM = intervals[currentBlockIdx].spm;
      }
      nextNoteTime += beatInterval;
    } else {
      let beatsLeftEstimate = timeRemainingSeconds / beatInterval;
      let isWarningBeat = beatsLeftEstimate <= 4;

      let toneFreq = isWarningBeat ? 1400 : 600;
      playTone(toneFreq, 'sine', 0.06);

      timeRemainingSeconds -= beatInterval;

      if (timeRemainingSeconds <= 0) {
        currentBlockIdx++;
        if (currentBlockIdx < intervals.length) {
          isTransitioning = true;
          transitionTimeRemaining = 5.0;
          currentSPM = intervals[currentBlockIdx].spm;
        } else {
          playEndTune();
          document.getElementById('phase').innerText = "Complete!";
          reset();
          return;
        }
      }
      nextNoteTime += beatInterval;
    }
    updateDisplay();
  }
}