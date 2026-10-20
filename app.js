/* ============================================================
   DREAM RECORDER — launch frontend. Plain JS + Supabase Auth.

   SUPABASE
   --------
   Accounts are handled by Supabase Auth (email + password).
   The two values below are public by design (the anon key is
   safe to ship in client code). The Luma API key is NOT stored
   server-side: it stays in the user's browser localStorage and
   is sent only to Luma when generating a dream.
   ============================================================ */
const SUPABASE_URL = "https://qrnaesouklkiwqttqtmw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFybmFlc291a2xraXdxdHRxdG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NDAxNTMsImV4cCI6MjEwNjExNjE1M30.A7TIN9t26mY0ESP_2rq2_IDpIO5QLMr6Rhl5mADFScE";

const LUMA_KEY_STORAGE = "dreamrecorder_luma_key";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 14 * 60 * 1000; // ~14 min, matches Luma 10s/540p timing

let supabase = null;

async function initAuth() {
  if (SUPABASE_URL.indexOf("__SUPABASE") !== -1) return; // not configured yet
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    supabase = null;
  }
}

/* ---------------- view switching ---------------- */

const views = {
  landing: document.getElementById("view-landing"),
  auth: document.getElementById("view-auth"),
  account: document.getElementById("view-account"),
  recorder: document.getElementById("view-recorder"),
};

function showView(name) {
  Object.keys(views).forEach(function (key) {
    views[key].classList.toggle("hidden", key !== name);
  });
  if (name === "account") renderAccount();
  window.scrollTo(0, 0);
}

/* ---------------- Luma key (browser localStorage only) ---------------- */

function getKey() {
  try {
    return window.localStorage.getItem(LUMA_KEY_STORAGE) || "";
  } catch (e) {
    return "";
  }
}

function clearKey() {
  try {
    window.localStorage.removeItem(LUMA_KEY_STORAGE);
  } catch (e) { /* noop */ }
}

function enterRecorder() {
  resetRecorder();
  showView("recorder");
}

function authedRoute() {
  if (getKey()) {
    enterRecorder();
  } else {
    showView("account");
  }
}

/* ---------------- auth (email + password) ---------------- */

let authMode = "signup"; // or "signin"

function setAuthMessage(text, kind) {
  const el = document.getElementById("auth-message");
  el.textContent = text;
  el.className = "form-message" + (kind ? " " + kind : "");
}

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById("auth-heading").textContent =
    mode === "signup" ? "Create your account." : "Welcome back.";
  document.getElementById("auth-submit").textContent =
    mode === "signup" ? "Create account" : "Sign in";
  document.getElementById("auth-toggle").textContent =
    mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account";
  setAuthMessage("", "");
}

document.getElementById("go-signup").addEventListener("click", function () {
  setAuthMode("signup");
  showView("auth");
});

document.getElementById("go-signin").addEventListener("click", function () {
  setAuthMode("signin");
  showView("auth");
});

document.getElementById("auth-toggle").addEventListener("click", function () {
  setAuthMode(authMode === "signup" ? "signin" : "signup");
});

document.getElementById("auth-back").addEventListener("click", function () {
  showView("landing");
});

document.getElementById("auth-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  if (!supabase) {
    setAuthMessage("Account service is unavailable — check your connection and reload.", "err");
    return;
  }
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  if (!email || !password) {
    setAuthMessage("Enter your email and password.", "err");
    return;
  }
  if (password.length < 6) {
    setAuthMessage("Password must be at least 6 characters.", "err");
    return;
  }
  const submitBtn = document.getElementById("auth-submit");
  submitBtn.disabled = true;
  setAuthMessage("", "");
  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: email, password: password });
      if (error) throw error;
      if (data.session) {
        authedRoute();
      } else {
        // Email confirmation is on: tell them to confirm, then sign in.
        setAuthMode("signin");
        setAuthMessage("Account created — check your email to confirm, then sign in.", "ok");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email, password: password });
      if (error) throw error;
      authedRoute();
    }
  } catch (err) {
    setAuthMessage((err && err.message) || "Something went wrong — try again.", "err");
  } finally {
    submitBtn.disabled = false;
  }
});

/* ---------------- account page ---------------- */

function setKeyMessage(text, kind) {
  const el = document.getElementById("key-message");
  el.textContent = text;
  el.className = "form-message" + (kind ? " " + kind : "");
}

function setProfileMessage(text, kind) {
  const el = document.getElementById("profile-message");
  el.textContent = text;
  el.className = "form-message" + (kind ? " " + kind : "");
}

async function renderAccount() {
  let email = "", fullName = "", phone = "";
  try {
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data && data.user) {
        email = data.user.email || "";
        const meta = data.user.user_metadata || {};
        fullName = meta.full_name || "";
        phone = meta.phone || "";
      }
    }
  } catch (e) { /* noop */ }
  document.getElementById("account-email").textContent = email;
  document.getElementById("profile-name").value = fullName;
  document.getElementById("profile-phone").value = phone;
  const k = getKey();
  document.getElementById("key-status").textContent = k
    ? "Key saved — your dreams are ready to record."
    : "No key added yet.";
  const input = document.getElementById("account-key");
  input.value = "";
  input.placeholder = k ? "Paste a new key to replace it" : "Paste your Luma API key";
  setKeyMessage("", "");
  setProfileMessage("", "");
}

document.getElementById("profile-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  if (!supabase) {
    setProfileMessage("Account service is unavailable — check your connection and reload.", "err");
    return;
  }
  const fullName = document.getElementById("profile-name").value.trim();
  const phone = document.getElementById("profile-phone").value.trim();
  setProfileMessage("", "");
  try {
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName, phone: phone } });
    if (error) throw error;
    setProfileMessage("Profile saved.", "ok");
  } catch (err) {
    setProfileMessage((err && err.message) || "Something went wrong — try again.", "err");
  }
});

document.getElementById("key-form").addEventListener("submit", function (e) {
  e.preventDefault();
  const v = document.getElementById("account-key").value.trim();
  if (!v) {
    setKeyMessage("Paste your Luma API key to save it.", "err");
    return;
  }
  try {
    window.localStorage.setItem(LUMA_KEY_STORAGE, v);
  } catch (err) {
    setKeyMessage("This browser blocked local storage, so the key cannot be saved.", "err");
    return;
  }
  renderAccount();
  setKeyMessage("Key saved.", "ok");
});

document.getElementById("forget-key-2").addEventListener("click", function () {
  clearKey();
  renderAccount();
  setKeyMessage("Key forgotten.", "");
});

document.getElementById("start-recording").addEventListener("click", function () {
  if (!getKey()) {
    setKeyMessage("Add your Luma API key first.", "err");
    document.getElementById("account-key").focus();
    return;
  }
  enterRecorder();
});

document.getElementById("sign-out-account").addEventListener("click", async function () {
  clearKey();
  try { if (supabase) await supabase.auth.signOut(); } catch (e) { /* noop */ }
  showView("landing");
});

/* ---------------- recorder ---------------- */

const dreamText = document.getElementById("dream-text");
const micBtn = document.getElementById("mic-btn");
const generateBtn = document.getElementById("generate-btn");
const recorderMessage = document.getElementById("recorder-message");
const speechNote = document.getElementById("speech-note");
const afterActions = document.getElementById("after-actions");

const screenIdle = document.getElementById("screen-idle");
const screenWorking = document.getElementById("screen-working");
const workingText = document.getElementById("working-text");
const workingTimer = document.getElementById("working-timer");
const dreamVideo = document.getElementById("dream-video");
const deviceHint = document.getElementById("device-hint");

const fullscreenOverlay = document.getElementById("fullscreen-overlay");
const fullscreenVideo = document.getElementById("fullscreen-video");

function setRecorderMessage(text, kind) {
  recorderMessage.textContent = text;
  recorderMessage.className = "form-message" + (kind ? " " + kind : "");
}

function setDeviceState(state) {
  screenIdle.classList.toggle("hidden", state !== "idle");
  screenWorking.classList.toggle("hidden", state !== "working");
  dreamVideo.classList.toggle("hidden", state !== "ready");
}

function resetRecorder() {
  setDeviceState("idle");
  afterActions.classList.add("hidden");
  dreamVideo.removeAttribute("src");
  dreamVideo.load();
  fullscreenVideo.removeAttribute("src");
  fullscreenVideo.load();
  fullscreenOverlay.classList.add("hidden");
  deviceHint.textContent = "Describe your dream below, then press generate.";
  setRecorderMessage("", "");
  generateBtn.disabled = false;
}

document.getElementById("go-account").addEventListener("click", function () {
  showView("account");
});

document.getElementById("sign-out").addEventListener("click", async function () {
  clearKey();
  resetRecorder();
  try { if (supabase) await supabase.auth.signOut(); } catch (e) { /* noop */ }
  showView("landing");
});

/* ----- voice input: free browser Web Speech API, no key needed ----- */

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (!SpeechRecognition) {
  micBtn.disabled = true;
  speechNote.textContent = "Voice input is not supported in this browser — typing works everywhere.";
} else {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = function (event) {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    // Replace the live portion: keep it simple by filling the box.
    dreamText.value = transcript.trim();
  };

  recognition.onerror = function (event) {
    listening = false;
    micBtn.textContent = "🎙 Speak";
    if (event.error === "not-allowed") {
      setRecorderMessage("Microphone access was blocked — check your browser permissions.", "err");
    } else if (event.error !== "aborted") {
      setRecorderMessage("Voice input hiccup — try again or type your dream.", "err");
    }
  };

  recognition.onend = function () {
    listening = false;
    micBtn.textContent = "🎙 Speak";
  };

  micBtn.addEventListener("click", function () {
    if (listening) {
      recognition.stop();
      return;
    }
    setRecorderMessage("", "");
    try {
      recognition.start();
      listening = true;
      micBtn.textContent = "■ Stop";
    } catch (e) {
      setRecorderMessage("Could not start voice input in this browser.", "err");
    }
  });
}

/* ----- generation ----- */

// Keep generations clean and bright so the imagery stays visible; the
// device's moody look comes from the hardware/playback, not the prompt.
function buildVideoPrompt(text) {
  return (
    "Clean, bright, luminous cinematic dream footage, vivid color, soft glow: " +
    text.trim()
  );
}

function authHeaders() {
  return {
    "Authorization": "Bearer " + getKey(),
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

let pollTimer = null;

generateBtn.addEventListener("click", async function () {
  const text = dreamText.value.trim();
  if (!text) {
    setRecorderMessage("Describe your dream first — a sentence or two is plenty.", "err");
    return;
  }
  if (!getKey()) {
    setRecorderMessage("Your API key is missing — please add it on your account page.", "err");
    showView("account");
    return;
  }

  setRecorderMessage("", "");
  generateBtn.disabled = true;
  afterActions.classList.add("hidden");
  setDeviceState("working");
  deviceHint.textContent = "Generating your dream film…";
  const startedAt = Date.now();
  workingText.textContent = "Dreaming…";
  workingTimer.textContent = "";

  const tick = setInterval(function () {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    workingTimer.textContent =
      "about " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " elapsed";
  }, 1000);

  try {
    // 1. Kick off the generation via our serverless proxy.
    const genRes = await fetch("/api/generate", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ prompt: buildVideoPrompt(text) }),
    });
    const genData = await genRes.json().catch(function () { return {}; });

    if (genRes.status === 401) {
      throw new Error("invalid_key");
    }
    if (!genRes.ok || !genData.id) {
      throw new Error(genData.error || "Could not start the generation.");
    }

    // 2. Poll until the video is ready.
    workingText.textContent = "Filming your dream…";
    const videoUrl = await pollForVideo(genData.id);
    clearInterval(tick);

    // 3. Play it back on the device.
    dreamVideo.src = videoUrl;
    fullscreenVideo.src = videoUrl;
    setDeviceState("ready");
    deviceHint.textContent = "Your dream, on film.";
    afterActions.classList.remove("hidden");
    try {
      await dreamVideo.play();
    } catch (e) { /* autoplay may need a tap; controls still work */ }
  } catch (err) {
    clearInterval(tick);
    setDeviceState("idle");
    deviceHint.textContent = "Describe your dream below, then press generate.";
    if (err && err.message === "invalid_key") {
      setRecorderMessage("That Luma API key was rejected — please check it on your account page.", "err");
      clearKey();
      setTimeout(function () { showView("account"); }, 1600);
    } else if (err && err.message === "timeout") {
      setRecorderMessage("The generation took too long — please try again.", "err");
    } else {
      setRecorderMessage((err && err.message) || "Something went wrong.", "err");
    }
  } finally {
    generateBtn.disabled = false;
  }
});

function pollForVideo(id) {
  return new Promise(function (resolve, reject) {
    const startedAt = Date.now();

    async function check() {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        reject(new Error("timeout"));
        return;
      }
      try {
        const res = await fetch("/api/status?id=" + encodeURIComponent(id), {
          headers: { "Authorization": "Bearer " + getKey(), "Accept": "application/json" },
        });
        const data = await res.json().catch(function () { return {}; });
        if (res.status === 401) {
          reject(new Error("invalid_key"));
          return;
        }
        if (data.state === "completed" && data.video_url) {
          resolve(data.video_url);
          return;
        }
        if (data.state === "failed") {
          reject(new Error(data.error || "The video generation failed."));
          return;
        }
        pollTimer = setTimeout(check, POLL_INTERVAL_MS);
      } catch (err) {
        // Transient network blip: keep polling.
        pollTimer = setTimeout(check, POLL_INTERVAL_MS);
      }
    }

    check();
  });
}

document.getElementById("record-another").addEventListener("click", function () {
  if (pollTimer) clearTimeout(pollTimer);
  dreamText.value = "";
  resetRecorder();
  dreamText.focus();
});

/* ----- fullscreen playback ----- */

document.getElementById("fullscreen-btn").addEventListener("click", function () {
  if (!fullscreenVideo.src) return;
  fullscreenOverlay.classList.remove("hidden");
  fullscreenVideo.play().catch(function () { /* user can press play */ });
});

document.getElementById("fullscreen-close").addEventListener("click", function () {
  fullscreenVideo.pause();
  fullscreenOverlay.classList.add("hidden");
});

/* ---------------- boot ---------------- */

(async function boot() {
  await initAuth();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data && data.session) {
        authedRoute();
        return;
      }
    } catch (e) { /* fall through to landing */ }
    supabase.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") showView("landing");
    });
  }
  showView("landing");
})();
