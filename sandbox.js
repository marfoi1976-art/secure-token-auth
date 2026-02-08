// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────
let state = {
  deviceId: "",
  sePrivateKey: null,        // CryptoKey
  sePublicKeyRaw: null,      // ArrayBuffer (for verification)
  intent: "",
  intentHash: null,          // ArrayBuffer
  biometricConfirmed: false,
  teeSignature: null,        // ArrayBuffer
  challenge: "",
  challengeBound: false,
  token: null,               // object
  tokenJson: "",
};

// ──────────────────────────────────────────────
// Utils
// ──────────────────────────────────────────────
function log(msg, type = "info") {
  const ts = new Date().toLocaleTimeString();
  const el = document.getElementById("log");
  const color = type === "error" ? "#f85149" : type === "success" ? "#3fb950" : "#8b949e";
  el.innerHTML += `<span style="color:${color}">[${ts}] ${msg}</span>\n`;
  el.scrollTop = el.scrollHeight;
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b,16)));
  return bytes.buffer;
}

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  return await crypto.subtle.digest("SHA-256", buf);
}

function setStatus(id, text, cls = "waiting") {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "status " + cls;
}

function updateLocks() {
  // Card 2 – Intent
  const intentOk = !!state.deviceId && !!state.sePrivateKey;
  document.getElementById("btn-biometric-confirm").disabled = !intentOk;
  setStatus("status-intent", intentOk ? "Ready" : "Locked – complete Device Identity", intentOk ? "success" : "waiting");

  // Card 3 – TEE
  const teeOk = intentOk && state.biometricConfirmed && !!state.intent;
  document.getElementById("btn-tee-sign").disabled = !teeOk;
  setStatus("status-tee", teeOk ? "Ready" : "Locked", teeOk ? "success" : "waiting");

  // Card 4 – Challenge
  const chalOk = teeOk && !!state.teeSignature;
  document.getElementById("btn-bind-challenge").disabled = !chalOk;
  setStatus("status-challenge", chalOk ? "Paste challenge to continue" : "Locked", chalOk ? "success" : "waiting");

  // Card 5 – Token
  const tokenOk = chalOk && state.challengeBound && state.challenge.length > 0;
  document.getElementById("btn-generate-token").disabled = !tokenOk;
  setStatus("status-token", tokenOk ? "Ready to generate" : "Locked", tokenOk ? "success" : "waiting");

  // Card 6 – Send
  const sendOk = tokenOk && !!state.token;
  document.getElementById("btn-copy-token").disabled = !sendOk;
  setStatus("status-send", sendOk ? "Token ready – copy & paste" : "Locked", sendOk ? "success" : "waiting");
}

// ──────────────────────────────────────────────
// Handlers
// ──────────────────────────────────────────────
document.getElementById("btn-random-id").onclick = async () => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  state.deviceId = "dev-" + toHex(randomBytes).slice(0,12);
  document.getElementById("deviceId").value = state.deviceId;
  setStatus("status-identity", "Device ID set", "success");
  log("Generated device ID: " + state.deviceId);

  document.getElementById("btn-derive-se-key").disabled = false;
};

document.getElementById("btn-derive-se-key").onclick = async () => {
  if (!state.deviceId) return;

  // Simulate SE key derivation from deviceId
  const keyMaterial = await sha256(state.deviceId);
  state.sePrivateKey = await crypto.subtle.importKey(
    "raw", keyMaterial, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );

  // Export public key for terminal verification simulation
  const pub = await crypto.subtle.exportKey("spki", state.sePrivateKey);
  state.sePublicKeyRaw = pub; // simplified – normally we'd derive public properly

  setStatus("status-identity", "SE key derived", "success");
  log("SE key pair derived from device ID");
  updateLocks();
};

document.getElementById("btn-biometric-confirm").onclick = () => {
  state.biometricConfirmed = true;
  setStatus("status-intent", "Biometric confirmed", "success");
  log("User intent confirmed via simulated biometric");
  updateLocks();
};

document.getElementById("intentText").oninput = (e) => {
  state.intent = e.target.value.trim();
  updateLocks();
};

document.getElementById("btn-tee-sign").onclick = async () => {
  if (!state.intent) return;

  state.intentHash = await sha256(state.intent);

  // Simulate TEE signing the intent hash with SE key
  state.teeSignature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    state.sePrivateKey,
    state.intentHash
  );

  setStatus("status-tee", "TEE signature created", "success");
  log("TEE signed intent hash");
  updateLocks();
};

document.getElementById("challenge").oninput = (e) => {
  state.challenge = e.target.value.trim();
  updateLocks();
};

document.getElementById("btn-bind-challenge").onclick = () => {
  if (!state.challenge) {
    setStatus("status-challenge", "Challenge required", "fail");
    log("Bind failed: no challenge", "error");
    return;
  }
  state.challengeBound = true;
  setStatus("status-challenge", "Challenge bound", "success");
  log("Challenge bound successfully");
  updateLocks();
};

document.getElementById("btn-generate-token").onclick = async () => {
  const ts = Date.now();

  const payload = {
    deviceId: state.deviceId,
    intentHash: toHex(state.intentHash),
    challenge: state.challenge,
    timestamp: ts,
    teeSignature: toHex(state.teeSignature),
    seKeyHash: toHex(await sha256(toHex(state.sePublicKeyRaw || ""))),
  };

  // Final signature over the whole payload (simulating device binding)
  const payloadStr = JSON.stringify(payload);
  const payloadHash = await sha256(payloadStr);
  const finalSig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    state.sePrivateKey,
    payloadHash
  );

  state.token = { ...payload, finalSignature: toHex(finalSig) };
  state.tokenJson = JSON.stringify(state.token, null, 2);

  document.getElementById("tokenOutput").textContent = state.tokenJson;
  setStatus("status-token", "Token generated", "success");
  log("Transaction token generated");
  updateLocks();
};

document.getElementById("btn-copy-token").onclick = () => {
  navigator.clipboard.writeText(state.tokenJson).then(() => {
    log("Token copied to clipboard");
    alert("Token copied!");
  });
};

// Init
log("Device simulator ready. Start with Device Identity.");