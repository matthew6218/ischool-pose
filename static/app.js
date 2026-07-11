const $ = (id) => document.getElementById(id);
const MOVES = ["rock", "paper", "scissors"];
const EMOJI = { rock: "✊", paper: "✋", scissors: "✌️" };
const REQUIRED_STABLE_MS = 1200;
const CONFIDENCE_THRESHOLD = 0.85;
const ROUND_COOLDOWN_MS = 1800;

let model;
let webcam;
let running = false;
let candidate = null;
let candidateSince = 0;
let cooldownUntil = 0;
let lastPredictionLog = 0;

function errorMessage(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function log(message, details) {
  const time = new Date().toLocaleTimeString();
  const suffix = details === undefined ? "" : ` | ${typeof details === "string" ? details : JSON.stringify(details)}`;
  const line = `[${time}] ${message}${suffix}`;
  console.log(`[RPS] ${message}`, details ?? "");
  const output = $("debug-log");
  if (output) {
    output.textContent += `${line}\n`;
    output.scrollTop = output.scrollHeight;
  }
}

window.addEventListener("error", (event) => log("Browser error", `${event.message} (${event.filename}:${event.lineno})`));
window.addEventListener("unhandledrejection", (event) => log("Unhandled promise rejection", errorMessage(event.reason)));

function normalizeModelBase(value) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function classToMove(className) {
  const text = className.trim().toLowerCase();
  if (text.includes("scissor")) return "scissors";
  if (text.includes("rock")) return "rock";
  if (text.includes("paper")) return "paper";
  return null;
}

async function start() {
  if (running) return;
  $("start").disabled = true;
  $("status").textContent = "Loading image model…";
  try {
    const base = normalizeModelBase($("model-url").value);
    log("Start requested", { modelBase: base, secureContext: window.isSecureContext });
    if (!window.tf) throw new Error("TensorFlow.js did not load. Check the CDN connection or an ad blocker.");
    if (!window.tmImage) throw new Error("Teachable Machine Image library did not load. Check the CDN connection or an ad blocker.");
    log("Libraries ready", { tfjs: tf.version.tfjs, tmImage: typeof tmImage.load });

    log("Downloading model.json and metadata.json");
    model = await tmImage.load(`${base}model.json`, `${base}metadata.json`);
    log("Model loaded", { classes: model.getClassLabels(), totalClasses: model.getTotalClasses() });

    webcam = new tmImage.Webcam(420, 420, true);
    log("Requesting camera permission");
    await webcam.setup();
    log("Camera permission granted");
    await webcam.play();
    log("Webcam stream started", { width: webcam.canvas.width, height: webcam.canvas.height });
    $("webcam").replaceChildren(webcam.canvas);
    running = true;
    $("status").textContent = "Camera ready. Hold up rock, paper, or scissors.";
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    const message = errorMessage(error);
    log("Start failed", message);
    $("status").textContent = `Could not start: ${message}`;
    $("start").disabled = false;
  }
}

async function loop(now) {
  if (!running) return;
  try {
    webcam.update();
    const predictions = await model.predict(webcam.canvas);
    const best = predictions.reduce((a, b) => a.probability > b.probability ? a : b);
    const move = classToMove(best.className);

    if (now - lastPredictionLog >= 3000) {
      log("Prediction running", predictions.map(({ className, probability }) => ({
        className,
        confidence: `${Math.round(probability * 100)}%`,
      })));
      lastPredictionLog = now;
    }

    $("detected-move").textContent = move ? `${EMOJI[move]} ${move}` : best.className;
    $("confidence").textContent = `${Math.round(best.probability * 100)}%`;

    if (move && best.probability >= CONFIDENCE_THRESHOLD && now >= cooldownUntil) {
      if (candidate !== move) {
        candidate = move;
        candidateSince = now;
      }
      const progress = Math.min(1, (now - candidateSince) / REQUIRED_STABLE_MS);
      $("meter-fill").style.width = `${progress * 100}%`;
      if (progress >= 1) await playRound(move, now);
    } else {
      candidate = null;
      candidateSince = 0;
      $("meter-fill").style.width = "0%";
    }
  } catch (error) {
    running = false;
    const message = errorMessage(error);
    log("Prediction loop failed", message);
    $("status").textContent = `Prediction failed: ${message}`;
    $("start").disabled = false;
    return;
  }
  requestAnimationFrame(loop);
}

async function playRound(move, now) {
  cooldownUntil = now + ROUND_COOLDOWN_MS;
  candidate = null;
  $("meter-fill").style.width = "0%";
  try {
    const response = await fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move }),
    });
    if (!response.ok) throw new Error(await response.text());
    render(await response.json());
  } catch (error) {
    $("status").textContent = `Round failed: ${error.message}`;
  }
}

function render(state) {
  $("player-score").textContent = state.playerScore;
  $("computer-score").textContent = state.computerScore;
  $("draws").textContent = state.draws;
  $("round").textContent = state.roundNumber;
  if (state.playerMove) {
    $("player-move").textContent = EMOJI[state.playerMove];
    $("computer-move").textContent = EMOJI[state.computerMove];
    $("outcome").textContent = { win: "You win!", lose: "Computer wins!", draw: "It's a draw!" }[state.outcome];
  }
  const history = state.history || [];
  $("history").innerHTML = history.length ? history.map(item =>
    `<li><span>Round ${item.round}</span><strong>${EMOJI[item.playerMove]} vs ${EMOJI[item.computerMove]}</strong><em>${item.outcome}</em></li>`
  ).join("") : "<li>No rounds yet.</li>";
}

async function reset() {
  const response = await fetch("/api/reset", { method: "POST" });
  render(await response.json());
  $("player-move").textContent = "?";
  $("computer-move").textContent = "?";
  $("outcome").textContent = "Show your move!";
}

$("start").addEventListener("click", start);
$("reset").addEventListener("click", reset);
$("copy-log").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("debug-log").textContent);
    log("Diagnostic log copied");
  } catch (error) {
    log("Could not copy log", errorMessage(error));
  }
});

log("Page script initialized", {
  secureContext: window.isSecureContext,
  tfLoaded: Boolean(window.tf),
  tmImageLoaded: Boolean(window.tmImage),
});
fetch("/api/state").then(r => r.json()).then(render).catch(error => log("State request failed", errorMessage(error)));
